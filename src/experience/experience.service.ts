import { BadRequestException, Injectable } from '@nestjs/common';
import { ExperienceProgressStatus, UserExperienceProgress } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

// These identify the meaning of a guide, not the current application release.
// A deployment or a visual experiment must never change these identifiers.
export const EXPERIENCE_FLOWS = [
  'first-application-v1', 'cv-filter-week1-v1', 'explorer-intro-week1-v1',
  'explorer-filters-week1-v1', 'groups-week1-v1', 'analytics-week1-v1',
  'analytics-unlocked-v1', 'journey-coachmark-v1', 'journey-continue-v1',
] as const;

@Injectable()
export class ExperienceService {
  constructor(private readonly prisma: PrismaService) {}

  async getProgress(userId: string) {
    let items = await this.prisma.userExperienceProgress.findMany({ where: { userId } });
    if (!items.some(item => item.flowKey === 'first-application-v1')) {
      // The previous release persisted the completed mandatory guide as telemetry.
      // Import that evidence across devices; application counts are NOT evidence.
      const completed = await this.prisma.domainEventLog.findFirst({
        where: { actorId: userId, entityType: 'ux_analytics', eventName: 'ux.tour_completed' },
        select: { id: true },
      });
      if (completed) {
        await this.saveProgress(userId, 'first-application-v1', 'COMPLETED', 7);
        items = await this.prisma.userExperienceProgress.findMany({ where: { userId } });
      }
    }
    return { items };
  }

  async saveProgress(userId: string, flowKey: string, status: ExperienceProgressStatus, currentStep: number) {
    if (!(EXPERIENCE_FLOWS as readonly string[]).includes(flowKey)) throw new BadRequestException('Unknown experience guide');
    if (flowKey === 'first-application-v1' && currentStep > 7) throw new BadRequestException('Invalid mandatory guide step');
    if (flowKey === 'first-application-v1' && status === 'SKIPPED') throw new BadRequestException('The required guide cannot be skipped');
    // Atomic monotonic upsert: a late tab/retry cannot rewind a completed/skipped
    // guide, replace its original outcome, or reduce its saved step.
    const rows = await this.prisma.$queryRaw<UserExperienceProgress[]>`
      INSERT INTO user_experience_progress
        (id, user_id, flow_key, status, current_step, started_at, finished_at, updated_at)
      VALUES (${randomUUID()}::uuid, ${userId}::uuid, ${flowKey}, ${status}::"ExperienceProgressStatus", ${currentStep}, NOW(),
        CASE WHEN ${status} = 'IN_PROGRESS' THEN NULL ELSE NOW() END, NOW())
      ON CONFLICT (user_id, flow_key) DO UPDATE SET
        status = CASE WHEN user_experience_progress.status IN ('COMPLETED','SKIPPED')
          THEN user_experience_progress.status ELSE EXCLUDED.status END,
        current_step = CASE WHEN user_experience_progress.status IN ('COMPLETED','SKIPPED')
          THEN user_experience_progress.current_step ELSE GREATEST(user_experience_progress.current_step, EXCLUDED.current_step) END,
        finished_at = COALESCE(user_experience_progress.finished_at, EXCLUDED.finished_at),
        updated_at = NOW()
      RETURNING id, user_id AS "userId", flow_key AS "flowKey", status,
        current_step AS "currentStep", started_at AS "startedAt", finished_at AS "finishedAt", updated_at AS "updatedAt"
    `;
    const saved = rows[0];
    if (flowKey === 'first-application-v1' && status === 'IN_PROGRESS' && saved.status === 'IN_PROGRESS') {
      // A legacy Task 0 state may predate the required walkthrough and include
      // historical submissions. Start its new work window once, at this guide's
      // durable start. Never rewind a completed task, an advanced account, or a
      // guide completed in another tab. Existing applications remain untouched.
      await this.prisma.userJourneyState.updateMany({
        where: { userId, currentWeek: 0, currentNodeCode: 'TASK_0',
          currentNodeStartedAt: { lt: saved.startedAt },
          NOT: { completedNodeCodes: { has: 'TASK_0' } } },
        data: { currentNodeStartedAt: saved.startedAt, weekStartedAt: saved.startedAt },
      });
    }
    if (flowKey === 'first-application-v1' && status === 'COMPLETED' && saved.status === 'COMPLETED') {
      // The required guide already teaches these entry points. Apply the same
      // implication when importing an old completion, including on another device.
      await Promise.all(['explorer-intro-week1-v1', 'explorer-filters-week1-v1', 'journey-coachmark-v1']
        .map(key => this.saveProgress(userId, key, 'COMPLETED', 0)));
    }
    return saved;
  }
}
