import {
  Injectable,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ApplicationOutcome,
  ApplicationStage,
  JourneyNode,
  JourneyNodeType,
  Notification,
  OutreachStatus,
  SideTaskSubmission,
  SideTaskType,
  UserJourneyState,
} from '@prisma/client';
import { GroupAssignmentService } from '../members/group-assignment.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSideTaskDto } from './dto/create-side-task.dto';
import { UpdateJourneyNodeDto } from './dto/update-journey-node.dto';
import {
  JOURNEY_V4_NODES,
  JourneyNodeSeedItem,
  seedJourneyV4Nodes,
} from './journey-v4.seed';

export type JourneyNodeStatus = 'COMPLETED' | 'ACTIVE' | 'LOCKED_BLURRED';

export interface RequirementProgress {
  current: number;
  required: number;
  percentage: number;
}

export interface NodeProgressMetrics {
  apps: RequirementProgress;
  tailored: RequirementProgress;
  posts: RequirementProgress;
  outreach: RequirementProgress;
  weeklyReview?: RequirementProgress;
  overallPercentage: number;
}

export interface EnrichedJourneyNode extends JourneyNodeSeedItem {
  id?: string;
  status: JourneyNodeStatus;
  progress: NodeProgressMetrics;
}

export interface WeeklyConversionStats {
  weekNumber: number;
  totalApplications: number;
  tailoredApplications: number;
  interviewsOrResponses: number;
  conversionRate: number;
}

export interface JourneyStateResponse {
  state: UserJourneyState;
  currentNode: EnrichedJourneyNode | null;
  currentWeekNodes: EnrichedJourneyNode[];
  nodes: EnrichedJourneyNode[];
  weeklyStats: WeeklyConversionStats;
}

export interface JobMarketCompassPlatform {
  id: string;
  name: string;
  url: string;
  descriptionAr: string;
  descriptionEn: string;
}

export interface JobMarketCompassResponse {
  targetJobTitle: string;
  location: string;
  platforms: JobMarketCompassPlatform[];
}

@Injectable()
export class JourneyEngineService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly groupAssignment?: GroupAssignmentService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await seedJourneyV4Nodes(this.prisma);
    } catch {
      // Allow application startup in test or dry-run environments without DB connectivity
    }
  }

  private async getNodeByCode(
    code: string,
  ): Promise<(JourneyNode | JourneyNodeSeedItem) | null> {
    if (this.prisma?.journeyNode?.findUnique) {
      const dbNode = await this.prisma.journeyNode.findUnique({
        where: { code },
      });
      if (dbNode) return dbNode;
    }
    return JOURNEY_V4_NODES.find((node) => node.code === code) ?? null;
  }

  private async getAllNodes(): Promise<Array<JourneyNode | JourneyNodeSeedItem>> {
    if (this.prisma?.journeyNode?.findMany) {
      const dbNodes = await this.prisma.journeyNode.findMany({
        orderBy: [{ orderIndex: 'asc' }],
      });
      if (dbNodes && dbNodes.length > 0) return dbNodes;
    }
    return [...JOURNEY_V4_NODES];
  }

  private async assignUserToGroupSafe(userId: string): Promise<string | null> {
    if (!this.groupAssignment) return null;
    if (typeof this.groupAssignment.assignUserToGroup === 'function') {
      return this.groupAssignment.assignUserToGroup(userId);
    }
    if (
      typeof this.groupAssignment.withAssignmentLock === 'function' &&
      typeof this.groupAssignment.assignUser === 'function'
    ) {
      return this.groupAssignment.withAssignmentLock((tx) =>
        this.groupAssignment!.assignUser(tx, userId),
      );
    }
    return null;
  }

  private async createNotificationSafe(data: {
    userId: string;
    type: string;
    titleAr: string;
    titleEn: string;
    bodyAr: string;
    bodyEn: string;
    actionUrl?: string | null;
  }): Promise<Notification | null> {
    if (!this.prisma?.notification?.create) return null;
    return this.prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        titleAr: data.titleAr,
        titleEn: data.titleEn,
        bodyAr: data.bodyAr,
        bodyEn: data.bodyEn,
        actionUrl: data.actionUrl ?? null,
      },
    });
  }

  async getOrCreateUserState(userId: string): Promise<UserJourneyState> {
    const existing = await this.prisma.userJourneyState.findUnique({
      where: { userId },
    });

    if (existing) {
      if (!existing.isGroupUnlocked && this.prisma?.membership?.findUnique) {
        const membership = await this.prisma.membership.findUnique({
          where: { userId },
          select: { id: true },
        });
        if (membership) {
          return this.prisma.userJourneyState.update({
            where: { userId },
            data: { isGroupUnlocked: true },
          });
        }
      }
      return existing;
    }

    const [membership, existingAppsCount] = await Promise.all([
      this.prisma?.membership?.findUnique
        ? this.prisma.membership.findUnique({
            where: { userId },
            select: { id: true },
          })
        : Promise.resolve(null),
      this.prisma?.application?.count
        ? this.prisma.application.count({ where: { userId } })
        : Promise.resolve(0),
    ]);

    const isGroupUnlocked = Boolean(membership);
    const canUseTableView = existingAppsCount >= 10;

    return this.prisma.userJourneyState.create({
      data: {
        userId,
        currentWeek: 0,
        currentNodeCode: 'TASK_0',
        currentNodeStartedAt: new Date(),
        weekStartedAt: new Date(),
        completedNodeCodes: [],
        unlockedInsightCodes: [],
        isGroupUnlocked,
        canUseTableView,
        hasUnlockedAdvPrep: false,
        cvVersionNumber: 1,
      },
    });
  }

  private computeRequirementProgress(
    current: number,
    required: number,
  ): RequirementProgress {
    if (required <= 0) {
      return { current, required: 0, percentage: 100 };
    }
    const percentage = Math.min(100, Math.round((current / required) * 100));
    return { current, required, percentage };
  }

  private async getCurrentNodeCounts(
    userId: string,
    state: UserJourneyState,
    node: JourneyNode | JourneyNodeSeedItem,
  ): Promise<{
    appsCount: number;
    tailoredCount: number;
    postsCount: number;
    outreachCount: number;
    weeklyReviewCount: number;
  }> {
    const dateFilter = { createdAt: { gte: state.currentNodeStartedAt } };

    const [
      appsCount,
      tailoredCount,
      postsCount,
      outreachCount,
      weeklyReviewCount,
    ] = await Promise.all([
      this.prisma?.application?.count
        ? this.prisma.application.count({
            where: { userId, ...dateFilter },
          })
        : Promise.resolve(0),
      node.requiredTailoredCount > 0 && this.prisma?.application?.count
        ? this.prisma.application.count({
            where: { userId, isTailored: true, ...dateFilter },
          })
        : Promise.resolve(0),
      node.requiredPostsCount > 0 && this.prisma?.sideTaskSubmission?.count
        ? this.prisma.sideTaskSubmission.count({
            where: {
              userId,
              nodeCode: node.code,
              type: SideTaskType.LINKEDIN_POST,
            },
          })
        : Promise.resolve(0),
      node.requiredOutreachCount > 0 && this.prisma?.sideTaskSubmission?.count
        ? this.prisma.sideTaskSubmission.count({
            where: {
              userId,
              nodeCode: node.code,
              type: SideTaskType.OUTREACH_CONTACT,
            },
          })
        : Promise.resolve(0),
      node.nodeType === JourneyNodeType.REVIEW_STATION &&
      this.prisma?.sideTaskSubmission?.count
        ? this.prisma.sideTaskSubmission.count({
            where: {
              userId,
              nodeCode: node.code,
              type: SideTaskType.WEEKLY_REVIEW,
            },
          })
        : Promise.resolve(0),
    ]);

    return {
      appsCount,
      tailoredCount,
      postsCount,
      outreachCount,
      weeklyReviewCount,
    };
  }

  private buildNodeProgressMetrics(
    node: JourneyNode | JourneyNodeSeedItem,
    counts: {
      appsCount: number;
      tailoredCount: number;
      postsCount: number;
      outreachCount: number;
      weeklyReviewCount: number;
    },
  ): NodeProgressMetrics {
    const apps = this.computeRequirementProgress(
      counts.appsCount,
      node.requiredAppsCount,
    );
    const tailored = this.computeRequirementProgress(
      counts.tailoredCount,
      node.requiredTailoredCount,
    );
    const posts = this.computeRequirementProgress(
      counts.postsCount,
      node.requiredPostsCount,
    );
    const outreach = this.computeRequirementProgress(
      counts.outreachCount,
      node.requiredOutreachCount,
    );

    const activeRequirements: number[] = [];
    if (node.requiredAppsCount > 0) activeRequirements.push(apps.percentage);
    if (node.requiredTailoredCount > 0)
      activeRequirements.push(tailored.percentage);
    if (node.requiredPostsCount > 0) activeRequirements.push(posts.percentage);
    if (node.requiredOutreachCount > 0)
      activeRequirements.push(outreach.percentage);

    let weeklyReview: RequirementProgress | undefined;
    if (node.nodeType === JourneyNodeType.REVIEW_STATION) {
      weeklyReview = this.computeRequirementProgress(
        counts.weeklyReviewCount,
        1,
      );
      activeRequirements.push(weeklyReview.percentage);
    }

    const overallPercentage =
      activeRequirements.length > 0
        ? Math.round(
            activeRequirements.reduce((sum, val) => sum + val, 0) /
              activeRequirements.length,
          )
        : 100;

    return {
      apps,
      tailored,
      posts,
      outreach,
      ...(weeklyReview ? { weeklyReview } : {}),
      overallPercentage,
    };
  }

  async evaluateProgress(userId: string): Promise<UserJourneyState> {
    const state = await this.getOrCreateUserState(userId);
    const currentNode = await this.getNodeByCode(state.currentNodeCode);

    if (!currentNode || currentNode.nodeType === JourneyNodeType.FINAL_REPORT) {
      return state;
    }

    const counts = await this.getCurrentNodeCounts(userId, state, currentNode);

    const appsSatisfied = counts.appsCount >= currentNode.requiredAppsCount;
    const tailoredSatisfied =
      counts.tailoredCount >= currentNode.requiredTailoredCount;
    const postsSatisfied = counts.postsCount >= currentNode.requiredPostsCount;
    const outreachSatisfied =
      counts.outreachCount >= currentNode.requiredOutreachCount;
    const reviewSatisfied =
      currentNode.nodeType === JourneyNodeType.REVIEW_STATION
        ? counts.weeklyReviewCount >= 1
        : true;

    if (
      !appsSatisfied ||
      !tailoredSatisfied ||
      !postsSatisfied ||
      !outreachSatisfied ||
      !reviewSatisfied
    ) {
      return state;
    }

    const nextNodeCode = currentNode.nextNodeCode ?? currentNode.code;
    const nextNode = currentNode.nextNodeCode
      ? await this.getNodeByCode(currentNode.nextNodeCode)
      : null;

    // A quest is completed only after its requirements are met, and its
    // successor is unlocked only when both the requirements and schedule allow
    // it. Keep the completed quest selected while waiting for the next day.
    // Administrators bypass the calendar gate, but not quest requirements.
    const account = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    const completedNodeCodes = Array.from(
      new Set([...(state.completedNodeCodes ?? []), currentNode.code]),
    );
    const unlockedInsightCodes = [...(state.unlockedInsightCodes ?? [])];

    if (
      currentNode.unlocksInsightCode &&
      !unlockedInsightCodes.includes(currentNode.unlocksInsightCode)
    ) {
      unlockedInsightCodes.push(currentNode.unlocksInsightCode);
      await this.createNotificationSafe({
        userId,
        type: 'INSIGHT_UNLOCKED',
        titleAr: 'تم فتح ملاحظة إرشادية جديدة!',
        titleEn: 'New Career Insight Unlocked!',
        bodyAr: `تم فتح الدليل الإرشادي (${currentNode.unlocksInsightCode}) بعد إتمام ${currentNode.titleAr}.`,
        bodyEn: `Insight (${currentNode.unlocksInsightCode}) has been unlocked after completing ${currentNode.titleEn}.`,
        actionUrl: '/professional-development',
      });
    }

    let isGroupUnlocked = state.isGroupUnlocked;
    let canUseTableView = state.canUseTableView;

    if (currentNode.code === 'TASK_0') {
      isGroupUnlocked = true;
      await this.assignUserToGroupSafe(userId);
      await this.createNotificationSafe({
        userId,
        type: 'GROUP_ACTIVITY',
        titleAr: 'تم فتح قسم تقدم المجموعة!',
        titleEn: 'Group Progress Section Unlocked!',
        bodyAr:
          'أحسنت إتمام المهمة صفر! تم تسكينك في مجموعتك ويمكنك الآن متابعة تقدم زملائك.',
        bodyEn:
          'Congratulations on completing Task 0! You have been assigned to a cohort group and can now view Members Progress.',
        actionUrl: '/members-progress',
      });
    }

    if (currentNode.code === 'W1_M1') {
      canUseTableView = true;
    }

    if (
      account?.role !== 'ADMIN' &&
      nextNode &&
      nextNode.weekNumber === currentNode.weekNumber
    ) {
      const weekNodes = (await this.getAllNodes())
        .filter((node) => node.weekNumber === nextNode.weekNumber)
        .sort((a, b) => a.orderIndex - b.orderIndex);
      const elapsedDaysBeforeNextNode = weekNodes
        .filter((node) => node.orderIndex < nextNode.orderIndex)
        .reduce((days, node) => days + node.durationDays, 0);
      const nextNodeAvailableAt = new Date(
        state.weekStartedAt.getTime() +
          elapsedDaysBeforeNextNode * 86_400_000,
      );

      if (Date.now() < nextNodeAvailableAt.getTime()) {
        return this.prisma.userJourneyState.update({
          where: { userId },
          data: {
            completedNodeCodes,
            unlockedInsightCodes,
            isGroupUnlocked,
            canUseTableView,
          },
        });
      }
    }

    const nextWeek = nextNode ? nextNode.weekNumber : state.currentWeek;
    const now = new Date();
    const weekStartedAt =
      nextWeek !== state.currentWeek ? now : state.weekStartedAt;

    const updatedState = await this.prisma.userJourneyState.update({
      where: { userId },
      data: {
        completedNodeCodes,
        unlockedInsightCodes,
        isGroupUnlocked,
        canUseTableView,
        currentNodeCode: nextNodeCode,
        currentWeek: nextWeek,
        currentNodeStartedAt: now,
        weekStartedAt,
      },
    });

    if (nextNode) {
      await this.createNotificationSafe({
        userId,
        type: 'QUEST_UNLOCKED',
        titleAr: `مهمة جديدة مفتوحة: ${nextNode.titleAr}`,
        titleEn: `New Quest Unlocked: ${nextNode.titleEn}`,
        bodyAr: nextNode.descriptionAr ?? nextNode.titleAr,
        bodyEn: nextNode.descriptionEn ?? nextNode.titleEn,
        actionUrl: '/applications',
      });
    }

    this.eventEmitter?.emit('journey.node_completed', {
      userId,
      completedNodeCode: currentNode.code,
      nextNodeCode,
      currentWeek: nextWeek,
      unlockedInsightCode: currentNode.unlocksInsightCode ?? null,
      isGroupUnlocked,
      canUseTableView,
    });

    return updatedState;
  }

  async unlockAdvancedInterviewPrepIfNeeded(userId: string): Promise<boolean> {
    const state = await this.getOrCreateUserState(userId);
    if (state.hasUnlockedAdvPrep) return false;

    const unlockedInsightCodes = Array.from(
      new Set([
        ...(state.unlockedInsightCodes ?? []),
        'INSIGHT_INTERVIEW_ADVANCED',
      ]),
    );

    await this.prisma.userJourneyState.update({
      where: { userId },
      data: {
        hasUnlockedAdvPrep: true,
        unlockedInsightCodes,
      },
    });

    await this.createNotificationSafe({
      userId,
      type: 'INTERVIEW_PREP',
      titleAr: 'تم فتح دليل التحضير المتقدم للمقابلة/الأسيمنت!',
      titleEn: 'Advanced Interview & Assignment Prep Unlocked!',
      bodyAr:
        'بناءً على ترشحك لمقابلة أو استلام تاسك تقني، تم فتح دليل التحضير المتقدم وقوائم المراجعة.',
      bodyEn:
        'Based on your interview stage or technical assignment, the Advanced Interview & Assignment Prep guide is now unlocked.',
      actionUrl: '/professional-development',
    });

    this.eventEmitter?.emit('journey.adv_prep_unlocked', {
      userId,
      insightCode: 'INSIGHT_INTERVIEW_ADVANCED',
    });

    return true;
  }

  async submitSideTask(
    userId: string,
    dto: CreateSideTaskDto,
  ): Promise<{
    submission: SideTaskSubmission;
    journeyState: UserJourneyState;
  }> {
    const state = await this.getOrCreateUserState(userId);
    const nodeCode = dto.nodeCode?.trim() || state.currentNodeCode;

    const submission = await this.prisma.sideTaskSubmission.create({
      data: {
        userId,
        nodeCode,
        journeyWeek: state.currentWeek,
        type: dto.type,
        postUrl: dto.postUrl?.trim() || null,
        postTopic: dto.postTopic?.trim() || null,
        applicationId: dto.applicationId || null,
        contactName: dto.contactName?.trim() || null,
        contactRole: dto.contactRole?.trim() || null,
        companyName: dto.companyName?.trim() || null,
        contactMethod: dto.contactMethod?.trim() || null,
        contactUrl: dto.contactUrl?.trim() || null,
        outreachState:
          dto.type === SideTaskType.OUTREACH_CONTACT
            ? (dto.outreachState ?? OutreachStatus.SENT)
            : null,
        reviewSummary: dto.reviewSummary?.trim() || null,
        newCvUploaded: dto.newCvUploaded ?? false,
        sharedInGroup: dto.sharedInGroup ?? true,
      },
    });

    if (dto.type === SideTaskType.WEEKLY_REVIEW && dto.newCvUploaded) {
      await this.prisma.userJourneyState.update({
        where: { userId },
        data: { cvVersionNumber: { increment: 1 } },
      });
    }

    this.eventEmitter?.emit('sidetask.submitted', {
      userId,
      submissionId: submission.id,
      nodeCode: submission.nodeCode,
      journeyWeek: submission.journeyWeek,
      type: submission.type,
      sharedInGroup: submission.sharedInGroup,
    });

    const journeyState = await this.evaluateProgress(userId);
    return { submission, journeyState };
  }

  async getSideTasks(
    userId: string,
    filters?: { week?: number; nodeCode?: string },
  ): Promise<SideTaskSubmission[]> {
    return this.prisma.sideTaskSubmission.findMany({
      where: {
        userId,
        ...(filters?.week !== undefined ? { journeyWeek: filters.week } : {}),
        ...(filters?.nodeCode ? { nodeCode: filters.nodeCode } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async getJourneyStateSummary(userId: string): Promise<JourneyStateResponse> {
    const state = await this.evaluateProgress(userId);
    const allNodes = await this.getAllNodes();
    const currentNodeRaw =
      allNodes.find((n) => n.code === state.currentNodeCode) ??
      (await this.getNodeByCode(state.currentNodeCode));

    const currentCounts = currentNodeRaw
      ? await this.getCurrentNodeCounts(userId, state, currentNodeRaw)
      : {
          appsCount: 0,
          tailoredCount: 0,
          postsCount: 0,
          outreachCount: 0,
          weeklyReviewCount: 0,
        };

    const completedSet = new Set(state.completedNodeCodes ?? []);

    const enrichedNodes: EnrichedJourneyNode[] = allNodes.map((node) => {
      const isCompleted = completedSet.has(node.code);
      const isActive = state.currentNodeCode === node.code;
      const status: JourneyNodeStatus = isCompleted
        ? 'COMPLETED'
        : isActive
          ? 'ACTIVE'
          : 'LOCKED_BLURRED';

      const progress: NodeProgressMetrics = isCompleted
        ? {
            apps: {
              current: node.requiredAppsCount,
              required: node.requiredAppsCount,
              percentage: 100,
            },
            tailored: {
              current: node.requiredTailoredCount,
              required: node.requiredTailoredCount,
              percentage: 100,
            },
            posts: {
              current: node.requiredPostsCount,
              required: node.requiredPostsCount,
              percentage: 100,
            },
            outreach: {
              current: node.requiredOutreachCount,
              required: node.requiredOutreachCount,
              percentage: 100,
            },
            overallPercentage: 100,
          }
        : isActive
          ? this.buildNodeProgressMetrics(node, currentCounts)
          : {
              apps: {
                current: 0,
                required: node.requiredAppsCount,
                percentage: 0,
              },
              tailored: {
                current: 0,
                required: node.requiredTailoredCount,
                percentage: 0,
              },
              posts: {
                current: 0,
                required: node.requiredPostsCount,
                percentage: 0,
              },
              outreach: {
                current: 0,
                required: node.requiredOutreachCount,
                percentage: 0,
              },
              overallPercentage: 0,
            };

      return {
        id: 'id' in node ? node.id : undefined,
        code: node.code,
        weekNumber: node.weekNumber,
        orderIndex: node.orderIndex,
        nodeType: node.nodeType,
        titleAr: node.titleAr,
        titleEn: node.titleEn,
        descriptionAr: node.descriptionAr ?? '',
        descriptionEn: node.descriptionEn ?? '',
        durationDays: node.durationDays,
        requiredAppsCount: node.requiredAppsCount,
        requiredTailoredCount: node.requiredTailoredCount,
        requiredPostsCount: node.requiredPostsCount,
        requiredOutreachCount: node.requiredOutreachCount,
        unlocksInsightCode: node.unlocksInsightCode ?? null,
        nextNodeCode: node.nextNodeCode ?? null,
        status,
        progress,
      };
    });

    const currentNode =
      enrichedNodes.find((n) => n.code === state.currentNodeCode) ?? null;
    const currentWeekNodes = enrichedNodes.filter(
      (n) => n.weekNumber === state.currentWeek,
    );

    const [totalApplications, tailoredApplications, interviewsOrResponses] =
      await Promise.all([
        this.prisma?.application?.count
          ? this.prisma.application.count({
              where: { userId, journeyWeek: state.currentWeek },
            })
          : Promise.resolve(0),
        this.prisma?.application?.count
          ? this.prisma.application.count({
              where: {
                userId,
                journeyWeek: state.currentWeek,
                isTailored: true,
              },
            })
          : Promise.resolve(0),
        this.prisma?.application?.count
          ? this.prisma.application.count({
              where: {
                userId,
                journeyWeek: state.currentWeek,
                OR: [
                  { stage: { not: ApplicationStage.APPLIED } },
                  {
                    outcome: {
                      in: [
                        ApplicationOutcome.ACCEPTED,
                        ApplicationOutcome.REJECTED,
                      ],
                    },
                  },
                  { hasAssignment: true },
                ],
              },
            })
          : Promise.resolve(0),
      ]);

    const conversionRate =
      totalApplications > 0
        ? Math.round((interviewsOrResponses / totalApplications) * 10000) / 100
        : 0;

    return {
      state,
      currentNode,
      currentWeekNodes,
      nodes: enrichedNodes,
      weeklyStats: {
        weekNumber: state.currentWeek,
        totalApplications,
        tailoredApplications,
        interviewsOrResponses,
        conversionRate,
      },
    };
  }

  async getJobMarketCompass(
    userId: string,
    locationFilter?: string,
  ): Promise<JobMarketCompassResponse> {
    const user = this.prisma?.user?.findUnique
      ? await this.prisma.user.findUnique({
          where: { id: userId },
          select: { targetJobTitle: true, preferredLocations: true },
        })
      : null;

    const targetJobTitle =
      user?.targetJobTitle?.trim() || 'Software Engineer';
    const location =
      locationFilter?.trim() || user?.preferredLocations?.[0]?.trim() || 'Remote';

    const encodedTitle = encodeURIComponent(targetJobTitle);
    const encodedLocation = encodeURIComponent(location);

    const platforms: JobMarketCompassPlatform[] = [
      {
        id: 'linkedin',
        name: 'LinkedIn Jobs',
        url: `https://www.linkedin.com/jobs/search/?keywords=${encodedTitle}&location=${encodedLocation}`,
        descriptionAr: 'البحث المباشر عن الوظائف الحديثة على LinkedIn',
        descriptionEn: 'Direct search for recent jobs on LinkedIn',
      },
      {
        id: 'wuzzuf',
        name: 'Wuzzuf',
        url: `https://wuzzuf.net/search/jobs/?q=${encodedTitle}`,
        descriptionAr: 'منصة التوظيف الأولى في مصر والشرق الأوسط',
        descriptionEn: 'Leading job platform in Egypt and MENA',
      },
      {
        id: 'bayt',
        name: 'Bayt.com',
        url: `https://www.bayt.com/en/international/jobs/?q=${encodedTitle}`,
        descriptionAr: 'فرص العمل في الخليج والشرق الأوسط عبر بيت.كوم',
        descriptionEn: 'GCC and MENA career opportunities on Bayt.com',
      },
      {
        id: 'wellfound',
        name: 'Wellfound (AngelList)',
        url: `https://wellfound.com/jobs?q=${encodedTitle}`,
        descriptionAr: 'وظائف الشركات الناشئة والتقنية العالمية',
        descriptionEn: 'Global startup and tech opportunities',
      },
      {
        id: 'remoteok',
        name: 'RemoteOK',
        url: `https://remoteok.com/remote-jobs?search=${encodedTitle}`,
        descriptionAr: 'وظائف العمل عن بُعد حول العالم',
        descriptionEn: 'Worldwide remote job listings',
      },
    ];

    return {
      targetJobTitle,
      location,
      platforms,
    };
  }

  // ============================================================================
  // Notifications Management
  // ============================================================================
  async getUserNotifications(
    userId: string,
    limit = 30,
  ): Promise<{ items: Notification[]; unreadCount: number }> {
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 30));
    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }],
        take: safeLimit,
      }),
      this.prisma.notification.count({
        where: { userId, isRead: false },
      }),
    ]);
    return { items, unreadCount };
  }

  async markNotificationRead(
    userId: string,
    notificationId: string,
  ): Promise<Notification> {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!notification) {
      throw new NotFoundException(
        `Notification with ID "${notificationId}" not found`,
      );
    }
    if (notification.isRead) return notification;
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllNotificationsRead(
    userId: string,
  ): Promise<{ updatedCount: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updatedCount: result.count };
  }

  // ============================================================================
  // Admin Journey Nodes Management
  // ============================================================================
  async getAdminJourneyNodes(): Promise<JourneyNode[]> {
    await seedJourneyV4Nodes(this.prisma);
    return this.prisma.journeyNode.findMany({
      orderBy: [{ orderIndex: 'asc' }],
    });
  }

  async updateJourneyNodeByCode(
    code: string,
    dto: UpdateJourneyNodeDto,
  ): Promise<JourneyNode> {
    const existing = await this.prisma.journeyNode.findUnique({
      where: { code },
    });
    if (!existing) {
      throw new NotFoundException(`Journey node with code "${code}" not found`);
    }
    return this.prisma.journeyNode.update({
      where: { code },
      data: {
        ...(dto.weekNumber !== undefined ? { weekNumber: dto.weekNumber } : {}),
        ...(dto.orderIndex !== undefined ? { orderIndex: dto.orderIndex } : {}),
        ...(dto.nodeType !== undefined ? { nodeType: dto.nodeType } : {}),
        ...(dto.titleAr !== undefined ? { titleAr: dto.titleAr.trim() } : {}),
        ...(dto.titleEn !== undefined ? { titleEn: dto.titleEn.trim() } : {}),
        ...(dto.descriptionAr !== undefined
          ? { descriptionAr: dto.descriptionAr }
          : {}),
        ...(dto.descriptionEn !== undefined
          ? { descriptionEn: dto.descriptionEn }
          : {}),
        ...(dto.durationDays !== undefined
          ? { durationDays: dto.durationDays }
          : {}),
        ...(dto.requiredAppsCount !== undefined
          ? { requiredAppsCount: dto.requiredAppsCount }
          : {}),
        ...(dto.requiredTailoredCount !== undefined
          ? { requiredTailoredCount: dto.requiredTailoredCount }
          : {}),
        ...(dto.requiredPostsCount !== undefined
          ? { requiredPostsCount: dto.requiredPostsCount }
          : {}),
        ...(dto.requiredOutreachCount !== undefined
          ? { requiredOutreachCount: dto.requiredOutreachCount }
          : {}),
        ...(dto.unlocksInsightCode !== undefined
          ? { unlocksInsightCode: dto.unlocksInsightCode }
          : {}),
        ...(dto.nextNodeCode !== undefined
          ? { nextNodeCode: dto.nextNodeCode }
          : {}),
      },
    });
  }
}

