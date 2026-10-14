import { Test, TestingModule } from '@nestjs/testing';
import { UxAnalyticsController } from './ux-analytics.controller';
import { UxAnalyticsService } from './ux-analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { PrismaService } from '../prisma/prisma.service';

describe('UxAnalyticsController & AdminController monitoring/ux-analytics', () => {
  let uxController: UxAnalyticsController;
  let adminController: AdminController;
  let uxService: UxAnalyticsService;
  let adminService: any;
  let prismaService: { membership: { findUnique: jest.Mock } };

  beforeEach(async () => {
    uxService = new UxAnalyticsService();
    prismaService = { membership: { findUnique: jest.fn() } };
    adminService = {
      getUxAnalytics: jest.fn(() => uxService.getAnalytics()),
      updateUxConfig: jest.fn((dto) => uxService.updateConfig(dto)),
      recordUxEvent: jest.fn((userId, dto) =>
        uxService.recordEvent(userId, dto),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UxAnalyticsController, AdminController],
      providers: [
        { provide: UxAnalyticsService, useValue: uxService },
        { provide: PrismaService, useValue: prismaService },
        { provide: AdminService, useValue: adminService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    uxController = module.get<UxAnalyticsController>(UxAnalyticsController);
    adminController = module.get<AdminController>(AdminController);
  });

  it('records an event for a member via POST /ux-analytics/events', () => {
    const response = uxController.recordEvent('user-abc', {
      name: 'onboarding_completed',
      variant: 'A',
    });

    expect(response.success).toBe(true);
    expect(response.event.name).toBe('onboarding_completed');
    expect(response.event.userId).toBe('user-abc');
  });

  it('tracks interactions for variant C', () => {
    uxController.recordEvent('user-c', {
      name: 'application_created',
      variant: 'C',
    });

    expect(uxService.getAnalytics().abTestSummary.C).toEqual({
      usersCount: 1,
      interactionsCount: 1,
      eventsCount: 1,
    });
  });

  it('exposes public video config and resolves a protected group assignment', async () => {
    uxService.updateConfig({
      defaultVariant: 'A',
      groupVariants: { 'group-c': 'C' },
      introVideoUrl: 'https://www.youtube.com/watch?v=demo',
    });
    prismaService.membership.findUnique.mockResolvedValue({
      groupId: 'group-c',
    });

    expect(uxController.getPublicConfig()).toEqual({
      introVideoUrl: 'https://www.youtube.com/watch?v=demo',
      defaultVariant: 'A',
    });
    await expect(uxController.getMyAssignment('user-c')).resolves.toEqual({
      assignedVariant: 'C',
      groupId: 'group-c',
      introVideoUrl: 'https://www.youtube.com/watch?v=demo',
    });
    expect(prismaService.membership.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-c' },
      select: { groupId: true },
    });
  });

  it('updates experiment configuration through the admin controller', () => {
    const config = adminController.updateUxConfig({
      defaultVariant: 'B',
      introVideoUrl: 'https://www.loom.com/share/demo',
    });

    expect(adminService.updateUxConfig).toHaveBeenCalledWith({
      defaultVariant: 'B',
      introVideoUrl: 'https://www.loom.com/share/demo',
    });
    expect(config.defaultVariant).toBe('B');
  });

  it('exposes UX analytics report via GET /admin/monitoring/ux-analytics', () => {
    uxController.recordEvent('user-1', {
      name: 'application_created',
      variant: 'A',
    });
    uxController.recordEvent('user-2', {
      name: 'task_status_changed',
      variant: 'B',
    });

    const report = adminController.getUxAnalytics();

    expect(adminService.getUxAnalytics).toHaveBeenCalled();
    expect(report.totalsByEvent.application_created).toBe(1);
    expect(report.totalsByEvent.task_status_changed).toBe(1);
    expect(report.abTestSummary.A.interactionsCount).toBe(1);
    expect(report.abTestSummary.B.interactionsCount).toBe(1);
  });
});
