import { ProfileService } from '../profile/profile.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { CareerConsultingCase, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hasAdminAccess } from '../admin/admin-access';
import { OperationsPolicyService } from '../operations/operations-policy.service';
import { CV_MAX_FILE_SIZE_BYTES } from '../profile/profile.constants';
import { UploadedCvFile } from '../profile/cv-file.util';
import { CONSULTING_CATALOG } from './catalog';
import { ConsultingFilesService } from './consulting-files.service';
import {
  AGREEMENT_VERSION,
  cleanAnswers,
  cleanDraft,
  fingerprint,
  ids,
  object,
  publishContent,
  str,
} from './consulting.validation';
import {
  CaseUpdateDto,
  CommentDto,
  ConsentDto,
  CreateCaseDto,
  DecisionDto,
  ItemDto,
  ListDto,
  PublishDto,
  RequestDto,
  ResponseDto,
  ReviewDto,
  SharingDto,
  StateDto,
} from './consulting.dto';
type Tx = Prisma.TransactionClient;
const json = (v: unknown) => v as Prisma.InputJsonValue;
const alive = () => ({ retentionUntil: { gt: new Date() } });
@Injectable()
export class CareerConsultingService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private readonly logger = new Logger(CareerConsultingService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: OperationsPolicyService,
    private readonly files: ConsultingFilesService,
    private readonly profile: ProfileService,
  ) {}
  onModuleInit() {
    this.timer = setInterval(
      () =>
        void this.purgeExpired().catch(() =>
          this.logger.warn('Consultation retention cleanup will retry'),
        ),
      30 * 60000,
    );
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private async staff(db: Tx, id: string, write = false) {
    const a = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        isRootAdmin: true,
        adminPermissions: true,
      },
    });
    if (
      !a ||
      a.role !== 'ADMIN' ||
      !hasAdminAccess(
        a.adminPermissions,
        ['CAREER_CONSULTING'],
        write ? 'WRITE' : 'READ',
        a.isRootAdmin,
      )
    )
      throw new ForbiddenException('Career consulting permission required');
    return a;
  }
  private async member(db: Tx, id: string) {
    const u = await db.user.findUnique({
      where: { id },
      select: { id: true, role: true, emailVerified: true },
    });
    if (!u || u.role !== 'USER' || !u.emailVerified)
      throw new ForbiddenException('A verified member account is required');
    return u;
  }
  private async check(
    db: Tx,
    actor: string,
    id: string,
    member = false,
    write = false,
  ) {
    const a = member
      ? await this.member(db, actor)
      : await this.staff(db, actor, write);
    const c = await db.careerConsultingCase.findUnique({ where: { id } });
    if (
      !c ||
      c.retentionUntil <= new Date() ||
      (member
        ? c.userId !== actor || c.status === 'DRAFT'
        : !('isRootAdmin' in a && a.isRootAdmin) &&
          c.ownerId !== actor &&
          !c.allowedAdminIds.includes(actor))
    )
      throw new NotFoundException('Consultation unavailable');
    return { c, a };
  }
  private active(c: CareerConsultingCase) {
    if (
      c.status !== 'ACTIVE' ||
      c.consentStatus !== 'ACCEPTED' ||
      c.retentionUntil <= new Date()
    )
      throw new ForbiddenException('Active service agreement is required');
  }
  private retention(v: string) {
    const d = new Date(v);
    if (
      !Number.isFinite(d.getTime()) ||
      d <= new Date() ||
      d.getTime() > Date.now() + 366 * 86400000
    )
      throw new BadRequestException(
        'Choose an explicit retention date within one year',
      );
    return d;
  }
  private async admins(db: Tx, ownerId: string, allowed: string[]) {
    const all = [...new Set([ownerId, ...allowed])];
    const users = await db.user.findMany({
      where: { id: { in: all }, role: 'ADMIN' },
      select: { id: true, isRootAdmin: true, adminPermissions: true },
    });
    if (
      users.length !== all.length ||
      users.some(
        (a) =>
          !hasAdminAccess(
            a.adminPermissions,
            ['CAREER_CONSULTING'],
            a.id === ownerId ? 'WRITE' : 'READ',
            a.isRootAdmin,
          ),
      )
    )
      throw new BadRequestException(
        'Choose authorized consultation administrators',
      );
  }
  private async notify(
    db: Tx,
    c: CareerConsultingCase,
    toClient: boolean,
    action: string,
  ) {
    const userId = toClient ? c.userId : c.ownerId;
    await db.notification.create({
      data: {
        userId,
        type: 'CAREER_CONSULTING',
        titleAr: 'تحديث في الاستشارة المهنية',
        titleEn: 'Career consultation update',
        bodyAr: 'يوجد اتفاق أو عمل مشترك يحتاج مراجعتك في مساحة الاستشارة.',
        bodyEn:
          'An agreement or shared work needs your attention in the consultation workspace.',
        actionUrl: `${toClient ? '/career-consulting' : '/admin/career-consulting'}?case=${c.id}`,
      },
    });
  }
  private async mutation(
    actor: string,
    id: string,
    action: string,
    d: RequestDto | Record<string, any>,
    member: boolean,
    fn: (db: Tx, c: CareerConsultingCase, a: any) => Promise<{ id: string }>,
    options: { active?: boolean; tx?: Tx; target?: string } = {},
  ) {
    const execute = async (db: Tx) => {
      await db.$queryRaw`SELECT id FROM career_consulting_cases WHERE id=${id}::uuid FOR UPDATE`;
      const { c, a } = await this.check(db, actor, id, member, !member);
      if (options.active !== false) this.active(c);
      const hash = fingerprint({
        action,
        target: options.target ?? id,
        data: d,
      });
      const old = await db.careerConsultingEvent.findUnique({
        where: { caseId_requestId: { caseId: id, requestId: d.requestId } },
      });
      if (old) {
        if (
          old.actorId !== actor ||
          old.action !== action ||
          old.requestHash !== hash
        )
          throw new ConflictException(
            'Request key was already used for different work',
          );
        return { id: old.entityId ?? id };
      }
      const result = await fn(db, c, a);
      await db.careerConsultingEvent.create({
        data: {
          caseId: id,
          actorId: actor,
          action,
          entityId: result.id,
          requestId: d.requestId,
          requestHash: hash,
        },
      });
      await db.careerConsultingCase.update({
        where: { id },
        data: { updatedAt: new Date() },
      });
      return result;
    };
    return options.tx
      ? execute(options.tx)
      : this.prisma.$transaction(execute, { maxWait: 15000, timeout: 30000 });
  }
  async catalog(actor: string) {
    await this.staff(this.prisma, actor);
    return {
      ...CONSULTING_CATALOG,
      agreementVersion: AGREEMENT_VERSION,
      maxFileBytes: CV_MAX_FILE_SIZE_BYTES,
    };
  }
  async candidates(actor: string, search = '') {
    await this.staff(this.prisma, actor, true);
    return this.prisma.user.findMany({
      where: {
        role: 'USER',
        OR: [
          { name: { contains: search.slice(0, 100), mode: 'insensitive' } },
          { email: { contains: search.slice(0, 100), mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        emailVerified: true,
        email: true,
        targetJobTitle: true,
      },
      take: 30,
      orderBy: { name: 'asc' },
    });
  }
  async staffList(actor: string) {
    await this.staff(this.prisma, actor);
    return (
      await this.prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: {
          id: true,
          name: true,
          isRootAdmin: true,
          adminPermissions: true,
        },
      })
    )
      .filter((a) =>
        hasAdminAccess(
          a.adminPermissions,
          ['CAREER_CONSULTING'],
          'READ',
          a.isRootAdmin,
        ),
      )
      .map((a) => ({
        id: a.id,
        name: a.name,
        canOwn: hasAdminAccess(
          a.adminPermissions,
          ['CAREER_CONSULTING'],
          'WRITE',
          a.isRootAdmin,
        ),
      }));
  }
  async availability(actor: string) {
    await this.member(this.prisma, actor);
    const count = await this.prisma.careerConsultingCase.count({
      where: { userId: actor, status: { not: 'DRAFT' }, ...alive() },
    });
    return { available: count > 0, count };
  }
  async list(actor: string, q: ListDto, member = false) {
    const a = member
      ? await this.member(this.prisma, actor)
      : await this.staff(this.prisma, actor);
    const where: Prisma.CareerConsultingCaseWhereInput = {
      ...alive(),
      ...(member
        ? { userId: actor, status: { not: 'DRAFT' } }
        : !('isRootAdmin' in a && a.isRootAdmin)
          ? { OR: [{ ownerId: actor }, { allowedAdminIds: { has: actor } }] }
          : {}),
      ...(!member && q.status ? { status: q.status } : {}),
      ...(q.search
        ? { title: { contains: q.search, mode: 'insensitive' } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.careerConsultingCase.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: ((q.page ?? 1) - 1) * 30,
        take: 30,
        select: {
          id: true,
          title: true,
          status: true,
          consentStatus: true,
          updatedAt: true,
          retentionUntil: true,
          user: { select: { id: true, name: true } },
          owner: { select: { name: true } },
          _count: { select: { submissions: { where: { review: null } } } },
        },
      }),
      this.prisma.careerConsultingCase.count({ where }),
    ]);
    return { items, total, page: q.page ?? 1 };
  }
  async create(actor: string, d: CreateCaseDto) {
    return this.prisma.$transaction(async (db) => {
      const a = await this.staff(db, actor, true);
      const hash = fingerprint(d),
        old = await db.careerConsultingCase.findUnique({
          where: { requestId: d.requestId },
        });
      if (old) {
        await this.check(db, actor, old.id, false, true);
        if (old.requestHash !== hash)
          throw new ConflictException('Request key was already used');
        return { id: old.id };
      }
      if (str(d.title, 160).length < 3 || str(d.purpose, 3000).length < 5)
        throw new BadRequestException(
          'Describe the service purpose and a meaningful title',
        );
      const ownerId = d.ownerId ?? actor;
      if (!a.isRootAdmin && ownerId !== actor)
        throw new ForbiddenException('Only root can assign a different owner');
      await this.admins(db, ownerId, d.allowedAdminIds ?? []);
      if (
        !(await db.user.findFirst({
          where: { id: d.userId, role: 'USER' },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Member unavailable');
      const c = await db.careerConsultingCase.create({
        data: {
          userId: d.userId,
          ownerId,
          allowedAdminIds: d.allowedAdminIds ?? [],
          title: d.title.trim(),
          purpose: d.purpose.trim(),
          retentionUntil: this.retention(d.retentionUntil),
          requestId: d.requestId,
          requestHash: hash,
        },
      });
      await db.careerConsultingItem.create({
        data: {
          caseId: c.id,
          kind: 'WORK',
          title: 'Working agreement and goals',
          draft: json(cleanDraft('WORK', {})),
          createdBy: actor,
        },
      });
      await db.careerConsultingEvent.create({
        data: {
          caseId: c.id,
          actorId: actor,
          action: 'CASE_CREATED',
          entityId: c.id,
        },
      });
      return { id: c.id };
    });
  }
  async update(actor: string, id: string, d: CaseUpdateDto) {
    return this.mutation(
      actor,
      id,
      'CASE_UPDATED',
      d,
      false,
      async (db, c, a) => {
        if (c.revision !== d.revision)
          throw new ConflictException(
            'The case changed; refresh and keep your draft',
          );
        if (
          (d.ownerId !== undefined || d.allowedAdminIds !== undefined) &&
          !a.isRootAdmin &&
          c.ownerId !== actor
        )
          throw new ForbiddenException(
            'Only root or the owner can change case access',
          );
        if (
          (c.status !== 'DRAFT' &&
            d.purpose !== undefined &&
            d.purpose !== c.purpose) ||
          (c.consentStatus === 'ACCEPTED' &&
            d.retentionUntil &&
            new Date(d.retentionUntil) > c.retentionUntil)
        )
          throw new ConflictException(
            'Agreed purpose and retention cannot be expanded silently',
          );
        await this.admins(
          db,
          d.ownerId ?? c.ownerId,
          d.allowedAdminIds ?? c.allowedAdminIds,
        );
        const { requestId, revision, retentionUntil, ...rest } = d;
        await db.careerConsultingCase.update({
          where: { id },
          data: {
            ...rest,
            ...(retentionUntil
              ? { retentionUntil: this.retention(retentionUntil) }
              : {}),
            revision: { increment: 1 },
          },
        });
        return { id };
      },
      { active: false },
    );
  }
  async state(actor: string, id: string, d: StateDto) {
    return this.mutation(
      actor,
      id,
      'CASE_' + d.action,
      d,
      false,
      async (db, c) => {
        let status = c.status;
        if (d.action === 'INVITE') {
          if (c.status !== 'DRAFT' || c.consentStatus !== 'NOT_ACCEPTED')
            throw new ConflictException(
              'Only an uninvited draft can be invited',
            );
          status = 'INVITED';
          await this.notify(db, c, true, 'INVITE');
        } else if (d.action === 'PAUSE') {
          this.active(c);
          status = 'PAUSED';
        } else if (d.action === 'RESUME') {
          if (c.status !== 'PAUSED' || c.consentStatus !== 'ACCEPTED')
            throw new ForbiddenException('Current consent is required');
          status = 'ACTIVE';
        } else if (d.action === 'COMPLETE') {
          if (
            !['ACTIVE', 'PAUSED'].includes(c.status) ||
            c.consentStatus !== 'ACCEPTED'
          )
            throw new ForbiddenException('Current service agreement required');
          const work = await db.careerConsultingPublication.findFirst({
            where: { caseId: id, kind: 'WORK' },
            orderBy: { createdAt: 'desc' },
          });
          const content = object(work?.content ?? {});
          if (!content.beforeNow || !content.futureSteps)
            throw new BadRequestException(
              'Publish an outcome review and future steps before closing',
            );
          status = 'COMPLETED';
          await this.notify(db, c, true, 'COMPLETE');
        }
        await db.careerConsultingCase.update({
          where: { id },
          data: { status, revision: { increment: 1 } },
        });
        return { id };
      },
      { active: false },
    );
  }
  async accept(actor: string, id: string, d: ConsentDto) {
    return this.mutation(
      actor,
      id,
      'SERVICE_ACCEPTED',
      d,
      true,
      async (db, c) => {
        if (
          c.status !== 'INVITED' ||
          c.consentStatus !== 'NOT_ACCEPTED' ||
          !d.confirmed ||
          d.agreementVersion !== AGREEMENT_VERSION
        )
          throw new BadRequestException(
            'Review and explicitly accept the current service agreement',
          );
        await db.careerConsultingCase.update({
          where: { id },
          data: {
            status: 'ACTIVE',
            consentStatus: 'ACCEPTED',
            consentAt: new Date(),
            consentVersion: AGREEMENT_VERSION,
            revision: { increment: 1 },
          },
        });
        await this.notify(db, c, false, 'ACCEPT');
        return { id };
      },
      { active: false },
    );
  }
  async withdraw(actor: string, id: string, d: RequestDto) {
    return this.mutation(
      actor,
      id,
      'SERVICE_WITHDRAWN',
      d,
      true,
      async (db, c) => {
        if (c.consentStatus === 'WITHDRAWN') return { id };
        await db.careerConsultingCase.update({
          where: { id },
          data: {
            status: 'WITHDRAWN',
            consentStatus: 'WITHDRAWN',
            withdrawnAt: new Date(),
            programmeSharing: false,
            revision: { increment: 1 },
          },
        });
        return { id };
      },
      { active: false },
    );
  }
  async sharing(actor: string, id: string, d: SharingDto) {
    return this.mutation(
      actor,
      id,
      'PROGRAMME_SHARING_CHANGED',
      d,
      true,
      async (db) => {
        await db.careerConsultingCase.update({
          where: { id },
          data: { programmeSharing: d.enabled },
        });
        return { id };
      },
    );
  }
  private async publicFiles(
    db: Tx,
    c: CareerConsultingCase,
    fileIds: string[],
    actor: string,
    member: boolean,
    publish = false,
  ) {
    const rows = await db.careerConsultingFile.findMany({
      where: { id: { in: fileIds }, caseId: c.id },
    });
    if (
      rows.length !== fileIds.length ||
      rows.some((f) =>
        member
          ? f.createdBy !== actor && !f.shared
          : f.createdBy === c.userId && !f.shared,
      )
    )
      throw new NotFoundException('Document unavailable');
    if (publish && rows.length)
      await db.careerConsultingFile.updateMany({
        where: { id: { in: fileIds }, caseId: c.id },
        data: { shared: true },
      });
    return rows;
  }
  async saveItem(actor: string, id: string, d: ItemDto, itemId?: string) {
    return this.mutation(
      actor,
      id,
      itemId ? 'ITEM_UPDATED' : 'ITEM_CREATED',
      d,
      false,
      async (db, c) => {
        if (str(d.title, 160).length < 3)
          throw new BadRequestException('Choose a meaningful work title');
        const data = cleanDraft(d.kind, d.data, d.language);
        if (d.kind === 'ACTIVITY' && !data.goal) {
          const work = await db.careerConsultingPublication.findFirst({
            where: { caseId: id, kind: 'WORK' },
            orderBy: { createdAt: 'desc' },
          });
          data.goal = object(work?.content ?? {}).goal ?? '';
        }
        await this.publicFiles(db, c, ids(data.fileIds), actor, false);
        if (itemId) {
          const old = await db.careerConsultingItem.findFirst({
            where: { id: itemId, caseId: id },
          });
          if (!old) throw new NotFoundException('Work unavailable');
          if (old.kind !== d.kind)
            throw new BadRequestException('Work type cannot change');
          if (!d.revision || old.revision !== d.revision)
            throw new ConflictException(
              'Work changed; refresh while keeping your draft',
            );
          await db.careerConsultingItem.update({
            where: { id: itemId },
            data: {
              title: d.title.trim(),
              draft: json(data),
              privateNotes: d.privateNotes ?? old.privateNotes,
              revision: { increment: 1 },
            },
          });
          return { id: itemId };
        }
        if (d.kind === 'WORK')
          throw new ConflictException('The case already has its working map');
        const item = await db.careerConsultingItem.create({
          data: {
            caseId: id,
            kind: d.kind,
            title: d.title.trim(),
            draft: json(data),
            privateNotes: d.privateNotes ?? '',
            createdBy: actor,
          },
        });
        return { id: item.id };
      },
      { target: itemId },
    );
  }
  async publish(actor: string, id: string, itemId: string, d: PublishDto) {
    return this.mutation(
      actor,
      id,
      'WORK_PUBLISHED',
      d,
      false,
      async (db, c) => {
        const item = await db.careerConsultingItem.findFirst({
          where: { id: itemId, caseId: id, archived: false },
        });
        if (!item) throw new NotFoundException('Work unavailable');
        if (item.revision !== d.revision)
          throw new ConflictException('Work changed before publishing');
        const old = await db.careerConsultingPublication.findUnique({
          where: { itemId_revision: { itemId, revision: item.revision } },
        });
        if (old) return { id: old.id };
        const content = publishContent(item.kind, item.title, item.draft);
        await this.publicFiles(db, c, ids(content.fileIds), actor, false, true);
        if (content.materialIds?.length) {
          const count = await db.careerConsultingPublication.count({
            where: { id: { in: content.materialIds }, caseId: id },
          });
          if (count !== content.materialIds.length)
            throw new NotFoundException('Shared material unavailable');
        }
        const pub = await db.careerConsultingPublication.create({
          data: {
            caseId: id,
            itemId,
            kind: item.kind,
            revision: item.revision,
            content: json(content),
            publishedBy: actor,
          },
        });
        await this.notify(db, c, true, 'PUBLISH');
        return { id: pub.id };
      },
      { target: itemId },
    );
  }
  private async activity(db: Tx, c: CareerConsultingCase, pubId: string) {
    const p = await db.careerConsultingPublication.findFirst({
      where: { id: pubId, caseId: c.id, kind: 'ACTIVITY' },
      include: { item: { select: { archived: true } } },
    });
    if (!p || p.item.archived)
      throw new NotFoundException('Shared activity unavailable');
    return p;
  }
  async saveResponse(
    actor: string,
    id: string,
    d: ResponseDto,
    submit = false,
  ) {
    return this.mutation(
      actor,
      id,
      submit ? 'WORK_SUBMITTED' : 'RESPONSE_DRAFT_SAVED',
      d,
      true,
      async (db, c) => {
        const pub = await this.activity(db, c, d.publicationId);
        const answers = cleanAnswers(pub.content, d.answers),
          fileIds = ids(d.fileIds);
        await this.publicFiles(db, c, fileIds, actor, true, submit);
        const old = await db.careerConsultingResponseDraft.findUnique({
          where: {
            publicationId_createdBy: {
              publicationId: pub.id,
              createdBy: actor,
            },
          },
        });
        if (d.revision === undefined || d.revision !== (old?.revision ?? 0))
          throw new ConflictException(
            'Your saved draft changed; refresh without discarding your text',
          );
        if (
          submit &&
          !Object.values(answers).some((v) =>
            typeof v === 'string' ? v.trim() : Array.isArray(v) && v.length,
          ) &&
          !fileIds.length
        )
          throw new BadRequestException(
            'Add an answer or a document before submitting',
          );
        if (submit) {
          const last = await db.careerConsultingSubmission.findFirst({
            where: { activityId: pub.itemId },
            orderBy: { version: 'desc' },
          });
          if (
            last &&
            last.publicationId === pub.id &&
            fingerprint({ answers: last.answers, fileIds: last.fileIds }) ===
              fingerprint({ answers, fileIds })
          )
            return { id: last.id };
        }
        const draft = await db.careerConsultingResponseDraft.upsert({
          where: {
            publicationId_createdBy: {
              publicationId: pub.id,
              createdBy: actor,
            },
          },
          create: {
            caseId: id,
            publicationId: pub.id,
            createdBy: actor,
            answers: json(answers),
            fileIds,
            ...(submit ? { lastSubmittedAt: new Date() } : {}),
          },
          update: {
            answers: json(answers),
            fileIds,
            revision: { increment: 1 },
            ...(submit ? { lastSubmittedAt: new Date() } : {}),
          },
        });
        if (!submit) return { id: draft.id };
        const latest = await db.careerConsultingSubmission.findFirst({
          where: { activityId: pub.itemId },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const s = await db.careerConsultingSubmission.create({
          data: {
            caseId: id,
            activityId: pub.itemId,
            publicationId: pub.id,
            version: (latest?.version ?? 0) + 1,
            answers: json(answers),
            fileIds,
            createdBy: actor,
          },
        });
        await this.notify(db, c, false, 'SUBMIT');
        return { id: s.id };
      },
    );
  }
  async review(actor: string, id: string, submissionId: string, d: ReviewDto) {
    return this.mutation(
      actor,
      id,
      'SUBMISSION_REVIEWED',
      d,
      false,
      async (db, c) => {
        const s = await db.careerConsultingSubmission.findFirst({
          where: { id: submissionId, caseId: id },
        });
        if (!s) throw new NotFoundException('Submission unavailable');
        const old = await db.careerConsultingReview.findUnique({
          where: { submissionId },
        });
        if ((d.revision ?? 0) !== (old?.revision ?? 0))
          throw new ConflictException(
            'Review changed; refresh and keep your draft',
          );
        const row = await db.careerConsultingReview.upsert({
          where: { submissionId },
          create: {
            caseId: id,
            submissionId,
            body: d.body.trim(),
            nextStep: d.nextStep.trim(),
            createdBy: actor,
          },
          update: {
            body: d.body.trim(),
            nextStep: d.nextStep.trim(),
            revision: { increment: 1 },
          },
        });
        await this.notify(db, c, true, 'REVIEW');
        return { id: row.id };
      },
      { target: submissionId },
    );
  }
  async decide(actor: string, id: string, d: DecisionDto) {
    return this.mutation(
      actor,
      id,
      'CLIENT_DECISION',
      d,
      true,
      async (db, c) => {
        const p = await db.careerConsultingPublication.findFirst({
          where: {
            id: d.publicationId,
            caseId: id,
            kind: { in: ['WORK', 'RECOMMENDATION'] },
          },
        });
        if (!p) throw new NotFoundException('Shared proposal unavailable');
        const decision = await db.careerConsultingDecision.create({
          data: {
            caseId: id,
            publicationId: p.id,
            choice: d.choice,
            body: d.body,
            createdBy: actor,
          },
        });
        await this.notify(db, c, false, 'DECISION');
        return { id: decision.id };
      },
    );
  }
  async comment(actor: string, id: string, d: CommentDto, member = false) {
    return this.mutation(
      actor,
      id,
      'COMMENT_ADDED',
      d,
      member,
      async (db, c) => {
        if (member && d.private)
          throw new BadRequestException(
            'Member replies cannot create staff-private notes',
          );
        if (d.targetKind !== 'CASE' && !d.targetId)
          throw new BadRequestException(
            'Choose the shared work being discussed',
          );
        if (
          d.targetKind === 'PUBLICATION' &&
          !(await db.careerConsultingPublication.findFirst({
            where: { id: d.targetId, caseId: id },
            select: { id: true },
          }))
        )
          throw new NotFoundException('Shared work unavailable');
        if (
          d.targetKind === 'SUBMISSION' &&
          !(await db.careerConsultingSubmission.findFirst({
            where: { id: d.targetId, caseId: id },
            select: { id: true },
          }))
        )
          throw new NotFoundException('Submission unavailable');
        const row = await db.careerConsultingComment.create({
          data: {
            caseId: id,
            targetKind: d.targetKind,
            targetId: d.targetKind === 'CASE' ? null : d.targetId,
            body: d.body,
            private: member ? false : (d.private ?? false),
            authorRole: member ? 'CLIENT' : 'CONSULTANT',
            createdBy: actor,
          },
        });
        if (!row.private) await this.notify(db, c, !member, 'COMMENT');
        return { id: row.id };
      },
    );
  }
  async upload(
    actor: string,
    id: string,
    requestId: string,
    file: UploadedCvFile | undefined,
    member = false,
  ) {
    const metadata = this.files.prepare(file);
    let key: string | undefined;
    try {
      return await this.policy.withPrivateDocumentBudget(
        metadata.size,
        (db, reserve) =>
          this.mutation(
            actor,
            id,
            'DOCUMENT_UPLOADED',
            { requestId, ...metadata },
            member,
            async (tx, c) => {
              await reserve();
              key = await this.files.write(file!);
              const row = await tx.careerConsultingFile.create({
                data: {
                  caseId: id,
                  ...metadata,
                  storageKey: key!,
                  createdBy: actor,
                  shared: false,
                },
              });
              return { id: row.id };
            },
            { tx: db },
          ),
      );
    } catch (error) {
      if (key) await this.files.removeUncommitted(key).catch(() => undefined);
      throw error;
    }
  }
  async shareFile(
    actor: string,
    id: string,
    fileId: string,
    d: RequestDto,
    member = false,
  ) {
    return this.mutation(
      actor,
      id,
      'DOCUMENT_SHARED',
      d,
      member,
      async (db, c) => {
        const file = await db.careerConsultingFile.findFirst({
          where: { id: fileId, caseId: id },
        });
        if (
          !file ||
          (member
            ? file.createdBy !== actor
            : file.createdBy === c.userId && !file.shared)
        )
          throw new NotFoundException('Document unavailable');
        await db.careerConsultingFile.update({
          where: { id: fileId },
          data: { shared: true },
        });
        return { id: fileId };
      },
      { target: fileId },
    );
  }
  async file(actor: string, id: string, fileId: string, member = false) {
    const { c } = await this.check(this.prisma, actor, id, member);
    if (member && c.consentStatus === 'NOT_ACCEPTED')
      throw new ForbiddenException('Accept the service agreement first');
    const f = await this.prisma.careerConsultingFile.findFirst({
      where: { id: fileId, caseId: id },
    });
    if (
      !f ||
      (member
        ? f.createdBy !== actor && !f.shared
        : f.createdBy === c.userId && !f.shared)
    )
      throw new NotFoundException('Document unavailable');
    return {
      metadata: { originalName: f.originalName, size: f.size },
      path: this.files.path(f.storageKey),
    };
  }
  async programme(actor: string, id: string) {
    const { c, a } = await this.check(this.prisma, actor, id);
    if (!c.programmeSharing || c.consentStatus !== 'ACCEPTED')
      return { shared: false };
    const [profile, state, counts] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: c.userId },
        select: {
          targetJobTitle: true,
          portfolioUrl: true,
          cv: {
            select: {
              id: true,
              originalName: true,
              size: true,
              uploadedAt: true,
            },
          },
        },
      }),
      this.prisma.userJourneyState.findUnique({
        where: { userId: c.userId },
        select: { currentNodeCode: true, currentWeek: true },
      }),
      this.prisma.application.groupBy({
        by: ['stage'],
        where: { userId: c.userId },
        _count: { _all: true },
      }),
    ]);
    const mentoring = hasAdminAccess(
      'adminPermissions' in a ? a.adminPermissions : {},
      ['MENTORING'],
      'READ',
      'isRootAdmin' in a && a.isRootAdmin,
    );
    const [tasks, feedback] = mentoring
      ? await Promise.all([
          this.prisma.task.findMany({
            where: { userId: c.userId },
            select: {
              id: true,
              title: true,
              description: true,
              status: true,
              dueDate: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
          }),
          this.prisma.feedbackPost.findMany({
            where: { targetUserId: c.userId, visibility: 'DIRECT' },
            select: { id: true, title: true, content: true },
            orderBy: { createdAt: 'desc' },
            take: 50,
          }),
        ])
      : [[], []];
    return {
      shared: true,
      source: 'PROGRAMME_READ_ONLY',
      specialism: profile?.targetJobTitle ?? null,
      portfolioUrl: profile?.portfolioUrl ?? null,
      cv: profile?.cv ?? null,
      journey: state,
      applicationStages: counts.map((x) => ({
        stage: x.stage,
        count: x._count._all,
      })),
      mentoringAvailable: mentoring,
      tasks,
      feedback,
    };
  }
  async programmeCv(actor: string, id: string) {
    const { c } = await this.check(this.prisma, actor, id);
    if (!c.programmeSharing || c.consentStatus !== 'ACCEPTED')
      throw new ForbiddenException(
        'The person has not shared programme resources',
      );
    return this.profile.getCvForUser(actor, c.userId);
  }
  async detail(actor: string, id: string, member = false) {
    const { c, a } = await this.check(this.prisma, actor, id, member);
    const canReadShared = !member || c.consentStatus !== 'NOT_ACCEPTED';
    const [
      person,
      owner,
      items,
      publications,
      submissions,
      reviews,
      decisions,
      comments,
      files,
      drafts,
      events,
    ] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: c.userId },
        select: { id: true, name: true },
      }),
      this.prisma.user.findUnique({
        where: { id: c.ownerId },
        select: { name: true },
      }),
      member
        ? Promise.resolve([])
        : this.prisma.careerConsultingItem.findMany({
            where: { caseId: id },
            orderBy: { createdAt: 'asc' },
          }),
      canReadShared
        ? this.prisma.careerConsultingPublication.findMany({
            where: { caseId: id },
            orderBy: { createdAt: 'asc' },
          })
        : Promise.resolve([]),
      canReadShared
        ? this.prisma.careerConsultingSubmission.findMany({
            where: { caseId: id },
            orderBy: { createdAt: 'asc' },
          })
        : Promise.resolve([]),
      canReadShared
        ? this.prisma.careerConsultingReview.findMany({
            where: { caseId: id },
            orderBy: { createdAt: 'asc' },
          })
        : Promise.resolve([]),
      canReadShared
        ? this.prisma.careerConsultingDecision.findMany({
            where: { caseId: id },
            orderBy: { createdAt: 'asc' },
          })
        : Promise.resolve([]),
      canReadShared
        ? this.prisma.careerConsultingComment.findMany({
            where: { caseId: id, ...(member ? { private: false } : {}) },
            orderBy: { createdAt: 'asc' },
          })
        : Promise.resolve([]),
      canReadShared
        ? this.prisma.careerConsultingFile.findMany({
            where: {
              caseId: id,
              OR: [
                { shared: true },
                { createdBy: member ? actor : { not: c.userId } },
              ],
            },
            select: {
              id: true,
              caseId: true,
              originalName: true,
              size: true,
              shared: true,
              createdBy: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
          })
        : Promise.resolve([]),
      member && canReadShared
        ? this.prisma.careerConsultingResponseDraft.findMany({
            where: { caseId: id, createdBy: actor },
          })
        : Promise.resolve([]),
      member
        ? Promise.resolve([])
        : this.prisma.careerConsultingEvent.findMany({
            where: { caseId: id },
            orderBy: { createdAt: 'desc' },
            take: 200,
            select: {
              id: true,
              action: true,
              entityId: true,
              actorId: true,
              createdAt: true,
            },
          }),
    ]);
    const common = {
      id: c.id,
      title: c.title,
      purpose: c.purpose,
      status: c.status,
      consentStatus: c.consentStatus,
      consentAt: c.consentAt,
      retentionUntil: c.retentionUntil,
      programmeSharing: c.programmeSharing,
      agreementVersion: c.consentVersion ?? AGREEMENT_VERSION,
      person,
      consultantName: owner?.name ?? '',
      publications,
      submissions,
      reviews,
      decisions,
      comments,
      files,
      drafts,
      maxFileBytes: CV_MAX_FILE_SIZE_BYTES,
    };
    if (member) return common;
    await this.prisma.careerConsultingEvent.create({
      data: { caseId: id, actorId: actor, action: 'AUTHORIZED_VIEW' },
    });
    return {
      ...common,
      ownerId: c.ownerId,
      allowedAdminIds: c.allowedAdminIds,
      revision: c.revision,
      items,
      events,
      canWrite: hasAdminAccess(
        'adminPermissions' in a ? a.adminPermissions : {},
        ['CAREER_CONSULTING'],
        'WRITE',
        'isRootAdmin' in a && a.isRootAdmin,
      ),
      canManageAccess:
        ('isRootAdmin' in a && a.isRootAdmin) || c.ownerId === actor,
    };
  }
  async remove(actor: string, id: string, d: RequestDto) {
    await this.prisma.$transaction(async (db) => {
      const { c, a } = await this.check(db, actor, id, false, true);
      if (!('isRootAdmin' in a && a.isRootAdmin) && c.ownerId !== actor)
        throw new ForbiddenException(
          'Only root or the owner can remove this consultation',
        );
      await db.$queryRaw`SELECT id FROM career_consulting_cases WHERE id=${id}::uuid FOR UPDATE`;
      const files = await db.careerConsultingFile.findMany({
        where: { caseId: id },
        select: { storageKey: true },
      });
      if (files.length)
        await db.careerConsultingFileDeletion.createMany({
          data: files,
          skipDuplicates: true,
        });
      await db.notification.deleteMany({
        where: { actionUrl: { contains: id } },
      });
      await db.careerConsultingCase.delete({ where: { id } });
    });
    await this.files.processPending();
    return { id, deleted: true };
  }
  async purgeExpired() {
    return this.prisma.$transaction(async (db) => {
      const cases = await db.careerConsultingCase.findMany({
        where: { retentionUntil: { lte: new Date() } },
        select: { id: true },
        take: 50,
      });
      if (!cases.length) return { deleted: 0 };
      const keys = await db.careerConsultingFile.findMany({
        where: { caseId: { in: cases.map((c) => c.id) } },
        select: { storageKey: true },
      });
      if (keys.length)
        await db.careerConsultingFileDeletion.createMany({
          data: keys,
          skipDuplicates: true,
        });
      await db.notification.deleteMany({
        where: { OR: cases.map((c) => ({ actionUrl: { contains: c.id } })) },
      });
      const deleted = await db.careerConsultingCase.deleteMany({
        where: {
          id: { in: cases.map((c) => c.id) },
          retentionUntil: { lte: new Date() },
        },
      });
      return { deleted: deleted.count };
    });
  }
}
