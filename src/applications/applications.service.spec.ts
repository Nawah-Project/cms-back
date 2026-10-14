/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApplicationsService } from './applications.service';
import { ApplicationStage } from './enums/application-stage.enum';
import { ApplicationOutcome } from './enums/application-outcome.enum';
import { ApplicationMethod } from './enums/application-method.enum';

describe('ApplicationsService', () => {
  let service: ApplicationsService;
  let prisma: any;
  let transaction: any;
  let application: any;

  beforeEach(() => {
    application = {
      id: 'application-id',
      userId: 'user-id',
      companyName: 'Company',
      jobTitle: 'Designer',
      applicationDate: '2026-09-26',
      location: null,
      applicationMethod: null,
      jobUrl: null,
      stage: 'APPLIED',
      outcome: 'NONE',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    transaction = {
      application: {
        findFirst: jest.fn().mockResolvedValue(application),
        update: jest.fn(async ({ data }) => ({ ...application, ...data })),
      },
      applicationStageTransition: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      $transaction: jest.fn((input) =>
        Array.isArray(input) ? Promise.all(input) : input(transaction),
      ),
      application: {
        create: jest.fn(async ({ data }) => ({ ...application, ...data })),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    service = new ApplicationsService(prisma as PrismaService);
  });

  it('creates an APPLIED application with defaults without creating a fake transition', async () => {
    const result = await service.create('user-id', {
      companyName: 'New Co',
      jobTitle: 'Designer',
    });
    expect(result.stage).toBe(ApplicationStage.APPLIED);
    expect(result.outcome).toBe(ApplicationOutcome.NONE);
    expect(
      transaction.applicationStageTransition.create,
    ).not.toHaveBeenCalled();
  });

  it('does not allow a member to manually set NO_RESPONSE on creation', async () => {
    await expect(
      service.create('user-id', {
        companyName: 'New Co',
        jobTitle: 'Designer',
        outcome: ApplicationOutcome.NO_RESPONSE,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('preserves optional application fields', async () => {
    const result = await service.create('user-id', {
      companyName: 'Google',
      jobTitle: 'Engineer',
      applicationDate: '2026-03-15',
      applicationMethod: ApplicationMethod.LINKEDIN,
      jobUrl: 'https://example.com/job',
    });
    expect(result.applicationMethod).toBe(ApplicationMethod.LINKEDIN);
    expect(result.applicationDate).toBe('2026-03-15');
  });

  it('creates one transactional transition whenever the stage changes', async () => {
    await service.update('user-id', 'application-id', {
      stage: ApplicationStage.INTERVIEW,
    });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(transaction.applicationStageTransition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        applicationId: 'application-id',
        userId: 'user-id',
        fromStage: 'APPLIED',
        toStage: 'INTERVIEW',
        outcome: null,
      }),
    });
  });

  it('does not create a transition for same-stage or detail-only changes', async () => {
    await service.update('user-id', 'application-id', {
      companyName: 'Edited',
      jobUrl: 'https://example.com/job',
    });
    expect(
      transaction.applicationStageTransition.create,
    ).not.toHaveBeenCalled();
  });

  it('does not update job-search activity timestamps for a no-op application edit', async () => {
    await service.update('user-id', 'application-id', {});
    expect(transaction.application.update).not.toHaveBeenCalled();
    expect(
      transaction.applicationStageTransition.create,
    ).not.toHaveBeenCalled();
  });

  it('requires an outcome when closing an application', async () => {
    await expect(
      service.update('user-id', 'application-id', {
        stage: ApplicationStage.CLOSED,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(
      transaction.applicationStageTransition.create,
    ).not.toHaveBeenCalled();
  });

  it('filters active applications excluding CLOSED and returns unfilteredTotal', async () => {
    prisma.application.findMany.mockResolvedValue([application]);
    prisma.application.count
      .mockResolvedValueOnce(1) // filtered count
      .mockResolvedValueOnce(5); // unfiltered count

    const result = await service.findAll('user-id', {
      stage: 'ACTIVE',
      page: 1,
      limit: 10,
    });

    expect(prisma.application.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-id',
          stage: { not: ApplicationStage.CLOSED },
        }),
      }),
    );
    expect(result.total).toBe(1);
    expect(result.unfilteredTotal).toBe(5);
  });

  it('allows editing an application already closed with NO_RESPONSE', async () => {
    application.stage = 'CLOSED';
    application.outcome = 'NO_RESPONSE';

    const result = await service.update('user-id', 'application-id', {
      companyName: 'Updated Company Name',
      outcome: ApplicationOutcome.NO_RESPONSE,
    });

    expect(result.companyName).toBe('Updated Company Name');
    expect(result.outcome).toBe(ApplicationOutcome.NO_RESPONSE);
  });

  it('rejects setting NO_RESPONSE on an application that was not NO_RESPONSE', async () => {
    application.outcome = 'NONE';

    await expect(
      service.update('user-id', 'application-id', {
        outcome: ApplicationOutcome.NO_RESPONSE,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns expiringSoonCount and recentNoResponseCount in getDashboard', async () => {
    prisma.application.groupBy.mockResolvedValue([
      { stage: 'APPLIED', outcome: 'NONE', _count: { _all: 3 } },
      { stage: 'CLOSED', outcome: 'NO_RESPONSE', _count: { _all: 2 } },
    ]);
    prisma.application.findMany.mockResolvedValue([]);
    prisma.application.count
      .mockResolvedValueOnce(2) // expiringSoonCount
      .mockResolvedValueOnce(1); // recentNoResponseCount

    const stats = await service.getDashboard('user-id');

    expect(stats.expiringSoonCount).toBe(2);
    expect(stats.recentNoResponseCount).toBe(1);
    expect(stats.active.total).toBe(3);
    expect(stats.closed.noResponse).toBe(2);
  });
});
