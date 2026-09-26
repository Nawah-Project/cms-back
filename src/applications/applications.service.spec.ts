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
      $transaction: jest.fn((callback) => callback(transaction)),
      application: {
        create: jest.fn(async ({ data }) => ({ ...application, ...data })),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
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
});
