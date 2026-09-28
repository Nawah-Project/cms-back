import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationOutcome, ApplicationStage, Prisma } from '@prisma/client';
import { PrismaService as Database } from '../prisma/prisma.service';

type MemberSummary = {
  id: string;
  name: string;
  avatar: string | null;
  portfolioUrl?: string | null;
  hasCv?: boolean;
};

export interface MemberProgress {
  memberId: string;
  userId: string;
  name: string;
  avatar: string | null;
  portfolioUrl: string | null;
  hasCv: boolean;
  hasAcceptedApplication: boolean;
  isCurrentUser: boolean;
  lastUpdatedAt: string | null;
  counts: {
    applied: number;
    interview: number;
    decision: number;
    closed: number;
  };
}

export interface MemberActivity {
  id: string;
  member: MemberSummary;
  memberId: string;
  application: {
    id: string;
    companyName: string;
    jobTitle: string;
    jobUrl: string | null;
    applicationMethod: string | null;
  };
  fromStage: ApplicationStage | null;
  toStage: ApplicationStage;
  outcome: ApplicationOutcome | null;
  changedAt: string;
}

@Injectable()
export class MembersService {
  constructor(private readonly prisma: Database) {}

  private async getGroup(
    userId: string,
  ): Promise<{ id: string; memberIds: string[] }> {
    const membership = await this.prisma.membership.findUnique({
      where: { userId },
      select: { groupId: true },
    });
    if (!membership)
      throw new ForbiddenException('You are not a member of a group');
    const memberships = await this.prisma.membership.findMany({
      where: { groupId: membership.groupId },
      select: { userId: true },
    });
    return {
      id: membership.groupId,
      memberIds: memberships.map((row) => row.userId),
    };
  }

  async getProgress(currentUserId: string): Promise<MemberProgress[]> {
    const { memberIds } = await this.getGroup(currentUserId);
    const [
      memberships,
      groupedCounts,
      applicationActivity,
      transitionActivity,
      acceptedApplications,
    ] = await Promise.all([
      this.prisma.membership.findMany({
        where: { userId: { in: memberIds } },
        select: {
          userId: true,
          user: {
            select: {
              name: true,
              portfolioUrl: true,
              cv: { select: { id: true } },
            },
          },
        },
      }),
      this.prisma.application.groupBy({
        by: ['userId', 'stage'],
        where: { userId: { in: memberIds } },
        _count: { _all: true },
      }),
      this.prisma.application.groupBy({
        by: ['userId'],
        where: { userId: { in: memberIds } },
        _max: { createdAt: true, updatedAt: true },
      }),
      this.prisma.applicationStageTransition.groupBy({
        by: ['userId'],
        where: { userId: { in: memberIds } },
        _max: { changedAt: true },
      }),
      this.prisma.application.groupBy({
        by: ['userId'],
        where: {
          userId: { in: memberIds },
          stage: ApplicationStage.CLOSED,
          outcome: ApplicationOutcome.ACCEPTED,
        },
        _count: { _all: true },
      }),
    ]);

    const countsByUser = new Map<string, MemberProgress['counts']>(
      memberIds.map((id) => [
        id,
        { applied: 0, interview: 0, decision: 0, closed: 0 },
      ]),
    );
    for (const row of groupedCounts) {
      const counts = countsByUser.get(row.userId);
      if (counts)
        counts[row.stage.toLowerCase() as keyof MemberProgress['counts']] =
          row._count._all;
    }
    const latestByUser = new Map<string, Date>();
    const consider = (userId: string, date: Date | null) => {
      if (
        date &&
        (!latestByUser.has(userId) || date > latestByUser.get(userId)!)
      )
        latestByUser.set(userId, date);
    };
    for (const row of applicationActivity) {
      consider(row.userId, row._max.createdAt);
      consider(row.userId, row._max.updatedAt);
    }
    for (const row of transitionActivity)
      consider(row.userId, row._max.changedAt);
    const nameByUser = new Map(
      memberships.map(({ userId, user }) => [userId, user.name]),
    );
    const profileByUser = new Map(
      memberships.map(({ userId, user }) => [userId, user]),
    );
    const usersWithAcceptedApplications = new Set(
      acceptedApplications.map(({ userId }) => userId),
    );

    return memberIds
      .map((userId) => ({
        memberId: userId,
        userId,
        name: nameByUser.get(userId) ?? '',
        avatar: null,
        portfolioUrl: profileByUser.get(userId)?.portfolioUrl ?? null,
        hasCv: Boolean(profileByUser.get(userId)?.cv),
        hasAcceptedApplication: usersWithAcceptedApplications.has(userId),
        isCurrentUser: userId === currentUserId,
        lastUpdatedAt: latestByUser.get(userId)?.toISOString() ?? null,
        counts: countsByUser.get(userId)!,
      }))
      .sort((a, b) => {
        if (a.lastUpdatedAt && b.lastUpdatedAt)
          return (
            b.lastUpdatedAt.localeCompare(a.lastUpdatedAt) ||
            a.userId.localeCompare(b.userId)
          );
        if (a.lastUpdatedAt) return -1;
        if (b.lastUpdatedAt) return 1;
        return a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId);
      });
  }

  async getRecentProgress(
    currentUserId: string,
    limit = 10,
  ): Promise<MemberActivity[]> {
    return this.getActivity(currentUserId, limit);
  }

  async getActivity(
    currentUserId: string,
    requestedLimit = 20,
  ): Promise<MemberActivity[]> {
    const { memberIds } = await this.getGroup(currentUserId);
    const limit = Math.min(50, Math.max(1, Math.floor(requestedLimit) || 20));
    const memberFilter: Prisma.ApplicationWhereInput = {
      userId: { in: memberIds },
    };
    const transitionFilter: Prisma.ApplicationStageTransitionWhereInput = {
      userId: { in: memberIds },
    };
    const [transitions, applications] = await Promise.all([
      this.prisma.applicationStageTransition.findMany({
        where: transitionFilter,
        select: {
          id: true,
          userId: true,
          fromStage: true,
          toStage: true,
          outcome: true,
          changedAt: true,
          user: { select: { id: true, name: true } },
          application: {
            select: {
              id: true,
              companyName: true,
              jobTitle: true,
              jobUrl: true,
              applicationMethod: true,
            },
          },
        },
        orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
        take: limit,
      }),
      this.prisma.application.findMany({
        where: memberFilter,
        select: {
          id: true,
          userId: true,
          companyName: true,
          jobTitle: true,
          jobUrl: true,
          applicationMethod: true,
          stage: true,
          outcome: true,
          createdAt: true,
          transitions: {
            select: { fromStage: true },
            orderBy: [{ changedAt: 'asc' }, { id: 'asc' }],
            take: 1,
          },
          user: { select: { id: true, name: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
      }),
    ]);
    const feed: MemberActivity[] = [
      ...transitions.map((row) => ({
        id: `transition:${row.id}`,
        member: { ...row.user, avatar: null },
        memberId: row.userId,
        application: {
          id: row.application.id,
          companyName: row.application.companyName,
          jobTitle: row.application.jobTitle,
          jobUrl: row.application.jobUrl,
          applicationMethod: row.application.applicationMethod,
        },
        fromStage: row.fromStage,
        toStage: row.toStage,
        outcome: row.outcome,
        changedAt: row.changedAt.toISOString(),
      })),
      ...applications.map((row) => ({
        id: `application:${row.id}`,
        member: { ...row.user, avatar: null },
        memberId: row.userId,
        application: {
          id: row.id,
          companyName: row.companyName,
          jobTitle: row.jobTitle,
          jobUrl: row.jobUrl,
          applicationMethod: row.applicationMethod,
        },
        fromStage: null,
        toStage: row.transitions?.[0]?.fromStage ?? row.stage,
        outcome:
          (row.transitions?.length ?? 0) > 0 ||
          row.outcome === ApplicationOutcome.NONE
            ? null
            : row.outcome,
        changedAt: row.createdAt.toISOString(),
      })),
    ];
    return feed
      .sort(
        (a, b) =>
          b.changedAt.localeCompare(a.changedAt) || b.id.localeCompare(a.id),
      )
      .slice(0, limit);
  }

  async getMemberDetail(currentUserId: string, targetMemberId: string) {
    const { memberIds } = await this.getGroup(currentUserId);
    if (!memberIds.includes(targetMemberId))
      throw new NotFoundException('Member not found');
    const member = await this.prisma.user.findUnique({
      where: { id: targetMemberId },
      select: {
        id: true,
        name: true,
        portfolioUrl: true,
        cv: { select: { id: true } },
      },
    });
    if (!member) throw new NotFoundException('Member not found');
    const [applicationActivity, transitionActivity, applications] =
      await Promise.all([
        this.prisma.application.aggregate({
          where: { userId: targetMemberId },
          _max: { createdAt: true, updatedAt: true },
        }),
        this.prisma.applicationStageTransition.aggregate({
          where: { userId: targetMemberId },
          _max: { changedAt: true },
        }),
        this.prisma.application.findMany({
          where: { userId: targetMemberId },
          select: {
            id: true,
            companyName: true,
            jobTitle: true,
            applicationDate: true,
            location: true,
            applicationMethod: true,
            jobUrl: true,
            stage: true,
            outcome: true,
            updatedAt: true,
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: 20,
        }),
      ]);
    const activityDates = [
      applicationActivity._max.createdAt,
      applicationActivity._max.updatedAt,
      transitionActivity._max.changedAt,
    ].filter((date): date is Date => date !== null);
    const lastUpdatedAt = activityDates.length
      ? new Date(
          Math.max(...activityDates.map((d) => d.getTime())),
        ).toISOString()
      : null;
    const companies = [
      ...new Set(applications.map((application) => application.companyName)),
    ];
    const otherUserIds = memberIds.filter((id) => id !== targetMemberId);
    const shared =
      companies.length && otherUserIds.length
        ? await this.prisma.application.findMany({
            where: {
              userId: { in: otherUserIds },
              companyName: { in: companies },
            },
            select: { userId: true, companyName: true },
            distinct: ['userId', 'companyName'],
          })
        : [];
    const sharedCompanyByName = new Map<string, MemberSummary[]>();
    if (shared.length) {
      const sharedMemberIds = [...new Set(shared.map((row) => row.userId))];
      const sharedMembers = await this.prisma.user.findMany({
        where: { id: { in: sharedMemberIds } },
        select: { id: true, name: true },
      });
      const membersById = new Map(
        sharedMembers.map((row) => [row.id, { ...row, avatar: null }]),
      );
      for (const row of shared) {
        const summary = membersById.get(row.userId);
        if (!summary) continue;
        const list = sharedCompanyByName.get(row.companyName) ?? [];
        list.push(summary);
        sharedCompanyByName.set(row.companyName, list);
      }
    }
    return {
      member: {
        id: member.id,
        name: member.name,
        avatar: null,
        portfolioUrl: member.portfolioUrl ?? null,
        hasCv: Boolean(member.cv),
        lastUpdatedAt,
      },
      applications: applications.map((application) => ({
        ...application,
        outcome:
          application.outcome === ApplicationOutcome.NONE
            ? null
            : application.outcome,
        updatedAt: application.updatedAt.toISOString(),
        sharedCompany:
          (sharedCompanyByName.get(application.companyName)?.length ?? 0) > 0,
        otherMembers: sharedCompanyByName.get(application.companyName) ?? [],
      })),
    };
  }
}
