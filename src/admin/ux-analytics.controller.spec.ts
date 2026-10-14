import { Test, TestingModule } from '@nestjs/testing';
import { UxAnalyticsController } from './ux-analytics.controller';
import { UxAnalyticsService } from './ux-analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';

describe('UxAnalyticsController & AdminController monitoring/ux-analytics', () => {
  let uxController: UxAnalyticsController;
  let adminController: AdminController;
  let uxService: UxAnalyticsService;
  let adminService: any;

  beforeEach(async () => {
    uxService = new UxAnalyticsService();
    adminService = {
      getUxAnalytics: jest.fn(() => uxService.getAnalytics()),
      recordUxEvent: jest.fn((userId, dto) =>
        uxService.recordEvent(userId, dto),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UxAnalyticsController, AdminController],
      providers: [
        { provide: UxAnalyticsService, useValue: uxService },
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
