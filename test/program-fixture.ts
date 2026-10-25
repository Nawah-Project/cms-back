import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
/** Synthetic ready member for authorization tests; full onboarding is covered by HTTP stabilization tests. */
export async function prepareProgramMember(
  prisma: PrismaService,
  userId: string,
  week = 1,
) {
  if (
    process.env.NODE_ENV !== 'test' ||
    new URL(process.env.TEST_DATABASE_URL || '').pathname !== '/cms_test'
  )
    throw new Error('Disposable test database required');
  await prisma.user.update({
    where: { id: userId },
    data: {
      emailVerified: true,
      targetJobTitle: 'Engineer',
      portfolioUrl: 'https://example.com/synthetic',
    },
  });
  await prisma.userCv.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      originalName: 'synthetic.pdf',
      mimeType: 'application/pdf',
      size: 20,
      storageKey: randomUUID() + '.pdf',
    },
  });
  await prisma.userJourneyState.upsert({
    where: { userId },
    create: {
      userId,
      currentWeek: week,
      currentNodeCode: week === 3 ? 'W3_M3' : 'W1_M1',
      completedNodeCodes: ['TASK_0'],
      readInsightCodes: week === 3 ? ['INSIGHT_W3_TIME_MGMT'] : [],
    },
    update: {
      currentWeek: week,
      currentNodeCode: week === 3 ? 'W3_M3' : 'W1_M1',
      completedNodeCodes: ['TASK_0'],
      readInsightCodes: week === 3 ? ['INSIGHT_W3_TIME_MGMT'] : [],
    },
  });
}
