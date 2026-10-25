import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  ApplicationOutcome,
  ApplicationStage,
  Prisma,
  TaskNoteType,
  TaskSource,
  TaskStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  GroupAssignmentService,
  MAX_GROUP_SIZE,
} from '../members/group-assignment.service';
import {
  ADMIN_MONITORING_DEFAULT_LIMIT,
  ADMIN_MONITORING_MAX_LIMIT,
  INACTIVITY_CRITICAL_DAYS,
  INACTIVITY_WARNING_DAYS,
} from './admin.constants';
import { ActivityState, getActivityState } from './activity-status.util';
import { MonitoringQueryDto } from './dto/monitoring-query.dto';
import { UxAnalyticsService } from './ux-analytics.service';
import {
  TrackUxEventDto,
  UpdateUxConfigDto,
} from './dto/track-ux-event.dto';
import { AdminNotificationsService } from './notifications/admin-notifications.service';
import { NoResponseProcessor } from '../applications/no-response.processor';
import { ProfileService } from '../profile/profile.service';

type ActivityItem = {
  id: string;
  type:
    'APPLICATION_CREATED' | 'APPLICATION_UPDATED' | 'APPLICATION_STAGE_CHANGED';
  user: { id: string; name: string; avatar: null };
  group: { id: string; name: string } | null;
  application: { id: string; companyName: string; jobTitle: string };
  fromStage: ApplicationStage | null;
  toStage: ApplicationStage;
  outcome: ApplicationOutcome | null;
  createdAt: string;
};

type MemberRow = {
  id: string;
  name: string;
  email?: string | null;
  role: UserRole;
  groupId: string | null;
  groupName: string | null;
  emailVerified?: boolean | null;
  registeredAt?: Date | null;
  profileComplete?: boolean | null;
  lastActivityAt: Date | null;
  inactivityDays: number | null;
  activityStatus: ActivityState['activityStatus'];
  applicationsCount: number;
  applied: number;
  assignment: number;
  interview: number;
  decision: number;
  closed: number;
  activeTasks: number | null;
  inProgressTasks: number | null;
  overdueTasks: number | null;
  lastTaskAt: Date | null;
  journeyNodeCode?: string | null;
  journeyWeek?: number | null;
  journeyNodeStartedAt?: Date | null;
  journeyCompletedNodes?: number | null;
  journeyRequiredApps?: number | null;
  journeyNodeApps?: number | null;
  journeyNodeTitleAr?: string | null;
  journeyNodeTitleEn?: string | null;
  journeyDaysInNode?: number | null;
};

type AttentionReason = {
  code:
    | 'JOURNEY_NOT_STARTED'
    | 'JOURNEY_STALLED'
    | 'OVERDUE_TASKS'
    | 'PROFILE_INCOMPLETE'
    | 'INACTIVE';
  severity: number;
  days?: number;
  count?: number;
};

const ATTENTION_NOT_STARTED_DAYS = 2;
const ATTENTION_STALLED_DAYS = 3;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly groupAssignment: GroupAssignmentService,
    private readonly uxAnalytics: UxAnalyticsService,
    @Optional() private readonly adminNotifications?: AdminNotificationsService,
    @Optional() private readonly noResponseProcessor?: NoResponseProcessor,
    @Optional() private readonly profileService?: ProfileService,
  ) {}

  private boundedLimit(value?: number): number {
    return Math.min(
      ADMIN_MONITORING_MAX_LIMIT,
      Math.max(
        1,
        Math.floor(value ?? ADMIN_MONITORING_DEFAULT_LIMIT) ||
          ADMIN_MONITORING_DEFAULT_LIMIT,
      ),
    );
  }

  private userActivityCte(): Prisma.Sql {
    return Prisma.sql`WITH application_activity AS (
      SELECT "userId", MAX(GREATEST("createdAt", "updatedAt")) AS last_at
      FROM applications GROUP BY "userId"
    ), transition_activity AS (
      SELECT "userId", MAX("changedAt") AS last_at
      FROM application_stage_transitions GROUP BY "userId"
    ), task_activity AS (
      SELECT "userId", MAX("updatedAt") AS last_at
      FROM professional_tasks GROUP BY "userId"
    ), latest_activity AS (
      SELECT u.id, u.name, u.email, u.role, u."emailVerified" AS email_verified,
        u."createdAt" AS registered_at, u."portfolioUrl" AS portfolio_url,
        EXISTS (SELECT 1 FROM user_cvs cv WHERE cv."userId" = u.id) AS has_cv,
        m."groupId", g.name AS "groupName",
        GREATEST(a.last_at, t.last_at, tk.last_at) AS last_at
      FROM users u
      LEFT JOIN memberships m ON m."userId" = u.id
      LEFT JOIN member_groups g ON g.id = m."groupId"
      LEFT JOIN application_activity a ON a."userId" = u.id
      LEFT JOIN transition_activity t ON t."userId" = u.id
      LEFT JOIN task_activity tk ON tk."userId" = u.id
      WHERE u.role = 'USER'::"UserRole"
    ), activity_age AS (
      SELECT *,
        CASE WHEN last_at IS NULL THEN NULL
          ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_at)) / 86400)::int)
        END AS inactivity_days
      FROM latest_activity
    ), classified AS (
      SELECT *, CASE
        WHEN inactivity_days IS NULL THEN 'NEVER_ACTIVE'
        WHEN inactivity_days >= ${INACTIVITY_CRITICAL_DAYS} THEN 'CRITICAL'
        WHEN inactivity_days >= ${INACTIVITY_WARNING_DAYS} THEN 'WARNING'
        ELSE 'ACTIVE'
      END AS activity_status
      FROM activity_age
    )`;
  }

  /**
   * Journey Engine snapshot per regular user. Users that never opened the new
   * journey (no `user_journey_states` row) are reported at `TASK_0` with zero
   * progress so admins can still see them as "not started".
   */
  private journeyCte(): Prisma.Sql {
    return Prisma.sql`journey AS (
      SELECT u.id AS "userId",
        COALESCE(js."currentNodeCode", 'TASK_0') AS node_code,
        COALESCE(js."currentWeek", 0) AS journey_week,
        js."currentNodeStartedAt" AS node_started_at,
        COALESCE(array_length(js."completedNodeCodes", 1), 0) AS completed_nodes,
        COALESCE(jn."requiredAppsCount", 5) AS node_required_apps,
        jn."titleAr" AS node_title_ar,
        jn."titleEn" AS node_title_en,
        CASE WHEN js."currentNodeStartedAt" IS NULL THEN 0
          ELSE (SELECT COUNT(*)::int FROM applications ap
            WHERE ap."userId" = u.id AND ap."createdAt" >= js."currentNodeStartedAt")
        END AS node_apps,
        CASE WHEN js."currentNodeStartedAt" IS NULL THEN NULL
          ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - js."currentNodeStartedAt")) / 86400)::int)
        END AS days_in_node
      FROM users u
      LEFT JOIN user_journey_states js ON js."userId" = u.id
      LEFT JOIN journey_nodes jn ON jn.code = COALESCE(js."currentNodeCode", 'TASK_0')
      WHERE u.role = 'USER'::"UserRole"
    )`;
  }

  private memberRowsCte(): Prisma.Sql {
    return Prisma.sql`${this.userActivityCte()}, ${this.journeyCte()}, application_counts AS (
        SELECT "userId", COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE stage = 'APPLIED')::int AS applied,
          COUNT(*) FILTER (WHERE stage = 'ASSIGNMENT')::int AS assignment,
          COUNT(*) FILTER (WHERE stage = 'INTERVIEW')::int AS interview,
          COUNT(*) FILTER (WHERE stage = 'DECISION')::int AS decision,
          COUNT(*) FILTER (WHERE stage = 'CLOSED')::int AS closed
        FROM applications GROUP BY "userId"
      ), development_counts AS (
        SELECT "userId",
          COUNT(*) FILTER (WHERE status <> 'DONE'::"TaskStatus")::int AS "activeTasks",
          COUNT(*) FILTER (WHERE status = 'IN_PROGRESS'::"TaskStatus")::int AS "inProgressTasks",
          COUNT(*) FILTER (WHERE status <> 'DONE'::"TaskStatus" AND "dueDate" < CURRENT_TIMESTAMP)::int AS "overdueTasks",
          MAX("updatedAt") AS "lastTaskAt"
        FROM professional_tasks GROUP BY "userId"
      )`;
  }

  private memberRowsSelect(): Prisma.Sql {
    return Prisma.sql`SELECT c.id, c.name, c.email, c.role, c."groupId", c."groupName",
        c.email_verified AS "emailVerified", c.registered_at AS "registeredAt",
        (c.portfolio_url IS NOT NULL AND c.has_cv) AS "profileComplete",
        c.last_at AS "lastActivityAt", c.inactivity_days AS "inactivityDays",
        c.activity_status AS "activityStatus", COALESCE(a.total, 0)::int AS "applicationsCount",
        COALESCE(a.applied, 0)::int AS applied, COALESCE(a.assignment, 0)::int AS assignment,
        COALESCE(a.interview, 0)::int AS interview, COALESCE(a.decision, 0)::int AS decision,
        COALESCE(a.closed, 0)::int AS closed,
        d."activeTasks", d."inProgressTasks", d."overdueTasks", d."lastTaskAt",
        j.node_code AS "journeyNodeCode", j.journey_week AS "journeyWeek",
        j.node_started_at AS "journeyNodeStartedAt", j.completed_nodes AS "journeyCompletedNodes",
        j.node_required_apps AS "journeyRequiredApps", j.node_apps AS "journeyNodeApps",
        j.node_title_ar AS "journeyNodeTitleAr", j.node_title_en AS "journeyNodeTitleEn",
        j.days_in_node AS "journeyDaysInNode"
      FROM classified c
      LEFT JOIN application_counts a ON a."userId" = c.id
      LEFT JOIN development_counts d ON d."userId" = c.id
      LEFT JOIN journey j ON j."userId" = c.id`;
  }

  private memberFilters(query: Partial<MonitoringQueryDto>): Prisma.Sql {
    const conditions: Prisma.Sql[] = [];
    if (query.activityStatus) {
      conditions.push(Prisma.sql`c.activity_status = ${query.activityStatus}`);
    }
    const search = query.search?.trim();
    if (search) {
      const pattern = `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
      conditions.push(
        Prisma.sql`(c.name ILIKE ${pattern} OR c.email ILIKE ${pattern})`,
      );
    }
    if (query.groupId === 'UNASSIGNED') {
      conditions.push(Prisma.sql`c."groupId" IS NULL`);
    } else if (query.groupId) {
      conditions.push(Prisma.sql`c."groupId" = ${query.groupId}::uuid`);
    }
    return conditions.length
      ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
      : Prisma.empty;
  }

  private mapMemberRow(row: MemberRow) {
    return {
      id: row.id,
      name: row.name,
      email: row.email ?? null,
      role: row.role,
      emailVerified: row.emailVerified ?? null,
      registeredAt: row.registeredAt?.toISOString() ?? null,
      profileComplete: row.profileComplete ?? null,
      group: row.groupId ? { id: row.groupId, name: row.groupName! } : null,
      lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
      inactivityDays: row.inactivityDays,
      activityStatus: row.activityStatus,
      applicationsCount: row.applicationsCount,
      currentStageCounts: {
        applied: row.applied,
        assignment: row.assignment,
        interview: row.interview,
        decision: row.decision,
        closed: row.closed,
      },
      development: {
        active: row.activeTasks ?? 0,
        inProgress: row.inProgressTasks ?? 0,
        overdue: row.overdueTasks ?? 0,
        lastTaskAt: row.lastTaskAt?.toISOString() ?? null,
      },
      journey: row.journeyNodeCode
        ? {
            nodeCode: row.journeyNodeCode,
            week: row.journeyWeek ?? 0,
            started: Boolean(row.journeyNodeStartedAt),
            nodeStartedAt: row.journeyNodeStartedAt?.toISOString() ?? null,
            completedNodes: row.journeyCompletedNodes ?? 0,
            requiredApps: row.journeyRequiredApps ?? 0,
            nodeApps: row.journeyNodeApps ?? 0,
            titleAr: row.journeyNodeTitleAr ?? null,
            titleEn: row.journeyNodeTitleEn ?? null,
            daysInNode: row.journeyDaysInNode ?? null,
          }
        : null,
      avatar: null,
    };
  }

  async getOverview() {
    const [[overview], funnelRows] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          usersCount: number;
          groupsCount: number;
          membershipsCount: number;
          unassignedUsersCount: number;
          activeUsersCount: number;
          warningUsersCount: number;
          criticalUsersCount: number;
          neverActiveUsersCount: number;
          applicationsCount: number;
        }>
      >(Prisma.sql`${this.userActivityCte()}
      SELECT COUNT(*)::int AS "usersCount",
        (SELECT COUNT(*)::int FROM member_groups) AS "groupsCount",
        COUNT(*) FILTER (WHERE "groupId" IS NOT NULL)::int AS "membershipsCount",
        COUNT(*) FILTER (WHERE "groupId" IS NULL)::int AS "unassignedUsersCount",
        COUNT(*) FILTER (WHERE activity_status = 'ACTIVE')::int AS "activeUsersCount",
        COUNT(*) FILTER (WHERE activity_status = 'WARNING')::int AS "warningUsersCount",
        COUNT(*) FILTER (WHERE activity_status = 'CRITICAL')::int AS "criticalUsersCount",
        COUNT(*) FILTER (WHERE activity_status = 'NEVER_ACTIVE')::int AS "neverActiveUsersCount",
        (SELECT COUNT(*)::int FROM applications) AS "applicationsCount"
      FROM classified`),
      this.prisma.$queryRaw<
        Array<{
          week: number;
          members: number;
          notStarted: number;
          finished: number;
        }>
      >(Prisma.sql`WITH ${this.journeyCte()}
        SELECT journey_week AS week, COUNT(*)::int AS members,
          COUNT(*) FILTER (WHERE node_code = 'TASK_0' AND node_apps = 0)::int AS "notStarted",
          COUNT(*) FILTER (WHERE node_code = 'FINAL_REPORT')::int AS finished
        FROM journey GROUP BY journey_week ORDER BY journey_week`),
    ]);
    const weeks = [0, 1, 2, 3, 4].map((week) => {
      const row = (funnelRows ?? []).find((item) => item.week === week);
      return { week, members: row?.members ?? 0 };
    });
    const rows = funnelRows ?? [];
    const notStarted = rows.reduce((sum, row) => sum + row.notStarted, 0);
    const finished = rows.reduce((sum, row) => sum + row.finished, 0);
    const total = rows.reduce((sum, row) => sum + row.members, 0);
    return {
      ...overview,
      journey: {
        weeks,
        notStartedCount: notStarted,
        startedCount: Math.max(0, total - notStarted),
        finishedCount: finished,
      },
    };
  }

  async getUsers(query: MonitoringQueryDto) {
    const page = Math.max(1, Math.floor(query.page || 1));
    const limit = this.boundedLimit(query.limit);
    const where = this.memberFilters(query);
    const offset = (page - 1) * limit;
    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<MemberRow[]>(Prisma.sql`${this.memberRowsCte()}
      ${this.memberRowsSelect()}
      ${where}
      ORDER BY c.last_at DESC NULLS LAST, c.name ASC, c.id ASC
      OFFSET ${offset} LIMIT ${limit}`),
      this.prisma.$queryRaw<
        Array<{ total: number }>
      >(Prisma.sql`${this.userActivityCte()}
        SELECT COUNT(*)::int AS total FROM classified c ${where}`),
    ]);
    const total = totals[0]?.total ?? 0;
    return {
      items: rows.map((row) => this.mapMemberRow(row)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Members who need a mentor intervention right now, ordered by severity.
   * Reasons are computed from the journey state, overdue tasks and profile.
   */
  async getAttention(limit = 25) {
    const rows = await this.prisma.$queryRaw<MemberRow[]>(
      Prisma.sql`${this.memberRowsCte()}
      ${this.memberRowsSelect()}
      ORDER BY c.name ASC LIMIT 1000`,
    );
    const now = Date.now();
    const items = rows
      .map((row) => {
        const member = this.mapMemberRow(row);
        const reasons: AttentionReason[] = [];
        const journey = member.journey;
        const daysSinceRegistration = row.registeredAt
          ? Math.floor((now - row.registeredAt.getTime()) / 86_400_000)
          : 0;
        if (!member.profileComplete) {
          reasons.push({ code: 'PROFILE_INCOMPLETE', severity: 2 });
        }
        if (journey && journey.nodeCode !== 'FINAL_REPORT') {
          const notStarted =
            journey.nodeCode === 'TASK_0' && journey.nodeApps === 0;
          const idleDays = journey.daysInNode ?? daysSinceRegistration;
          if (notStarted && idleDays >= ATTENTION_NOT_STARTED_DAYS) {
            reasons.push({
              code: 'JOURNEY_NOT_STARTED',
              severity: 3,
              days: idleDays,
            });
          } else if (
            !notStarted &&
            (journey.daysInNode ?? 0) >= ATTENTION_STALLED_DAYS &&
            journey.nodeApps < journey.requiredApps
          ) {
            reasons.push({
              code: 'JOURNEY_STALLED',
              severity: 4,
              days: journey.daysInNode ?? 0,
            });
          }
        }
        if (member.development.overdue > 0) {
          reasons.push({
            code: 'OVERDUE_TASKS',
            severity: 3,
            count: member.development.overdue,
          });
        }
        if (member.activityStatus === 'CRITICAL') {
          reasons.push({
            code: 'INACTIVE',
            severity: 4,
            days: member.inactivityDays ?? 0,
          });
        }
        const score = reasons.reduce((sum, reason) => sum + reason.severity, 0);
        return { member, reasons, score };
      })
      .filter((item) => item.reasons.length > 0)
      .sort(
        (a, b) =>
          b.score - a.score || a.member.name.localeCompare(b.member.name),
      );
    return {
      total: items.length,
      items: items.slice(0, Math.min(100, Math.max(1, limit))),
    };
  }

  async getGroups() {
    const items = await this.prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        memberCount: number;
        lastActivityAt: Date | null;
        activeMembers: number;
        warningMembers: number;
        criticalMembers: number;
        neverActiveMembers: number;
      }>
    >(Prisma.sql`${this.userActivityCte()}
      SELECT g.id, g.name, COUNT(c.id)::int AS "memberCount",
        MAX(c.last_at) AS "lastActivityAt",
        COUNT(c.id) FILTER (WHERE c.activity_status = 'ACTIVE')::int AS "activeMembers",
        COUNT(c.id) FILTER (WHERE c.activity_status = 'WARNING')::int AS "warningMembers",
        COUNT(c.id) FILTER (WHERE c.activity_status = 'CRITICAL')::int AS "criticalMembers",
        COUNT(c.id) FILTER (WHERE c.activity_status = 'NEVER_ACTIVE')::int AS "neverActiveMembers"
      FROM member_groups g
      LEFT JOIN classified c ON c."groupId" = g.id
      GROUP BY g.id, g.name, g."createdAt"
      ORDER BY g."createdAt" ASC, g.id ASC`);
    return {
      items: items.map((group) => ({
        ...group,
        capacity: MAX_GROUP_SIZE,
        availableSlots: Math.max(0, MAX_GROUP_SIZE - group.memberCount),
        lastActivityAt: group.lastActivityAt?.toISOString() ?? null,
      })),
    };
  }

  async getActivity(
    requestedPage = 1,
    requestedLimit = ADMIN_MONITORING_DEFAULT_LIMIT,
  ) {
    const page = Math.max(1, Math.floor(requestedPage || 1));
    const limit = this.boundedLimit(requestedLimit);
    const maxFetch = Math.min(1000, Math.max(limit * page, 100));
    const all = await this.queryActivity({}, maxFetch);
    const total = all.length;
    const offset = (page - 1) * limit;
    const items = all.slice(offset, offset + limit);
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  private async queryActivity(
    userFilter: Prisma.UserWhereInput,
    limit: number,
  ): Promise<ActivityItem[]> {
    const transitionWhere: Prisma.ApplicationStageTransitionWhereInput = {
      user: { is: userFilter },
    };
    const appWhere: Prisma.ApplicationWhereInput = { user: userFilter };
    const [transitions, recentApplications, recentUpdates] = await Promise.all([
      this.prisma.applicationStageTransition.findMany({
        where: transitionWhere,
        select: {
          id: true,
          fromStage: true,
          toStage: true,
          outcome: true,
          changedAt: true,
          user: {
            select: {
              id: true,
              name: true,
              membership: {
                select: { group: { select: { id: true, name: true } } },
              },
            },
          },
          application: {
            select: { id: true, companyName: true, jobTitle: true },
          },
        },
        orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
        take: limit,
      }),
      this.prisma.application.findMany({
        where: appWhere,
        select: {
          id: true,
          companyName: true,
          jobTitle: true,
          stage: true,
          outcome: true,
          createdAt: true,
          transitions: {
            select: { fromStage: true },
            orderBy: [{ changedAt: 'asc' }, { id: 'asc' }],
            take: 1,
          },
          user: {
            select: {
              id: true,
              name: true,
              membership: {
                select: { group: { select: { id: true, name: true } } },
              },
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
      }),
      this.prisma.application.findMany({
        where: appWhere,
        select: {
          id: true,
          companyName: true,
          jobTitle: true,
          stage: true,
          outcome: true,
          createdAt: true,
          updatedAt: true,
          transitions: {
            select: { changedAt: true },
            orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
            take: 1,
          },
          user: {
            select: {
              id: true,
              name: true,
              membership: {
                select: { group: { select: { id: true, name: true } } },
              },
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: limit * 2,
      }),
    ]);
    const activity: ActivityItem[] = transitions.map((row) => ({
      id: `transition:${row.id}`,
      type: 'APPLICATION_STAGE_CHANGED',
      user: { id: row.user.id, name: row.user.name, avatar: null },
      group: row.user.membership?.group ?? null,
      application: row.application,
      fromStage: row.fromStage,
      toStage: row.toStage,
      outcome: row.outcome,
      createdAt: row.changedAt.toISOString(),
    }));
    for (const row of recentApplications) {
      activity.push({
        id: `application-created:${row.id}`,
        type: 'APPLICATION_CREATED',
        user: { id: row.user.id, name: row.user.name, avatar: null },
        group: row.user.membership?.group ?? null,
        application: {
          id: row.id,
          companyName: row.companyName,
          jobTitle: row.jobTitle,
        },
        fromStage: null,
        toStage: row.transitions[0]?.fromStage ?? row.stage,
        outcome:
          row.transitions.length > 0 || row.outcome === ApplicationOutcome.NONE
            ? null
            : row.outcome,
        createdAt: row.createdAt.toISOString(),
      });
    }
    for (const row of recentUpdates) {
      const latestTransition = row.transitions[0]?.changedAt;
      const isJustCreated =
        row.updatedAt.getTime() - row.createdAt.getTime() < 1_000;
      const duplicatesTransition =
        latestTransition &&
        Math.abs(row.updatedAt.getTime() - latestTransition.getTime()) < 1_000;
      if (isJustCreated || duplicatesTransition) continue;
      activity.push({
        id: `application-updated:${row.id}:${row.updatedAt.getTime()}`,
        type: 'APPLICATION_UPDATED',
        user: { id: row.user.id, name: row.user.name, avatar: null },
        group: row.user.membership?.group ?? null,
        application: {
          id: row.id,
          companyName: row.companyName,
          jobTitle: row.jobTitle,
        },
        fromStage: null,
        toStage: row.stage,
        outcome: row.outcome === ApplicationOutcome.NONE ? null : row.outcome,
        createdAt: row.updatedAt.toISOString(),
      });
    }
    return activity
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
      )
      .slice(0, limit);
  }

  async getUserDetail(userId: string) {
    const [
      user,
      appStats,
      stageCounts,
      transitionStats,
      recentApplications,
      recentActivity,
      taskCounts,
      taskSourceCounts,
      taskStats,
    ] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          emailVerified: true,
          targetJobTitle: true,
          preferredLocations: true,
          createdAt: true,
          portfolioUrl: true,
          cv: { select: { id: true } },
          membership: {
            select: { group: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.application.aggregate({
        where: { userId },
        _count: { _all: true },
        _max: { createdAt: true, updatedAt: true },
      }),
      this.prisma.application.groupBy({
        by: ['stage'],
        where: { userId },
        _count: { _all: true },
      }),
      this.prisma.applicationStageTransition.aggregate({
        where: { userId },
        _max: { changedAt: true },
      }),
      this.prisma.application.findMany({
        where: { userId },
        select: {
          id: true,
          companyName: true,
          jobTitle: true,
          applicationDate: true,
          stage: true,
          outcome: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 10,
      }),
      this.queryActivity({ id: userId }, 10),
      this.prisma.task.groupBy({
        by: ['status'],
        where: { userId },
        _count: { _all: true },
      }),
      this.prisma.task.groupBy({
        by: ['source'],
        where: { userId },
        _count: { _all: true },
      }),
      this.prisma.task.aggregate({
        where: { userId },
        _max: { updatedAt: true },
      }),
    ]);
    if (!user) throw new NotFoundException('User not found');
    const dates = [
      appStats._max.createdAt,
      appStats._max.updatedAt,
      transitionStats._max.changedAt,
      taskStats._max.updatedAt,
    ].filter((date): date is Date => date !== null);
    const lastActivityAt = dates.length
      ? new Date(Math.max(...dates.map((date) => date.getTime())))
      : null;
    const activityState = getActivityState(lastActivityAt);
    const currentStageCounts = {
      applied: 0,
      assignment: 0,
      interview: 0,
      decision: 0,
      closed: 0,
    };
    for (const row of stageCounts)
      currentStageCounts[
        row.stage.toLowerCase() as keyof typeof currentStageCounts
      ] = row._count._all;
    const taskStatusCounts = { TODO: 0, IN_PROGRESS: 0, BLOCKED: 0, DONE: 0 };
    for (const row of taskCounts)
      taskStatusCounts[row.status] = row._count._all;
    const tasksBySource = { PERSONAL: 0, MENTOR_ASSIGNED: 0 };
    for (const row of taskSourceCounts)
      tasksBySource[row.source] = row._count._all;
    const activeTasks =
      taskStatusCounts.TODO +
      taskStatusCounts.IN_PROGRESS +
      taskStatusCounts.BLOCKED;
    const [
      overdueTasks,
      mentorPriorityTasks,
      unreadMentorFeedback,
      journeyRows,
    ] = await Promise.all([
      this.prisma.task.count({
        where: {
          userId,
          status: { not: TaskStatus.DONE },
          dueDate: { lt: new Date() },
        },
      }),
      this.prisma.task.count({
        where: {
          userId,
          status: { not: TaskStatus.DONE },
          mentorPriority: true,
        },
      }),
      this.prisma.taskNote.count({
        where: {
          type: TaskNoteType.MENTOR_FEEDBACK,
          readAt: null,
          task: { userId },
        },
      }),
      this.prisma.$queryRaw<
        Array<{
          node_code: string;
          journey_week: number;
          node_started_at: Date | null;
          completed_nodes: number;
          node_required_apps: number;
          node_apps: number;
          node_title_ar: string | null;
          node_title_en: string | null;
          days_in_node: number | null;
        }>
      >(
        Prisma.sql`WITH ${this.journeyCte()} SELECT * FROM journey WHERE "userId" = ${userId}::uuid`,
      ),
    ]);
    const journeyRow = journeyRows?.[0];
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified ?? false,
        targetJobTitle: user.targetJobTitle ?? null,
        preferredLocations: user.preferredLocations ?? [],
        createdAt: user.createdAt.toISOString(),
        portfolioUrl: user.portfolioUrl,
        hasCv: Boolean(user.cv),
        group: user.membership?.group ?? null,
      },
      journey: journeyRow
        ? {
            nodeCode: journeyRow.node_code,
            week: journeyRow.journey_week,
            started: Boolean(journeyRow.node_started_at),
            nodeStartedAt: journeyRow.node_started_at?.toISOString() ?? null,
            completedNodes: journeyRow.completed_nodes,
            requiredApps: journeyRow.node_required_apps,
            nodeApps: journeyRow.node_apps,
            titleAr: journeyRow.node_title_ar,
            titleEn: journeyRow.node_title_en,
            daysInNode: journeyRow.days_in_node,
          }
        : null,
      lastActivityAt: lastActivityAt?.toISOString() ?? null,
      ...activityState,
      applicationsCount: appStats._count._all,
      currentStageCounts,
      recentActivities: recentActivity,
      recentApplications: recentApplications.map((application) => ({
        ...application,
        createdAt: application.createdAt.toISOString(),
        updatedAt: application.updatedAt.toISOString(),
        outcome:
          application.outcome === ApplicationOutcome.NONE
            ? null
            : application.outcome,
      })),
      development: {
        totalActiveTasks: activeTasks,
        taskStatusCounts,
        overdueTasks,
        mentorPriorityTasks,
        tasksBySource: {
          personal: tasksBySource[TaskSource.PERSONAL],
          mentorAssigned: tasksBySource[TaskSource.MENTOR_ASSIGNED],
        },
        unreadMentorFeedback,
      },
    };
  }

  async removeMember(groupId: string, userId: string) {
    const result = await this.groupAssignment.withAssignmentLock(
      async (transaction) => {
        const membership = await transaction.membership.findFirst({
          where: { groupId, userId },
          select: { id: true },
        });
        if (!membership)
          throw new NotFoundException('Member not found in group');
        await transaction.membership.delete({ where: { id: membership.id } });
        return { success: true, groupId, userId, membershipRemoved: true };
      },
    );
    this.logger.log(`Removed user ${userId} from group ${groupId}`);
    return result;
  }

  async assignUserToGroup(userId: string, targetGroupId?: string) {
    const result = await this.groupAssignment.withAssignmentLock(
      async (transaction) => {
        const user = await transaction.user.findUnique({
          where: { id: userId },
          select: { id: true },
        });
        if (!user) throw new NotFoundException('User not found');
        let groupId: string;
        if (targetGroupId) {
          const target = await transaction.group.findUnique({
            where: { id: targetGroupId },
            select: { id: true },
          });
          if (!target) throw new NotFoundException('Group not found');
          const membership = await transaction.membership.findUnique({
            where: { userId },
            select: { id: true, groupId: true },
          });
          if (membership?.groupId === targetGroupId) {
            groupId = targetGroupId;
          } else {
            const memberCount = await transaction.membership.count({
              where: { groupId: targetGroupId },
            });
            if (memberCount >= MAX_GROUP_SIZE)
              throw new ConflictException('Group is at full capacity');
            if (membership) {
              await transaction.membership.delete({
                where: { id: membership.id },
              });
            }
            await transaction.membership.create({
              data: { userId, groupId: targetGroupId },
            });
            groupId = targetGroupId;
          }
        } else {
          groupId = await this.groupAssignment.assignUser(transaction, userId);
        }
        const group = await transaction.group.findUniqueOrThrow({
          where: { id: groupId },
          select: { id: true, name: true },
        });
        return { userId, group };
      },
    );
    this.logger.log(`Assigned user ${userId} to group ${result.group.id}`);
    return result;
  }

  getUxAnalytics() {
    return this.uxAnalytics.getAnalytics();
  }

  updateUxConfig(dto: UpdateUxConfigDto) {
    return this.uxAnalytics.updateConfig(dto);
  }

  recordUxEvent(userId: string, dto: TrackUxEventDto) {
    return this.uxAnalytics.recordEvent(userId, dto);
  }

  async getGranularFunnel() {
    const rows = await this.prisma.$queryRaw<MemberRow[]>(Prisma.sql`
      ${this.memberRowsCte()}
      ${this.memberRowsSelect()}
      ORDER BY c.last_at DESC NULLS LAST, c.name ASC
    `);

    const stageDefinitions = [
      {
        code: 'ONBOARDING_INCOMPLETE',
        titleAr: 'سجل حساباً ولم يكمل التهيئة',
        titleEn: 'Onboarding Incomplete',
        descriptionAr: 'أنشأ حساباً ولكن لم يرفع سيرته الذاتية أو يكمل بياناته',
        descriptionEn: 'Account created but CV or profile details missing',
      },
      {
        code: 'ONBOARDING_DONE_ZERO_APPS',
        titleAr: 'أكمل التهيئة ولم يبدأ أول طلب (0 طلبات)',
        titleEn: 'Onboarding Done (0 Applications)',
        descriptionAr: 'بياناته جاهزة وسيرته الذاتية مرفوعة ولكنه لم يسجل أي تقديم',
        descriptionEn: 'Profile is complete but has not submitted any job application',
      },
      {
        code: 'TASK_0_STALLED_1_4_APPS',
        titleAr: 'بدأ المهمة 0 وعالق قبل إتمامها (1-4 طلبات)',
        titleEn: 'Task 0 In-Progress (1-4 Applications)',
        descriptionAr: 'بدأ التقديم ولكن لم يكمل الحد الأدنى للمهمة صفر (5 طلبات)',
        descriptionEn: 'Started Task 0 but stuck before reaching the 5-application milestone',
      },
      {
        code: 'WEEK_1',
        titleAr: 'الأسبوع 1: التقديم المكثف والأسيمنت',
        titleEn: 'Week 1: Active Submissions',
        descriptionAr: 'اجتاز المهمة صفر ويعمل على مهام ومحطات الأسبوع الأول',
        descriptionEn: 'Completed Task 0, currently in Week 1 milestones',
      },
      {
        code: 'WEEK_2',
        titleAr: 'الأسبوع 2: التقديم المخصص والمحتوى',
        titleEn: 'Week 2: Customization & Branding',
        descriptionAr: 'يعمل على مهام التقديم المخصص واليوم السابع في الأسبوع الثاني',
        descriptionEn: 'Working on tailored applications and Week 2 content',
      },
      {
        code: 'WEEK_3',
        titleAr: 'الأسبوع 3: إدارة الوقت وبناء العلاقات',
        titleEn: 'Week 3: Time & Networking',
        descriptionAr: 'وصل إلى مرحلة التوسع وشبكة العلاقات وإدارة الوقت',
        descriptionEn: 'Focused on time management and outreach networking',
      },
      {
        code: 'WEEK_4',
        titleAr: 'الأسبوع 4: التخطيط المهني المستمر',
        titleEn: 'Week 4: Career Planning',
        descriptionAr: 'المرحلة الختامية للرحلة ووضع استراتيجية الاستدامة المهنية',
        descriptionEn: 'Final sprint of the 30-day journey',
      },
      {
        code: 'JOURNEY_COMPLETED',
        titleAr: 'أتم رحلة الـ 30 يوماً بنجاح',
        titleEn: 'Journey Completed',
        descriptionAr: 'أكمل كافة محطات الرحلة والتقرير النهائي',
        descriptionEn: 'Finished all journey nodes and final report',
      },
    ];

    const totalUsers = rows.length || 1;
    const stageMap: Record<
      string,
      {
        code: string;
        titleAr: string;
        titleEn: string;
        descriptionAr: string;
        descriptionEn: string;
        count: number;
        percent: number;
        stuckUsers: Array<{
          id: string;
          name: string;
          email: string | null;
          groupName: string | null;
          daysAtStage: number;
          applicationsCount: number;
        }>;
      }
    > = {};

    for (const def of stageDefinitions) {
      stageMap[def.code] = {
        ...def,
        count: 0,
        percent: 0,
        stuckUsers: [],
      };
    }

    for (const m of rows) {
      let stageCode = 'JOURNEY_COMPLETED';
      if (!m.profileComplete) {
        stageCode = 'ONBOARDING_INCOMPLETE';
      } else if (Number(m.applicationsCount || 0) === 0) {
        stageCode = 'ONBOARDING_DONE_ZERO_APPS';
      } else if (
        m.journeyNodeCode === 'TASK_0' &&
        Number(m.applicationsCount || 0) < 5
      ) {
        stageCode = 'TASK_0_STALLED_1_4_APPS';
      } else if (m.journeyWeek === 1) {
        stageCode = 'WEEK_1';
      } else if (m.journeyWeek === 2) {
        stageCode = 'WEEK_2';
      } else if (m.journeyWeek === 3) {
        stageCode = 'WEEK_3';
      } else if (m.journeyWeek === 4) {
        stageCode = 'WEEK_4';
      } else if (
        m.journeyNodeCode === 'FINAL_REPORT' ||
        (m.journeyCompletedNodes ?? 0) >= 15
      ) {
        stageCode = 'JOURNEY_COMPLETED';
      } else {
        stageCode = 'WEEK_1';
      }

      const stage = stageMap[stageCode];
      if (stage) {
        stage.count += 1;
        stage.stuckUsers.push({
          id: m.id,
          name: m.name,
          email: m.email ?? null,
          groupName: m.groupName ?? null,
          daysAtStage: m.journeyDaysInNode ?? m.inactivityDays ?? 0,
          applicationsCount: Number(m.applicationsCount || 0),
        });
      }
    }

    for (const stage of Object.values(stageMap)) {
      stage.percent = Math.round((stage.count / totalUsers) * 100);
      stage.stuckUsers.sort((a, b) => b.daysAtStage - a.daysAtStage);
    }

    const candidatesForBottleneck = stageDefinitions
      .filter((s) => s.code !== 'JOURNEY_COMPLETED')
      .map((s) => stageMap[s.code]);

    let topBottleneck = candidatesForBottleneck[0];
    for (const c of candidatesForBottleneck) {
      if (c && c.count > (topBottleneck?.count ?? 0)) {
        topBottleneck = c;
      }
    }

    const [
      tourEvents,
      jobExplorerEvents,
      promptEvents,
      plotGuidanceReads,
      totalPlotPosts,
    ] = await Promise.all([
      this.prisma.domainEventLog.count({
        where: { eventName: 'ux.tour_completed' },
      }),
      this.prisma.domainEventLog.findMany({
        where: { eventName: 'ux.job_explorer_clicked' },
        select: { payload: true },
        take: 500,
      }),
      this.prisma.domainEventLog.count({
        where: { eventName: 'ux.prompt_copied' },
      }),
      this.prisma.feedbackRead.count({
        where: {
          feedback: { unlockTriggerCode: { not: null } },
        },
      }),
      this.prisma.feedbackPost.count({
        where: { unlockTriggerCode: { not: null }, archivedAt: null },
      }),
    ]);

    const platformCounts: Record<string, number> = {};
    for (const ev of jobExplorerEvents) {
      const p =
        (ev.payload as Record<string, any>)?.platform ||
        (ev.payload as Record<string, any>)?.name;
      if (typeof p === 'string' && p.trim()) {
        platformCounts[p] = (platformCounts[p] || 0) + 1;
      }
    }
    const topPlatforms = Object.entries(platformCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, clicks]) => ({ name, clicks }));

    return {
      stages: stageDefinitions.map((def) => ({
        ...stageMap[def.code],
        isTopBottleneck: def.code === topBottleneck?.code,
      })),
      topBottleneck: topBottleneck
        ? {
            code: topBottleneck.code,
            titleAr: topBottleneck.titleAr,
            titleEn: topBottleneck.titleEn,
            count: topBottleneck.count,
            percent: topBottleneck.percent,
            stuckUsers: topBottleneck.stuckUsers.slice(0, 10),
          }
        : null,
      totalUsers: rows.length,
      adoptionMetrics: {
        tourCompletedCount: tourEvents,
        tourCompletionRate: Math.min(
          100,
          Math.round((tourEvents / Math.max(1, rows.length)) * 100),
        ),
        jobExplorerClicksCount: jobExplorerEvents.length,
        topPlatforms,
        plotGuidanceReadsCount: plotGuidanceReads,
        plotGuidancePostsCount: totalPlotPosts,
        promptCopiesCount: promptEvents,
      },
    };
  }

  async getOperationsStats() {
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);

    const [
      notifStats,
      totalNotifications,
      unreadNotifications,
      recentEmailLogs,
      autoClosedCount,
      candidatesNext24h,
      activeCvCount,
      cvHistoryCount,
      activeCvSizeSum,
      cvHistorySizeSum,
      domainEventsCount,
    ] = await Promise.all([
      this.adminNotifications?.getStats() ?? null,
      this.prisma.notification.count(),
      this.prisma.notification.count({ where: { readAt: null } }),
      this.prisma.emailDeliveryLog.findMany({
        take: 6,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      this.prisma.application.count({
        where: {
          stage: ApplicationStage.CLOSED,
          outcome: ApplicationOutcome.NO_RESPONSE,
        },
      }),
      this.prisma.application.count({
        where: {
          stage: { not: ApplicationStage.CLOSED },
          outcome: ApplicationOutcome.NONE,
          createdAt: { lte: sixDaysAgo },
        },
      }),
      this.prisma.userCv.count(),
      this.prisma.userCvHistory.count(),
      this.prisma.userCv.aggregate({ _sum: { size: true } }),
      this.prisma.userCvHistory.aggregate({ _sum: { size: true } }),
      this.prisma.domainEventLog.count(),
    ]);

    const startPing = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - startPing;

    const totalFiles = activeCvCount + cvHistoryCount;
    const totalBytes =
      (activeCvSizeSum._sum.size ?? 0) + (cvHistorySizeSum._sum.size ?? 0);
    const totalMegabytes = Number((totalBytes / (1024 * 1024)).toFixed(2));
    const limitMegabytes = 500;
    const storagePercent = Math.min(
      100,
      Number(((totalMegabytes / limitMegabytes) * 100).toFixed(1)),
    );

    const readNotifications = Math.max(0, totalNotifications - unreadNotifications);
    const notificationsReadRate =
      totalNotifications > 0
        ? Math.round((readNotifications / totalNotifications) * 100)
        : 100;

    return {
      notifications: {
        daily: notifStats?.daily ?? {
          sent: 0,
          limit: 100,
          remaining: 100,
          percentUsed: 0,
          otpSafeReserve: 15,
          safeAvailableForBulk: 85,
        },
        monthly: notifStats?.monthly ?? {
          sent: 0,
          limit: 3000,
          remaining: 3000,
          percentUsed: 0,
        },
        smtp: notifStats?.smtp ?? {
          configured: false,
          active: false,
        },
        stats: {
          totalNotifications,
          unreadNotifications,
          readNotifications,
          readRate: notificationsReadRate,
        },
        recentLogs: recentEmailLogs.map((l) => ({
          id: l.id,
          type: l.type,
          recipientEmail: l.recipientEmail,
          recipientName: l.recipientName || l.user?.name || null,
          subject: l.subject,
          status: l.status,
          errorMessage: l.errorMessage,
          channel: l.channel,
          createdAt: l.createdAt.toISOString(),
        })),
      },
      noResponseProcessor: {
        status: 'ACTIVE',
        interval: 'Every 15 minutes',
        autoClosedCount,
        candidatesNext24h,
      },
      storage: {
        activeCvCount,
        cvHistoryCount,
        totalFiles,
        totalBytes,
        totalMegabytes,
        limitMegabytes,
        percentUsed: storagePercent,
      },
      systemHealth: {
        dbStatus: 'CONNECTED',
        dbLatencyMs: latencyMs,
        domainEventsCount,
        rateLimiter: {
          limit: 120,
          ttlSeconds: 60,
          status: 'ACTIVE',
        },
      },
    };
  }

  async runNoResponseProcessor() {
    if (!this.noResponseProcessor) {
      throw new NotFoundException('NoResponseProcessor not configured');
    }
    const closed = await this.noResponseProcessor.runOnce();
    return {
      success: true,
      closedCount: closed,
      timestamp: new Date().toISOString(),
      message: `تم فحص وإغلاق ${closed} من الطلبات غير المستجابة.`,
    };
  }

  async cleanupOrphanedFiles() {
    if (!this.profileService) {
      throw new NotFoundException('ProfileService not configured');
    }
    const result = await this.profileService.cleanupOrphanedFiles();
    return {
      success: true,
      deletedCount: result.deletedCount,
      freedBytes: result.freedBytes,
      freedMegabytes: Number((result.freedBytes / (1024 * 1024)).toFixed(2)),
      timestamp: new Date().toISOString(),
      message: `تم تنظيف ${result.deletedCount} ملفات يتيمة وتحرير ${(result.freedBytes / (1024 * 1024)).toFixed(2)} ميغابايت.`,
    };
  }
}
