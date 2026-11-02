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
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hasAdminAccess } from '../admin/admin-access';
import { fingerprint } from './consulting.validation';
import { CreateRoadmapDto, UpdateRoadmapDto } from './roadmap.dto';
import { cleanRoadmap } from './roadmap.validation';
import { ROADMAP_TEMPLATE } from './roadmap-template';
type Tx = Prisma.TransactionClient;
@Injectable()
export class ConsultingRoadmapService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private readonly logger = new Logger(ConsultingRoadmapService.name);
  constructor(private readonly prisma: PrismaService) {}
  onModuleInit() {
    this.timer = setInterval(
      () =>
        void this.purgeExpired().catch(() =>
          this.logger.warn('Roadmap retention cleanup will retry'),
        ),
      30 * 60000,
    );
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async purgeExpired() {
    return this.prisma.careerConsultingRoadmap.deleteMany({
      where: { retentionUntil: { lte: new Date() } },
    });
  }
  private async staff(db: Tx, actor: string, write = false) {
    const a = await db.user.findUnique({
      where: { id: actor },
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
  private scope(a: { id: string; isRootAdmin: boolean }) {
    return {
      retentionUntil: { gt: new Date() },
      ...(a.isRootAdmin ? {} : { ownerId: a.id }),
    };
  }
  private async check(db: Tx, actor: string, id: string, write = false) {
    const a = await this.staff(db, actor, write);
    const map = await db.careerConsultingRoadmap.findFirst({
      where: { id, ...this.scope(a) },
    });
    if (!map) throw new NotFoundException('Roadmap unavailable');
    return map;
  }
  template(actor: string) {
    return this.prisma.$transaction(async (db) => {
      await this.staff(db, actor);
      return ROADMAP_TEMPLATE;
    });
  }
  list(actor: string, page = 1) {
    return this.prisma.$transaction(async (db) => {
      const a = await this.staff(db, actor);
      const where = this.scope(a);
      return {
        items: await db.careerConsultingRoadmap.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          take: 30,
          skip: (page - 1) * 30,
          select: {
            id: true,
            title: true,
            revision: true,
            retentionUntil: true,
            updatedAt: true,
          },
        }),
        total: await db.careerConsultingRoadmap.count({ where }),
      };
    });
  }
  detail(actor: string, id: string) {
    return this.prisma.$transaction((db) => this.check(db, actor, id));
  }
  create(actor: string, dto: CreateRoadmapDto) {
    return this.prisma.$transaction(async (db) => {
      await this.staff(db, actor, true);
      const content = cleanRoadmap(dto.content),
        title = dto.title.trim();
      if (title.length < 3) throw new BadRequestException('Title required');
      const retentionUntil = new Date(dto.retentionUntil);
      // Retention is explicit and immutable: editing notes never silently extends it.
      if (
        !Number.isFinite(+retentionUntil) ||
        +retentionUntil <= Date.now() ||
        +retentionUntil > Date.now() + 366 * 86400000
      )
        throw new BadRequestException('Choose retention within one year');
      const requestHash = fingerprint({
        title,
        content,
        retentionUntil: retentionUntil.toISOString(),
      });
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actor + dto.requestId})::bigint)`;
      const existing = await db.careerConsultingRoadmap.findUnique({
        where: {
          ownerId_requestId: { ownerId: actor, requestId: dto.requestId },
        },
      });
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new ConflictException('Request key was reused');
        if (existing.retentionUntil <= new Date())
          throw new NotFoundException('Roadmap unavailable');
        return existing;
      }
      return db.careerConsultingRoadmap.create({
        data: {
          ownerId: actor,
          title,
          content,
          retentionUntil,
          requestId: dto.requestId,
          requestHash,
        },
      });
    });
  }
  update(actor: string, id: string, dto: UpdateRoadmapDto) {
    return this.prisma.$transaction(async (db) => {
      const map = await this.check(db, actor, id, true);
      const content = cleanRoadmap(dto.content),
        title = dto.title.trim();
      if (title.length < 3) throw new BadRequestException('Title required');
      const hash = fingerprint({ revision: dto.revision, title, content });
      if (map.lastRequestId === dto.requestId) {
        if (map.lastRequestHash !== hash)
          throw new ConflictException('Request key was reused');
        return map;
      }
      const updated = await db.careerConsultingRoadmap.updateMany({
        where: {
          id,
          revision: dto.revision,
          retentionUntil: { gt: new Date() },
        },
        data: {
          title,
          content,
          revision: { increment: 1 },
          lastRequestId: dto.requestId,
          lastRequestHash: hash,
        },
      });
      if (!updated.count)
        throw new ConflictException('A newer roadmap revision exists');
      return db.careerConsultingRoadmap.findUniqueOrThrow({ where: { id } });
    });
  }
  remove(actor: string, id: string) {
    return this.prisma.$transaction(async (db) => {
      const a = await this.staff(db, actor, true);
      await db.careerConsultingRoadmap.deleteMany({
        where: { id, ...this.scope(a) },
      });
      return { removed: true };
    });
  }
}
