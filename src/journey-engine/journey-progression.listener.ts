import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ApplicationStage } from '@prisma/client';
import { JourneyEngineService } from './journey-engine.service';

export interface ApplicationEventPayload {
  userId: string;
  applicationId?: string;
  stage?: ApplicationStage | string;
  hasAssignment?: boolean;
  isTailored?: boolean;
  journeyWeek?: number;
}

export interface SideTaskEventPayload {
  userId: string;
  submissionId?: string;
  nodeCode?: string;
  journeyWeek?: number;
  type?: string;
}

@Injectable()
export class JourneyProgressionListener {
  constructor(private readonly journeyEngine: JourneyEngineService) {}

  @OnEvent('application.created')
  async handleApplicationCreated(
    payload: ApplicationEventPayload,
  ): Promise<void> {
    if (!payload?.userId) return;

    if (
      payload.stage === ApplicationStage.INTERVIEW ||
      payload.hasAssignment === true
    ) {
      await this.journeyEngine.unlockAdvancedInterviewPrepIfNeeded(
        payload.userId,
      );
    }

    await this.journeyEngine.evaluateProgress(payload.userId);
  }

  @OnEvent('application.updated')
  async handleApplicationUpdated(
    payload: ApplicationEventPayload,
  ): Promise<void> {
    if (!payload?.userId) return;

    if (
      payload.stage === ApplicationStage.INTERVIEW ||
      payload.hasAssignment === true
    ) {
      await this.journeyEngine.unlockAdvancedInterviewPrepIfNeeded(
        payload.userId,
      );
    }

    await this.journeyEngine.evaluateProgress(payload.userId);
  }

  @OnEvent('sidetask.submitted')
  async handleSideTaskSubmitted(payload: SideTaskEventPayload): Promise<void> {
    if (!payload?.userId) return;
    await this.journeyEngine.evaluateProgress(payload.userId);
  }
}

