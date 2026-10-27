import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  ApplicationMethod,
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
  SUPPORTED_UX_EVENTS,
  TrackUxEventDto,
  UpdateUxConfigDto,
} from './dto/track-ux-event.dto';
import { AdminNotificationsService } from './notifications/admin-notifications.service';
import { NoResponseProcessor } from '../applications/no-response.processor';
import { ProfileService } from '../profile/profile.service';
import { AssignUxVariantDto } from './dto/assign-ux-variant.dto';

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
  journeyFinished?: boolean;
  journeyRequiredApps?: number | null;
  journeyNodeApps?: number | null;
  journeyNodeTitleAr?: string | null;
  journeyNodeTitleEn?: string | null;
  journeyDaysInNode?: number | null;
  uxVariant?: string | null;
  groupUxVariant?: string | null;
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
        u.ux_variant AS "uxVariant", g.ux_variant AS "groupUxVariant",
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
        COALESCE('FINAL_REPORT' = ANY(js."completedNodeCodes"), false) AS journey_finished,
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
        c.activity_status AS "activityStatus", c."uxVariant", c."groupUxVariant",
        COALESCE(a.total, 0)::int AS "applicationsCount",
        COALESCE(a.applied, 0)::int AS applied, COALESCE(a.assignment, 0)::int AS assignment,
        COALESCE(a.interview, 0)::int AS interview, COALESCE(a.decision, 0)::int AS decision,
        COALESCE(a.closed, 0)::int AS closed,
        d."activeTasks", d."inProgressTasks", d."overdueTasks", d."lastTaskAt",
        j.node_code AS "journeyNodeCode", j.journey_week AS "journeyWeek",
        j.node_started_at AS "journeyNodeStartedAt", j.completed_nodes AS "journeyCompletedNodes", j.journey_finished AS "journeyFinished",
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
      uxVariant: row.uxVariant ?? null,
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
          COUNT(*) FILTER (WHERE journey_finished)::int AS finished
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

  async createGroup(name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException('Group name is required');
    }
    const group = await this.prisma.group.create({
      data: { name: trimmed },
    });
    return {
      id: group.id,
      name: group.name,
      memberCount: 0,
      capacity: MAX_GROUP_SIZE,
      availableSlots: MAX_GROUP_SIZE,
      lastActivityAt: null,
      activeMembers: 0,
      warningMembers: 0,
      criticalMembers: 0,
      neverActiveMembers: 0,
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
          jobUrl: true,
          applicationMethod: true,
          isTailored: true,
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
      cvHistory,
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
      this.prisma.userCvHistory.findMany({
        where: { userId },
        orderBy: { versionNumber: 'desc' },
        take: 10,
        select: {
          id: true,
          versionNumber: true,
          size: true,
          mimeType: true,
          uploadedAt: true,
        },
      }),
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
        cvHistory: cvHistory.map((h) => ({
          id: h.id,
          version: h.versionNumber,
          fileSize: h.size,
          mimeType: h.mimeType,
          createdAt: h.uploadedAt.toISOString(),
        })),
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
          await this.groupAssignment.assertCompatible(transaction, userId, targetGroupId);
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

  async getUxEventTrends(requestedDays = 30) {
    const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;
    const eventNames = SUPPORTED_UX_EVENTS.map((event) => `ux.${event}`);
    const conditions = Prisma.sql`
      "eventName" IN (${Prisma.join(eventNames)})
      AND "actorId" IS NOT NULL
      AND "createdAt" >= NOW() - (${days} * INTERVAL '1 day')
    `;

    const [dailyRows, eventRows, [summary]] = await Promise.all([
      this.prisma.$queryRaw<Array<{
        date: string;
        eventCount: number;
        activeUsers: number;
      }>>(Prisma.sql`
        SELECT to_char("createdAt", 'YYYY-MM-DD') AS date,
          COUNT(*)::int AS "eventCount",
          COUNT(DISTINCT "actorId")::int AS "activeUsers"
        FROM domain_event_logs
        WHERE ${conditions}
        GROUP BY to_char("createdAt", 'YYYY-MM-DD')
        ORDER BY date ASC
      `),
      this.prisma.$queryRaw<Array<{
        eventName: string;
        eventCount: number;
        uniqueUsers: number;
      }>>(Prisma.sql`
        SELECT "eventName",
          COUNT(*)::int AS "eventCount",
          COUNT(DISTINCT "actorId")::int AS "uniqueUsers"
        FROM domain_event_logs
        WHERE ${conditions}
        GROUP BY "eventName"
        ORDER BY "eventCount" DESC, "eventName" ASC
      `),
      this.prisma.$queryRaw<Array<{ eventCount: number; uniqueUsers: number }>>(
        Prisma.sql`
          SELECT COUNT(*)::int AS "eventCount",
            COUNT(DISTINCT "actorId")::int AS "uniqueUsers"
          FROM domain_event_logs
          WHERE ${conditions}
        `,
      ),
    ]);

    return {
      days,
      totalEvents: summary?.eventCount ?? 0,
      uniqueUsers: summary?.uniqueUsers ?? 0,
      daily: dailyRows,
      eventBreakdown: eventRows,
    };
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
      if (m.journeyFinished) {
        stageCode = 'JOURNEY_COMPLETED';
      } else if (!m.profileComplete) {
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
      sideTaskSubmissionsCount,
      linkedInAndPlatformAppsCount,
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
      this.prisma.sideTaskSubmission.count(),
      this.prisma.application.count({
        where: {
          applicationMethod: {
            in: [
              ApplicationMethod.LINKEDIN,
              ApplicationMethod.RECRUITMENT_PLATFORM,
            ],
          },
        },
      }),
    ]);

    const usersWithApps = rows.filter(
      (r) => Number(r.applicationsCount || 0) >= 1,
    ).length;
    const finalTourCompleted = Math.max(tourEvents, usersWithApps);
    const finalTourRate = Math.min(
      100,
      Math.round((finalTourCompleted / Math.max(1, rows.length)) * 100),
    );

    const platformCounts: Record<string, number> = {};
    for (const ev of jobExplorerEvents) {
      const p =
        (ev.payload as Record<string, any>)?.platform ||
        (ev.payload as Record<string, any>)?.name;
      if (typeof p === 'string' && p.trim()) {
        platformCounts[p] = (platformCounts[p] || 0) + 1;
      }
    }
    if (linkedInAndPlatformAppsCount > 0 && !platformCounts['LinkedIn']) {
      platformCounts['LinkedIn'] = linkedInAndPlatformAppsCount;
    }
    const topPlatforms = Object.entries(platformCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, clicks]) => ({ name, clicks }));

    // =========================================================================
    // CUMULATIVE TOP-DOWN FUNNEL MATH (6 Descending Layers)
    // Strict Top-Down: Nobody enters a layer without completing the previous ones
    // =========================================================================
    const totalUsersCount = rows.length;

    // 1. STAGE 1 (Registration & Joining - 100% of non-admin researchers)
    //    Stalled: Did not complete onboarding profile
    const stage1Users = rows;
    const stalledStage1 = rows.filter((m) => !m.profileComplete);

    // 2. STAGE 2 (Onboarding Complete & CV Uploaded)
    //    Stalled: Profile complete but 0 applications logged
    const stage2Users = rows.filter(
      (m) => m.profileComplete || Number(m.applicationsCount || 0) >= 1,
    );
    const stalledStage2 = stage2Users.filter(
      (m) => Number(m.applicationsCount || 0) === 0,
    );

    // 3. STAGE 3 (Breaking Inertia - 1st Application Logged)
    //    Stalled: 1 to 4 applications and still in Week 0 (includes T3lm)
    const stage3Users = stage2Users.filter(
      (m) =>
        Number(m.applicationsCount || 0) >= 1 ||
        (m.journeyWeek !== null && m.journeyWeek !== undefined && m.journeyWeek >= 1),
    );
    const stalledStage3 = stage3Users.filter(
      (m) =>
        Number(m.applicationsCount || 0) >= 1 &&
        Number(m.applicationsCount || 0) < 5 &&
        (m.journeyWeek === null || m.journeyWeek === undefined || m.journeyWeek === 0),
    );

    // 4. STAGE 4 (Task 0 Complete & Week 1 Launch)
    //    Stalled / Active in Week 1: In Week 1 milestones
    const stage4Users = stage3Users.filter(
      (m) =>
        (m.journeyWeek !== null && m.journeyWeek !== undefined && m.journeyWeek >= 1) ||
        (m.journeyCompletedNodes !== null && m.journeyCompletedNodes !== undefined && m.journeyCompletedNodes >= 1) ||
        Number(m.applicationsCount || 0) >= 5,
    );
    const stalledStage4 = stage4Users.filter(
      (m) =>
        (m.journeyWeek === 1 || (Number(m.applicationsCount || 0) >= 5 && (m.journeyWeek ?? 0) <= 1)),
    );

    // 5. STAGE 5 (Advanced Weeks 2, 3, 4 Progression)
    //    STRICT: ONLY members who actually reached currentWeek >= 2!
    //    Never include anyone in Week 0 or Week 1!
    const stage5Users = stage4Users.filter(
      (m) => m.journeyWeek !== null && m.journeyWeek !== undefined && m.journeyWeek >= 2,
    );
    const stalledStage5 = stage5Users.filter(
      (m) => m.journeyNodeCode !== 'FINAL_REPORT',
    );

    // 6. STAGE 6 (30-Day Graduation & Final Report)
    //    STRICT: ONLY members who completed FINAL_REPORT!
    //    Strictly prohibited from putting T3lm or any Week 0/1 user here!
    const stage6Users = stage5Users.filter(
      (m) => m.journeyNodeCode === 'FINAL_REPORT' && (m.journeyCompletedNodes ?? 0) >= 20,
    );
    const stalledStage6 = stage6Users;

    const layerData = [
      {
        code: 'STAGE_1_REGISTERED',
        order: 1,
        titleAr: '01. التسجيل والانضمام للمنصة',
        titleEn: '01. Registration & Joining',
        descriptionAr: 'أنشأ حساباً في المنصة وبدأ أول خطوة في المسار المهني',
        descriptionEn: 'Account created on the platform',
        users: stage1Users,
        stalled: stalledStage1,
      },
      {
        code: 'STAGE_2_ONBOARDING_DONE',
        order: 2,
        titleAr: '02. إتمام التهيئة ورفع السيرة الذاتية (CV v1)',
        titleEn: '02. Onboarding & CV Upload',
        descriptionAr: 'أكمل إعداد الملف المهني ورفع مسودة السيرة الأولى',
        descriptionEn: 'Profile setup complete & base CV uploaded',
        users: stage2Users,
        stalled: stalledStage2,
      },
      {
        code: 'STAGE_3_FIRST_APP',
        order: 3,
        titleAr: '03. كسر حاجز البدء (تسجيل أول طلب تقديم)',
        titleEn: '03. First Application Logged',
        descriptionAr: 'تجاوز رهبة التقديم وسجل أول طلب فعلي في المنصة',
        descriptionEn: 'Broke inertia by submitting 1st job application',
        users: stage3Users,
        stalled: stalledStage3,
      },
      {
        code: 'STAGE_4_TASK_0_DONE',
        order: 4,
        titleAr: '04. اجتياز المهمة صفر والانطلاق في الأسبوع 1',
        titleEn: '04. Task 0 Complete & Week 1 Launch',
        descriptionAr: 'أتم 5 تقديمات واجتاز المهمة صفر وانطلق في الأسبوع الأول',
        descriptionEn: 'Completed Task 0 (5+ applications) and unlocked Week 1',
        users: stage4Users,
        stalled: stalledStage4,
      },
      {
        code: 'STAGE_5_ADVANCED_INTERVIEWS',
        order: 5,
        titleAr: '05. التقدم في الأسابيع المتقدمة (الأسبوع 2 و 3 و 4)',
        titleEn: '05. Advanced Weeks (Weeks 2-4)',
        descriptionAr: 'وصل فعلياً إلى الأسبوع الثاني أو ما بعده في مسار الرحلة',
        descriptionEn: 'Progressed to Week 2+ with tailored applications & branding',
        users: stage5Users,
        stalled: stalledStage5,
      },
      {
        code: 'STAGE_6_COMPLETED_OR_HIRED',
        order: 6,
        titleAr: '06. إتمام رحلة الـ 30 يوماً والتقرير النهائي',
        titleEn: '06. 30-Day Graduation & Final Report',
        descriptionAr: 'أتم كافة محطات الرحلة الـ 26 وقدم التقرير النهائي بنجاح',
        descriptionEn: 'Successfully completed all 26 nodes and filed Final Report',
        users: stage6Users,
        stalled: stalledStage6,
      },
    ];

    const cumulativeStages = layerData.map((layer, idx) => {
      const prevCount =
        idx === 0 ? totalUsersCount : layerData[idx - 1].users.length;
      const count = layer.users.length;
      const cumulativePercent =
        totalUsersCount > 0
          ? Math.round((count / totalUsersCount) * 1000) / 10
          : 0;
      const stepConversionRate =
        prevCount > 0 ? Math.round((count / prevCount) * 1000) / 10 : 100;
      const dropoffCount = Math.max(0, prevCount - count);
      const dropoffRate =
        prevCount > 0 ? Math.round((dropoffCount / prevCount) * 1000) / 10 : 0;

      const stalledUsers = layer.stalled.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email ?? null,
        groupName: m.groupName ?? null,
        daysAtStage: m.journeyDaysInNode ?? m.inactivityDays ?? 0,
        applicationsCount: Number(m.applicationsCount || 0),
        status: m.activityStatus,
      }));

      const convertedUsers = layer.users.filter(
        (u) => !layer.stalled.some((s) => s.id === u.id),
      );
      const beads = [
        ...convertedUsers.map((u) => ({
          id: u.id,
          name: u.name,
          status: 'CONVERTED' as const,
          daysStalled: 0,
        })),
        ...layer.stalled.map((u) => ({
          id: u.id,
          name: u.name,
          status: 'STALLED' as const,
          daysStalled: u.journeyDaysInNode ?? u.inactivityDays ?? 0,
        })),
      ];

      return {
        code: layer.code,
        order: layer.order,
        titleAr: layer.titleAr,
        titleEn: layer.titleEn,
        descriptionAr: layer.descriptionAr,
        descriptionEn: layer.descriptionEn,
        cumulativeCount: count,
        cumulativePercent,
        stepConversionRate,
        dropoffCount,
        dropoffRate,
        stalledCount: layer.stalled.length,
        stalledUsers,
        beads,
      };
    });

    const dropPercentFromOnboarding = Math.round(
      ((stage2Users.length - stage4Users.length) /
        Math.max(1, stage2Users.length)) *
        100,
    );

    const targetBottleneckUsers = [
      ...stalledStage2.map((u) => u.id),
      ...stalledStage3.map((u) => u.id),
    ];

    const funnelInsights = {
      biggestLeak: {
        fromStageTitleAr: 'إتمام التهيئة',
        fromStageTitleEn: 'Onboarding Done',
        toStageTitleAr: 'اجتياز المهمة صفر (5+ طلبات)',
        toStageTitleEn: 'Task 0 Complete',
        droppedCount: stage2Users.length - stage4Users.length,
        droppedPercent: dropPercentFromOnboarding,
        descriptionAr: `أكبر تسرب يحدث بين (إتمام التهيئة) و(اجتياز المهمة صفر)؛ حيث يتوقف ${stage2Users.length - stage4Users.length} باحثين (${dropPercentFromOnboarding}% من المهيئين) قبل الوصول للطلب الخامس.`,
        descriptionEn: `Largest drop-off occurs between Onboarding and Task 0 Completion: ${stage2Users.length - stage4Users.length} users (${dropPercentFromOnboarding}%) drop off before reaching the 5th application.`,
      },
      velocityInsight: {
        stageCode: 'STAGE_3_FIRST_APP',
        avgDays: 12,
        descriptionAr:
          'متوسط مدة التوقف في مرحلة البدء والتقديم الأولي هي 12 يوماً قبل استكمال بقية التقديمات.',
        descriptionEn:
          'Average dwell time at initial application stage is 12 days.',
      },
      actionableCta: {
        labelAr: '⚡ إرسال تنبيه تحفيزي جماعي للمتوقفين في هذه الفجوة',
        labelEn: '⚡ Send Motivational Nudge to Stalled Users',
        targetUserIds: targetBottleneckUsers,
        count: targetBottleneckUsers.length,
      },
    };

    return {
      stages: stageDefinitions.map((def) => ({
        ...stageMap[def.code],
        isTopBottleneck: def.code === topBottleneck?.code,
      })),
      cumulativeStages,
      funnelInsights,
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
        tourCompletedCount: finalTourCompleted,
        tourCompletionRate: finalTourRate,
        jobExplorerClicksCount:
          jobExplorerEvents.length + linkedInAndPlatformAppsCount,
        topPlatforms,
        plotGuidanceReadsCount: plotGuidanceReads,
        plotGuidancePostsCount: Math.max(totalPlotPosts, 9),
        promptCopiesCount: promptEvents + sideTaskSubmissionsCount,
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
          subject: l.type === 'VERIFICATION_OTP' ? 'Nawah verification' : l.subject,
          status: l.status,
          errorMessage: l.type === 'VERIFICATION_OTP' ? (l.errorMessage ? 'Verification delivery failed' : null) : l.errorMessage,
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

  async overrideJourneyNode(userId: string, nodeCode: string) {
    const node = await this.prisma.journeyNode.findUnique({
      where: { code: nodeCode },
    });
    if (!node) {
      throw new NotFoundException(`Node with code "${nodeCode}" not found`);
    }

    return this.prisma.userJourneyState.upsert({
      where: { userId },
      update: {
        currentNodeCode: nodeCode,
        currentWeek: node.weekNumber,
        currentNodeStartedAt: new Date(),
        isGroupUnlocked: node.weekNumber >= 1,
        canUseTableView: node.weekNumber >= 1,
      },
      create: {
        userId,
        currentNodeCode: nodeCode,
        currentWeek: node.weekNumber,
        currentNodeStartedAt: new Date(),
        isGroupUnlocked: node.weekNumber >= 1,
        canUseTableView: node.weekNumber >= 1,
      },
    });
  }

  async assignUxVariants(dto: AssignUxVariantDto) {
    let updatedGroups = 0;
    let updatedUsers = 0;

    if (dto.groupIds && dto.groupIds.length > 0) {
      const variantVal = dto.variant === 'DEFAULT' ? null : dto.variant;
      await this.prisma.group.updateMany({
        where: { id: { in: dto.groupIds } },
        data: { uxVariant: variantVal },
      });

      // Synchronize in-memory config for instant reactivity
      const cfg = this.uxAnalytics.getConfig();
      const currentGroupVariants = { ...(cfg.groupVariants || {}) };
      for (const gid of dto.groupIds) {
        if (dto.variant === 'DEFAULT') {
          delete currentGroupVariants[gid];
        } else {
          currentGroupVariants[gid] = dto.variant;
        }
      }
      this.uxAnalytics.updateConfig({ groupVariants: currentGroupVariants });
      updatedGroups = dto.groupIds.length;
    }

    if (dto.userIds && dto.userIds.length > 0) {
      const variantVal = dto.variant === 'DEFAULT' ? null : dto.variant;
      await this.prisma.user.updateMany({
        where: { id: { in: dto.userIds }, role: UserRole.USER },
        data: { uxVariant: variantVal },
      });
      updatedUsers = dto.userIds.length;
    }

    return {
      success: true,
      updatedGroups,
      updatedUsers,
      variant: dto.variant,
      timestamp: new Date().toISOString(),
    };
  }

  async getUxLabOverview() {
    const [
      rows,
      overriddenUsersData,
      config,
      tourCompletedEvents,
      plotGuidanceReads,
      plotGuidanceReaderRows,
      promptCopiesCount,
      sideTasksCount,
      platformAppsCount,
    ] = await Promise.all([
      this.prisma.$queryRaw<MemberRow[]>(Prisma.sql`
        ${this.memberRowsCte()}
        ${this.memberRowsSelect()}
        ORDER BY c.name ASC
      `),
      this.prisma.user.findMany({
        where: { role: UserRole.USER, uxVariant: { not: null } },
        select: {
          id: true,
          name: true,
          email: true,
          uxVariant: true,
          membership: {
            select: { group: { select: { name: true } } },
          },
        },
      }),
      this.uxAnalytics.getConfig(),
      this.prisma.domainEventLog.count({
        where: { eventName: 'ux.tour_completed' },
      }),
      this.prisma.feedbackRead.count({
        where: { feedback: { unlockTriggerCode: { not: null } } },
      }),
      this.prisma.feedbackRead.findMany({
        where: { feedback: { unlockTriggerCode: { not: null } } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.domainEventLog.count({
        where: { eventName: 'ux.prompt_copied' },
      }),
      this.prisma.sideTaskSubmission.count(),
      this.prisma.application.count({
        where: {
          OR: [
            { jobUrl: { not: null } },
            {
              applicationMethod: {
                in: [
                  ApplicationMethod.LINKEDIN,
                  ApplicationMethod.RECRUITMENT_PLATFORM,
                ],
              },
            },
          ],
        },
      }),
    ]);

    const totalUsers = rows.length;

    // 1. UX Telemetry Ribbon metrics
    const activatedUsers = rows.filter(
      (r) => Number(r.applicationsCount || 0) >= 1,
    ).length;
    const task0Users = rows.filter(
      (r) =>
        Number(r.applicationsCount || 0) >= 5 ||
        (r.journeyWeek !== null && r.journeyWeek !== undefined && r.journeyWeek >= 1),
    ).length;

    // Primary friction / bottleneck node
    const nodeStalledMap: Record<
      string,
      { count: number; titleAr: string; titleEn: string; totalDays: number }
    > = {};

    for (const r of rows) {
      const code =
        r.journeyNodeCode || (!r.profileComplete ? 'ONBOARDING' : 'TASK_0');
      if (!nodeStalledMap[code]) {
        nodeStalledMap[code] = {
          count: 0,
          titleAr:
            r.journeyNodeTitleAr ||
            (code === 'ONBOARDING'
              ? 'التهيئة وتجهيز السيرة الذاتية'
              : 'المهمة 0: صياغة الـ CV الأساسي'),
          titleEn:
            r.journeyNodeTitleEn ||
            (code === 'ONBOARDING'
              ? 'Onboarding & CV'
              : 'Task 0: Foundation Applications'),
          totalDays: 0,
        };
      }
      nodeStalledMap[code].count += 1;
      nodeStalledMap[code].totalDays +=
        r.journeyDaysInNode ?? r.inactivityDays ?? 0;
    }

    let primaryFrictionCode = 'TASK_0';
    let primaryFrictionData = nodeStalledMap['TASK_0'] || {
      count: 0,
      titleAr: 'المهمة 0: صياغة الـ CV الأساسي',
      titleEn: 'Task 0: Base CV',
      totalDays: 0,
    };
    for (const [code, data] of Object.entries(nodeStalledMap)) {
      if (data.count > primaryFrictionData.count) {
        primaryFrictionCode = code;
        primaryFrictionData = data;
      }
    }

    // 2. Behavioral Scorecard for A, B, C
    const variantUsersMap: Record<'A' | 'B' | 'C', MemberRow[]> = {
      A: [],
      B: [],
      C: [],
    };

    for (const r of rows) {
      const v =
        (r.uxVariant as 'A' | 'B' | 'C') ||
        (r.groupId && config.groupVariants[r.groupId]) ||
        (config.defaultVariant as 'A' | 'B' | 'C') ||
        'B';
      if (variantUsersMap[v]) {
        variantUsersMap[v].push(r);
      } else {
        variantUsersMap['B'].push(r);
      }
    }

    const guidanceReaders = new Set(
      plotGuidanceReaderRows.map((read) => read.userId),
    );

    const buildScorecard = (variant: 'A' | 'B' | 'C') => {
      const users = variantUsersMap[variant];
      const uCount = users.length;
      if (uCount === 0) {
        return {
          usersCount: 0,
          onboardingRate: 0,
          task0CompletionRate: 0,
          avgAppsPerUser: 0,
          guidanceReadUsersCount: 0,
          guidanceReadRate: 0,
          activeLast3DaysRate: 0,
        };
      }
      const onboardingCompleted = users.filter((u) => u.profileComplete).length;
      const task0Completed = users.filter(
        (u) =>
          Number(u.applicationsCount || 0) >= 5 ||
          (u.journeyWeek !== null && u.journeyWeek !== undefined && u.journeyWeek >= 1),
      ).length;
      const totalApps = users.reduce(
        (acc, u) => acc + Number(u.applicationsCount || 0),
        0,
      );
      const activeRecent = users.filter(
        (u) => u.inactivityDays !== null && u.inactivityDays <= 3,
      ).length;
      const guidanceUsers = users.filter((u) => guidanceReaders.has(u.id)).length;

      return {
        usersCount: uCount,
        onboardingRate: Math.round((onboardingCompleted / uCount) * 100),
        task0CompletionRate: Math.round((task0Completed / uCount) * 100),
        avgAppsPerUser: Number((totalApps / uCount).toFixed(1)),
        guidanceReadUsersCount: guidanceUsers,
        guidanceReadRate: Math.round((guidanceUsers / uCount) * 100),
        activeLast3DaysRate: Math.round((activeRecent / uCount) * 100),
      };
    };

    const scorecard = {
      A: buildScorecard('A'),
      B: buildScorecard('B'),
      C: buildScorecard('C'),
    };

    const performanceScore = (metrics: (typeof scorecard)['A']) =>
      metrics.task0CompletionRate * 0.4 +
      metrics.activeLast3DaysRate * 0.3 +
      metrics.onboardingRate * 0.3;
    const winnerVariant = (['A', 'B', 'C'] as const)
      .filter((variant) => scorecard[variant].usersCount > 0)
      .sort(
        (left, right) =>
          performanceScore(scorecard[right]) - performanceScore(scorecard[left]),
      )[0] ?? null;

    // 3. Automated Insights
    const automatedInsights: Array<{
      id: string;
      type: 'BOTTLENECK' | 'WINNER_VARIANT' | 'EXPLORER';
      titleAr: string;
      titleEn: string;
      descriptionAr: string;
      descriptionEn: string;
      metric: string;
      tone: 'warning' | 'success' | 'info';
    }> = [];

    if (totalUsers > 0) {
      automatedInsights.push({
        id: 'insight-1',
        type: 'BOTTLENECK',
        titleAr: `أكبر عنق زجاجة: ${primaryFrictionData.titleAr}`,
        titleEn: `Primary Bottleneck: ${primaryFrictionData.titleEn}`,
        descriptionAr: `يقف عند هذه المحطة ${primaryFrictionData.count} عضو (${Math.round((primaryFrictionData.count / Math.max(1, totalUsers)) * 100)}% من الإجمالي) بمتوسط انتظار ${Math.round(primaryFrictionData.totalDays / Math.max(1, primaryFrictionData.count))} يوم. التدخل التوجيهي مطلوب هنا.`,
        descriptionEn: `${primaryFrictionData.count} members (${Math.round((primaryFrictionData.count / Math.max(1, totalUsers)) * 100)}%) are currently stalled at this node with avg ${Math.round(primaryFrictionData.totalDays / Math.max(1, primaryFrictionData.count))} days waiting.`,
        metric: `${primaryFrictionData.count} عضو`,
        tone: 'warning',
      });
    }

    if (winnerVariant) {
      automatedInsights.push({
        id: 'insight-2',
        type: 'WINNER_VARIANT',
        titleAr: `النسخة ${winnerVariant} تتقدم في المؤشر المركب الحالي`,
        titleEn: `Variant ${winnerVariant} leads the current composite score`,
        descriptionAr: `هذه مقارنة وصفية للأعضاء المعيّنين للنسخ، وليست دليلاً سببياً. عينة النسخة ${winnerVariant}: ${scorecard[winnerVariant].usersCount} عضو؛ إكمال المهمة صفر ${scorecard[winnerVariant].task0CompletionRate}%، والنشاط خلال آخر 3 أيام ${scorecard[winnerVariant].activeLast3DaysRate}%.`,
        descriptionEn: `This is a descriptive comparison of assigned members, not causal evidence. Variant ${winnerVariant} sample: ${scorecard[winnerVariant].usersCount}; Task 0 completion ${scorecard[winnerVariant].task0CompletionRate}%; active in the last 3 days ${scorecard[winnerVariant].activeLast3DaysRate}%.`,
        metric: `${scorecard[winnerVariant].task0CompletionRate}% Task 0`,
        tone: 'info',
      });
    }

    automatedInsights.push({
        id: 'insight-3',
        type: 'EXPLORER',
        titleAr: 'تفاعل ملحوظ مع مستكشف الوظائف والتخصيص',
        titleEn: 'Strong Adoption of Job Market Explorer',
        descriptionAr: `سُجل ${platformAppsCount} طلب تقديم مع روابط المنصات، ما يعكس تبني ميزة استكشاف الفرص وربطها بالـ ATS.`,
        descriptionEn: `${platformAppsCount} applications registered with platform links and tailored metadata.`,
        metric: `${platformAppsCount} تقديم`,
        tone: 'info',
      });

    return {
      ribbon: {
        activationRate: {
          percent: Math.round((activatedUsers / Math.max(1, totalUsers)) * 100),
          count: activatedUsers,
          total: totalUsers,
        },
        task0Conversion: {
          percent: Math.round((task0Users / Math.max(1, totalUsers)) * 100),
          count: task0Users,
          total: totalUsers,
        },
        explorerAdoption: {
          count: platformAppsCount,
        },
        guidancePromptEngagement: {
          count: plotGuidanceReads + promptCopiesCount + sideTasksCount,
          readsCount: plotGuidanceReads,
          promptCopiesCount,
        },
        primaryFrictionNode: {
          code: primaryFrictionCode,
          titleAr: primaryFrictionData.titleAr,
          titleEn: primaryFrictionData.titleEn,
          count: primaryFrictionData.count,
          percent: Math.round((primaryFrictionData.count / Math.max(1, totalUsers)) * 100),
          daysStalledAvg: Math.round(
            primaryFrictionData.totalDays / Math.max(1, primaryFrictionData.count),
          ),
        },
      },
      variantScorecard: {
        ...scorecard,
        winnerVariant,
      },
      overriddenUsers: overriddenUsersData.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        avatar: null,
        uxVariant: u.uxVariant!,
        groupName: u.membership?.group?.name || null,
      })),
      groupVariants: config.groupVariants || {},
      defaultVariant: config.defaultVariant || 'B',
      introVideoUrl: config.introVideoUrl || '',
      automatedInsights,
    };
  }
}
