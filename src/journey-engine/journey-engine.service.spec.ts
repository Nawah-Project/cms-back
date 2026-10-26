/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SideTaskType, UserJourneyState } from '@prisma/client';
import { GroupAssignmentService } from '../members/group-assignment.service';
import { PrismaService } from '../prisma/prisma.service';
import { JourneyEngineService } from './journey-engine.service';

describe('JourneyEngineService (Journey V4 State Machine)', () => {
  let service: JourneyEngineService;
  let prisma: any;
  let groupAssignment: { assignUserToGroup: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let currentState: UserJourneyState;

  beforeEach(() => {
    currentState = {
      id: 'state-1',
      userId: 'user-1',
      currentWeek: 0,
      currentNodeCode: 'TASK_0',
      currentNodeStartedAt: new Date('2026-10-20T00:00:00.000Z'),
      weekStartedAt: new Date('2026-10-20T00:00:00.000Z'),
      week1StartedAt: new Date('2026-10-20T00:00:00.000Z'),
      completedNodeCodes: [],
      unlockedInsightCodes: [],
      readInsightCodes: [],
      isGroupUnlocked: false,
      canUseTableView: false,
      hasUnlockedAdvPrep: false,
      cvVersionNumber: 1,
      cvFoundationBaselineVersion: null,
      cvFoundationCompletedAt: null,
      updatedAt: new Date('2026-10-20T00:00:00.000Z'),
    };

    prisma = {
      userJourneyState: {
        findUnique: jest.fn(async () => ({ ...currentState })),
        create: jest.fn(async ({ data }) => {
          currentState = { ...currentState, ...data };
          return currentState;
        }),
        update: jest.fn(async ({ data }) => {
          currentState = {
            ...currentState,
            ...data,
            updatedAt: new Date(),
          };
          return currentState;
        }),
      },
      journeyNode: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
      },
      userCvHistory: { findFirst: jest.fn().mockResolvedValue(null) },
      application: {
        count: jest.fn().mockResolvedValue(0),
      },
      sideTaskSubmission: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }) => ({
          id: 'sidetask-1',
          createdAt: new Date(),
          ...data,
        })),
        findMany: jest.fn().mockResolvedValue([]),
      },
      notification: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }) => ({
          id: 'notif-1',
          isRead: false,
          readAt: null,
          createdAt: new Date(),
          ...data,
        })),
      },
      membership: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          role: 'USER',
          targetJobTitle: 'Frontend Developer',
          preferredLocations: ['Cairo'],
        }),
      },
    };

    groupAssignment = {
      assignUserToGroup: jest.fn().mockResolvedValue('group-1'),
    };

    eventEmitter = {
      emit: jest.fn(),
    };

    service = new JourneyEngineService(
      prisma as PrismaService,
      groupAssignment as unknown as GroupAssignmentService,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  describe('1. Onboarding Quest (TASK_0 -> W1_M1 & Group Unlock)', () => {
    it('stays on TASK_0 when user has fewer than 5 applications', async () => {
      prisma.application.count.mockResolvedValue(4);

      const state = await service.evaluateProgress('user-1');

      expect(state.currentNodeCode).toBe('TASK_0');
      expect(state.isGroupUnlocked).toBe(false);
      expect(groupAssignment.assignUserToGroup).not.toHaveBeenCalled();
    });

    it('transitions from TASK_0 after 5 applications to W1_M1, unlocks group automatically, and unlocks INSIGHT_TASK_0_CV_BASE', async () => {
      prisma.application.count.mockResolvedValue(5);

      const state = await service.evaluateProgress('user-1');

      expect(state.currentNodeCode).toBe('W1_M1');
      expect(state.currentWeek).toBe(1);
      expect(state.isGroupUnlocked).toBe(true);
      expect(state.completedNodeCodes).toContain('TASK_0');
      expect(state.unlockedInsightCodes).toContain('INSIGHT_TASK_0_CV_BASE');
      expect(prisma.notification.create.mock.calls.map(([input])=>input.data.type)).toEqual(['GROUP_ACTIVITY']);
      expect(groupAssignment.assignUserToGroup).toHaveBeenCalledWith('user-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'journey.node_completed',
        expect.objectContaining({
          userId: 'user-1',
          completedNodeCode: 'TASK_0',
          nextNodeCode: 'W1_M1',
          isGroupUnlocked: true,
        }),
      );
    });
  });

  describe('2. Week 1 Sequential Fog Unblurring (10 -> 15 -> 20 -> 25 -> 30) & Table View Unlock', () => {
    beforeEach(() => {
      currentState = {
        ...currentState,
        currentWeek: 1,
        currentNodeCode: 'W1_M1',
        weekStartedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        completedNodeCodes: ['TASK_0'],
        unlockedInsightCodes: ['INSIGHT_TASK_0_CV_BASE'],
        readInsightCodes: ['INSIGHT_TASK_0_CV_BASE'],
        cvFoundationCompletedAt: new Date(),
        isGroupUnlocked: true,
        canUseTableView: false,
      };
    });

    it('progresses sequentially across Week 1 (10 -> 15 -> 20 -> 25 -> 30) and unlocks Table View after W1_M1', async () => {
      // W1_M1 requires 10 applications
      prisma.application.count.mockResolvedValueOnce(10);
      let state = await service.evaluateProgress('user-1');
      expect(state.currentNodeCode).toBe('W1_M2');
      expect(state.canUseTableView).toBe(true);
      expect(state.completedNodeCodes).toEqual(['TASK_0', 'W1_M1']);

      // W1_M2 requires 15 applications and unlocks INSIGHT_W1_INTERVIEW_BASIC
      prisma.application.count.mockResolvedValueOnce(14);
      state = await service.evaluateProgress('user-1');
      expect(state.currentNodeCode).toBe('W1_M2'); // Still locked with 14

      prisma.application.count.mockResolvedValueOnce(15);
      state = await service.evaluateProgress('user-1');
      expect(state.currentNodeCode).toBe('W1_M3');
      expect(state.unlockedInsightCodes).toContain(
        'INSIGHT_W1_INTERVIEW_BASIC',
      );

      // W1_M3 requires 20 applications
      prisma.application.count.mockResolvedValueOnce(20);
      state = await service.evaluateProgress('user-1');
      expect(state.currentNodeCode).toBe('W1_M4');

      // W1_M4 requires 25 applications
      prisma.application.count.mockResolvedValueOnce(25);
      state = await service.evaluateProgress('user-1');
      expect(state.currentNodeCode).toBe('W1_M5');

      // W1_M5 requires 30 applications
      prisma.application.count.mockResolvedValueOnce(30);
      state = await service.evaluateProgress('user-1');
      expect(state.currentNodeCode).toBe('W1_REVIEW');

      // Verify fog status via getJourneyStateSummary
      const summary = await service.getJourneyStateSummary('user-1');
      const statusByCode = new Map(
        summary.nodes.map((n) => [n.code, n.status]),
      );
      expect(statusByCode.get('W1_M1')).toBe('COMPLETED');
      expect(statusByCode.get('W1_M5')).toBe('COMPLETED');
      expect(statusByCode.get('W1_REVIEW')).toBe('ACTIVE');
      expect(statusByCode.get('W2_M1')).toBe('LOCKED_BLURRED');
    });

    it('requires both the previous quest and its scheduled day before unlocking the next quest', async () => {
      const weekStartedAt = new Date();
      currentState = {
        ...currentState,
        currentNodeCode: 'W1_M1',
        currentNodeStartedAt: weekStartedAt,
        weekStartedAt,
      };
      prisma.application.count.mockResolvedValue(10);

      let state = await service.evaluateProgress('user-1');
      expect(state.currentNodeCode).toBe('W1_M1');
      expect(state.completedNodeCodes).toContain('W1_M1');

      currentState.weekStartedAt = new Date(
        weekStartedAt.getTime() - 24 * 60 * 60 * 1000,
      );
      state = await service.evaluateProgress('user-1');
      expect(state.currentNodeCode).toBe('W1_M2');
    });

    it('lets administrators bypass the schedule while retaining quest requirements', async () => {
      currentState = {
        ...currentState,
        currentNodeCode: 'W1_M1',
        currentNodeStartedAt: new Date(),
        weekStartedAt: new Date(),
      };
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.application.count.mockResolvedValue(10);

      const state = await service.evaluateProgress('user-1');

      expect(state.currentNodeCode).toBe('W1_M2');
      expect(state.completedNodeCodes).toContain('W1_M1');
    });
  });

  describe('3. Weeks 2, 3, and 4 Combined Requirements (General Apps + Tailored Apps + SideTaskSubmission)', () => {
    it('does not complete Week 2 node (W2_M1) unless both general apps (15) and tailored apps (3) are satisfied', async () => {
      currentState = {
        ...currentState,
        currentWeek: 2,
        currentNodeCode: 'W2_M1',
      };

      // 15 general apps, but only 2 tailored apps -> should NOT complete
      prisma.application.count
        .mockResolvedValueOnce(15) // appsCount
        .mockResolvedValueOnce(2); // tailoredCount

      let state = await service.evaluateProgress('user-1');
      expect(state.currentNodeCode).toBe('W2_M1');

      // 15 general apps and 3 tailored apps -> completes and moves to W2_M2
      prisma.application.count
        .mockResolvedValueOnce(15) // appsCount
        .mockResolvedValueOnce(3); // tailoredCount

      state = await service.evaluateProgress('user-1');
      expect(state.currentNodeCode).toBe('W2_M2');
      expect(state.completedNodeCodes).toContain('W2_M1');
    });

    it('does not complete Week 3 node (W3_M1) unless general apps (15) + tailored apps (3) + LinkedIn posts (1) are all satisfied', async () => {
      currentState = {
        ...currentState,
        currentWeek: 3,
        currentNodeCode: 'W3_M1',
      };

      // Apps (15) and tailored (3) met, but 0 LinkedIn posts -> stays on W3_M1
      prisma.application.count
        .mockResolvedValueOnce(15) // appsCount
        .mockResolvedValueOnce(3); // tailoredCount
      prisma.sideTaskSubmission.count.mockResolvedValueOnce(0); // postsCount

      let state = await service.evaluateProgress('user-1');
      expect(state.currentNodeCode).toBe('W3_M1');

      // Now 1 LinkedIn post submitted -> transitions to W3_M2
      prisma.application.count
        .mockResolvedValueOnce(15)
        .mockResolvedValueOnce(3);
      prisma.sideTaskSubmission.count.mockResolvedValueOnce(1);

      state = await service.evaluateProgress('user-1');
      expect(state.currentNodeCode).toBe('W3_M2');
      expect(state.completedNodeCodes).toContain('W3_M1');
    });

    it('does not complete Week 4 node (W4_M1) unless general apps (18) + tailored apps (3) + posts (1) + outreach (1) are all satisfied', async () => {
      currentState = {
        ...currentState,
        currentWeek: 4,
        currentNodeCode: 'W4_M1',
      };

      // Missing outreach contact (0 instead of 1) -> stays on W4_M1
      prisma.application.count
        .mockResolvedValueOnce(18) // appsCount
        .mockResolvedValueOnce(3); // tailoredCount
      prisma.sideTaskSubmission.count
        .mockResolvedValueOnce(1) // postsCount
        .mockResolvedValueOnce(0); // outreachCount

      let state = await service.evaluateProgress('user-1');
      expect(state.currentNodeCode).toBe('W4_M1');

      // All 4 conditions met (18 apps, 3 tailored, 1 post, 1 outreach) -> transitions to W4_M2
      prisma.application.count
        .mockResolvedValueOnce(18)
        .mockResolvedValueOnce(3);
      prisma.sideTaskSubmission.count
        .mockResolvedValueOnce(1) // postsCount
        .mockResolvedValueOnce(1); // outreachCount

      state = await service.evaluateProgress('user-1');
      expect(state.currentNodeCode).toBe('W4_M2');
      expect(state.completedNodeCodes).toContain('W4_M1');
    });

    it('transitions from REVIEW_STATION (W1_REVIEW -> W2_M1) when WEEKLY_REVIEW side task is submitted', async () => {
      currentState = {
        ...currentState,
        currentWeek: 1,
        currentNodeCode: 'W1_REVIEW',
      };

      prisma.sideTaskSubmission.findMany.mockResolvedValueOnce([{ reviewSummary: 'Reviewed the week' }]);

      const result = await service.submitSideTask('user-1', {
        type: SideTaskType.WEEKLY_REVIEW,
        reviewSummary: 'Reviewed 100 applications and updated CV keywords',
        newCvUploaded: true,
      });

      expect(result.journeyState.currentNodeCode).toBe('W2_M1');
      expect(result.journeyState.currentWeek).toBe(2);
      expect(result.journeyState.unlockedInsightCodes).toContain(
        'INSIGHT_W1_TAILORED_CV',
      );
    });
  });

  describe('4. Advanced Interview Prep & Job Market Compass', () => {
    it('unlocks INSIGHT_INTERVIEW_ADVANCED on first interview or assignment if basic guide is read', async () => {
      prisma.application.count.mockResolvedValue(1);
      prisma.feedbackPost = {
        findFirst: jest.fn().mockResolvedValue({ id: 'fp-basic' }),
      };
      prisma.feedbackRead = {
        findUnique: jest.fn().mockResolvedValue({
          feedbackId: 'fp-basic',
          userId: 'user-1',
        }),
      };
      const unlocked = await service.unlockAdvancedInterviewPrepIfNeeded('user-1');
      expect(unlocked).toBe(true);
      expect(currentState.hasUnlockedAdvPrep).toBe(true);
      expect(currentState.unlockedInsightCodes).toContain(
        'INSIGHT_INTERVIEW_ADVANCED',
      );
    });

    it('generates filtered Job Market Compass links using user targetJobTitle', async () => {
      const compass = await service.getJobMarketCompass('user-1', 'Remote');
      expect(compass.targetJobTitle).toBe('Frontend Developer');
      expect(compass.location).toBe('Remote');
      expect(compass.platforms).toHaveLength(5);
      expect(compass.platforms[0].url).toContain('Frontend%20Developer');
    });
  });
  describe('Week 1 foundation prerequisite enforcement', () => {
    it('rejects reading completion without a revised CV even through the direct API', async () => {
      currentState = {...currentState,currentWeek:1,completedNodeCodes:['TASK_0'],unlockedInsightCodes:['INSIGHT_TASK_0_CV_BASE'],cvFoundationBaselineVersion:1};
      prisma.feedbackPost = {findFirst:jest.fn().mockResolvedValue({id:'cv-guide'})};
      prisma.userJourneyState.updateMany = jest.fn();
      await expect(service.markInsightRead('user-1','INSIGHT_TASK_0_CV_BASE')).rejects.toMatchObject({response:expect.objectContaining({code:'CV_UPDATE_REQUIRED'})});
      expect(prisma.userJourneyState.updateMany).not.toHaveBeenCalled();
    });
    it('does not advance a completed application quota before CV foundation completion', async () => {
      currentState = {...currentState,currentWeek:1,currentNodeCode:'W1_M1',completedNodeCodes:['TASK_0']};
      prisma.application.count.mockResolvedValue(100);
      const state = await service.evaluateProgress('user-1');
      expect(state.currentNodeCode).toBe('W1_M1');
      expect(state.completedNodeCodes).not.toContain('W1_M1');
    });
    it('does not reveal the basic interview guide on an early interview before quest two', async () => {
      currentState = {...currentState,currentWeek:1,completedNodeCodes:['TASK_0']};
      prisma.application.count.mockResolvedValue(1);
      prisma.feedbackPost = {findFirst:jest.fn().mockResolvedValue(null)};
      await service.evaluateInterviewGuidanceUnlocks('user-1');
      expect(currentState.unlockedInsightCodes).not.toContain('INSIGHT_W1_INTERVIEW_BASIC');
    });
  });

});

