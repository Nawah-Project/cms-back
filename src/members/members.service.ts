import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationOutcome, ApplicationStage, Prisma, UserRole } from '@prisma/client';
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
    assignment: number;
    interview: number;
    decision: number;
    closed: number;
  };
}

export interface MemberActivity {
  id: string;
  activityType?:
    | 'APPLICATION'
    | 'SHARED_APPLICATION'
    | 'STAGE_TRANSITION'
    | 'SIDE_TASK';
  sharedWithGroup?: boolean;
  member: MemberSummary;
  memberId: string;
  application: {
    id: string;
    companyName: string;
    jobTitle: string;
    jobUrl: string | null;
    applicationMethod: string | null;
    sharedWithGroup?: boolean;
    isTailored?: boolean;
  };
  sideTask?: {
    id: string;
    type: string;
    nodeCode: string;
    journeyWeek: number;
    postUrl: string | null;
    postTopic: string | null;
    reviewSummary: string | null;
  } | null;
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
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    const isAdmin = user?.role === UserRole.ADMIN;

    if (!isAdmin) {
      const journey = await this.prisma.userJourneyState.findUnique({
        where: { userId },
        select: { completedNodeCodes: true, currentWeek: true },
      });
      if (!journey || (!(journey.completedNodeCodes ?? []).includes('TASK_0') && journey.currentWeek < 1)) {
        throw new ForbiddenException(
          'Group progress unlocks after completing Task 0 (5 applications)',
        );
      }
    }

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
        { applied: 0, assignment: 0, interview: 0, decision: 0, closed: 0 },
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
    const [transitions, applications, sideTasks] = await Promise.all([
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
              sharedWithGroup: true,
              isTailored: true,
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
          sharedWithGroup: true,
          isTailored: true,
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
      this.prisma.sideTaskSubmission?.findMany
        ? this.prisma.sideTaskSubmission.findMany({
            where: {
              userId: { in: memberIds },
              sharedInGroup: true,
            },
            select: {
              id: true,
              userId: true,
              nodeCode: true,
              journeyWeek: true,
              type: true,
              postUrl: true,
              postTopic: true,
              reviewSummary: true,
              createdAt: true,
              user: { select: { id: true, name: true } },
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: limit,
          })
        : Promise.resolve([]),
    ]);
    const feed: MemberActivity[] = [
      ...transitions.map((row) => ({
        id: `transition:${row.id}`,
        activityType: 'STAGE_TRANSITION' as const,
        sharedWithGroup: Boolean(row.application.sharedWithGroup),
        member: { ...row.user, avatar: null },
        memberId: row.userId,
        application: {
          id: row.application.id,
          companyName: row.application.companyName,
          jobTitle: row.application.jobTitle,
          jobUrl: row.application.jobUrl,
          applicationMethod: row.application.applicationMethod,
          sharedWithGroup: Boolean(row.application.sharedWithGroup),
          isTailored: Boolean(row.application.isTailored),
        },
        sideTask: null,
        fromStage: row.fromStage,
        toStage: row.toStage,
        outcome: row.outcome,
        changedAt: row.changedAt.toISOString(),
      })),
      ...applications.map((row) => ({
        id: `application:${row.id}`,
        activityType: (row.sharedWithGroup
          ? 'SHARED_APPLICATION'
          : 'APPLICATION') as 'SHARED_APPLICATION' | 'APPLICATION',
        sharedWithGroup: Boolean(row.sharedWithGroup),
        member: { ...row.user, avatar: null },
        memberId: row.userId,
        application: {
          id: row.id,
          companyName: row.companyName,
          jobTitle: row.jobTitle,
          jobUrl: row.jobUrl,
          applicationMethod: row.applicationMethod,
          sharedWithGroup: Boolean(row.sharedWithGroup),
          isTailored: Boolean(row.isTailored),
        },
        sideTask: null,
        fromStage: null,
        toStage: row.transitions?.[0]?.fromStage ?? row.stage,
        outcome:
          (row.transitions?.length ?? 0) > 0 ||
          row.outcome === ApplicationOutcome.NONE
            ? null
            : row.outcome,
        changedAt: row.createdAt.toISOString(),
      })),
      ...sideTasks.map((row) => {
        let companyName =
          row.type === 'LINKEDIN_POST'
            ? 'منشور لينكدإن'
            : row.type === 'WEEKLY_REVIEW'
              ? `مراجعة الأسبوع ${row.journeyWeek}`
              : 'نشاط تواصل مهني';
        let jobTitle =
          row.postTopic ||
          row.reviewSummary ||
          `إتمام ${row.nodeCode}`;

        if (
          row.reviewSummary &&
          typeof row.reviewSummary === 'string' &&
          row.reviewSummary.trim().startsWith('{')
        ) {
          try {
            const parsed = JSON.parse(row.reviewSummary);
            if (parsed.category === 'CV_UPDATE') {
              companyName = 'تحديث السيرة الذاتية';
              jobTitle = `قام بتحديث السيرة الذاتية (CV v${parsed.version || 1})`;
            } else if (parsed.category === 'PORTFOLIO_UPDATE') {
              companyName = 'معرض الأعمال';
              jobTitle = `قام بتحديث معرض أعماله${parsed.summary ? `: ${parsed.summary}` : ''}`;
            } else if (parsed.summary) {
              jobTitle = parsed.summary;
            }
          } catch {
            // keep default
          }
        }

        return {
          id: `sidetask:${row.id}`,
          activityType: 'SIDE_TASK' as const,
          sharedWithGroup: true,
          member: { ...row.user, avatar: null },
          memberId: row.userId,
          application: {
            id: row.id,
            companyName,
            jobTitle,
            jobUrl: row.postUrl ?? null,
            applicationMethod: 'LINKEDIN',
          },
          sideTask: {
            id: row.id,
            type: row.type,
            nodeCode: row.nodeCode,
            journeyWeek: row.journeyWeek,
            postUrl: row.postUrl ?? null,
            postTopic: row.postTopic ?? null,
            reviewSummary: row.reviewSummary ?? null,
          },
          fromStage: null,
          toStage: ApplicationStage.APPLIED,
          outcome: null,
          changedAt: row.createdAt.toISOString(),
        };
      }),
    ];
    // Peer progress remains visible; opportunity details require explicit sharing.
    return feed.map(item => item.memberId === currentUserId || item.sharedWithGroup ? item : {
      ...item, application: { ...item.application, companyName: '', jobTitle: '', jobUrl: null, applicationMethod: null },
    })
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
            sharedWithGroup: true,
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
      ...new Set(
        applications
          .filter(application=>application.sharedWithGroup)
          .map((application) => application.companyName.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
    const otherUserIds = memberIds.filter((id) => id !== targetMemberId);
    const shared =
      companies.length && otherUserIds.length
        ? await this.prisma.application.findMany({
            where: {
              userId: { in: otherUserIds },
              sharedWithGroup: true,
              OR: companies.map((name) => ({
                companyName: { equals: name.trim(), mode: 'insensitive' },
              })),
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
        const normalizedKey = row.companyName.trim().toLowerCase();
        const list = sharedCompanyByName.get(normalizedKey) ?? [];
        if (!list.some((m) => m.id === summary.id)) {
          list.push(summary);
        }
        sharedCompanyByName.set(normalizedKey, list);
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
      applications: applications.map((application) => {
        const key = application.companyName.trim().toLowerCase();
        const otherMembers = sharedCompanyByName.get(key) ?? [];
        return {
          ...application,
          ...(targetMemberId !== currentUserId && !application.sharedWithGroup ? { companyName: '', jobTitle: '', jobUrl: null, location: null, applicationMethod: null } : {}),
          outcome:
            application.outcome === ApplicationOutcome.NONE
              ? null
              : application.outcome,
          updatedAt: application.updatedAt.toISOString(),
          sharedCompany: otherMembers.length > 0,
          otherMembers,
        };
      }),
    };
  }
}
