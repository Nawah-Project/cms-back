import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApplicationOutcome,
  ApplicationStage,
  Prisma,
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
} from './admin.constants';
import { ActivityState, getActivityState } from './activity-status.util';
import { MonitoringQueryDto } from './dto/monitoring-query.dto';

interface UserMonitoringRow {
  id: string;
  name: string;
  role: UserRole;
  group: { id: string; name: string } | null;
  lastActivityAt: Date | null;
  inactivityDays: number | null;
  activityStatus: ActivityState['activityStatus'];
  applicationsCount: number;
  currentStageCounts: {
    applied: number;
    interview: number;
    decision: number;
    closed: number;
  };
}

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

  private async getUserRows(): Promise<UserMonitoringRow[]> {
    const evaluatedAt = new Date();
    const [users, appStats, stageCounts, transitionStats] = await Promise.all([
      this.prisma.user.findMany({
        select: {
          id: true,
          name: true,
          role: true,
          membership: {
            select: { group: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.application.groupBy({
        by: ['userId'],
        _count: { _all: true },
        _max: { createdAt: true, updatedAt: true },
      }),
      this.prisma.application.groupBy({
        by: ['userId', 'stage'],
        _count: { _all: true },
      }),
      this.prisma.applicationStageTransition.groupBy({
        by: ['userId'],
        _max: { changedAt: true },
      }),
    ]);
    const appByUser = new Map(appStats.map((row) => [row.userId, row]));
    const transitionsByUser = new Map(
      transitionStats.map((row) => [row.userId, row._max.changedAt]),
    );
    const stagesByUser = new Map<
      string,
      UserMonitoringRow['currentStageCounts']
    >();
    for (const row of stageCounts) {
      const counts = stagesByUser.get(row.userId) ?? {
        applied: 0,
        interview: 0,
        decision: 0,
        closed: 0,
      };
      counts[row.stage.toLowerCase() as keyof typeof counts] = row._count._all;
      stagesByUser.set(row.userId, counts);
    }

    return users.map((user) => {
      const app = appByUser.get(user.id);
      const dates = [
        app?._max.createdAt ?? null,
        app?._max.updatedAt ?? null,
        transitionsByUser.get(user.id) ?? null,
      ].filter((date): date is Date => date !== null);
      const lastActivityAt = dates.length
        ? new Date(Math.max(...dates.map((date) => date.getTime())))
        : null;
      const state = getActivityState(lastActivityAt, evaluatedAt);
      return {
        id: user.id,
        name: user.name,
        role: user.role,
        group: user.membership?.group ?? null,
        lastActivityAt,
        ...state,
        applicationsCount: app?._count._all ?? 0,
        currentStageCounts: stagesByUser.get(user.id) ?? {
          applied: 0,
          interview: 0,
          decision: 0,
          closed: 0,
        },
      };
    });
  }

  async getOverview() {
    const [rows, groupsCount, applicationsCount, membershipsCount] =
      await Promise.all([
        this.getUserRows(),
        this.prisma.group.count(),
        this.prisma.application.count(),
        this.prisma.membership.count(),
      ]);
    return {
      usersCount: rows.length,
      groupsCount,
      membershipsCount,
      unassignedUsersCount: rows.filter((row) => !row.group).length,
      activeUsersCount: rows.filter((row) => row.activityStatus === 'ACTIVE')
        .length,
      warningUsersCount: rows.filter((row) => row.activityStatus === 'WARNING')
        .length,
      criticalUsersCount: rows.filter(
        (row) => row.activityStatus === 'CRITICAL',
      ).length,
      neverActiveUsersCount: rows.filter(
        (row) => row.activityStatus === 'NEVER_ACTIVE',
      ).length,
      applicationsCount,
    };
  }

  async getUsers(query: MonitoringQueryDto) {
    const page = Math.max(1, Math.floor(query.page || 1));
    const limit = this.boundedLimit(query.limit);
    const allRows = await this.getUserRows();
    const filtered = query.activityStatus
      ? allRows.filter((row) => row.activityStatus === query.activityStatus)
      : allRows;
    filtered.sort((a, b) => {
      if (a.lastActivityAt && b.lastActivityAt)
        return (
          b.lastActivityAt.getTime() - a.lastActivityAt.getTime() ||
          a.id.localeCompare(b.id)
        );
      if (a.lastActivityAt) return -1;
      if (b.lastActivityAt) return 1;
      return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    });
    return {
      items: filtered.slice((page - 1) * limit, page * limit).map((row) => ({
        ...row,
        lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
        avatar: null,
      })),
      total: filtered.length,
      page,
      limit,
      totalPages: Math.ceil(filtered.length / limit),
    };
  }

  async getGroups() {
    const rows = await this.getUserRows();
    const groups = await this.prisma.group.findMany({
      select: { id: true, name: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const usersByGroup = new Map<string, UserMonitoringRow[]>();
    for (const row of rows) {
      if (!row.group) continue;
      const members = usersByGroup.get(row.group.id) ?? [];
      members.push(row);
      usersByGroup.set(row.group.id, members);
    }
    return {
      items: groups.map((group) => {
        const members = usersByGroup.get(group.id) ?? [];
        const dates = members
          .map((member) => member.lastActivityAt)
          .filter((date): date is Date => date !== null);
        const lastActivityAt = dates.length
          ? new Date(Math.max(...dates.map((date) => date.getTime())))
          : null;
        return {
          id: group.id,
          name: group.name,
          memberCount: members.length,
          capacity: MAX_GROUP_SIZE,
          availableSlots: Math.max(0, MAX_GROUP_SIZE - members.length),
          lastActivityAt: lastActivityAt?.toISOString() ?? null,
          activeMembers: members.filter(
            (member) => member.activityStatus === 'ACTIVE',
          ).length,
          warningMembers: members.filter(
            (member) => member.activityStatus === 'WARNING',
          ).length,
          criticalMembers: members.filter(
            (member) => member.activityStatus === 'CRITICAL',
          ).length,
          neverActiveMembers: members.filter(
            (member) => member.activityStatus === 'NEVER_ACTIVE',
          ).length,
        };
      }),
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
    };
  }

  async removeMember(groupId: string, userId: string) {
    return this.groupAssignment.withAssignmentLock(async (transaction) => {
      const membership = await transaction.membership.findFirst({
        where: { groupId, userId },
        select: { id: true },
      });
      if (!membership) throw new NotFoundException('Member not found in group');
      await transaction.membership.delete({ where: { id: membership.id } });
      return { success: true, groupId, userId, membershipRemoved: true };
    });
  }

  async assignUserToGroup(userId: string, targetGroupId?: string) {
    return this.groupAssignment.withAssignmentLock(async (transaction) => {
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
  }
}
