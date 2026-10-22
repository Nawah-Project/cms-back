import { Injectable, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { domainEventsTotal } from './metrics.registry';

@Injectable()
export class DomainEventAuditListener {
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  private resolveEventName(
    payload: Record<string, unknown> | undefined,
    explicitEventName?: string,
  ): string {
    if (explicitEventName && typeof explicitEventName === 'string') {
      return explicitEventName;
    }
    if (typeof payload?.eventName === 'string' && payload.eventName.trim()) {
      return payload.eventName.trim();
    }
    if (payload?.completedNodeCode) return 'journey.node_completed';
    if (payload?.insightCode === 'INSIGHT_INTERVIEW_ADVANCED') {
      return 'journey.adv_prep_unlocked';
    }
    if (payload?.submissionId) return 'sidetask.submitted';
    if (payload?.fromStage && payload?.toStage) {
      return 'application.stage_changed';
    }
    if (payload?.applicationId && payload?.journeyWeek !== undefined) {
      return 'application.created';
    }
    if (payload?.applicationId) return 'application.updated';
    if (payload?.uxEventName) return `ux.${String(payload.uxEventName)}`;
    return 'domain.event';
  }

  private resolveEntityType(
    eventName: string,
    payload: Record<string, unknown> | undefined,
  ): string {
    if (typeof payload?.entityType === 'string' && payload.entityType.trim()) {
      return payload.entityType.trim();
    }
    const prefix = eventName.split('.')[0];
    return prefix || 'unknown';
  }

  private resolveEntityId(
    payload: Record<string, unknown> | undefined,
  ): string | null {
    const candidate =
      payload?.entityId ??
      payload?.applicationId ??
      payload?.submissionId ??
      payload?.completedNodeCode ??
      null;
    return typeof candidate === 'string' ? candidate : null;
  }

  @OnEvent('**')
  async handleDomainEvent(
    payload?: Record<string, unknown>,
    explicitEventName?: string,
  ): Promise<void> {
    const eventName = this.resolveEventName(payload, explicitEventName);
    domainEventsTotal.labels({ event_name: eventName }).inc();

    if (!this.prisma?.domainEventLog?.create) return;

    const actorId =
      typeof payload?.actorId === 'string'
        ? payload.actorId
        : typeof payload?.userId === 'string'
          ? payload.userId
          : null;
    const targetUserId =
      typeof payload?.targetUserId === 'string' ? payload.targetUserId : null;
    const groupId =
      typeof payload?.groupId === 'string' ? payload.groupId : null;
    const entityType = this.resolveEntityType(eventName, payload);
    const entityId = this.resolveEntityId(payload);

    try {
      await this.prisma.domainEventLog.create({
        data: {
          eventName,
          actorId,
          targetUserId,
          groupId,
          entityType,
          entityId,
          payload: (payload ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch {
      // Prevent audit log write failure from interrupting request flow
    }
  }
}

