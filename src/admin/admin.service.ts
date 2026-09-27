import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
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

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly groupAssignment: GroupAssignmentService,
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
    ), latest_activity AS (
      SELECT u.id, u.name, u.role, m."groupId", g.name AS "groupName",
        COALESCE(GREATEST(a.last_at, t.last_at), a.last_at, t.last_at) AS last_at
      FROM users u
      LEFT JOIN memberships m ON m."userId" = u.id
      LEFT JOIN member_groups g ON g.id = m."groupId"
      LEFT JOIN application_activity a ON a."userId" = u.id
      LEFT JOIN transition_activity t ON t."userId" = u.id
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

  async getOverview() {
    const [overview] = await this.prisma.$queryRaw<
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
        (SELECT COUNT(*)::int FROM memberships) AS "membershipsCount",
        COUNT(*) FILTER (WHERE "groupId" IS NULL)::int AS "unassignedUsersCount",
        COUNT(*) FILTER (WHERE activity_status = 'ACTIVE')::int AS "activeUsersCount",
        COUNT(*) FILTER (WHERE activity_status = 'WARNING')::int AS "warningUsersCount",
        COUNT(*) FILTER (WHERE activity_status = 'CRITICAL')::int AS "criticalUsersCount",
        COUNT(*) FILTER (WHERE activity_status = 'NEVER_ACTIVE')::int AS "neverActiveUsersCount",
        (SELECT COUNT(*)::int FROM applications) AS "applicationsCount"
      FROM classified`);
    return {
      ...overview,
    };
  }

  async getUsers(query: MonitoringQueryDto) {
    const page = Math.max(1, Math.floor(query.page || 1));
    const limit = this.boundedLimit(query.limit);
    const statusFilter = query.activityStatus
      ? Prisma.sql`WHERE c.activity_status = ${query.activityStatus}`
      : Prisma.empty;
    const offset = (page - 1) * limit;
    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<Array<{
        id: string;
        name: string;
        role: UserRole;
        groupId: string | null;
        groupName: string | null;
        lastActivityAt: Date | null;
        inactivityDays: number | null;
        activityStatus: ActivityState['activityStatus'];
        applicationsCount: number;
        applied: number;
        interview: number;
        decision: number;
        closed: number;
      }>>(Prisma.sql`${this.userActivityCte()}, application_counts AS (
        SELECT "userId", COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE stage = 'APPLIED')::int AS applied,
          COUNT(*) FILTER (WHERE stage = 'INTERVIEW')::int AS interview,
          COUNT(*) FILTER (WHERE stage = 'DECISION')::int AS decision,
          COUNT(*) FILTER (WHERE stage = 'CLOSED')::int AS closed
        FROM applications GROUP BY "userId"
      )
      SELECT c.id, c.name, c.role, c."groupId", c."groupName",
        c.last_at AS "lastActivityAt", c.inactivity_days AS "inactivityDays",
        c.activity_status AS "activityStatus", COALESCE(a.total, 0)::int AS "applicationsCount",
        COALESCE(a.applied, 0)::int AS applied, COALESCE(a.interview, 0)::int AS interview,
        COALESCE(a.decision, 0)::int AS decision, COALESCE(a.closed, 0)::int AS closed
      FROM classified c LEFT JOIN application_counts a ON a."userId" = c.id
      ${statusFilter}
      ORDER BY c.last_at DESC NULLS LAST, c.name ASC, c.id ASC
      OFFSET ${offset} LIMIT ${limit}`),
      this.prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`${this.userActivityCte()}
        SELECT COUNT(*)::int AS total FROM classified c ${statusFilter}`),
    ]);
    const total = totals[0]?.total ?? 0;
    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        role: row.role,
        group: row.groupId ? { id: row.groupId, name: row.groupName! } : null,
        lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
        inactivityDays: row.inactivityDays,
        activityStatus: row.activityStatus,
        applicationsCount: row.applicationsCount,
        currentStageCounts: {
          applied: row.applied,
          interview: row.interview,
          decision: row.decision,
          closed: row.closed,
        },
        avatar: null,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getGroups() {
    const items = await this.prisma.$queryRaw<Array<{
      id: string;
      name: string;
      memberCount: number;
      lastActivityAt: Date | null;
      activeMembers: number;
      warningMembers: number;
      criticalMembers: number;
      neverActiveMembers: number;
    }>>(Prisma.sql`${this.userActivityCte()}
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

  async getActivity(requestedLimit = ADMIN_MONITORING_DEFAULT_LIMIT) {
    const limit = this.boundedLimit(requestedLimit);
    return {
      items: await this.queryActivity({}, limit),
      limit,
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
    ] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          role: true,
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
    ]);
    if (!user) throw new NotFoundException('User not found');
    const dates = [
      appStats._max.createdAt,
      appStats._max.updatedAt,
      transitionStats._max.changedAt,
    ].filter((date): date is Date => date !== null);
    const lastActivityAt = dates.length
      ? new Date(Math.max(...dates.map((date) => date.getTime())))
      : null;
    const activityState = getActivityState(lastActivityAt);
    const currentStageCounts = {
      applied: 0,
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
    const [overdueTasks, mentorPriorityTasks, unreadMentorFeedback] =
      await Promise.all([
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
      ]);
    return {
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
        portfolioUrl: user.portfolioUrl,
        hasCv: Boolean(user.cv),
        group: user.membership?.group ?? null,
      },
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
    const result = await this.groupAssignment.withAssignmentLock(async (transaction) => {
      const membership = await transaction.membership.findFirst({
        where: { groupId, userId },
        select: { id: true },
      });
      if (!membership) throw new NotFoundException('Member not found in group');
      await transaction.membership.delete({ where: { id: membership.id } });
      return { success: true, groupId, userId, membershipRemoved: true };
    });
    this.logger.log(`Removed user ${userId} from group ${groupId}`);
    return result;
  }

  async assignUserToGroup(userId: string, targetGroupId?: string) {
    const result = await this.groupAssignment.withAssignmentLock(async (transaction) => {
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
    });
    this.logger.log(`Assigned user ${userId} to group ${result.group.id}`);
    return result;
  }
}
