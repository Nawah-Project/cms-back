import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UxLabExperiment } from '@prisma/client';
import { enrollOrganizedEntry } from '../members/organized-entry';
import { PrismaService } from '../prisma/prisma.service';
import {
  LabEventBatchDto,
  LabExperimentDto,
  LabReleaseDto,
  LabReportQuery,
} from './ux-lab.dto';
import {
  registrySection,
  SECTION_REGISTRY,
  stableArm,
  PREVIEW_ONLY_SECTIONS,
} from './registry';

// A dedicated production QA account must not affect research evidence. Admin previews
// are excluded by role. No real user is excluded based on their name or activity.
const QA_ID = 'aeef0606-17bb-47b6-a239-4a44526303b4';
const baseline = (section: string) => `baseline-20261027:${section}`;
const eligibleUser = { role: 'USER' as const, id: { not: QA_ID } };
const rate = (n: number, d: number) =>
  d > 0 ? Math.round((n / d) * 1000) / 10 : null;
type Rollup = {
  section: string;
  version: string;
  name: string;
  users: number;
  events: number;
  seconds: number;
};

@Injectable()
export class UxLabService {
  constructor(private readonly prisma: PrismaService) {}
  async releases(db: Prisma.TransactionClient = this.prisma) {
    const rows = await db.uxLabRelease.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      distinct: ['section'],
    });
    return Object.fromEntries(
      SECTION_REGISTRY.map((s) => {
        const r = PREVIEW_ONLY_SECTIONS.has(s.id)
          ? undefined
          : rows.find((x) => x.section === s.id);
        return [
          s.id,
          {
            version: r?.version ?? 'A',
            context: r ? `release:${r.id}` : baseline(s.id),
            updatedAt: r?.createdAt ?? null,
          },
        ];
      }),
    );
  }
  async assignment(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { role: true, membership: { select: { groupId: true } } },
    });
    await this.prisma.$transaction((db) => enrollOrganizedEntry(db, userId));
    const sections = await this.releases();
    if (user.role !== 'USER' || userId === QA_ID)
      return { sections, excluded: true };
    const experiments = await this.prisma.uxLabExperiment.findMany({
      where: { status: 'RUNNING' },
      include: { assignments: { where: { userId } } },
    });
    for (const e of experiments) {
      if (PREVIEW_ONLY_SECTIONS.has(e.section)) continue;
      const targeted =
        e.audience === 'ALL' ||
        (e.audience === 'USERS' && e.userIds.includes(userId)) ||
        (e.audience === 'GROUPS' &&
          !!user.membership &&
          e.groupIds.includes(user.membership.groupId));
      if (!targeted && !e.assignments.length) continue;
      if (e.audience === 'ENTRY' && !e.assignments.length) continue;
      // Upsert freezes the arm on the account even when the audience changes later.
      const a = await this.prisma.uxLabAssignment.upsert({
        where: { experimentId_userId: { experimentId: e.id, userId } },
        create: {
          experimentId: e.id,
          userId,
          version: stableArm(e.id, userId, e.allocation),
        },
        update: {},
      });
      sections[e.section] = {
        version: a.version,
        context: `experiment:${e.id}`,
        updatedAt: e.startedAt,
      };
    }
    return { sections, excluded: false };
  }
  async create(actorId: string, dto: LabExperimentDto) {
    if (PREVIEW_ONLY_SECTIONS.has(dto.section))
      throw new BadRequestException('Home B is administrator preview only');
    if (
      dto.audience === 'ENTRY' &&
      (dto.section !== 'home' ||
        dto.allocation !== 50 ||
        dto.primaryMetric !== 'home_task_zero_completed')
    )
      throw new BadRequestException(
        'Organized entry requires Home and a 50/50 allocation',
      );
    if (dto.title.trim().length < 3 || dto.hypothesis.trim().length < 10)
      throw new BadRequestException(
        'A meaningful title and hypothesis are required',
      );
    const s = registrySection(dto.section);
    if (!s || !(s.versions as readonly string[]).includes('B'))
      throw new BadRequestException(
        'This section has no implemented B design yet',
      );
    if (!(s.metrics as readonly string[]).includes(dto.primaryMetric))
      throw new BadRequestException(
        'Choose a metric implemented in this section',
      );
    const groupIds = [...new Set(dto.groupIds)],
      userIds = [...new Set(dto.userIds)];
    if (
      (['ALL', 'ENTRY'].includes(dto.audience) &&
        (groupIds.length || userIds.length)) ||
      (dto.audience === 'GROUPS' && (!groupIds.length || userIds.length)) ||
      (dto.audience === 'USERS' && (!userIds.length || groupIds.length))
    )
      throw new BadRequestException('Choose one non-empty audience');
    const [groups, users] = await Promise.all([
      this.prisma.group.count({ where: { id: { in: groupIds } } }),
      this.prisma.user.count({
        where: { ...eligibleUser, id: { in: userIds, not: QA_ID } },
      }),
    ]);
    if (groups !== groupIds.length || users !== userIds.length)
      throw new BadRequestException('Invalid or excluded audience member');
    return this.prisma.uxLabExperiment.create({
      data: {
        ...dto,
        title: dto.title.trim(),
        hypothesis: dto.hypothesis.trim(),
        groupIds,
        userIds,
        createdBy: actorId,
      },
    });
  }
  async transition(id: string, status: string) {
    const found = await this.prisma.uxLabExperiment.findUnique({
      where: { id },
    });
    if (!found) throw new NotFoundException();
    return this.prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${found.section}))`;
      const e = await db.uxLabExperiment.findUniqueOrThrow({ where: { id } });
      const transitions: Record<string, string[]> = {
        DRAFT: ['RUNNING', 'COMPLETED'],
        RUNNING: ['PAUSED', 'COMPLETED'],
        PAUSED: ['RUNNING', 'COMPLETED'],
        COMPLETED: [],
      };
      if (!transitions[e.status].includes(status))
        throw new ConflictException('Experiment status changed; refresh first');
      if (status === 'RUNNING') {
        if (PREVIEW_ONLY_SECTIONS.has(e.section))
          throw new BadRequestException('Home B is administrator preview only');
        if (
          await db.uxLabExperiment.count({
            where: {
              section: e.section,
              status: { in: ['RUNNING', 'PAUSED'] },
              id: { not: id },
            },
          })
        )
          throw new ConflictException(
            'Finish the other experiment in this section first',
          );
        if ((await this.releases(db))[e.section].version !== 'A')
          throw new ConflictException(
            'Restore section A before testing A against B',
          );
      }
      return db.uxLabExperiment.update({
        where: { id },
        data: {
          status,
          ...(status === 'RUNNING' && !e.startedAt
            ? { startedAt: new Date() }
            : {}),
          ...(status === 'COMPLETED' ? { endedAt: new Date() } : {}),
        },
      });
    });
  }
  async publish(actorId: string, section: string, dto: LabReleaseDto) {
    if (PREVIEW_ONLY_SECTIONS.has(section))
      throw new BadRequestException('Home B is administrator preview only');
    const s = registrySection(section);
    if (!s || !(s.versions as readonly string[]).includes(dto.version))
      throw new BadRequestException('Design is not implemented');
    return this.prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${section}))`;
      if (
        await db.uxLabExperiment.count({
          where: { section, status: { in: ['RUNNING', 'PAUSED'] } },
        })
      )
        throw new ConflictException(
          'Complete the section experiment before publishing',
        );
      const current = (await this.releases(db))[section];
      if (current.context !== dto.expectedContext)
        throw new ConflictException(
          'Release changed; refresh before publishing',
        );
      if (current.version === dto.version) return current;
      const release = await db.uxLabRelease.create({
        data: { section, version: dto.version, createdBy: actorId },
      });
      return {
        version: release.version,
        context: `release:${release.id}`,
        updatedAt: release.createdAt,
      };
    });
  }
  async record(userId: string, batch: LabEventBatchDto) {
    // A request queued before logout must never be attributed to a subsequent
    // account that happens to own the browser's cookie when it is transmitted.
    if (batch.accountId !== userId)
      throw new ForbiddenException('Account changed; discard stale telemetry');
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { role: true, membership: { select: { groupId: true } } },
    });
    if (user.role !== 'USER' || userId === QA_ID)
      return { accepted: 0, excluded: true };
    // Validate the complete batch before writing. There is deliberately no arbitrary
    // metadata field: CV contents, form values and identifying text cannot enter it.
    for (const e of batch.events) {
      if (PREVIEW_ONLY_SECTIONS.has(e.section))
        throw new BadRequestException('Home B is administrator preview only');
      if (e.name === 'home_task_zero_completed')
        throw new BadRequestException(
          'Task zero is measured from durable journey state',
        );
      const s = registrySection(e.section)!;
      if (
        !(s.metrics as readonly string[]).includes(e.name) &&
        !['view', 'engaged', 'request_failed', 'validation_failed'].includes(
          e.name,
        )
      )
        throw new BadRequestException('Action does not belong to this section');
      if (e.name !== 'engaged' && e.duration)
        throw new BadRequestException(
          'Only active engagement carries duration',
        );
      if (e.context === baseline(e.section) && e.version === 'A') continue;
      const [kind, id] = e.context.split(':');
      if (!/^[0-9a-f-]{36}$/i.test(id ?? ''))
        throw new BadRequestException('Invalid exposure context');
      if (kind === 'release') {
        const r = await this.prisma.uxLabRelease.findUnique({ where: { id } });
        if (!r || r.section !== e.section || r.version !== e.version)
          throw new BadRequestException('Unknown release');
      } else if (kind === 'experiment') {
        const a = await this.prisma.uxLabAssignment.findUnique({
          where: { experimentId_userId: { experimentId: id, userId } },
          include: { experiment: true },
        });
        if (
          !a ||
          a.version !== e.version ||
          a.experiment.section !== e.section ||
          a.experiment.status !== 'RUNNING'
        )
          throw new ConflictException(
            'Experiment is no longer active; refresh assignment',
          );
      } else throw new BadRequestException('Invalid exposure context');
    }
    // Actions must belong to a real, earlier page exposure in this session/context.
    // The transaction and event UUIDs make retrying a batch safe.
    const accepted = await this.prisma.$transaction(async (db) => {
      let count = 0;
      for (const e of batch.events) {
        if (e.name !== 'view') {
          const view = await db.uxLabEvent.findFirst({
            where: {
              userId,
              sessionId: e.sessionId,
              section: e.section,
              context: e.context,
              version: e.version,
              name: 'view',
            },
            select: { id: true },
          });
          if (!view) continue;
        }
        const x = await db.uxLabEvent.createMany({
          data: [
            {
              ...e,
              userId,
              groupId: user.membership?.groupId ?? null,
              duration: e.name === 'engaged' ? (e.duration ?? 0) : 0,
            },
          ],
          skipDuplicates: true,
        });
        count += x.count;
      }
      return count;
    });
    return { accepted, excluded: false };
  }
  async config() {
    const [releases, experiments] = await Promise.all([
      this.releases(),
      this.prisma.uxLabExperiment.findMany({
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { assignments: true } } },
      }),
    ]);
    return {
      baseline: '2026-10-27',
      registry: SECTION_REGISTRY,
      releases,
      experiments,
    };
  }
  async report(q: LabReportQuery) {
    const days = q.days ?? 30;
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - days + 1);
    const scope = Prisma.sql`e.created_at >= ${since} AND u.role='USER' AND u.id<>${QA_ID}::uuid ${q.groupId ? Prisma.sql`AND e.group_id=${q.groupId}::uuid` : Prisma.empty} ${q.experimentId ? Prisma.sql`AND e.context=${'experiment:' + q.experimentId}` : Prisma.empty}`;
    const [rollup, daily, sessions, experiments, guideCounts] =
      await Promise.all([
        this.prisma.$queryRaw<
          Rollup[]
        >`SELECT e.section,e.version,e.name,count(DISTINCT e.user_id)::int users,count(*)::int events,coalesce(sum(e.duration),0)::int seconds FROM ux_lab_events e JOIN users u ON u.id=e.user_id WHERE ${scope} GROUP BY e.section,e.version,e.name`,
        this.prisma.$queryRaw<
          Array<{
            day: string;
            views: number;
            users: number;
            actions: number;
            errors: number;
          }>
        >`SELECT to_char(e.created_at AT TIME ZONE 'UTC','YYYY-MM-DD') AS "day",count(*) FILTER(WHERE e.name='view')::int views,count(DISTINCT e.user_id)::int users,count(*) FILTER(WHERE e.name NOT IN ('view','engaged','request_failed','validation_failed'))::int actions,count(*) FILTER(WHERE e.name IN ('request_failed','validation_failed'))::int errors FROM ux_lab_events e JOIN users u ON u.id=e.user_id WHERE ${scope} GROUP BY "day" ORDER BY "day"`,
        this.prisma.$queryRaw<
          Array<{
            section: string;
            visitors: number;
            sessions: number;
            engagedSeconds: number;
            actedUsers: number;
            errorUsers: number;
            medianFirstActionSeconds: number | null;
          }>
        >`WITH visits AS (SELECT e.user_id,e.session_id,e.section,e.context,min(e.created_at) FILTER(WHERE e.name='view') entered,min(e.created_at) FILTER(WHERE e.name NOT IN ('view','engaged','request_failed','validation_failed')) acted,sum(e.duration)::int seconds,bool_or(e.name IN ('request_failed','validation_failed')) errored FROM ux_lab_events e JOIN users u ON u.id=e.user_id WHERE ${scope} GROUP BY e.user_id,e.session_id,e.section,e.context) SELECT section,count(DISTINCT user_id)::int visitors,count(*) FILTER(WHERE entered IS NOT NULL)::int sessions,coalesce(sum(seconds),0)::int "engagedSeconds",count(DISTINCT user_id) FILTER(WHERE acted IS NOT NULL AND entered IS NOT NULL)::int "actedUsers",count(DISTINCT user_id) FILTER(WHERE errored)::int "errorUsers",round((percentile_cont(0.5) WITHIN GROUP(ORDER BY extract(epoch FROM (acted-entered))) FILTER(WHERE acted>=entered))::numeric,1)::float "medianFirstActionSeconds" FROM visits GROUP BY section`,
        this.prisma.uxLabExperiment.findMany({
          where: q.experimentId ? { id: q.experimentId } : {},
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.userExperienceProgress.groupBy({
          by: ['flowKey', 'status'],
          where: {
            user: {
              ...eligibleUser,
              ...(q.groupId ? { membership: { groupId: q.groupId } } : {}),
            },
          },
          _count: true,
        }),
      ]);
    const comparisons = await Promise.all(
      experiments.map(async (e) => ({
        experimentId: e.id,
        primaryMetric: e.primaryMetric,
        minSample: e.minSample,
        ...(await this.compare(e, since, q.groupId)),
      })),
    );
    const sections = SECTION_REGISTRY.map((s) => {
      const stats = sessions.find((x) => x.section === s.id);
      return {
        ...(stats ?? {
          visitors: 0,
          sessions: 0,
          engagedSeconds: 0,
          actedUsers: 0,
          errorUsers: 0,
          medianFirstActionSeconds: null,
        }),
        section: s.id,
        actionRate: rate(stats?.actedUsers ?? 0, stats?.visitors ?? 0),
      };
    });
    return {
      days,
      since: since.toISOString(),
      generatedAt: new Date().toISOString(),
      rollup,
      daily,
      sections,
      comparisons,
      guides: guideCounts.map((x) => ({
        flowKey: x.flowKey,
        status: x.status,
        count: x._count,
      })),
      ...(await this.activation(q.groupId)),
      notes: {
        schema: 'section-lab-v1',
        historicalVariantsExcluded: true,
        excludedAccount: QA_ID,
        groupScope: 'group at event time',
        guideScope: 'current account status, all time',
      },
    };
  }
  private async compare(e: UxLabExperiment, since: Date, groupId?: string) {
    if (e.audience === 'ENTRY') {
      const rows = await this.prisma.$queryRaw<
        Array<{ version: string; assigned: number; completed: number }>
      >`
        SELECT a.version, count(*)::int assigned,
          count(*) FILTER (WHERE 'TASK_0'=ANY(coalesce(j."completedNodeCodes", ARRAY[]::text[])))::int completed
        FROM ux_lab_assignments a JOIN users u ON u.id=a.user_id
        LEFT JOIN user_journey_states j ON j."userId"=u.id
        WHERE a.experiment_id=${e.id}::uuid AND a.created_at>=${since} AND u.role='USER' AND u.id<>${QA_ID}::uuid
        ${groupId ? Prisma.sql`AND EXISTS (SELECT 1 FROM memberships m WHERE m."userId"=u.id AND m."groupId"=${groupId}::uuid)` : Prisma.empty}
        GROUP BY a.version`;
      const arms = ['A', 'B'].map((version) => {
        const row = rows.find((r) => r.version === version);
        return {
          version,
          exposed: row?.assigned ?? 0,
          converted: row?.completed ?? 0,
          errors: 0,
          medianSeconds: null,
          rate: rate(row?.completed ?? 0, row?.assigned ?? 0),
        };
      });
      return {
        arms,
        sufficient: arms.every((a) => a.exposed >= e.minSample),
        deltaPoints: arms.every((a) => a.rate !== null)
          ? Math.round((arms[1].rate! - arms[0].rate!) * 10) / 10
          : null,
        interpretation: 'DURABLE_ENTRY_COHORT',
      };
    }
    const rows = await this.prisma.$queryRaw<
      Array<{
        version: string;
        exposed: number;
        converted: number;
        errors: number;
        medianSeconds: number | null;
      }>
    >`WITH people AS (SELECT v.user_id,v.version,min(v.created_at) first_view FROM ux_lab_events v JOIN users u ON u.id=v.user_id WHERE v.context=${'experiment:' + e.id} AND v.name='view' AND v.created_at>=${since} AND u.role='USER' AND u.id<>${QA_ID}::uuid ${groupId ? Prisma.sql`AND v.group_id=${groupId}::uuid` : Prisma.empty} GROUP BY v.user_id,v.version), outcomes AS (SELECT p.*,min(a.created_at) FILTER(WHERE a.name=${e.primaryMetric}) action_at,bool_or(a.name IN ('request_failed','validation_failed')) errored FROM people p LEFT JOIN ux_lab_events a ON a.user_id=p.user_id AND a.context=${'experiment:' + e.id} AND a.version=p.version AND a.created_at>=p.first_view ${groupId ? Prisma.sql`AND a.group_id=${groupId}::uuid` : Prisma.empty} GROUP BY p.user_id,p.version,p.first_view) SELECT version,count(*)::int exposed,count(*) FILTER(WHERE action_at IS NOT NULL)::int converted,count(*) FILTER(WHERE errored)::int errors,round((percentile_cont(0.5) WITHIN GROUP(ORDER BY extract(epoch FROM (action_at-first_view))) FILTER(WHERE action_at IS NOT NULL))::numeric,1)::float "medianSeconds" FROM outcomes GROUP BY version`;
    const arms = ['A', 'B'].map((version) => {
      const r = rows.find((x) => x.version === version) ?? {
        version,
        exposed: 0,
        converted: 0,
        errors: 0,
        medianSeconds: null,
      };
      return { ...r, rate: rate(r.converted, r.exposed) };
    });
    const sufficient = arms.every((a) => a.exposed >= e.minSample);
    return {
      arms,
      sufficient,
      deltaPoints: arms.every((a) => a.rate !== null)
        ? Math.round((arms[1].rate! - arms[0].rate!) * 10) / 10
        : null,
      interpretation: sufficient ? 'DESCRIPTIVE_ONLY' : 'INSUFFICIENT_SAMPLE',
    };
  }
  private async activation(groupId?: string) {
    // Snapshot milestones use durable records. Future timed weeks are deliberately
    // absent: being ineligible to enter a future week is not user abandonment.
    const users = await this.prisma.user.findMany({
      where: {
        ...eligibleUser,
        ...(groupId ? { membership: { groupId } } : {}),
      },
      select: {
        id: true,
        name: true,
        portfolioUrl: true,
        cv: { select: { id: true } },
        journeyState: {
          select: {
            currentNodeCode: true,
            completedNodeCodes: true,
            currentNodeStartedAt: true,
          },
        },
        experienceProgress: {
          where: { flowKey: 'first-application-v1' },
          select: { status: true },
        },
        _count: { select: { applications: true } },
      },
    });
    const stages = [
      {
        code: 'ACCOUNT',
        titleAr: 'الحسابات المسجلة',
        titleEn: 'Registered accounts',
        test: (_: (typeof users)[number]) => true,
      },
      {
        code: 'PROFILE',
        titleAr: 'ملف مهني مكتمل',
        titleEn: 'Professional profile ready',
        test: (u: (typeof users)[number]) => !!u.cv && !!u.portfolioUrl,
      },
      {
        code: 'GUIDE',
        titleAr: 'الجولة الإلزامية مكتملة',
        titleEn: 'Required guide completed',
        test: (u: (typeof users)[number]) =>
          u.experienceProgress.some((p) => p.status === 'COMPLETED'),
      },
      {
        code: 'TASK_0',
        titleAr: 'المهمة صفر مكتملة',
        titleEn: 'Task 0 completed',
        test: (u: (typeof users)[number]) =>
          !!u.journeyState?.completedNodeCodes.includes('TASK_0'),
      },
    ].map((s) => ({
      code: s.code,
      titleAr: s.titleAr,
      titleEn: s.titleEn,
      count: users.filter(s.test).length,
      percent: rate(users.filter(s.test).length, users.length),
    }));
    const waiting = users
      .filter((u) => !u.journeyState?.completedNodeCodes.includes('TASK_0'))
      .map((u) => ({
        id: u.id,
        name: u.name,
        node: u.journeyState?.currentNodeCode ?? 'ONBOARDING',
        applications: u._count.applications,
        days: u.journeyState
          ? Math.floor(
              (Date.now() - u.journeyState.currentNodeStartedAt.getTime()) /
                86400000,
            )
          : null,
        reason:
          !u.cv || !u.portfolioUrl
            ? 'PROFILE'
            : !u.experienceProgress.some((p) => p.status === 'COMPLETED')
              ? 'GUIDE'
              : 'TASK_0',
      }));
    return { activation: { total: users.length, stages, waiting } };
  }
}
