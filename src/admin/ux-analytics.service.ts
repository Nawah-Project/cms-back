import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
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
export class UxAnalyticsService implements OnModuleInit {
  private readonly events: StoredUxEvent[] = [];
  private readonly totals: Record<SupportedUxEvent, number> = {
    onboarding_started: 0,
    onboarding_video_watched: 0,
    onboarding_completed: 0,
    application_created: 0,
    application_stage_updated: 0,
    task_status_changed: 0,
    feedback_read: 0,
    tour_completed: 0,
    job_explorer_clicked: 0,
    prompt_copied: 0,
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

  constructor(@Optional() private readonly prisma?: PrismaService) {
    this.initUsersByEvent();
    this.loadPersistedConfig();
  }

  async onModuleInit(): Promise<void> {
    await this.hydrateFromDomainEventLogs();
  }

  async hydrateFromDomainEventLogs(): Promise<void> {
    if (!this.prisma?.domainEventLog?.findMany) return;
    try {
      const logs = await this.prisma.domainEventLog.findMany({
        where: { entityType: 'ux_analytics' },
        orderBy: { createdAt: 'asc' },
        take: MAX_STORED_EVENTS,
      });

      for (const log of logs) {
        const payload = (log.payload ?? {}) as Record<string, unknown>;
        const rawName =
          typeof payload.name === 'string'
            ? payload.name
            : log.eventName.replace(/^ux\./, '');
        if (!SUPPORTED_UX_EVENTS.includes(rawName as SupportedUxEvent)) {
          continue;
        }
        const eventName = rawName as SupportedUxEvent;
        const userId =
          log.actorId ||
          (typeof payload.userId === 'string' ? payload.userId : 'anonymous');
        const variant = isExperimentVariant(payload.variant)
          ? payload.variant
          : undefined;
        const timestamp =
          typeof payload.timestamp === 'string'
            ? payload.timestamp
            : log.createdAt.toISOString();

        this.applyEventToMemory({
          id: log.entityId || log.id,
          userId,
          name: eventName,
          variant,
          metadata:
            payload.metadata && typeof payload.metadata === 'object'
              ? (payload.metadata as Record<string, any>)
              : undefined,
          timestamp,
        });
      }
    } catch {
      // Allow startup when database is not yet migrated or reachable
    }
  }

  private applyEventToMemory(event: StoredUxEvent): void {
    if (this.events.some((existing) => existing.id === event.id)) return;
    if (this.events.length >= MAX_STORED_EVENTS) this.events.shift();
    this.events.push(event);
    this.totals[event.name] = (this.totals[event.name] ?? 0) + 1;

    this.usersByEvent.get(event.name)?.add(event.userId);

    if (isExperimentVariant(event.variant)) {
      this.variantUsers[event.variant].add(event.userId);
      this.variantTotalEvents[event.variant] += 1;
      if (INTERACTION_EVENTS.includes(event.name)) {
        this.variantInteractions[event.variant] += 1;
      }
    }
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

    this.applyEventToMemory(event);

    if (this.prisma?.domainEventLog?.create) {
      void this.prisma.domainEventLog
        .create({
          data: {
            eventName: `ux.${dto.name}`,
            actorId: userId,
            entityType: 'ux_analytics',
            entityId: event.id,
            payload: {
              userId,
              name: dto.name,
              variant: dto.variant ?? null,
              metadata: dto.metadata ?? null,
              timestamp: event.timestamp,
            } as Prisma.InputJsonValue,
          },
        })
        .catch(() => {
          // Ignore persistence errors in non-DB or read-only test contexts
        });
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
