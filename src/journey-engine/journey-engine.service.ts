import {
  BadRequestException,
  ForbiddenException,
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
  Prisma,
} from '@prisma/client';
import {
  buildDemoReports,
  buildReportsPayload,
  reportApplicationSelect,
  reportMetrics,
} from './reporting.util';
import { createHash } from 'node:crypto';
import { isWeeklyReflection, professionalTasksUnlocked } from './journey-rules';
import { GroupAssignmentService } from '../members/group-assignment.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSideTaskDto } from './dto/create-side-task.dto';
import { UpdateJourneyNodeDto } from './dto/update-journey-node.dto';
import {
  JOURNEY_V4_NODES,
  JourneyNodeSeedItem,
  seedJourneyV4Nodes,
} from './journey-v4.seed';
import { JOURNEY_GUIDANCE_CATALOG } from '../feedback/journey-guidance.catalog';

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
  features: { groups: boolean; tableView: boolean; professionalTasks: boolean };
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
  private activeEvaluations = new Map<string, Promise<UserJourneyState>>();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly groupAssignment?: GroupAssignmentService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await seedJourneyV4Nodes(this.prisma);
      await this.deduplicateNotifications();
    } catch {
      // Allow application startup in test or dry-run environments without DB connectivity
    }
  }

  async deduplicateNotifications(userId?: string): Promise<number> {
    if (!this.prisma?.notification) return 0;
    try {
      const userClause = userId ? `WHERE "userId" = '${userId.replace(/'/g, "''")}'` : '';

      const duplicateGroups: Array<{
        userId: string;
        titleAr: string;
        bodyAr: string;
        cnt: string | number | bigint;
      }> = await this.prisma.$queryRawUnsafe(
        `SELECT "userId", "titleAr", "bodyAr", COUNT(*)::text as cnt
         FROM "Notification"
         ${userClause}
         GROUP BY "userId", "titleAr", "bodyAr"
         HAVING COUNT(*) > 1`,
      );

      let totalDeleted = 0;
      for (const group of duplicateGroups) {
        const rows = await this.prisma.notification.findMany({
          where: {
            userId: group.userId,
            titleAr: group.titleAr,
            bodyAr: group.bodyAr,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { id: true },
        });

        if (rows.length > 1) {
          const idsToDelete = rows.slice(1).map((r) => r.id);
          const delResult = await this.prisma.notification.deleteMany({
            where: { id: { in: idsToDelete } },
          });
          totalDeleted += delResult.count;
        }
      }
      return totalDeleted;
    } catch {
      return 0;
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

    // Deduplication check: Do not create duplicate notification for same user and titleAr
    // created within the last 60 seconds (or exact duplicate title and body)
    const sixtySecondsAgo = new Date(Date.now() - 60 * 1000);
    const existing = await this.prisma.notification.findFirst({
      where: {
        userId: data.userId,
        titleAr: data.titleAr,
        OR: [
          { createdAt: { gte: sixtySecondsAgo } },
          { bodyAr: data.bodyAr },
          { type: data.type },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing;

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
      if (existing.currentWeek >= 1 && !existing.week1StartedAt) {
        return this.prisma.userJourneyState.update({
          where: { userId },
          data: { week1StartedAt: existing.weekStartedAt || new Date() },
        });
      }
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
      this.prisma?.sideTaskSubmission?.findMany
        ? this.prisma.sideTaskSubmission.findMany({
            where: {
              userId,
              nodeCode: node.code,
              type: SideTaskType.WEEKLY_REVIEW,
            },
            select: { reviewSummary: true },
          }).then((rows) => rows.filter((row) => isWeeklyReflection(row.reviewSummary)).length)
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
    // Serialize each evaluation, including mutations arriving during an earlier count.
    const ongoing = this.activeEvaluations.get(userId);
    const evaluationPromise = (ongoing ?? Promise.resolve()).catch(() => undefined)
      .then(() => this.internalEvaluateProgress(userId));
    this.activeEvaluations.set(userId, evaluationPromise);

    try {
      return await evaluationPromise;
    } finally {
      if (this.activeEvaluations.get(userId) === evaluationPromise) this.activeEvaluations.delete(userId);
    }
  }

  private async internalEvaluateProgress(userId: string): Promise<UserJourneyState> {
    const state = await this.getOrCreateUserState(userId);
    const currentNode = await this.getNodeByCode(state.currentNodeCode);
    const currentNodeAlreadyCompleted = (
      state.completedNodeCodes ?? []
    ).includes(state.currentNodeCode);

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

    const requirementsSatisfied =
      appsSatisfied &&
      tailoredSatisfied &&
      postsSatisfied &&
      outreachSatisfied &&
      reviewSatisfied;
    if (!currentNodeAlreadyCompleted && !requirementsSatisfied) {
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
      const guidance = JOURNEY_GUIDANCE_CATALOG.find(
        (g) => g.code === currentNode.unlocksInsightCode,
      );
      const titleAr = 'تم فتح إرشادات جديدة في رحلتك!';
      const titleEn = 'New Career Guidance Unlocked!';
      const bodyAr = guidance
        ? `تم فتح إرشادات: ${guidance.titleAr} بعد إتمام ${currentNode.titleAr}.`
        : `تم فتح إرشادات جديدة بعد إتمام ${currentNode.titleAr}.`;
      const bodyEn = guidance
        ? `Guidance unlocked: ${guidance.titleEn} after completing ${currentNode.titleEn}.`
        : `New guidance unlocked after completing ${currentNode.titleEn}.`;

      await this.createNotificationSafe({
        userId,
        type: 'INSIGHT_UNLOCKED',
        titleAr,
        titleEn,
        bodyAr,
        bodyEn,
        actionUrl: `/professional-development?guidance=${currentNode.unlocksInsightCode}`,
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
      await this.createNotificationSafe({
        userId,
        type: 'PROFESSIONAL_DEVELOPMENT_UNLOCKED',
        titleAr: 'إرشاداتك المهنية الأولى متاحة!',
        titleEn: 'Professional Development Unlocked!',
        bodyAr:
          'أكملت المهمة صفر! إرشادات السيرة الذاتية متاحة؛ المهام المهنية بتتفتح بعد إرشاد تنظيم الوقت في الأسبوع الثالث.',
        bodyEn:
          'Task 0 completed! Initial CV guidance is available. Professional tasks unlock after reading Week 3 time-management guidance.',
        actionUrl: '/professional-development',
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

    let week1StartedAt = state.week1StartedAt;
    if (!week1StartedAt && (nextWeek >= 1 || nextNodeCode === 'W1_M1')) {
      week1StartedAt = now;
    }

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
        week1StartedAt,
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
        actionUrl: '/journey/tasks',
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

  async evaluateInterviewGuidanceUnlocks(userId: string): Promise<void> {
    const hasCandidateApp = await this.prisma.application.count({
      where: {
        userId,
        OR: [
          { stage: { in: [ApplicationStage.INTERVIEW, ApplicationStage.ASSIGNMENT] } },
          { hasAssignment: true },
        ],
      },
    });
    if (hasCandidateApp === 0) return;

    // Check if user has read INSIGHT_W1_INTERVIEW_BASIC
    const basicPost = await this.prisma.feedbackPost.findFirst({
      where: { unlockTriggerCode: 'INSIGHT_W1_INTERVIEW_BASIC' },
      select: { id: true },
    });

    const readState = await this.getOrCreateUserState(userId);
    let hasReadBasic = (readState.readInsightCodes ?? []).includes('INSIGHT_W1_INTERVIEW_BASIC');
    if (basicPost) {
      const readRecord = await this.prisma.feedbackRead.findUnique({
        where: {
          feedbackId_userId: {
            feedbackId: basicPost.id,
            userId,
          },
        },
      });
      hasReadBasic = hasReadBasic || Boolean(readRecord);
    }

    if (!hasReadBasic) {
      // Exceptionally unlock INSIGHT_W1_INTERVIEW_BASIC early
      const state = await this.getOrCreateUserState(userId);
      const currentUnlocked = state.unlockedInsightCodes ?? [];
      if (!currentUnlocked.includes('INSIGHT_W1_INTERVIEW_BASIC')) {
        const nextUnlocked = Array.from(
          new Set([...currentUnlocked, 'INSIGHT_W1_INTERVIEW_BASIC']),
        );
        await this.prisma.userJourneyState.update({
          where: { userId },
          data: { unlockedInsightCodes: nextUnlocked },
        });

        await this.createNotificationSafe({
          userId,
          type: 'INTERVIEW_PREP',
          titleAr: '🎉 مبارك ترشحك للمرحلة التالية!',
          titleEn: '🎉 Congrats on advancing to the next stage!',
          bodyAr:
            'تم فتح (الدليل الأساسي للتحضير السريع للمقابلات والأسيمنت) لك الآن لتستعد فوراً — وبمجرد إتمام قراءته سيُفتح لك الدليل المتقدم تلقائياً.',
          bodyEn:
            'The Core Interview & Assignment Prep Guide is now unlocked so you can prepare immediately. Once you finish reading it, the Advanced Guide will unlock automatically.',
          actionUrl: '/professional-development?guidance=INSIGHT_W1_INTERVIEW_BASIC',
        });
      }
    } else {
      // Both conditions met: unlock advanced prep
      await this.unlockAdvancedInterviewPrepIfNeeded(userId);
    }
  }

  async unlockAdvancedInterviewPrepIfNeeded(userId: string): Promise<boolean> {
    const state = await this.getOrCreateUserState(userId);
    if (state.hasUnlockedAdvPrep) return false;

    // Check condition 1: at least one application in INTERVIEW or ASSIGNMENT
    const hasCandidateApp = await this.prisma.application.count({
      where: {
        userId,
        OR: [
          { stage: { in: [ApplicationStage.INTERVIEW, ApplicationStage.ASSIGNMENT] } },
          { hasAssignment: true },
        ],
      },
    });
    if (hasCandidateApp === 0) return false;

    // Check condition 2: user has marked INSIGHT_W1_INTERVIEW_BASIC as read
    const basicPost = await this.prisma.feedbackPost.findFirst({
      where: { unlockTriggerCode: 'INSIGHT_W1_INTERVIEW_BASIC' },
      select: { id: true },
    });
    if (!basicPost && !(state.readInsightCodes ?? []).includes('INSIGHT_W1_INTERVIEW_BASIC')) return false;
    if (basicPost) {
      const readRecord = await this.prisma.feedbackRead.findUnique({
        where: {
          feedbackId_userId: {
            feedbackId: basicPost.id,
            userId,
          },
        },
      });
      if (!readRecord && !(state.readInsightCodes ?? []).includes('INSIGHT_W1_INTERVIEW_BASIC')) {
        return false;
      }
    }

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
        'بناءً على ترشحك لمقابلة أو استلام تاسك تقني وإتمامك قراءة الدليل الأساسي، تم فتح دليل التحضير المتقدم وقوائم المراجعة.',
      bodyEn:
        'Based on your interview or technical assignment and completing the core guide, the Advanced Interview & Assignment Prep guide is now unlocked.',
      actionUrl: '/professional-development?guidance=INSIGHT_INTERVIEW_ADVANCED',
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

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    const clean = (value?: string) => value?.trim() || null;
    const payload = {
      nodeCode, type: dto.type, postUrl: clean(dto.postUrl), postTopic: clean(dto.postTopic),
      applicationId: dto.applicationId ?? null, contactName: clean(dto.contactName),
      contactRole: clean(dto.contactRole), companyName: clean(dto.companyName),
      contactMethod: clean(dto.contactMethod), contactUrl: clean(dto.contactUrl),
      outreachState: dto.outreachState ?? 'SENT', reviewSummary: clean(dto.reviewSummary),
      sharedInGroup: dto.sharedInGroup ?? true,
    };
    const requestKey = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const existing = await this.prisma.sideTaskSubmission.findFirst({ where: { userId, requestKey } });
    // Replaying an accepted action remains safe even if that action advanced the node.
    if (existing) return { submission: existing, journeyState: await this.evaluateProgress(userId) };
    const node = await this.getNodeByCode(nodeCode);
    if (!node || nodeCode !== state.currentNodeCode || (dto.type !== SideTaskType.USER_CHANGE && (state.completedNodeCodes ?? []).includes(nodeCode))) {
      throw new ForbiddenException('Submit activities only for your current active quest');
    }
    const require = (condition: unknown, message: string) => {
      if (!condition) throw new BadRequestException(message);
    };
    if (dto.applicationId) {
      const owned = await this.prisma.application.findFirst({ where: { id: dto.applicationId, userId } });
      if (!owned) throw new ForbiddenException('The linked application must belong to you');
    }
    if (dto.type === SideTaskType.LINKEDIN_POST) {
      require(state.currentWeek >= 3 && node.requiredPostsCount > 0, 'LinkedIn posts are not eligible for this quest');
      require(payload.postUrl, 'A published post URL is required');
    } else if (dto.type === SideTaskType.OUTREACH_CONTACT) {
      require(state.currentWeek >= 4 && node.requiredOutreachCount > 0, 'Outreach is not eligible for this quest');
      require(payload.contactName && payload.companyName && payload.contactMethod, 'Contact name, company and contact method are required');
    } else if (dto.type === SideTaskType.WEEKLY_REVIEW) {
      require(node.nodeType === JourneyNodeType.REVIEW_STATION, 'Weekly reflections are only accepted at the current review station');
      require(payload.reviewSummary && isWeeklyReflection(payload.reviewSummary), 'Write a weekly reflection, not a CV/change log');
    } else if (dto.type === SideTaskType.USER_CHANGE) {
      require(state.currentWeek >= 3 && payload.reviewSummary, 'A professional change description is required from Week 3');
    }
    let submission: SideTaskSubmission;
    try {
    submission = await this.prisma.sideTaskSubmission.create({
      data: {
        userId,
        requestKey,
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
        // Version metadata belongs exclusively to actual CV uploads.
        newCvUploaded: false,
        sharedInGroup: dto.sharedInGroup ?? true,
      },
    });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const replay = await this.prisma.sideTaskSubmission.findFirst({ where: { userId, requestKey } });
      if (!replay) throw error;
      submission = replay;
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

  async markInsightRead(userId: string, code: string): Promise<UserJourneyState> {
    const state = await this.getOrCreateUserState(userId);
    if (!(state.unlockedInsightCodes ?? []).includes(code)) throw new ForbiddenException('Complete the required quest to unlock this guidance');
    const post = await this.prisma.feedbackPost.findFirst({ where: {
      unlockTriggerCode: code, archivedAt: null,
      OR: [{ visibility: 'ALL' }, { visibility: 'DIRECT', targetUserId: userId },
        { visibility: 'GROUP', group: { memberships: { some: { userId } } } }],
    }, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }] });
    if (!post && !JOURNEY_GUIDANCE_CATALOG.some((item) => item.code === code)) throw new ForbiddenException('Guidance is unavailable for this participant');
    // Atomic append is conditional, so concurrent retries cannot duplicate read codes.
    await this.prisma.userJourneyState.updateMany({
      where: { userId, NOT: { readInsightCodes: { has: code } } },
      data: { readInsightCodes: { push: code } },
    });
    if (post) await this.prisma.feedbackRead.upsert({
      where: { feedbackId_userId: { feedbackId: post.id, userId } },
      create: { feedbackId: post.id, userId }, update: {},
    });
    await this.evaluateInterviewGuidanceUnlocks(userId);
    return this.getOrCreateUserState(userId);
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

    const apps = this.prisma?.application?.findMany
      ? await this.prisma.application.findMany({ where: { userId, journeyWeek: state.currentWeek }, select: reportApplicationSelect }) : [];
    const metrics = reportMetrics(apps);
    const totalApplications = metrics.logged, tailoredApplications = metrics.tailored;
    const interviewsOrResponses = metrics.positive, conversionRate = metrics.positiveRate ?? 0;

    return {
      state,
      features: {
        groups: (state.completedNodeCodes ?? []).includes('TASK_0') || state.currentWeek >= 1,
        tableView: state.canUseTableView,
        professionalTasks: professionalTasksUnlocked(state.currentWeek, state.readInsightCodes ?? []),
      },
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

  getDemoReports() {
    // The deterministic fixture is calculated in memory and never touches Prisma.
    return buildDemoReports();
  }

  async getAdminReportPreview(userId: string) {
    const report = await this.readReportsSnapshot(userId, true);
    // Match existing Admin detail permissions: keep report counts and dates,
    // but do not disclose private CV filenames, reflections, or contact info.
    return {
      ...report,
      cvs: report.cvs.map((cv) => ({
        ...cv,
        originalName: `CV v${cv.versionNumber}`,
      })),
      activities: report.activities.map((activity) => ({
        ...activity,
        summary: null,
        postUrl: null,
        postTopic: null,
        contactName: null,
        companyName: null,
      })),
    };
  }

  async getReports(userId: string) {
    // Reports are a pure read; a missing state is represented by the empty
    // baseline below rather than initialized by a GET request.
    return this.readReportsSnapshot(userId, false);
  }

  private async readReportsSnapshot(userId: string, adminPreview: boolean) {
    // One repeatable snapshot: all owned rows, no client pagination limit.
    // This method itself is read-only; adminPreview also never initializes state.
    return this.prisma.$transaction(async (tx) => {
      if (adminPreview) {
        const user = await tx.user.findFirst({
          where: { id: userId, role: 'USER' },
          select: { id: true },
        });
        if (!user) throw new NotFoundException('User not found');
      }

      const [applications, activities, cvs, tasks, persistedState] =
        await Promise.all([
          tx.application.findMany({
            where: { userId },
            select: reportApplicationSelect,
          }),
          tx.sideTaskSubmission.findMany({
            where: { userId },
            orderBy: { createdAt: 'asc' },
          }),
          tx.userCvHistory.findMany({
            where: { userId },
            orderBy: [{ uploadedAt: 'asc' }, { versionNumber: 'asc' }],
            select: {
              id: true,
              versionNumber: true,
              originalName: true,
              uploadedAt: true,
            },
          }),
          tx.task.findMany({
            where: { userId, status: 'DONE' },
            select: { id: true, title: true, completedAt: true },
          }),
          tx.userJourneyState.findUnique({ where: { userId } }),
        ]);

      const state = persistedState ?? {
        readInsightCodes: [],
        completedNodeCodes: [],
        currentNodeCode: 'TASK_0',
        currentWeek: 0,
      };

      return buildReportsPayload({
        applications,
        activities,
        cvs,
        tasks,
        state,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async completeFinalReport(userId: string) {
    const state=await this.getOrCreateUserState(userId);
    if(state.completedNodeCodes.includes('FINAL_REPORT')) return state;
    const nodes=await this.getAllNodes();
    const final=nodes.find(n=>n.code==='FINAL_REPORT');
    if(!final || state.currentNodeCode!=='FINAL_REPORT' || nodes.some(n=>n.orderIndex<final.orderIndex && !state.completedNodeCodes.includes(n.code))) {
      throw new ForbiddenException('Complete all preceding journey milestones before acknowledging the final report');
    }
    await this.prisma.userJourneyState.updateMany({where:{userId,currentNodeCode:'FINAL_REPORT',NOT:{completedNodeCodes:{has:'FINAL_REPORT'}}},data:{completedNodeCodes:{push:'FINAL_REPORT'}}});
    return this.prisma.userJourneyState.findUniqueOrThrow({where:{userId}});
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
    const slugifiedTitle = targetJobTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const isRemote =
      !location ||
      location.toLowerCase() === 'remote' ||
      location === 'عن بُعد' ||
      location === 'عن بعد';

    const platforms: JobMarketCompassPlatform[] = [
      {
        id: 'linkedin',
        name: 'LinkedIn Jobs',
        url: `https://www.linkedin.com/jobs/search/?keywords=${encodedTitle}&location=${encodedLocation}${isRemote ? '&f_WT=2' : ''}`,
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
        url: `https://wellfound.com/role/r/${slugifiedTitle}`,
        descriptionAr: 'وظائف الشركات الناشئة والتقنية العالمية',
        descriptionEn: 'Global startup and tech opportunities',
      },
      {
        id: 'remoteok',
        name: 'RemoteOK',
        url: `https://remoteok.com/remote-${slugifiedTitle}-jobs`,
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
    await this.deduplicateNotifications(userId).catch(() => 0);
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

  async getAdminPlotGuidance() {
    const dbPosts = await this.prisma.feedbackPost.findMany({
      where: { unlockTriggerCode: { not: null }, archivedAt: null },
      include: {
        reads: true,
      },
    });

    const dbPostsByCode = new Map<string, (typeof dbPosts)[0]>();
    for (const post of dbPosts) {
      if (post.unlockTriggerCode) {
        dbPostsByCode.set(post.unlockTriggerCode, post);
      }
    }

    const userStates = await this.prisma.userJourneyState.findMany({
      select: {
        userId: true,
        currentWeek: true,
        currentNodeCode: true,
        completedNodeCodes: true,
        unlockedInsightCodes: true,
      },
    });

    const totalMembers = userStates.length || 1;

    const items = JOURNEY_GUIDANCE_CATALOG.map((seed) => {
      const dbPost = dbPostsByCode.get(seed.code);

      const unlockedUsers = userStates.filter((u) => {
        if (u.unlockedInsightCodes.includes(seed.code)) return true;
        if (seed.code === 'INSIGHT_TASK_0_CV_BASE') return true;
        if (seed.weekNumber <= u.currentWeek) return true;
        return false;
      });

      const unlockedCount = unlockedUsers.length;
      const readsCount = dbPost?.reads?.length ?? 0;

      return {
        id: dbPost?.id ?? `catalog-${seed.code}`,
        code: seed.code,
        unlockTriggerCode: seed.code,
        weekNumber: seed.weekNumber,
        isAdvanced: seed.isAdvanced ?? false,
        title: dbPost?.title ?? seed.titleAr,
        titleAr: seed.titleAr,
        titleEn: seed.titleEn,
        content: dbPost?.content ?? seed.summaryAr,
        summaryAr: seed.summaryAr,
        summaryEn: seed.summaryEn,
        promptTemplate: dbPost?.promptTemplate ?? seed.promptTemplateAr,
        promptTemplateAr: seed.promptTemplateAr,
        promptTemplateEn: seed.promptTemplateEn,
        tierLevel: dbPost?.tierLevel ?? (seed.isAdvanced ? 'ADVANCED' : 'BASIC'),
        unlockedCount,
        readsCount,
        unlockedPercent: Math.round((unlockedCount / totalMembers) * 100),
        readPercent: unlockedCount > 0 ? Math.round((readsCount / unlockedCount) * 100) : 0,
        isCustomized: Boolean(dbPost),
        updatedAt: dbPost?.updatedAt?.toISOString() ?? null,
      };
    });

    // Also include any custom FeedbackPost with unlockTriggerCode not in seed catalog
    for (const post of dbPosts) {
      if (
        post.unlockTriggerCode &&
        !JOURNEY_GUIDANCE_CATALOG.some((s) => s.code === post.unlockTriggerCode)
      ) {
        items.push({
          id: post.id,
          code: post.unlockTriggerCode,
          unlockTriggerCode: post.unlockTriggerCode,
          weekNumber: 1,
          isAdvanced: post.tierLevel === 'ADVANCED',
          title: post.title,
          titleAr: post.title,
          titleEn: post.title,
          content: post.content,
          summaryAr: post.content,
          summaryEn: post.content,
          promptTemplate: post.promptTemplate || '',
          promptTemplateAr: post.promptTemplate || '',
          promptTemplateEn: post.promptTemplate || '',
          tierLevel: post.tierLevel || 'BASIC',
          unlockedCount: totalMembers,
          readsCount: post.reads?.length ?? 0,
          unlockedPercent: 100,
          readPercent: Math.round(((post.reads?.length ?? 0) / totalMembers) * 100),
          isCustomized: true,
          updatedAt: post.updatedAt.toISOString(),
        });
      }
    }

    return items;
  }

  async updateAdminPlotGuidance(
    code: string,
    dto: {
      title?: string;
      content?: string;
      promptTemplate?: string;
      tierLevel?: string;
    },
    authorId: string,
  ) {
    const existing = await this.prisma.feedbackPost.findFirst({
      where: { unlockTriggerCode: code, archivedAt: null },
    });

    const seed = JOURNEY_GUIDANCE_CATALOG.find((s) => s.code === code);

    if (existing) {
      return this.prisma.feedbackPost.update({
        where: { id: existing.id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.content !== undefined ? { content: dto.content.trim() } : {}),
          ...(dto.promptTemplate !== undefined
            ? { promptTemplate: dto.promptTemplate.trim() }
            : {}),
          ...(dto.tierLevel !== undefined ? { tierLevel: dto.tierLevel } : {}),
        },
      });
    }

    return this.prisma.feedbackPost.create({
      data: {
        authorId,
        title: dto.title?.trim() || seed?.titleAr || code,
        content: dto.content?.trim() || seed?.summaryAr || '',
        promptTemplate:
          dto.promptTemplate?.trim() || seed?.promptTemplateAr || '',
        visibility: 'ALL',
        context: 'GENERAL',
        unlockTriggerCode: code,
        tierLevel: dto.tierLevel || (seed?.isAdvanced ? 'ADVANCED' : 'BASIC'),
      },
    });
  }

  async createAdminPlotGuidance(
    dto: {
      code: string;
      title: string;
      content: string;
      promptTemplate?: string;
      tierLevel?: string;
    },
    authorId: string,
  ) {
    return this.prisma.feedbackPost.create({
      data: {
        authorId,
        title: dto.title.trim(),
        content: dto.content.trim(),
        promptTemplate: dto.promptTemplate?.trim() || null,
        visibility: 'ALL',
        context: 'GENERAL',
        unlockTriggerCode: dto.code.trim(),
        tierLevel: dto.tierLevel || 'BASIC',
      },
    });
  }

  async overrideUserJourneyNode(userId: string, nodeCode: string) {
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
}

