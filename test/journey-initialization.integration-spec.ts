import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { JourneyEngineService } from '../src/journey-engine/journey-engine.service';
import { JOURNEY_V4_NODES } from '../src/journey-engine/journey-v4.seed';

describe('Phase 1 against an empty, isolated cms_test database', () => {
  const prisma = new PrismaClient();
  const service = new JourneyEngineService(prisma as PrismaService);
  let userId: string;

  beforeAll(async () => {
    // Refuse to repurpose an existing database, even if it is called cms_test.
    if ((await prisma.user.count()) || (await prisma.journeyNode.count())) {
      throw new Error(
        'Phase 1 integration tests require a fresh disposable database',
      );
    }
    const user = await prisma.user.create({
      data: {
        name: 'Synthetic Phase 1 participant',
        email: `phase1-${randomUUID()}@example.invalid`,
        journeyState: {
          create: {
            currentWeek: 2,
            currentNodeCode: 'W2_M1',
            completedNodeCodes: ['TASK_0', 'W1_M1'],
            cvVersionNumber: 9,
          },
        },
      },
    });
    userId = user.id;
    await prisma.sideTaskSubmission.createMany({
      data: [
        {
          userId,
          nodeCode: 'W1_REVIEW',
          journeyWeek: 1,
          type: 'WEEKLY_REVIEW',
          reviewSummary: 'صلحت غلط في السيرة الذاتية',
        },
        {
          userId,
          nodeCode: 'W3_M1',
          journeyWeek: 3,
          type: 'LINKEDIN_POST',
          postTopic: 'تجنب اسبام — error and spam are ordinary text',
        },
      ],
    });
    await prisma.userCvHistory.createMany({
      data: [4, 9].map((versionNumber) => ({
        userId,
        versionNumber,
        originalName: 'synthetic.pdf',
        mimeType: 'application/pdf',
        size: 12,
        storageKey: `${randomUUID()}.pdf`,
      })),
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('initializes all 25 nodes on a fresh database', async () => {
    await service.onModuleInit();
    expect(await prisma.journeyNode.count()).toBe(25);
    expect(
      (await service.getAdminJourneyNodes()).map((node) => node.code),
    ).toEqual(JOURNEY_V4_NODES.map((node) => node.code));
  });

  it('retains administrator targets and timestamps on reads and restarts', async () => {
    const edited = await service.updateJourneyNodeByCode('W1_M1', {
      requiredAppsCount: 11,
      descriptionAr: 'إعداد إداري محفوظ',
    });
    expect(
      (await service.getAdminJourneyNodes()).find((n) => n.code === 'W1_M1'),
    ).toEqual(edited);
    await service.onModuleInit();
    await service.onModuleInit();
    expect(
      await prisma.journeyNode.findUnique({ where: { code: 'W1_M1' } }),
    ).toEqual(edited);
    expect(await prisma.journeyNode.count()).toBe(25);
  });

  it('preserves submission contents, progress and non-contiguous CV version history', async () => {
    const snapshot = async () => ({
      state: await prisma.userJourneyState.findUnique({ where: { userId } }),
      submissions: await prisma.sideTaskSubmission.findMany({
        where: { userId },
        orderBy: { id: 'asc' },
      }),
      history: await prisma.userCvHistory.findMany({
        where: { userId },
        orderBy: { versionNumber: 'asc' },
      }),
    });
    const before = await snapshot();
    await service.onModuleInit();
    await service.onModuleInit();
    expect(await snapshot()).toEqual(before);
    expect(before.submissions).toHaveLength(2);
    expect(before.state?.cvVersionNumber).toBe(9);
    expect(before.history.map((row) => row.versionNumber)).toEqual([4, 9]);
  });
});
