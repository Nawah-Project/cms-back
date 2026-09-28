import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const MAX_GROUP_SIZE = 10;
const REGISTRATION_LOCK_KEY = 684_206_731_104;

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
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
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

    const groups = await transaction.group.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { _count: { select: { memberships: true } } },
    });
    let group = groups.find(
      (candidate) => candidate._count.memberships < MAX_GROUP_SIZE,
    );
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
}
