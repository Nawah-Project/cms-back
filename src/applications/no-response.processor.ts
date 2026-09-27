import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ApplicationOutcome, ApplicationStage, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const WAITING_DAYS = 7;
const INTERVAL_MS = 15 * 60 * 1000;
const BATCH_SIZE = 100;

type Candidate = {
  id: string;
  userId: string;
  stage: ApplicationStage;
  updatedAt: Date;
};

@Injectable()
export class NoResponseProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NoResponseProcessor.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runOnce(), INTERVAL_MS);
    this.timer.unref();
    void this.runOnce();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const cutoff = new Date(
        now.getTime() - WAITING_DAYS * 24 * 60 * 60 * 1000,
      );
      const candidates = await this.prisma.$queryRaw<Candidate[]>(Prisma.sql`
        SELECT a.id, a."userId", a.stage, a."updatedAt"
        FROM applications a
        LEFT JOIN LATERAL (
          SELECT t."changedAt"
          FROM application_stage_transitions t
          WHERE t."applicationId" = a.id AND t."toStage" = a.stage
          ORDER BY t."changedAt" DESC, t.id DESC
          LIMIT 1
        ) latest ON TRUE
        WHERE a.stage <> 'CLOSED'::"ApplicationStage"
          AND a.outcome = 'NONE'::"ApplicationOutcome"
          AND COALESCE(latest."changedAt", a."applicationDate"::date::timestamp, a."createdAt") <= ${cutoff}
        ORDER BY COALESCE(latest."changedAt", a."applicationDate"::date::timestamp, a."createdAt") ASC, a.id ASC
        LIMIT ${BATCH_SIZE}
      `);

      let closed = 0;
      for (const candidate of candidates) {
        const didClose = await this.prisma.$transaction(async (tx) => {
          const result = await tx.application.updateMany({
            where: {
              id: candidate.id,
              userId: candidate.userId,
              stage: candidate.stage,
              outcome: ApplicationOutcome.NONE,
              updatedAt: candidate.updatedAt,
            },
            data: {
              stage: ApplicationStage.CLOSED,
              outcome: ApplicationOutcome.NO_RESPONSE,
              closedAt: now,
            },
          });
          if (!result.count) return false;
          await tx.applicationStageTransition.create({
            data: {
              applicationId: candidate.id,
              userId: candidate.userId,
              fromStage: candidate.stage,
              toStage: ApplicationStage.CLOSED,
              outcome: ApplicationOutcome.NO_RESPONSE,
              changedAt: now,
            },
          });
          return true;
        });
        if (didClose) closed += 1;
      }
      if (closed)
        this.logger.log(
          `Automatically closed ${closed} unanswered applications`,
        );
      return closed;
    } catch (error) {
      this.logger.error(
        'Failed to process unanswered applications',
        error instanceof Error ? error.stack : undefined,
      );
      return 0;
    } finally {
      this.running = false;
    }
  }
}
