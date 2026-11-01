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
import { Prisma, IndividualResearchCase } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hasAdminAccess } from '../admin/admin-access';
import { TasksService } from '../tasks/tasks.service';
import { FeedbackService } from '../feedback/feedback.service';
import { JOURNEY_GUIDANCE_CATALOG } from '../feedback/journey-guidance.catalog';
import { cvFoundationStatus } from '../journey-engine/cv-foundation.util';
import { professionalTasksUnlocked } from '../journey-engine/journey-rules';
import {
  FEATURE_IDS,
  IndividualAccessService,
  overrideSource,
} from './individual-access.service';
import {
  CaseCreateDto,
  CaseQueryDto,
  CaseUpdateDto,
  ConsentDto,
  InterventionDto,
  ObservationDto,
  OverrideDto,
  PlanItemDto,
  SessionDto,
  SessionFollowUpDto,
  ObservationUpdateDto,
} from './individual-research.dto';
type Tx = Prisma.TransactionClient;
type Actor = { id: string; isRootAdmin: boolean; adminPermissions: unknown };
const CASE_SELECT = {
  id: true,
  title: true,
  goal: true,
  status: true,
  nextStep: true,
  followUpAt: true,
  updatedAt: true,
  consentStatus: true,
  retentionUntil: true,
  user: { select: { id: true, name: true, targetJobTitle: true } },
  owner: { select: { id: true, name: true } },
  _count: {
    select: {
      observations: { where: { isBarrier: true, status: { not: 'RESOLVED' } } },
    },
  },
} satisfies Prisma.IndividualResearchCaseSelect;
@Injectable()
export class IndividualResearchService
  implements OnModuleInit, OnModuleDestroy
{
  private timer?: NodeJS.Timeout;
  private readonly logger = new Logger(IndividualResearchService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly feedback: FeedbackService,
    private readonly access: IndividualAccessService,
  ) {}
  onModuleInit() {
    this.timer = setInterval(
      () =>
        void this.purgeExpired().catch(() =>
          this.logger.warn(
            'Research retention purge failed; retrying at next interval',
          ),
        ),
      30 * 60 * 1000,
    );
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async purgeExpired(now = new Date()) {
    return this.prisma.individualResearchCase.deleteMany({
      where: { retentionUntil: { lte: now } },
    });
  }
  private async actor(db: Tx, id: string, write = false): Promise<Actor> {
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
        ['INDIVIDUAL_RESEARCH'],
        write ? 'WRITE' : 'READ',
        a.isRootAdmin,
      )
    )
      throw new ForbiddenException('Individual research permission required');
    return a;
  }
  private async check(db: Tx, actorId: string, id: string, write = false) {
    const a = await this.actor(db, actorId, write),
      c = await db.individualResearchCase.findUnique({ where: { id } });
    if (
      !c ||
      c.retentionUntil <= new Date() ||
      (!a.isRootAdmin &&
        c.ownerId !== actorId &&
        !c.allowedAdminIds.includes(actorId))
    )
      throw new NotFoundException('Case not found');
    return { actor: a, c };
  }
  private collection(c: IndividualResearchCase) {
    if (
      c.status !== 'ACTIVE' ||
      c.consentStatus !== 'GIVEN' ||
      c.retentionUntil <= new Date()
    )
      throw new ForbiddenException(
        'Active case and current participant consent required',
      );
  }
  private retention(value: string) {
    const date = new Date(value),
      now = Date.now();
    if (date.getTime() <= now || date.getTime() > now + 366 * 86400000)
      throw new BadRequestException('Retention must end within the next year');
    return date;
  }
  private async event(
    db: Tx,
    caseId: string,
    actorId: string,
    action: string,
    requestId?: string,
    entityId?: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    return db.individualCaseEvent.create({
      data: { caseId, actorId, action, requestId, entityId, metadata },
    });
  }
  private async admins(db: Tx, ownerId: string, allowed: string[]) {
    const ids = [...new Set([ownerId, ...allowed])];
    const admins = await db.user.findMany({
      where: { id: { in: ids }, role: 'ADMIN' },
      select: { id: true, isRootAdmin: true, adminPermissions: true },
    });
    if (
      admins.length !== ids.length ||
      admins.some(
        (a) =>
          !hasAdminAccess(
            a.adminPermissions,
            ['INDIVIDUAL_RESEARCH'],
            a.id === ownerId ? 'WRITE' : 'READ',
            a.isRootAdmin,
          ),
      )
    )
      throw new BadRequestException(
        'Choose administrators authorized for individual research',
      );
  }
  private async mutate<T>(
    actorId: string,
    id: string,
    requestId: string,
    action: string,
    fn: (
      db: Tx,
      c: IndividualResearchCase,
      a: Actor,
      duplicate: boolean,
    ) => Promise<T>,
    changedFields: string[] = [],
  ) {
    return this.prisma.$transaction(
      async (db) => {
        await db.$queryRaw`SELECT id FROM individual_research_cases WHERE id=${id}::uuid FOR UPDATE`;
        const { actor, c } = await this.check(db, actorId, id, true);
        const previous = await db.individualCaseEvent.findUnique({
          where: { caseId_requestId: { caseId: id, requestId } },
        });
        if (previous && previous.action !== action)
          throw new ConflictException(
            'Request key already used for a different action',
          );
        const result = await fn(db, c, actor, Boolean(previous));
        if (!previous) {
          await this.event(
            db,
            id,
            actorId,
            action,
            requestId,
            typeof result === 'object' && result && 'id' in result
              ? String(result.id)
              : undefined,
            {
              caseStatusBefore: c.status,
              changedFields,
              ...(result && typeof result === 'object' && 'status' in result
                ? { entityStatus: String(result.status) }
                : {}),
            },
          );
          await db.individualResearchCase.update({
            where: { id },
            data: { updatedAt: new Date() },
          });
        }
        return result;
      },
      { timeout: 15000 },
    );
  }
  async candidates(actorId: string, search = '') {
    return this.prisma.$transaction(async (db) => {
      await this.actor(db, actorId, true);
      return db.user.findMany({
        where: {
          role: 'USER',
          name: { contains: search, mode: 'insensitive' },
        },
        select: { id: true, name: true, targetJobTitle: true },
        take: 30,
        orderBy: { name: 'asc' },
      });
    });
  }
  async staff(actorId: string) {
    return this.prisma.$transaction(async (db) => {
      await this.actor(db, actorId);
      const people = await db.user.findMany({
        where: { role: 'ADMIN' },
        select: {
          id: true,
          name: true,
          isRootAdmin: true,
          adminPermissions: true,
        },
      });
      return people
        .filter((p) =>
          hasAdminAccess(
            p.adminPermissions,
            ['INDIVIDUAL_RESEARCH'],
            'READ',
            p.isRootAdmin,
          ),
        )
        .map((p) => ({
          id: p.id,
          name: p.name,
          canOwn: hasAdminAccess(
            p.adminPermissions,
            ['INDIVIDUAL_RESEARCH'],
            'WRITE',
            p.isRootAdmin,
          ),
        }));
    });
  }
  async list(actorId: string, q: CaseQueryDto) {
    return this.prisma.$transaction(async (db) => {
      const a = await this.actor(db, actorId);
      const where: Prisma.IndividualResearchCaseWhereInput = {
        retentionUntil: { gt: new Date() },
        ...(!a.isRootAdmin
          ? {
              OR: [{ ownerId: actorId }, { allowedAdminIds: { has: actorId } }],
            }
          : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.search
          ? {
              AND: [
                {
                  OR: [
                    { title: { contains: q.search, mode: 'insensitive' } },
                    {
                      user: {
                        name: { contains: q.search, mode: 'insensitive' },
                      },
                    },
                  ],
                },
              ],
            }
          : {}),
      };
      const [items, total] = await Promise.all([
        db.individualResearchCase.findMany({
          where,
          select: CASE_SELECT,
          orderBy: { updatedAt: 'desc' },
          skip: ((q.page ?? 1) - 1) * (q.limit ?? 20),
          take: q.limit ?? 20,
        }),
        db.individualResearchCase.count({ where }),
      ]);
      return { items, total, page: q.page ?? 1, limit: q.limit ?? 20 };
    });
  }
  async create(actorId: string, d: CaseCreateDto) {
    return this.prisma.$transaction(async (db) => {
      const a = await this.actor(db, actorId, true);
      const old = await db.individualResearchCase.findUnique({
        where: { requestId: d.requestId },
      });
      if (old) {
        await this.check(db, actorId, old.id, true);
        return old;
      }
      const ownerId = d.ownerId ?? actorId;
      if (!a.isRootAdmin && ownerId !== actorId)
        throw new ForbiddenException(
          'Only root can assign a different owner at creation',
        );
      await this.admins(db, ownerId, d.allowedAdminIds ?? []);
      if (
        !(await db.user.findFirst({
          where: { id: d.userId, role: 'USER' },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Member not found');
      const c = await db.individualResearchCase.create({
        data: {
          userId: d.userId,
          ownerId,
          allowedAdminIds: d.allowedAdminIds ?? [],
          title: d.title.trim(),
          goal: d.goal.trim(),
          hypothesis: d.hypothesis.trim(),
          retentionUntil: this.retention(d.retentionUntil),
          requestId: d.requestId,
        },
      });
      await this.event(db, c.id, actorId, 'CASE_CREATED', undefined, c.id);
      return c;
    });
  }
  async detail(actorId: string, id: string) {
    return this.prisma.$transaction(async (db) => {
      const { actor, c } = await this.check(db, actorId, id);
      await this.event(db, id, actorId, 'CASE_VIEWED');
      const [
        user,
        sessions,
        observations,
        planItems,
        overrides,
        events,
        counts,
        assignedTasks,
        directFeedback,
      ] = await Promise.all([
        db.user.findUnique({
          where: { id: c.userId },
          select: {
            id: true,
            name: true,
            targetJobTitle: true,
            portfolioUrl: true,
            journeyState: true,
            cv: { select: { originalName: true } },
            cvHistory: {
              orderBy: { versionNumber: 'desc' },
              take: 1,
              select: { versionNumber: true, uploadedAt: true },
            },
            _count: { select: { applications: true, assignedTasks: true } },
          },
        }),
        db.individualCaseSession.findMany({
          where: { caseId: id },
          orderBy: { heldAt: 'desc' },
          take: 100,
        }),
        db.individualCaseObservation.findMany({
          where: { caseId: id },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        db.individualCasePlanItem.findMany({
          where: { caseId: id },
          include: {
            task: { select: { id: true, title: true, status: true } },
            feedback: {
              select: {
                id: true,
                title: true,
                archivedAt: true,
                reads: {
                  where: { userId: c.userId },
                  select: { readAt: true },
                },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
          take: 100,
        }),
        db.individualAccessOverride.findMany({
          where: { caseId: id },
          orderBy: { createdAt: 'desc' },
          take: 200,
        }),
        db.individualCaseEvent.findMany({
          where: { caseId: id },
          orderBy: { createdAt: 'desc' },
          take: 200,
        }),
        db.individualResearchCase.findUnique({
          where: { id },
          select: {
            _count: {
              select: {
                sessions: true,
                observations: true,
                planItems: true,
                events: true,
              },
            },
          },
        }),
        db.task.findMany({
          where: { userId: c.userId, source: 'MENTOR_ASSIGNED' },
          select: { id: true, title: true, status: true },
          take: 100,
          orderBy: { updatedAt: 'desc' },
        }),
        db.feedbackPost.findMany({
          where: {
            targetUserId: c.userId,
            visibility: 'DIRECT',
            archivedAt: null,
          },
          select: { id: true, title: true },
          take: 100,
          orderBy: { publishedAt: 'desc' },
        }),
      ]);
      const allGrants = await this.access.grants(c.userId, db);
      const activeCase = {
        status: c.status,
        consentStatus: c.consentStatus,
        retentionUntil: c.retentionUntil,
      };
      const state = user?.journeyState ?? {
        currentWeek: 0,
        currentNodeCode: 'TASK_0',
        completedNodeCodes: [],
        readInsightCodes: [],
        unlockedInsightCodes: [] as string[],
        canUseTableView: false,
      };
      const normal = {
        analytics: cvFoundationStatus(state, user?.cvHistory ?? []).completed,
        professionalTasks: professionalTasksUnlocked(
          state.currentWeek,
          state.readInsightCodes ?? [],
        ),
        tableView: state.canUseTableView,
      };
      const accessOverview = await this.access.decisions(
        c.userId,
        [
          ...Object.entries(normal).map(([key, value]) => ({
            resourceType: 'FEATURE',
            resourceId: key,
            normalView: value,
            normalInteract: key === 'professionalTasks' && value,
          })),
          ...JOURNEY_GUIDANCE_CATALOG.map((g) => ({
            resourceType: 'GUIDANCE',
            resourceId: g.code,
            normalView: (state.unlockedInsightCodes ?? []).includes(g.code),
            normalInteract: (state.unlockedInsightCodes ?? []).includes(g.code),
          })),
        ],
        db,
      );
      const reports = await this.access.reportAccess(
        c.userId,
        state,
        normal.analytics,
        db,
      );
      return {
        ...c,
        user,
        sessions,
        observations,
        planItems,
        resourceOptions: { assignedTasks, directFeedback },
        accessOverview: [
          ...accessOverview,
          reports.performance,
          ...reports.weeks,
          reports.final,
        ],
        overrides: overrides.map((o) => ({
          ...o,
          effectiveSource: overrideSource({ ...o, case: activeCase }),
        })),
        effectiveOverrides: allGrants.map((g) => ({
          resourceType: g.resourceType,
          resourceId: g.resourceId,
          permission: g.permission,
        })),
        events,
        counts: counts?._count,
        canWrite: hasAdminAccess(
          actor.adminPermissions,
          ['INDIVIDUAL_RESEARCH'],
          'WRITE',
          actor.isRootAdmin,
        ),
        canManageAccess: actor.isRootAdmin || c.ownerId === actorId,
      };
    });
  }
  async update(actorId: string, id: string, d: CaseUpdateDto) {
    return this.mutate(
      actorId,
      id,
      d.requestId,
      'CASE_UPDATED',
      async (db, c, a, duplicate) => {
        if (duplicate) return c;
        if (
          c.consentStatus === 'GIVEN' &&
          ((d.goal !== undefined && d.goal !== c.goal) ||
            (d.retentionUntil && new Date(d.retentionUntil) > c.retentionUntil))
        )
          throw new ConflictException(
            'A different purpose or longer retention requires a new case and explicit consent',
          );
        if (
          (d.ownerId || d.allowedAdminIds) &&
          !a.isRootAdmin &&
          c.ownerId !== actorId
        )
          throw new ForbiddenException(
            'Only the owner or root can change case access',
          );
        if (d.ownerId || d.allowedAdminIds)
          await this.admins(
            db,
            d.ownerId ?? c.ownerId,
            d.allowedAdminIds ?? c.allowedAdminIds,
          );
        if (d.status && d.status !== c.status) {
          const transitions: Record<string, string[]> = {
            DRAFT: ['ACTIVE', 'PAUSED'],
            ACTIVE: ['PAUSED', 'COMPLETED'],
            PAUSED: ['ACTIVE', 'COMPLETED'],
            COMPLETED: [],
          };
          if (!transitions[c.status]?.includes(d.status))
            throw new BadRequestException('Invalid case status transition');
          if (
            d.status === 'ACTIVE' &&
            (c.consentStatus !== 'GIVEN' || c.retentionUntil <= new Date())
          )
            throw new BadRequestException(
              'Record current consent and retention before activation',
            );
        }
        const { requestId, retentionUntil, followUpAt, review, ...fields } = d;
        return db.individualResearchCase.update({
          where: { id },
          data: {
            ...fields,
            ...(retentionUntil
              ? { retentionUntil: this.retention(retentionUntil) }
              : {}),
            ...(followUpAt ? { followUpAt: new Date(followUpAt) } : {}),
            ...(review
              ? { review: review as unknown as Prisma.InputJsonValue }
              : {}),
          },
        });
      },
      Object.keys(d).filter((k) => k !== 'requestId'),
    );
  }
  async consent(actorId: string, id: string, d: ConsentDto) {
    return this.mutate(
      actorId,
      id,
      d.requestId,
      'CONSENT_RECORDED',
      async (db, c, _a, duplicate) => {
        if (duplicate) return c;
        if (c.consentStatus === 'GIVEN')
          throw new ConflictException(
            'Consent is already recorded; create a new case for changed research terms',
          );
        if (c.consentStatus === 'WITHDRAWN')
          throw new BadRequestException(
            'Withdrawn participation needs a new case and new consent',
          );
        if (!d.confirmed || new Date(d.consentAt).getTime() > Date.now())
          throw new BadRequestException('Explicit dated consent is required');
        return db.individualResearchCase.update({
          where: { id },
          data: {
            consentStatus: 'GIVEN',
            consentAt: new Date(d.consentAt),
            consentMethod: d.method,
            consentEvidence: d.evidence,
          },
        });
      },
    );
  }
  async session(actorId: string, id: string, d: SessionDto) {
    return this.mutate(
      actorId,
      id,
      d.requestId,
      'SESSION_RECORDED',
      async (db, c, _a, dup) => {
        if (!dup) this.collection(c);
        const old = await db.individualCaseSession.findUnique({
          where: { caseId_requestId: { caseId: id, requestId: d.requestId } },
        });
        if (old) return old;
        return db.individualCaseSession.create({
          data: {
            ...d,
            caseId: id,
            heldAt: new Date(d.heldAt),
            followUpAt: d.followUpAt ? new Date(d.followUpAt) : null,
          },
        });
      },
    );
  }
  async observation(actorId: string, id: string, d: ObservationDto) {
    return this.mutate(
      actorId,
      id,
      d.requestId,
      'OBSERVATION_RECORDED',
      async (db, c, _a, dup) => {
        if (!dup) this.collection(c);
        const old = await db.individualCaseObservation.findUnique({
          where: { caseId_requestId: { caseId: id, requestId: d.requestId } },
        });
        if (old) return old;
        if (
          d.sessionId &&
          !(await db.individualCaseSession.findFirst({
            where: { id: d.sessionId, caseId: id },
            select: { id: true },
          }))
        )
          throw new BadRequestException('Session belongs to a different case');
        return db.individualCaseObservation.create({
          data: { ...d, caseId: id },
        });
      },
    );
  }
  async sessionFollowUp(
    actorId: string,
    id: string,
    sessionId: string,
    d: SessionFollowUpDto,
  ) {
    return this.mutate(
      actorId,
      id,
      d.requestId,
      'SESSION_FOLLOW_UP',
      async (db, c, _a, dup) => {
        const row = await db.individualCaseSession.findFirst({
          where: { id: sessionId, caseId: id },
        });
        if (!row) throw new NotFoundException('Session not found');
        if (dup) return row;
        this.collection(c);
        return db.individualCaseSession.update({
          where: { id: sessionId },
          data: {
            followUpStatus: d.followUpStatus,
            ...(d.followUpAt ? { followUpAt: new Date(d.followUpAt) } : {}),
            ...(d.outcome !== undefined ? { outcome: d.outcome } : {}),
          },
        });
      },
    );
  }
  async observationUpdate(
    actorId: string,
    id: string,
    observationId: string,
    d: ObservationUpdateDto,
  ) {
    return this.mutate(
      actorId,
      id,
      d.requestId,
      'OBSERVATION_UPDATED',
      async (db, c, _a, dup) => {
        const row = await db.individualCaseObservation.findFirst({
          where: { id: observationId, caseId: id },
        });
        if (!row) throw new NotFoundException('Observation not found');
        if (dup) return row;
        this.collection(c);
        return db.individualCaseObservation.update({
          where: { id: observationId },
          data: {
            status: d.status,
            ...(d.evidence !== undefined ? { evidence: d.evidence } : {}),
          },
        });
      },
    );
  }
  private async links(
    db: Tx,
    c: IndividualResearchCase,
    d: { taskId?: string; feedbackId?: string; nodeCode?: string },
  ) {
    if (
      d.taskId &&
      !(await db.task.findFirst({
        where: { id: d.taskId, userId: c.userId, source: 'MENTOR_ASSIGNED' },
        select: { id: true },
      }))
    )
      throw new BadRequestException(
        'Task must be assigned to this participant',
      );
    if (
      d.feedbackId &&
      !(await db.feedbackPost.findFirst({
        where: {
          id: d.feedbackId,
          targetUserId: c.userId,
          visibility: 'DIRECT',
          archivedAt: null,
        },
        select: { id: true },
      }))
    )
      throw new BadRequestException(
        'Feedback must be direct to this participant',
      );
    if (
      d.nodeCode &&
      !(await db.journeyNode.findUnique({
        where: { code: d.nodeCode },
        select: { id: true },
      }))
    )
      throw new BadRequestException('Unknown journey node');
  }
  async plan(actorId: string, id: string, d: PlanItemDto) {
    return this.mutate(
      actorId,
      id,
      d.requestId,
      'PLAN_ITEM_CREATED',
      async (db, c, _a, dup) => {
        if (!dup) this.collection(c);
        const old = await db.individualCasePlanItem.findUnique({
          where: { caseId_requestId: { caseId: id, requestId: d.requestId } },
        });
        if (old) return old;
        await this.links(db, c, d);
        return db.individualCasePlanItem.create({
          data: { ...d, caseId: id, dueAt: d.dueAt ? new Date(d.dueAt) : null },
        });
      },
    );
  }
  async planStatus(
    actorId: string,
    id: string,
    itemId: string,
    requestId: string,
    status: string,
  ) {
    return this.mutate(
      actorId,
      id,
      requestId,
      'PLAN_STATUS_UPDATED',
      async (db, c, _a, dup) => {
        const item = await db.individualCasePlanItem.findFirst({
          where: { id: itemId, caseId: id },
        });
        if (!item) throw new NotFoundException('Plan item not found');
        if (dup) return item;
        this.collection(c);
        return db.individualCasePlanItem.update({
          where: { id: itemId },
          data: { status, completedAt: status === 'DONE' ? new Date() : null },
        });
      },
    );
  }
  async intervention(actorId: string, id: string, d: InterventionDto) {
    return this.mutate(
      actorId,
      id,
      d.requestId,
      'INTERVENTION_PUBLISHED',
      async (db, c, _a, dup) => {
        const old = await db.individualCasePlanItem.findUnique({
          where: { caseId_requestId: { caseId: id, requestId: d.requestId } },
        });
        if (old) return old;
        this.collection(c);
        if (!d.publishConfirmed)
          throw new BadRequestException(
            'Explicit member-facing publication confirmation required',
          );
        let taskId = d.kind === 'TASK' ? d.existingId : undefined,
          feedbackId = d.kind === 'FEEDBACK' ? d.existingId : undefined;
        if (d.existingId) await this.links(db, c, { taskId, feedbackId });
        else if (d.kind === 'TASK') {
          const task = await this.tasks.createForMember(
            c.userId,
            actorId,
            { title: d.title, description: d.content, priority: 'MEDIUM' },
            db,
          );
          taskId = task.id;
        } else {
          const feedback = await this.feedback.create(
            actorId,
            {
              title: d.title,
              content: d.content,
              visibility: 'DIRECT',
              targetUserId: c.userId,
              sendEmailNotification: false,
            },
            db,
          );
          feedbackId = feedback.id;
        }
        return db.individualCasePlanItem.create({
          data: {
            caseId: id,
            title: d.title,
            completionCondition:
              'Review the actual linked resource outcome; opening it is not completion.',
            taskId,
            feedbackId,
            requestId: d.requestId,
          },
        });
      },
    );
  }
  async grant(actorId: string, id: string, d: OverrideDto) {
    return this.mutate(
      actorId,
      id,
      d.requestId,
      'ACCESS_GRANTED',
      async (db, c, _a, dup) => {
        const old = await db.individualAccessOverride.findUnique({
          where: { caseId_requestId: { caseId: id, requestId: d.requestId } },
        });
        if (old) return old;
        this.collection(c);
        if (
          d.resourceType === 'FEATURE' &&
          !(FEATURE_IDS as readonly string[]).includes(d.resourceId)
        )
          throw new BadRequestException('Unsupported individual feature');
        if (
          d.resourceType === 'GUIDANCE' &&
          !JOURNEY_GUIDANCE_CATALOG.some((g) => g.code === d.resourceId)
        )
          throw new BadRequestException(
            'P0 supports catalog guidance. Use existing DIRECT Feedback for individual material',
          );
        if (
          d.resourceType === 'WEEKLY_REPORT' &&
          !['1', '2', '3', '4'].includes(d.resourceId)
        )
          throw new BadRequestException('Unknown report week');
        if (
          (d.resourceType === 'PERFORMANCE_ANALYTICS' &&
            d.resourceId !== 'performance') ||
          (d.resourceType === 'FINAL_REPORT' && d.resourceId !== 'final')
        )
          throw new BadRequestException('Unknown report resource');
        if (
          ['WEEKLY_REPORT', 'FINAL_REPORT', 'PERFORMANCE_ANALYTICS'].includes(
            d.resourceType,
          ) &&
          d.permission !== 'VIEW'
        )
          throw new BadRequestException(
            'Reports can only grant viewing, never completion',
          );
        if (
          d.resourceType === 'FEATURE' &&
          d.resourceId !== 'professionalTasks' &&
          d.permission !== 'VIEW'
        )
          throw new BadRequestException(
            'This feature supports view access only',
          );
        if (d.resourceType === 'PLAN_ITEM')
          throw new BadRequestException(
            'Member-interactive individual plan steps are deferred to P1; use existing assigned Tasks',
          );
        const startsAt = new Date(d.startsAt),
          endsAt = d.endsAt ? new Date(d.endsAt) : null;
        if (
          startsAt >= c.retentionUntil ||
          (endsAt && (endsAt <= startsAt || endsAt > c.retentionUntil))
        )
          throw new BadRequestException(
            'Access window must be inside case retention and end after its start',
          );
        return db.individualAccessOverride.create({
          data: {
            ...d,
            caseId: id,
            userId: c.userId,
            issuedBy: actorId,
            startsAt,
            endsAt,
          },
        });
      },
    );
  }
  async revoke(
    actorId: string,
    id: string,
    overrideId: string,
    requestId: string,
  ) {
    return this.mutate(
      actorId,
      id,
      requestId,
      'ACCESS_REVOKED',
      async (db, _c, _a, dup) => {
        const row = await db.individualAccessOverride.findFirst({
          where: { id: overrideId, caseId: id },
        });
        if (!row) throw new NotFoundException('Override not found');
        if (dup || row.status === 'REVOKED') return row;
        return db.individualAccessOverride.update({
          where: { id: overrideId },
          data: { status: 'REVOKED', revokedAt: new Date() },
        });
      },
    );
  }
  async withdraw(
    actorId: string,
    id: string,
    requestId: string,
    member = false,
  ) {
    return this.prisma.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM individual_research_cases WHERE id=${id}::uuid FOR UPDATE`;
      const c = await db.individualResearchCase.findUnique({ where: { id } });
      if (!c) throw new NotFoundException('Participation not found');
      if (member) {
        if (c.userId !== actorId)
          throw new NotFoundException('Participation not found');
      } else await this.check(db, actorId, id, true);
      if (c.consentStatus === 'WITHDRAWN') return { success: true };
      await db.individualResearchCase.update({
        where: { id },
        data: {
          consentStatus: 'WITHDRAWN',
          consentWithdrawnAt: new Date(),
          status: c.status === 'COMPLETED' ? 'COMPLETED' : 'PAUSED',
        },
      });
      await db.individualAccessOverride.updateMany({
        where: { caseId: id, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      await this.event(db, id, actorId, 'CONSENT_WITHDRAWN', requestId);
      return { success: true };
    });
  }
  async remove(actorId: string, id: string) {
    return this.prisma.$transaction(async (db) => {
      await this.check(db, actorId, id, true);
      await db.individualResearchCase.delete({ where: { id } });
      return { success: true };
    });
  }
  async participation(userId: string) {
    return this.prisma.individualResearchCase.findMany({
      where: { userId, retentionUntil: { gt: new Date() } },
      select: {
        id: true,
        title: true,
        goal: true,
        status: true,
        consentStatus: true,
        consentAt: true,
        consentWithdrawnAt: true,
        retentionUntil: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
