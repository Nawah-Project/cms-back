import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  ExperimentVariant,
  SUPPORTED_UX_EVENTS,
  SupportedUxEvent,
  TrackUxEventDto,
  UpdateUxConfigDto,
} from './dto/track-ux-event.dto';

export interface StoredUxEvent {
  id: string;
  userId: string;
  name: SupportedUxEvent;
  variant?: ExperimentVariant;
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface UxConfigState {
  defaultVariant: ExperimentVariant;
  groupVariants: Record<string, ExperimentVariant>;
  introVideoUrl: string;
}

export interface VariantMetrics {
  usersCount: number;
  interactionsCount: number;
  eventsCount: number;
}

export interface UxAnalyticsReport {
  totalsByEvent: Record<SupportedUxEvent, number>;
  uniqueUsersByEvent: Record<SupportedUxEvent, number>;
  abTestSummary: Record<ExperimentVariant, VariantMetrics>;
  config: UxConfigState;
  totalEventsRecorded: number;
  bufferedEventsCount: number;
}

const MAX_STORED_EVENTS = 2000;
const INTERACTION_EVENTS: readonly SupportedUxEvent[] = [
  'application_created',
  'task_status_changed',
  'feedback_read',
];
// In Docker, CV_STORAGE_DIR is a persistent writable volume owned by the
// runtime user. For local development, keep the config alongside the app.
const CONFIG_FILE_PATH =
  process.env.UX_CONFIG_FILE?.trim() ||
  join(process.env.CV_STORAGE_DIR?.trim() || process.cwd(), '.ux-config.json');

function isExperimentVariant(value: unknown): value is ExperimentVariant {
  return value === 'A' || value === 'B' || value === 'C';
}

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
  private readonly variantUsers: Record<ExperimentVariant, Set<string>> = {
    A: new Set<string>(),
    B: new Set<string>(),
    C: new Set<string>(),
  };
  private readonly variantInteractions: Record<ExperimentVariant, number> = {
    A: 0,
    B: 0,
    C: 0,
  };
  private readonly variantTotalEvents: Record<ExperimentVariant, number> = {
    A: 0,
    B: 0,
    C: 0,
  };

  private config: UxConfigState = {
    defaultVariant: 'B',
    groupVariants: {},
    introVideoUrl: process.env.INTRO_VIDEO_URL?.trim() || '',
  };

  constructor() {
    this.initUsersByEvent();
    this.loadPersistedConfig();
  }

  private initUsersByEvent(): void {
    for (const eventName of SUPPORTED_UX_EVENTS) {
      this.usersByEvent.set(eventName, new Set<string>());
    }
  }

  private loadPersistedConfig(): void {
    try {
      const parsed: unknown = JSON.parse(readFileSync(CONFIG_FILE_PATH, 'utf8'));
      if (!parsed || typeof parsed !== 'object') return;

      const stored = parsed as Partial<UxConfigState>;
      if (isExperimentVariant(stored.defaultVariant)) {
        this.config.defaultVariant = stored.defaultVariant;
      }
      if (
        stored.groupVariants &&
        typeof stored.groupVariants === 'object' &&
        !Array.isArray(stored.groupVariants)
      ) {
        const cleanMap: Record<string, ExperimentVariant> = {};
        for (const [groupId, variant] of Object.entries(stored.groupVariants)) {
          if (isExperimentVariant(variant)) cleanMap[groupId] = variant;
        }
        this.config.groupVariants = cleanMap;
      }
      if (typeof stored.introVideoUrl === 'string') {
        this.config.introVideoUrl = stored.introVideoUrl.trim();
      }
    } catch {
      // File does not exist yet or is not readable; use in-memory defaults.
    }
  }

  private savePersistedConfig(): void {
    const temporaryPath = `${CONFIG_FILE_PATH}.tmp`;
    try {
      mkdirSync(dirname(CONFIG_FILE_PATH), { recursive: true });
      writeFileSync(temporaryPath, JSON.stringify(this.config, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });
      renameSync(temporaryPath, CONFIG_FILE_PATH);
    } catch {
      // Ignore write errors in read-only environments; the in-memory config remains active.
    }
  }

  getConfig(): UxConfigState {
    return {
      defaultVariant: this.config.defaultVariant,
      groupVariants: { ...this.config.groupVariants },
      introVideoUrl: this.config.introVideoUrl,
    };
  }

  getVariantForGroup(groupId?: string | null): ExperimentVariant {
    if (groupId && this.config.groupVariants[groupId]) {
      return this.config.groupVariants[groupId];
    }
    return this.config.defaultVariant;
  }

  updateConfig(dto: UpdateUxConfigDto): UxConfigState {
    if (isExperimentVariant(dto.defaultVariant)) {
      this.config.defaultVariant = dto.defaultVariant;
    }
    if (
      dto.groupVariants &&
      typeof dto.groupVariants === 'object' &&
      !Array.isArray(dto.groupVariants)
    ) {
      const nextMap = { ...this.config.groupVariants };
      for (const [groupId, variant] of Object.entries(dto.groupVariants)) {
        if (groupId && isExperimentVariant(variant)) nextMap[groupId] = variant;
      }
      this.config.groupVariants = nextMap;
    }
    if (typeof dto.introVideoUrl === 'string') {
      this.config.introVideoUrl = dto.introVideoUrl.trim();
    }
    this.savePersistedConfig();
    return this.getConfig();
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

    if (this.events.length >= MAX_STORED_EVENTS) this.events.shift();
    this.events.push(event);
    this.totals[dto.name] = (this.totals[dto.name] ?? 0) + 1;

    this.usersByEvent.get(dto.name)?.add(userId);

    if (isExperimentVariant(dto.variant)) {
      this.variantUsers[dto.variant].add(userId);
      this.variantTotalEvents[dto.variant] += 1;
      if (INTERACTION_EVENTS.includes(dto.name)) {
        this.variantInteractions[dto.variant] += 1;
      }
    }

    return event;
  }

  getAnalytics(): UxAnalyticsReport {
    const uniqueUsersByEvent = {} as Record<SupportedUxEvent, number>;
    for (const eventName of SUPPORTED_UX_EVENTS) {
      uniqueUsersByEvent[eventName] =
        this.usersByEvent.get(eventName)?.size ?? 0;
    }

    const toVariantMetrics = (variant: ExperimentVariant): VariantMetrics => ({
      usersCount: this.variantUsers[variant].size,
      interactionsCount: this.variantInteractions[variant],
      eventsCount: this.variantTotalEvents[variant],
    });

    return {
      totalsByEvent: { ...this.totals },
      uniqueUsersByEvent,
      abTestSummary: {
        A: toVariantMetrics('A'),
        B: toVariantMetrics('B'),
        C: toVariantMetrics('C'),
      },
      config: this.getConfig(),
      totalEventsRecorded: Object.values(this.totals).reduce(
        (total, value) => total + value,
        0,
      ),
      bufferedEventsCount: this.events.length,
    };
  }

  reset(): void {
    this.events.length = 0;
    for (const eventName of SUPPORTED_UX_EVENTS) this.totals[eventName] = 0;
    this.initUsersByEvent();
    for (const variant of ['A', 'B', 'C'] as const) {
      this.variantUsers[variant].clear();
      this.variantInteractions[variant] = 0;
      this.variantTotalEvents[variant] = 0;
    }
  }
}
