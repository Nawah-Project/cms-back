/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { GroupAssignmentService } from '../members/group-assignment.service';
import { UserRole } from '@prisma/client';
import { UxAnalyticsService } from './ux-analytics.service';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn(),
      user: {
        findUnique: jest.fn(),
      },
      application: {
        aggregate: jest.fn(),
        groupBy: jest.fn(),
        findMany: jest.fn(),
      },
      applicationStageTransition: {
        aggregate: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      task: {
        groupBy: jest.fn(),
        aggregate: jest.fn(),
        count: jest.fn(),
      },
      taskNote: {
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: GroupAssignmentService, useValue: {} },
        UxAnalyticsService,
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  describe('getUsers', () => {
    it('returns development metrics without N+1 queries', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          name: 'Ahmed',
          role: UserRole.USER,
          groupId: 'group-1',
          groupName: 'Frontend Team',
          lastActivityAt: new Date('2026-10-10T10:00:00.000Z'),
          inactivityDays: 2,
          activityStatus: 'ACTIVE',
          applicationsCount: 5,
          applied: 2,
          interview: 1,
          decision: 1,
          closed: 1,
          activeTasks: 4,
          inProgressTasks: 2,
          overdueTasks: 1,
          lastTaskAt: new Date('2026-10-11T12:00:00.000Z'),
        },
      ];

      prisma.$queryRaw
        .mockResolvedValueOnce(mockUsers)
        .mockResolvedValueOnce([{ total: 1 }]);

      const result = await service.getUsers({ page: 1, limit: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].development).toEqual({
        active: 4,
        inProgress: 2,
        overdue: 1,
        lastTaskAt: '2026-10-11T12:00:00.000Z',
      });
      expect(result.items[0].applicationsCount).toBe(5);
    });
  });

  describe('getUserDetail', () => {
    it('factors task updatedAt into lastActivityAt', async () => {
      const userId = 'user-1';
      prisma.user.findUnique.mockResolvedValue({
        id: userId,
        name: 'Sara',
        email: 'sara@example.com',
        role: UserRole.USER,
        createdAt: new Date('2026-01-01'),
        portfolioUrl: null,
        cv: null,
        membership: null,
      });

      prisma.application.aggregate.mockResolvedValue({
        _count: { _all: 1 },
        _max: {
          createdAt: new Date('2026-05-01'),
          updatedAt: new Date('2026-05-02'),
        },
      });

      prisma.application.groupBy.mockResolvedValue([]);
      prisma.applicationStageTransition.aggregate.mockResolvedValue({
        _max: { changedAt: null },
      });
      prisma.application.findMany.mockResolvedValue([]);
      prisma.task.groupBy.mockResolvedValue([]);
      // Task was updated more recently than application
      const latestTaskDate = new Date('2026-10-12T00:00:00.000Z');
      prisma.task.aggregate.mockResolvedValue({
        _max: { updatedAt: latestTaskDate },
      });
      prisma.task.count.mockResolvedValue(0);
      prisma.taskNote.count.mockResolvedValue(0);

      const result = await service.getUserDetail(userId);

      expect(result.lastActivityAt).toBe(latestTaskDate.toISOString());
    });
  });

  describe('UX Analytics & A/B testing', () => {
    it('records UX events and computes metrics by event and A/B variants', () => {
      service.recordUxEvent('user-1', {
        name: 'onboarding_started',
        variant: 'A',
      });
      service.recordUxEvent('user-1', {
        name: 'application_created',
        variant: 'A',
      });
      service.recordUxEvent('user-2', {
        name: 'onboarding_started',
        variant: 'B',
      });
      service.recordUxEvent('user-2', {
        name: 'task_status_changed',
        variant: 'B',
      });
      service.recordUxEvent('user-2', {
        name: 'feedback_read',
        variant: 'B',
      });

      const analytics = service.getUxAnalytics();

      expect(analytics.totalsByEvent.onboarding_started).toBe(2);
      expect(analytics.uniqueUsersByEvent.onboarding_started).toBe(2);
      expect(analytics.totalsByEvent.application_created).toBe(1);
      expect(analytics.totalsByEvent.task_status_changed).toBe(1);
      expect(analytics.totalsByEvent.feedback_read).toBe(1);

      // A/B test summary: interactions are application_created + task_status_changed + feedback_read
      expect(analytics.abTestSummary.A).toEqual({
        usersCount: 1,
        interactionsCount: 1, // application_created
        eventsCount: 2,
      });
      expect(analytics.abTestSummary.B).toEqual({
        usersCount: 1,
        interactionsCount: 2, // task_status_changed + feedback_read
        eventsCount: 3,
      });
    });
  });
});
