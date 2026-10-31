import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const PROFESSIONAL_CHANGE_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;

/** A per-member transaction lock makes the 72-hour limit atomic, including concurrent requests. */
export async function persistProfessionalChange(
  prisma: PrismaService,
  data: Prisma.SideTaskSubmissionUncheckedCreateInput,
  clock: () => Date = () => new Date(),
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${data.userId}, 0))`;
    const replay = await tx.sideTaskSubmission.findFirst({ where: { userId: data.userId, requestKey: data.requestKey } });
    if (replay) return replay;
    const latest = await tx.sideTaskSubmission.findFirst({ where: { userId: data.userId, type: 'USER_CHANGE' }, orderBy: { createdAt: 'desc' } });
    const now = clock();
    const nextAvailableAt = latest ? new Date(latest.createdAt.getTime() + PROFESSIONAL_CHANGE_INTERVAL_MS) : null;
    if (nextAvailableAt && now < nextAvailableAt) {
      throw new BadRequestException({ message: 'A professional update is available once every 3 days', code: 'CHANGE_COOLDOWN', nextAvailableAt: nextAvailableAt.toISOString() });
    }
    return tx.sideTaskSubmission.create({ data: { ...data, createdAt: now } });
  });
}
