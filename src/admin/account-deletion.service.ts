import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AccountCvCleanupService, CV_KEY } from "./account-cv-cleanup.service";
import { DeleteUserDto } from "./dto/delete-user.dto";
@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cleanup: AccountCvCleanupService,
  ) {}
  private assertAllowed(
    actorId: string,
    user: { id: string; role: string } | null,
  ) {
    if (!user) throw new NotFoundException("Account no longer exists");
    if (user.id === actorId || user.role !== "USER")
      throw new ForbiddenException(
        "Only member accounts can be permanently deleted",
      );
  }
  async preview(actorId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        cv: { select: { storageKey: true } },
        cvHistory: { select: { storageKey: true } },
        _count: {
          select: {
            applications: true,
            assignedTasks: true,
            sideTaskSubmissions: true,
            notifications: true,
            experienceProgress: true,
          },
        },
      },
    });
    this.assertAllowed(actorId, user);
    return {
      id: user!.id,
      name: user!.name,
      email: user!.email,
      counts: {
        ...user!._count,
        cvVersions: new Set(
          [
            user!.cv?.storageKey,
            ...user!.cvHistory.map((c) => c.storageKey),
          ].filter(Boolean),
        ).size,
      },
    };
  }
  async delete(actorId: string, userId: string, dto: DeleteUserDto) {
    // Defend service callers as well as the request DTO.
    if (dto.confirmation !== "DELETE_PERMANENTLY")
      throw new BadRequestException(
        "Permanent deletion confirmation is required",
      );
    let keys: string[] = [];
    for (let attempt = 0; ; attempt++) {
      try {
        keys = await this.prisma.$transaction(
          async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
            await tx.$queryRaw`SELECT id FROM users WHERE id=${userId}::uuid FOR UPDATE`;
            const user = await tx.user.findUnique({
              where: { id: userId },
              select: {
                id: true,
                role: true,
                email: true,
                cv: { select: { storageKey: true } },
                cvHistory: { select: { storageKey: true } },
              },
            });
            this.assertAllowed(actorId, user);
            if (dto.email.trim().toLowerCase() !== user!.email.toLowerCase())
              throw new BadRequestException(
                "Confirmation email does not match this account",
              );
            const files = [
              ...new Set(
                [
                  user!.cv?.storageKey,
                  ...user!.cvHistory.map((c) => c.storageKey),
                ].filter((v): v is string => !!v),
              ),
            ];
            if (files.some((k) => !CV_KEY.test(k)))
              throw new ConflictException(
                "A private CV reference needs review before deletion",
              );
            // Remove restrictions and non-relational identity traces before cascading the account.
            await tx.feedbackPost.deleteMany({
              where: { OR: [{ targetUserId: userId }, { authorId: userId }] },
            });
            await tx.task.deleteMany({
              where: { OR: [{ userId }, { createdById: userId }] },
            });
            await tx.emailDeliveryLog.deleteMany({
              where: {
                OR: [
                  { userId },
                  {
                    recipientEmail: {
                      equals: user!.email,
                      mode: "insensitive",
                    },
                  },
                ],
              },
            });
            await tx.uxJourneyObservation.deleteMany({
              where: {
                OR: [
                  { subjectUserId: userId },
                  { authorId: userId },
                  { ownerId: userId },
                ],
              },
            });
            await tx.$executeRaw`UPDATE ux_lab_experiments SET user_ids=array_remove(user_ids,${userId}::uuid) WHERE ${userId}::uuid=ANY(user_ids)`;
            await tx.$executeRaw`DELETE FROM domain_event_logs WHERE "actorId"=${userId}::uuid OR "targetUserId"=${userId}::uuid OR "entityId"=${userId} OR jsonb_path_exists(payload, '$.** ? (@ == $identity)', jsonb_build_object('identity', ${userId}::text)) OR jsonb_path_exists(payload, '$.** ? (@ == $identity)', jsonb_build_object('identity', ${user!.email}::text))`;
            await tx.notification.deleteMany({
              where: { actionUrl: { contains: userId } },
            });
            if (files.length)
              await tx.cvDeletionJob.createMany({
                data: files.map((storageKey) => ({ storageKey })),
                skipDuplicates: true,
              });
            await tx.user.delete({ where: { id: userId } });
            return files;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        break;
      } catch (error) {
        if ((error as { code?: string }).code !== "P2034" || attempt >= 3)
          throw error;
      }
    }
    await this.cleanup.processPending(keys);
    const cvFilesPending = keys.length
      ? await this.prisma.cvDeletionJob.count({
          where: { storageKey: { in: keys } },
        })
      : 0;
    return { deleted: true, cvFilesPending };
  }
}
