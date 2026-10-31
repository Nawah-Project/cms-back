import { Prisma } from '@prisma/client';
export const ASSIGNMENT_LOCK = 684_206_731_104;
export const RESEARCH_QA_ID = 'aeef0606-17bb-47b6-a239-4a44526303b4';
export const specialtyKey = (value?: string | null) =>
  (value ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');

// The experiment row is the durable alternating counter. Account deletion must
// never rewind it. The global transaction lock also serializes group placement.
export async function enrollOrganizedEntry(
  db: Prisma.TransactionClient,
  userId: string,
) {
  await db.$queryRaw`SELECT pg_advisory_xact_lock(${BigInt(ASSIGNMENT_LOCK)}) IS NULL AS locked`;
  const experiment = await db.uxLabExperiment.findFirst({
    where: { section: 'home', audience: 'ENTRY', status: 'RUNNING' },
    orderBy: { createdAt: 'desc' },
  });
  if (!experiment) return;
  await db.$queryRaw`SELECT id FROM ux_lab_experiments WHERE id=${experiment.id}::uuid FOR UPDATE`;
  const locked = await db.uxLabExperiment.findUnique({
    where: { id: experiment.id },
    select: { status: true },
  });
  if (locked?.status !== 'RUNNING') return;
  const existing = await db.uxLabAssignment.findUnique({
    where: { experimentId_userId: { experimentId: experiment.id, userId } },
  });
  if (existing) return existing;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      journeyState: {
        select: {
          currentNodeCode: true,
          completedNodeCodes: true,
          isGroupUnlocked: true,
        },
      },
      membership: { select: { id: true } },
    },
  });
  if (
    !user ||
    user.role !== 'USER' ||
    userId === RESEARCH_QA_ID ||
    user.membership ||
    (user.journeyState &&
      (user.journeyState.currentNodeCode !== 'TASK_0' ||
        user.journeyState.completedNodeCodes.includes('TASK_0') ||
        user.journeyState.isGroupUnlocked))
  )
    return;
  const sequence = await db.uxLabExperiment.update({
    where: { id: experiment.id },
    data: { entrySequence: { increment: 1 } },
    select: { entrySequence: true },
  });
  return db.uxLabAssignment.create({
    data: {
      experimentId: experiment.id,
      userId,
      version: sequence.entrySequence % 2 === 1 ? 'A' : 'B',
    },
  });
}
export async function homeCohort(db: Prisma.TransactionClient, userId: string) {
  const assignment = await db.uxLabAssignment.findFirst({
    where: { userId, experiment: { section: 'home', audience: 'ENTRY' } },
    orderBy: { createdAt: 'desc' },
    select: { experimentId: true, version: true },
  });
  return assignment
    ? `${assignment.experimentId}:${assignment.version}`
    : 'baseline:A';
}
