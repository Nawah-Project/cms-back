import { ApplicationOutcome, ApplicationStage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NoResponseProcessor } from './no-response.processor';

describe('NoResponseProcessor', () => {
  it('closes eligible applications with an auditable transition, once', async () => {
    const now = new Date('2026-09-27T12:00:00.000Z');
    const candidate = {
      id: 'application-1',
      userId: 'member-1',
      stage: ApplicationStage.INTERVIEW,
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    };
    let scan = 0;
    const tx = {
      application: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      applicationStageTransition: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $queryRaw: jest.fn(async () => (scan++ === 0 ? [candidate] : [])),
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const processor = new NoResponseProcessor(
      prisma as unknown as PrismaService,
    );

    expect(await processor.runOnce(now)).toBe(1);
    expect(tx.application.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          stage: ApplicationStage.INTERVIEW,
          outcome: ApplicationOutcome.NONE,
          updatedAt: candidate.updatedAt,
        }),
        data: expect.objectContaining({
          stage: ApplicationStage.CLOSED,
          outcome: ApplicationOutcome.NO_RESPONSE,
          closedAt: now,
        }),
      }),
    );
    expect(tx.applicationStageTransition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStage: ApplicationStage.INTERVIEW,
          toStage: ApplicationStage.CLOSED,
          outcome: ApplicationOutcome.NO_RESPONSE,
          changedAt: now,
        }),
      }),
    );
    expect(await processor.runOnce(now)).toBe(0);
    expect(tx.applicationStageTransition.create).toHaveBeenCalledTimes(1);
  });

  it('does not record a transition when a concurrent edit makes the candidate ineligible', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([
          {
            id: 'application-1',
            userId: 'member-1',
            stage: ApplicationStage.APPLIED,
            updatedAt: new Date(),
          },
        ]),
      $transaction: jest.fn(async (callback: any) =>
        callback({
          application: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
          applicationStageTransition: { create: jest.fn() },
        }),
      ),
    };
    const processor = new NoResponseProcessor(
      prisma as unknown as PrismaService,
    );
    expect(await processor.runOnce()).toBe(0);
  });
});
