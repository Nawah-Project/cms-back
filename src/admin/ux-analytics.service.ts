import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  SUPPORTED_UX_EVENTS,
  SupportedUxEvent,
  TrackUxEventDto,
} from './dto/track-ux-event.dto';

export interface StoredUxEvent {
  id: string;
  userId: string;
  name: SupportedUxEvent;
  variant?: 'A' | 'B';
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface UxAnalyticsReport {
  totalsByEvent: Record<SupportedUxEvent, number>;
  uniqueUsersByEvent: Record<SupportedUxEvent, number>;
  abTestSummary: {
    A: {
      usersCount: number;
      interactionsCount: number;
      eventsCount: number;
    };
    B: {
      usersCount: number;
      interactionsCount: number;
      eventsCount: number;
    };
  };
  totalEventsRecorded: number;
  bufferedEventsCount: number;
}

const MAX_STORED_EVENTS = 2000;
const INTERACTION_EVENTS: readonly SupportedUxEvent[] = [
  'application_created',
  'task_status_changed',
  'feedback_read',
];

@Injectable()
export class UxAnalyticsService {
  private readonly events: StoredUxEvent[] = [];
  private readonly totals: Record<SupportedUxEvent, number> = {
    onboarding_started: 0,
    onboarding_video_watched: 0,
    onboarding_completed: 0,
    application_created: 0,
    application_stage_updated: 0,
    task_status_changed: 0,
    feedback_read: 0,
  };
  private readonly usersByEvent = new Map<SupportedUxEvent, Set<string>>();
  private readonly variantUsers = {
    A: new Set<string>(),
    B: new Set<string>(),
  };
  private readonly variantInteractions = {
    A: 0,
    B: 0,
  };
  private readonly variantTotalEvents = {
    A: 0,
    B: 0,
  };

  constructor() {
    this.initUsersByEvent();
  }

  private initUsersByEvent(): void {
    for (const eventName of SUPPORTED_UX_EVENTS) {
      this.usersByEvent.set(eventName, new Set<string>());
    }
  }

  recordEvent(userId: string, dto: TrackUxEventDto): StoredUxEvent {
    const event: StoredUxEvent = {
      id: randomUUID(),
      userId,
      name: dto.name,
      variant: dto.variant,
      metadata: dto.metadata,
      timestamp: new Date().toISOString(),
    };

    if (this.events.length >= MAX_STORED_EVENTS) {
      this.events.shift();
    }
    this.events.push(event);

    // Totals by event
    this.totals[dto.name] = (this.totals[dto.name] ?? 0) + 1;

    // Unique users by event
    let userSet = this.usersByEvent.get(dto.name);
    if (!userSet) {
      userSet = new Set<string>();
      this.usersByEvent.set(dto.name, userSet);
    }
    userSet.add(userId);

    // A/B test tracking
    if (dto.variant === 'A' || dto.variant === 'B') {
      const v = dto.variant;
      this.variantUsers[v].add(userId);
      this.variantTotalEvents[v] += 1;
      if (INTERACTION_EVENTS.includes(dto.name)) {
        this.variantInteractions[v] += 1;
      }
    }

    return event;
  }

  getAnalytics(): UxAnalyticsReport {
    const totalsByEvent = { ...this.totals };
    const uniqueUsersByEvent: Record<string, number> = {};
    for (const eventName of SUPPORTED_UX_EVENTS) {
      uniqueUsersByEvent[eventName] =
        this.usersByEvent.get(eventName)?.size ?? 0;
    }

    return {
      totalsByEvent: totalsByEvent,
      uniqueUsersByEvent: uniqueUsersByEvent,
      abTestSummary: {
        A: {
          usersCount: this.variantUsers.A.size,
          interactionsCount: this.variantInteractions.A,
          eventsCount: this.variantTotalEvents.A,
        },
        B: {
          usersCount: this.variantUsers.B.size,
          interactionsCount: this.variantInteractions.B,
          eventsCount: this.variantTotalEvents.B,
        },
      },
      totalEventsRecorded: Object.values(this.totals).reduce(
        (acc, val) => acc + val,
        0,
      ),
      bufferedEventsCount: this.events.length,
    };
  }

  reset(): void {
    this.events.length = 0;
    for (const eventName of SUPPORTED_UX_EVENTS) {
      this.totals[eventName] = 0;
    }
    this.initUsersByEvent();
    this.variantUsers.A.clear();
    this.variantUsers.B.clear();
    this.variantInteractions.A = 0;
    this.variantInteractions.B = 0;
    this.variantTotalEvents.A = 0;
    this.variantTotalEvents.B = 0;
  }
}
