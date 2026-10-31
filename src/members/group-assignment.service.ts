import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const MAX_GROUP_SIZE = 10;
import { ASSIGNMENT_LOCK, homeCohort, specialtyKey } from './organized-entry';
const REGISTRATION_LOCK_KEY = ASSIGNMENT_LOCK;

@Injectable()
export class GroupAssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  async withAssignmentLock<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (transaction) => {
            await this.lockAssignments(transaction);
            return operation(transaction);
          },
          {
            // All membership and specialty edits take the same advisory lock.
            // READ COMMITTED takes its snapshot after waiting for that lock,
            // avoiding stale SERIALIZABLE snapshots during concurrent joins.
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            maxWait: 15_000,
            timeout: 15_000,
          },
        );
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2034' || attempt >= 5)
          throw error;
        await new Promise((resolve) => setTimeout(resolve, attempt * 20));
      }
    }
  }

  async lockAssignments(transaction: Prisma.TransactionClient): Promise<void> {
    await transaction.$queryRaw`
      SELECT pg_advisory_xact_lock(${BigInt(REGISTRATION_LOCK_KEY)}) IS NULL AS locked
    `;
  }

  // Call only during new-account onboarding or an explicit admin assignment.
  // A missing membership can mean an admin deliberately removed the user.
  async assignUser(
    transaction: Prisma.TransactionClient | PrismaClient,
    userId: string,
  ): Promise<string> {
    const existing = await transaction.membership.findUnique({
      where: { userId },
      select: { groupId: true },
    });
    if (existing) return existing.groupId;

    const user = await transaction.user.findUniqueOrThrow({
      where: { id: userId },
      select: { targetJobTitle: true },
    });
    if (!specialtyKey(user.targetJobTitle))
      throw new BadRequestException(
        'Choose a specialization before joining a group',
      );
    const groups = await transaction.group.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { _count: { select: { memberships: true } } },
    });
    let group: (typeof groups)[number] | undefined;
    for (const candidate of groups) {
      if (candidate._count.memberships >= MAX_GROUP_SIZE) continue;
      try {
        await this.assertCompatible(transaction, userId, candidate.id);
        group = candidate;
        break;
      } catch (error) {
        if (!(error instanceof ConflictException)) throw error;
      }
    }
    if (!group) {
      const largestNumber = groups.reduce((largest, item) => {
        const match = /^Group (\d+)$/.exec(item.name);
        return match ? Math.max(largest, Number(match[1])) : largest;
      }, 0);
      group = await transaction.group.create({
        data: { name: `Group ${largestNumber + 1}` },
        include: { _count: { select: { memberships: true } } },
      });
    }

    await transaction.membership.create({
      data: { userId, groupId: group.id },
    });
    return group.id;
  }

  async assertCompatible(
    db: Prisma.TransactionClient | PrismaClient,
    userId: string,
    groupId: string,
    proposedSpecialty?: string | null,
  ) {
    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { targetJobTitle: true },
    });
    const key = specialtyKey(
      proposedSpecialty === undefined ? user.targetJobTitle : proposedSpecialty,
    );
    if (!key)
      throw new BadRequestException(
        'Choose a specialization before joining a group',
      );
    const cohort = await homeCohort(db, userId);
    const members = await db.membership.findMany({
      where: { groupId, userId: { not: userId } },
      select: { userId: true, user: { select: { targetJobTitle: true } } },
    });
    for (const member of members) {
      if (specialtyKey(member.user.targetJobTitle) !== key)
        throw new ConflictException('Group specialization does not match');
      if ((await homeCohort(db, member.userId)) !== cohort)
        throw new ConflictException('Group home experiment does not match');
    }
  }

  async assignUserToGroup(userId: string): Promise<string> {
    return this.withAssignmentLock((transaction) =>
      this.assignUser(transaction, userId),
    );
  }
}
