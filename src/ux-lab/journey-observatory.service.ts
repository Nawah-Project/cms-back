import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JOURNEY_V4_NODES } from '../journey-engine/journey-v4.seed';
import { JOURNEY_GUIDANCE_CATALOG } from '../feedback/journey-guidance.catalog';
import { isWeeklyReflection } from '../journey-engine/journey-rules';
import { classifyJourney, metricRate } from './journey-observatory.model';
import {
  JourneyMapQuery,
  JourneyObservationDto,
  JourneyObservationQuery,
  JourneyObservationStatusDto,
} from './journey-observatory.dto';
const QA_ID = 'aeef0606-17bb-47b6-a239-4a44526303b4';
const lastDate = (dates: (Date | null | undefined)[]) => {
  const valid = dates.filter((d): d is Date => !!d);
  return valid.length
    ? new Date(Math.max(...valid.map((d) => d.getTime())))
    : null;
};
type AppAggregate = {
  userId: string;
  apps: number;
  tailored: number;
  lastWorkAt: Date | null;
};
type HistoryAggregate = {
  code: string;
  users: number;
  events: number;
  observedVisits: number;
  medianHours: number | null;
};
type Transition = {
  userId: string;
  code: string;
  nextCode: string | null;
  at: Date;
  enteredAt: Date | null;
};
@Injectable()
export class JourneyObservatoryService {
  constructor(private readonly prisma: PrismaService) {}
  async map(q: JourneyMapQuery) {
    const now = new Date(),
      days = q.days ?? 30,
      idleDays = q.idleDays ?? 3,
      since = new Date(now);
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - days + 1);
    const [rawNodes, users, groups, admins, posts] = await Promise.all([
      this.prisma.journeyNode.findMany({ orderBy: { orderIndex: 'asc' } }),
      this.prisma.user.findMany({
        where: {
          role: 'USER',
          id: { not: QA_ID },
          ...(q.groupId ? { membership: { groupId: q.groupId } } : {}),
        },
        select: {
          id: true,
          name: true,
          createdAt: true,
          targetJobTitle: true,
          portfolioUrl: true,
          membership: {
            select: { groupId: true, group: { select: { name: true } } },
          },
          cv: { select: { id: true } },
          cvHistory: {
            select: { versionNumber: true, uploadedAt: true },
            orderBy: { versionNumber: 'desc' },
            take: 2,
          },
          journeyState: true,
          experienceProgress: {
            where: { flowKey: 'first-application-v1' },
            select: {
              status: true,
              currentStep: true,
              startedAt: true,
              finishedAt: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.group.findMany({
        select: {
          id: true,
          name: true,
          _count: { select: { memberships: true } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.feedbackPost.findMany({
        where: { unlockTriggerCode: { not: null }, archivedAt: null },
        select: {
          id: true,
          unlockTriggerCode: true,
          title: true,
          visibility: true,
          groupId: true,
          targetUserId: true,
        },
        orderBy: { publishedAt: 'desc' },
      }),
    ]);
    const nodes = (
      rawNodes.length ? rawNodes : JOURNEY_V4_NODES
    ) as typeof rawNodes;
    const selectedUsers = q.userId
      ? users.filter((u) => u.id === q.userId)
      : users;
    if (q.userId && !selectedUsers.length)
      throw new NotFoundException('Member is not in the selected scope');
    const ids = selectedUsers.map((u) => u.id),
      inIds = ids.length
        ? Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))
        : Prisma.sql`NULL::uuid`;
    // Every measurement below is read-only. In particular, never call the ordinary
    // journey/state getter: it evaluates progression and could mutate user state.
    const historyCte = Prisma.sql`WITH ordered AS (SELECT "actorId" AS user_id,"createdAt" at,payload->>'completedNodeCode' code,payload->>'nextNodeCode' next_code,LAG("createdAt") OVER(PARTITION BY "actorId" ORDER BY "createdAt",id) previous_at,LAG(payload->>'nextNodeCode') OVER(PARTITION BY "actorId" ORDER BY "createdAt",id) previous_next FROM domain_event_logs WHERE "eventName"='journey.node_completed' AND "actorId" IN (${inIds})), measured AS (SELECT *,CASE WHEN previous_next=code THEN previous_at ELSE NULL END entered_at FROM ordered WHERE at>=${since})`;
    const [
      appRows,
      sideRows,
      reads,
      history,
      daily,
      transitions,
      workRows,
      guideRows,
      uniqueTransitionRows,
    ] = await Promise.all([
      this.prisma.$queryRaw<
        AppAggregate[]
      >`SELECT u.id "userId",count(a.id)::int apps,count(a.id) FILTER(WHERE a."isTailored")::int tailored,max(a."createdAt") "lastWorkAt" FROM users u LEFT JOIN user_journey_states s ON s."userId"=u.id LEFT JOIN user_experience_progress g ON g.user_id=u.id AND g.flow_key='first-application-v1' LEFT JOIN applications a ON a."userId"=u.id AND s."userId" IS NOT NULL AND a."createdAt">=CASE WHEN s."currentNodeCode"='TASK_0' AND g.status='IN_PROGRESS' THEN GREATEST(s."currentNodeStartedAt",g.started_at) ELSE s."currentNodeStartedAt" END AND (s."currentNodeCode"<>'TASK_0' OR g.id IS NOT NULL) WHERE u.id IN (${inIds}) GROUP BY u.id`,
      this.prisma.sideTaskSubmission.findMany({
        where: { userId: { in: ids } },
        select: {
          userId: true,
          nodeCode: true,
          journeyWeek: true,
          type: true,
          createdAt: true,
          reviewSummary: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.feedbackRead.findMany({
        where: {
          userId: { in: ids },
          feedback: { unlockTriggerCode: { not: null } },
        },
        select: {
          userId: true,
          readAt: true,
          feedback: { select: { unlockTriggerCode: true } },
        },
      }),
      this.prisma.$queryRaw<
        HistoryAggregate[]
      >`${historyCte} SELECT code,count(DISTINCT user_id)::int users,count(*)::int events,count(*) FILTER(WHERE entered_at IS NOT NULL AND at>=entered_at)::int "observedVisits",(percentile_cont(0.5) WITHIN GROUP(ORDER BY extract(epoch FROM (at-entered_at))/3600) FILTER(WHERE entered_at IS NOT NULL AND at>=entered_at))::float "medianHours" FROM measured WHERE code IS NOT NULL GROUP BY code`,
      this.prisma.$queryRaw<
        Array<{ day: string; users: number; transitions: number }>
      >`${historyCte} SELECT to_char(at,'YYYY-MM-DD') AS "day",count(DISTINCT user_id)::int users,count(*)::int transitions FROM measured GROUP BY "day" ORDER BY "day"`,
      this.prisma.$queryRaw<
        Transition[]
      >`${historyCte} SELECT user_id "userId",code,next_code "nextCode",at,entered_at "enteredAt" FROM measured ORDER BY at DESC LIMIT 200`,
      this.prisma.$queryRaw<
        Array<{ userId: string; at: Date | null }>
      >`SELECT "userId",max(at) at FROM (SELECT "userId","createdAt" at FROM applications WHERE "userId" IN (${inIds}) UNION ALL SELECT "userId","createdAt" FROM side_task_submissions WHERE "userId" IN (${inIds}) UNION ALL SELECT "userId","uploadedAt" FROM user_cv_history WHERE "userId" IN (${inIds}) UNION ALL SELECT "userId","readAt" FROM feedback_reads WHERE "userId" IN (${inIds}) UNION ALL SELECT user_id,created_at FROM ux_lab_events WHERE user_id IN (${inIds}) AND name NOT IN ('view','engaged','request_failed','validation_failed')) work GROUP BY "userId"`,
      q.userId
        ? this.prisma.userExperienceProgress.findMany({
            where: { userId: q.userId, finishedAt: { not: null } },
            select: { flowKey: true, status: true, finishedAt: true },
          })
        : Promise.resolve([]),
      this.prisma.$queryRaw<
        Array<{ users: number }>
      >`${historyCte} SELECT count(DISTINCT user_id)::int users FROM measured`,
    ]);
    const members = selectedUsers.map((u) => {
      const state = u.journeyState,
        node = nodes.find((n) => n.code === state?.currentNodeCode),
        row = appRows.find((a) => a.userId === u.id),
        side = sideRows.filter(
          (s) => s.userId === u.id && s.nodeCode === node?.code,
        );
      const counts = {
        apps: row?.apps ?? 0,
        tailored: row?.tailored ?? 0,
        posts: side.filter((s) => s.type === 'LINKEDIN_POST').length,
        outreach: side.filter((s) => s.type === 'OUTREACH_CONTACT').length,
        reviews: side.filter(
          (s) =>
            s.type === 'WEEKLY_REVIEW' && isWeeklyReflection(s.reviewSummary),
        ).length,
      };
      const guide = u.experienceProgress[0],
        profileReady = !!u.cv && !!u.portfolioUrl && !!u.targetJobTitle,
        lastWorkAt = lastDate([workRows.find((w) => w.userId === u.id)?.at]);
      const status = classifyJourney({
        now,
        idleDays,
        registeredAt: u.createdAt,
        profileReady,
        state,
        node,
        nodes,
        counts,
        guide,
        cvs: u.cvHistory,
        lastWorkAt,
      });
      return {
        id: u.id,
        name: u.name,
        group: u.membership
          ? { id: u.membership.groupId, name: u.membership.group.name }
          : null,
        registeredAt: u.createdAt.toISOString(),
        currentCode: !profileReady
          ? 'ONBOARDING'
          : (state?.currentNodeCode ?? 'ONBOARDING'),
        currentWeek: state?.currentWeek ?? 0,
        completedCodes: state?.completedNodeCodes ?? [],
        startedAt: state?.currentNodeStartedAt.toISOString() ?? null,
        lastWorkAt: lastWorkAt?.toISOString() ?? null,
        counts,
        guideStatus: guide?.status ?? null,
        guideStep: guide?.currentStep ?? 0,
        unlockedCodes: state?.unlockedInsightCodes ?? [],
        readCodes: [
          ...new Set([
            ...(state?.readInsightCodes ?? []),
            ...reads
              .filter((r) => r.userId === u.id)
              .map((r) => r.feedback.unlockTriggerCode!),
          ]),
        ],
        ...status,
      };
    });
    const stations = [
      {
        code: 'ONBOARDING',
        weekNumber: 0,
        orderIndex: -1,
        titleAr: 'الاستقبال والملف المهني',
        titleEn: 'Welcome & professional profile',
        nodeType: 'ONBOARDING_QUEST',
        durationDays: 0,
        requiredAppsCount: 0,
        requiredTailoredCount: 0,
        requiredPostsCount: 0,
        requiredOutreachCount: 0,
        unlocksInsightCode: null,
        nextNodeCode: 'TASK_0',
        descriptionAr: 'إكمال التخصص والروابط والسيرة الأساسية.',
        descriptionEn:
          'Complete professional specialization, links and base CV.',
      },
      ...nodes,
    ].map((n) => {
      const here = members.filter((m) => m.currentCode === n.code),
        entered = members.filter(
          (m) =>
            m.currentCode === n.code ||
            m.completedCodes.includes(n.code) ||
            n.code === 'ONBOARDING',
        ),
        completed = members.filter(
          (m) =>
            m.completedCodes.includes(n.code) ||
            (n.code === 'ONBOARDING' && m.gate !== 'PROFILE'),
        );
      const h = history.find((r) => r.code === n.code);
      return {
        ...n,
        current: here.length,
        entered: entered.length,
        completed: completed.length,
        completionRate: metricRate(completed.length, entered.length),
        needsReview: here.filter((m) => m.needsReview).length,
        timeWait: here.filter((m) => m.gate === 'TIME').length,
        cvWait: here.filter((m) => m.gate === 'CV').length,
        guideWait: here.filter((m) => m.gate === 'GUIDE').length,
        ready: here.filter((m) => m.gate === 'READY').length,
        completedInWindow: h?.users ?? 0,
        transitionsInWindow: h?.events ?? 0,
        observedVisits: h?.observedVisits ?? 0,
        medianHours:
          h?.medianHours == null ? null : Math.round(h.medianHours * 10) / 10,
        missingApps: here.reduce((sum, m) => sum + m.missing.apps, 0),
      };
    });
    const guidance = JOURNEY_GUIDANCE_CATALOG.map((seed) => {
      const visiblePost = posts.find(
        (p) =>
          p.unlockTriggerCode === seed.code &&
          (p.visibility === 'ALL' ||
            (q.groupId &&
              p.visibility === 'GROUP' &&
              p.groupId === q.groupId) ||
            (q.userId &&
              p.visibility === 'DIRECT' &&
              p.targetUserId === q.userId)),
      );
      const matched = nodes.find((n) => n.unlocksInsightCode === seed.code),
        isFoundation = seed.code === 'INSIGHT_TASK_0_CV_BASE';
      const unlocked = members.filter(
        (m) =>
          m.unlockedCodes.includes(seed.code) ||
          (seed.isAdvanced === true &&
            selectedUsers.find((u) => u.id === m.id)?.journeyState
              ?.hasUnlockedAdvPrep === true) ||
          (isFoundation &&
            (m.completedCodes.includes('TASK_0') || m.currentWeek >= 1)),
      );
      const read = unlocked.filter((m) => m.readCodes.includes(seed.code));
      const actionKind = isFoundation
        ? 'CV'
        : seed.code.includes('CONTENT_BUILDING')
          ? 'POST'
          : seed.code.includes('NETWORKING')
            ? 'OUTREACH'
            : null;
      const dated = read.flatMap((m) => {
        const dates = reads
          .filter(
            (r) =>
              r.userId === m.id && r.feedback.unlockTriggerCode === seed.code,
          )
          .map((r) => r.readAt.getTime());
        return dates.length
          ? [{ id: m.id, at: new Date(Math.min(...dates)) }]
          : [];
      });
      const applied = actionKind
        ? dated.filter((r) =>
            actionKind === 'CV'
              ? members.find((m) => m.id === r.id)?.foundationCompleted ===
                  true &&
                selectedUsers
                  .find((u) => u.id === r.id)!
                  .cvHistory.some(
                    (c) =>
                      c.uploadedAt >= r.at &&
                      c.versionNumber >
                        (selectedUsers.find((u) => u.id === r.id)?.journeyState
                          ?.cvFoundationBaselineVersion ?? 1),
                  )
              : sideRows.some(
                  (s) =>
                    s.userId === r.id &&
                    s.type ===
                      (actionKind === 'POST'
                        ? 'LINKEDIN_POST'
                        : 'OUTREACH_CONTACT') &&
                    s.createdAt >= r.at,
                ),
          ).length
        : null;
      return {
        code: seed.code,
        nodeCode: matched?.code ?? null,
        week: matched?.weekNumber ?? seed.weekNumber,
        titleAr: visiblePost?.title ?? seed.titleAr,
        titleEn: seed.titleEn,
        unlocked: unlocked.length,
        read: read.length,
        readRate: metricRate(read.length, unlocked.length),
        unreadIds: unlocked
          .filter((m) => !m.readCodes.includes(seed.code))
          .map((m) => m.id),
        datedReads: dated.length,
        applied,
        actionKind,
        foundationCompleted: isFoundation
          ? read.filter((m) => m.foundationCompleted).length
          : null,
      };
    });
    const weeks = [0, 1, 2, 3, 4].map((week) => {
      const list = stations.filter((s) => s.weekNumber === week),
        codes = list.filter((s) => s.code !== 'ONBOARDING').map((s) => s.code);
      return {
        week,
        current: members.filter((m) =>
          list.some((n) => n.code === m.currentCode),
        ).length,
        entered: members.filter((m) =>
          codes.some(
            (c) => m.currentCode === c || m.completedCodes.includes(c),
          ),
        ).length,
        completed: members.filter(
          (m) =>
            codes.length > 0 &&
            codes.every((c) => m.completedCodes.includes(c)),
        ).length,
        needsReview: members.filter(
          (m) => list.some((n) => n.code === m.currentCode) && m.needsReview,
        ).length,
        transitionsInWindow: list.reduce(
          (sum, s) => sum + s.transitionsInWindow,
          0,
        ),
      };
    });
    const timeline = q.userId
      ? [
          ...transitions.map((t) => ({
            kind: 'TRANSITION',
            code: t.code,
            nextCode: t.nextCode,
            at: t.at.toISOString(),
            enteredAt: t.enteredAt?.toISOString() ?? null,
          })),
          ...reads.map((r) => ({
            kind: 'GUIDANCE_READ',
            code: r.feedback.unlockTriggerCode!,
            at: r.readAt.toISOString(),
          })),
          ...selectedUsers.flatMap((u) =>
            u.cvHistory.map((c) => ({
              kind: 'CV_UPLOAD',
              code: `CV ${Math.max(0, c.versionNumber - 1)}`,
              at: c.uploadedAt.toISOString(),
            })),
          ),
          ...sideRows.slice(0, 60).map((s) => ({
            kind: s.type,
            code: s.nodeCode,
            at: s.createdAt.toISOString(),
          })),
          ...guideRows.map((g) => ({
            kind: g.status === 'SKIPPED' ? 'GUIDE_SKIPPED' : 'GUIDE_COMPLETED',
            code: g.flowKey,
            at: g.finishedAt!.toISOString(),
          })),
        ]
          .filter((t) => new Date(t.at) >= since)
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, 100)
      : [];
    const knownCompleted = members.reduce(
        (sum, m) => sum + m.completedCodes.length,
        0,
      ),
      windowTransitions = history.reduce((sum, h) => sum + h.events, 0);
    return {
      scope: {
        days,
        idleDays,
        groupId: q.groupId ?? null,
        userId: q.userId ?? null,
        now: now.toISOString(),
        since: since.toISOString(),
      },
      directory: users.map((u) => ({
        id: u.id,
        name: u.name,
        groupId: u.membership?.groupId ?? null,
      })),
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        members: g._count.memberships,
      })),
      admins,
      nodes: stations,
      members,
      guidance,
      weeks,
      daily,
      timeline,
      summary: {
        people: members.length,
        started: members.filter((m) => m.startedAt).length,
        finished: members.filter((m) => m.gate === 'FINISHED').length,
        needsReview: members.filter((m) => m.needsReview).length,
        timeWait: members.filter((m) => m.gate === 'TIME').length,
        cvWait: members.filter((m) => m.gate === 'CV').length,
        guideWait: members.filter((m) => m.gate === 'GUIDE').length,
        transitionsInWindow: windowTransitions,
        transitionUsersInWindow: uniqueTransitionRows[0]?.users ?? 0,
        pairedDurationSamples: history.reduce(
          (sum, h) => sum + h.observedVisits,
          0,
        ),
        knownCompleted,
        unmappedStates: members.filter((m) => m.gate === 'UNKNOWN').length,
      },
      quality: {
        historyWindowDays: days,
        transitionTimelineLimit: 200,
        individualTimelineLimit: 100,
        duration: 'paired_transition_timestamps_including_calendar_wait',
        guidanceApplication: 'dated_subsequent_action_is_association_not_proof',
        unmeasuredGuidance: guidance.filter((g) => g.actionKind === null)
          .length,
        legacyCompletionDatesReconstructed: false,
      },
    };
  }
  async observations(q: JourneyObservationQuery) {
    const where: Prisma.UxJourneyObservationWhereInput = {
      ...(q.nodeCode ? { nodeCode: q.nodeCode } : {}),
      ...(q.groupId ? { OR: [{ groupId: q.groupId }, { groupId: null }] } : {}),
      ...(q.userId ? { subjectUserId: q.userId } : {}),
    };
    const page = q.page ?? 1;
    const [items, total, admins] = await Promise.all([
      this.prisma.uxJourneyObservation.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * 20,
        take: 20,
      }),
      this.prisma.uxJourneyObservation.count({ where }),
      this.prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true, name: true },
      }),
    ]);
    return {
      items: items.map((i) => ({
        ...i,
        authorName: admins.find((a) => a.id === i.authorId)?.name ?? null,
        ownerName: admins.find((a) => a.id === i.ownerId)?.name ?? null,
      })),
      total,
      page,
      pageSize: 20,
    };
  }
  async createObservation(actorId: string, dto: JourneyObservationDto) {
    if (
      dto.ownerId &&
      !(await this.prisma.user.count({
        where: { id: dto.ownerId, role: 'ADMIN' },
      }))
    )
      throw new BadRequestException(
        'Observation owner must be an administrator',
      );
    if (
      dto.groupId &&
      !(await this.prisma.group.count({ where: { id: dto.groupId } }))
    )
      throw new BadRequestException('Unknown group');
    const report = await this.map(dto),
      node = report.nodes.find((n) => n.code === dto.nodeCode);
    if (!node) throw new BadRequestException('Unknown journey station');
    const evidence = {
      capturedAt: report.scope.now,
      since: report.scope.since,
      days: report.scope.days,
      idleDays: report.scope.idleDays,
      people: report.summary.people,
      station: {
        code: node.code,
        current: node.current,
        entered: node.entered,
        completed: node.completed,
        needsReview: node.needsReview,
        timeWait: node.timeWait,
        cvWait: node.cvWait,
        guideWait: node.guideWait,
        medianHours: node.medianHours,
        observedVisits: node.observedVisits,
      },
      guidance: report.guidance
        .filter((g) => g.nodeCode === node.code)
        .map((g) => ({
          code: g.code,
          unlocked: g.unlocked,
          read: g.read,
          applied: g.applied,
          datedReads: g.datedReads,
        })),
    };
    return this.prisma.uxJourneyObservation.create({
      data: {
        nodeCode: dto.nodeCode,
        groupId: dto.groupId ?? null,
        subjectUserId: dto.userId ?? null,
        title: dto.title,
        hypothesis: dto.hypothesis,
        nextAction: dto.nextAction,
        category: dto.category,
        ownerId: dto.ownerId === undefined ? actorId : dto.ownerId,
        authorId: actorId,
        evidence: evidence as Prisma.InputJsonValue,
      },
    });
  }
  async updateObservation(id: string, dto: JourneyObservationStatusDto) {
    if (!(await this.prisma.uxJourneyObservation.findUnique({ where: { id } })))
      throw new NotFoundException();
    const updated = await this.prisma.uxJourneyObservation.updateMany({
      where: { id, updatedAt: new Date(dto.expectedUpdatedAt) },
      data: { status: dto.status },
    });
    if (!updated.count)
      throw new ConflictException('Observation changed; refresh before saving');
    return this.prisma.uxJourneyObservation.findUniqueOrThrow({
      where: { id },
    });
  }
}
