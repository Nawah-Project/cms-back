import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JourneyEngineService } from './journey-engine.service';

describe('admin report preview isolation', () => {
  let service: JourneyEngineService;
  let prisma: any;
  let tx: any;

  beforeEach(() => {
    tx = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }) },
      application: { findMany: jest.fn().mockResolvedValue([]) },
      sideTaskSubmission: { findMany: jest.fn().mockResolvedValue([]) },
      userCvHistory: { findMany: jest.fn().mockResolvedValue([]) },
      task: { findMany: jest.fn().mockResolvedValue([]) },
      userJourneyState: {
        findUnique: jest.fn().mockResolvedValue({
          readInsightCodes: ['INSIGHT_A'],
          completedNodeCodes: ['TASK_0'],
          currentNodeCode: 'W1_M1',
          currentWeek: 1,
        }),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    prisma = {
      $transaction: jest.fn(async (callback: (client: any) => unknown) => callback(tx)),
      userJourneyState: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      application: { count: jest.fn() },
      membership: { findUnique: jest.fn() },
    };
    service = new JourneyEngineService(prisma as PrismaService);
  });

  it('returns every weekly cohort without initializing, evaluating, completing or unlocking the selected member', async () => {
    const initialize = jest.spyOn(service, 'getOrCreateUserState');
    const evaluate = jest.spyOn(service, 'evaluateProgress');

    const report = await service.getAdminReportPreview('member-1');

    expect(report.weeks.map((week) => week.week)).toEqual([0, 1, 2, 3, 4]);
    expect(report.currentWeek).toBe(1);
    expect(report.currentNodeCode).toBe('W1_M1');
    expect(report.completed).toBe(false);
    expect(report.completedNodeCodes).toEqual(['TASK_0']);
    expect(report.readInsightCodes).toEqual(['INSIGHT_A']);
    expect(tx.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'member-1', role: 'USER' },
      select: { id: true },
    });
    expect(initialize).not.toHaveBeenCalled();
    expect(evaluate).not.toHaveBeenCalled();
    expect(tx.userJourneyState.create).not.toHaveBeenCalled();
    expect(tx.userJourneyState.update).not.toHaveBeenCalled();
    expect(tx.userJourneyState.updateMany).not.toHaveBeenCalled();
  });

  it('does not create a missing journey state while previewing actual data', async () => {
    tx.userJourneyState.findUnique.mockResolvedValue(null);

    const report = await service.getAdminReportPreview('member-1');

    expect(report.currentNodeCode).toBe('TASK_0');
    expect(report.currentWeek).toBe(0);
    expect(report.completed).toBe(false);
    expect(tx.userJourneyState.create).not.toHaveBeenCalled();
  });

  it('redacts private CV names, reflections, URLs and contact details in actual Admin previews', async () => {
    tx.userCvHistory.findMany.mockResolvedValue([
      {
        id: 'cv-1',
        versionNumber: 2,
        originalName: 'private-name.pdf',
        uploadedAt: new Date('2026-10-20T00:00:00.000Z'),
      },
    ]);
    tx.sideTaskSubmission.findMany.mockResolvedValue([
      {
        id: 'activity-1',
        journeyWeek: 3,
        type: 'WEEKLY_REVIEW',
        reviewSummary: 'Private reflection',
        postUrl: 'https://example.invalid/private-post',
        postTopic: 'Private topic',
        contactName: 'Private contact',
        companyName: 'Private company',
        createdAt: new Date('2026-10-21T00:00:00.000Z'),
      },
    ]);

    const report = await service.getAdminReportPreview('member-1');

    expect(report.cvs[0].originalName).toBe('CV v2');
    expect(report.activities[0]).toMatchObject({
      summary: null,
      postUrl: null,
      postTopic: null,
      contactName: null,
      companyName: null,
    });
  });

  it('does not expose a report for a missing account or an Admin account', async () => {
    tx.user.findFirst.mockResolvedValue(null);

    await expect(service.getAdminReportPreview('other-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.application.findMany).not.toHaveBeenCalled();
    expect(tx.sideTaskSubmission.findMany).not.toHaveBeenCalled();
  });

  it('builds DEMO data without querying or writing any real activity', () => {
    const report = service.getDemoReports();

    expect(report.weeks.map((week) => week.week)).toEqual([0, 1, 2, 3, 4]);
    expect(report.weeks[1].logged).toBe(0);
    expect(report.completed).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.application.findMany).not.toHaveBeenCalled();
    expect(tx.sideTaskSubmission.findMany).not.toHaveBeenCalled();
    expect(tx.userJourneyState.update).not.toHaveBeenCalled();
  });
});
