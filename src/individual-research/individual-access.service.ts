import { Injectable } from '@nestjs/common';
import { Prisma, IndividualAccessOverride } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
export type AccessPermission = 'VIEW' | 'INTERACT';
export type AccessSource =
  'NORMAL' | 'ADMIN' | 'SCHEDULED' | 'EXPIRED' | 'REVOKED' | 'LOCKED';
export const FEATURE_IDS = [
  'analytics',
  'professionalTasks',
  'tableView',
] as const;
export function overrideSource(
  row: Pick<IndividualAccessOverride, 'status' | 'startsAt' | 'endsAt'> & {
    case: { status: string; consentStatus: string; retentionUntil: Date };
  },
  now = new Date(),
): AccessSource {
  if (row.status === 'REVOKED') return 'REVOKED';
  if ((row.endsAt && row.endsAt <= now) || row.case.retentionUntil <= now)
    return 'EXPIRED';
  if (row.case.status !== 'ACTIVE' || row.case.consentStatus !== 'GIVEN')
    return 'LOCKED';
  if (row.startsAt > now) return 'SCHEDULED';
  return row.status === 'ACTIVE' ? 'ADMIN' : 'LOCKED';
}
export function normalWeekView(
  state: {
    currentWeek: number;
    currentNodeCode: string;
    completedNodeCodes: string[];
  },
  week: number,
) {
  const completed = state.completedNodeCodes ?? [];
  if (week === 4)
    return (
      state.currentNodeCode === 'FINAL_REPORT' ||
      completed.includes('FINAL_REPORT')
    );
  return (
    completed.includes(`W${week}_REVIEW`) ||
    state.currentNodeCode === `W${week}_REVIEW` ||
    state.currentWeek > week
  );
}
@Injectable()
export class IndividualAccessService {
  constructor(private readonly prisma: PrismaService) {}
  async grants(
    userId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
    now = new Date(),
  ) {
    return db.individualAccessOverride.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        case: {
          status: 'ACTIVE',
          consentStatus: 'GIVEN',
          retentionUntil: { gt: now },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  async allows(
    userId: string,
    type: string,
    id: string,
    permission: AccessPermission = 'VIEW',
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return (await this.grants(userId, db)).some(
      (g) =>
        g.resourceType === type &&
        g.resourceId === id &&
        (permission === 'VIEW' || g.permission === 'INTERACT'),
    );
  }
  async decisions(
    userId: string,
    resources: {
      resourceType: string;
      resourceId: string;
      normalView: boolean;
      normalInteract?: boolean;
    }[],
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const rows = await db.individualAccessOverride.findMany({
      where: { userId },
      include: {
        case: {
          select: { status: true, consentStatus: true, retentionUntil: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return resources.map((resource) => {
      const same = rows.filter(
        (r) =>
          r.resourceType === resource.resourceType &&
          r.resourceId === resource.resourceId,
      );
      const live = same.filter((r) => overrideSource(r) === 'ADMIN');
      const source: AccessSource = resource.normalView
        ? 'NORMAL'
        : live.length
          ? 'ADMIN'
          : same.length
            ? overrideSource(same[0])
            : 'LOCKED';
      return {
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
        view: resource.normalView || live.length > 0,
        interact:
          Boolean(resource.normalInteract) ||
          live.some((r) => r.permission === 'INTERACT'),
        source,
        // The administrator's free-text reason is private. Never return it to members.
        reason:
          source === 'NORMAL'
            ? 'NORMAL_JOURNEY'
            : source === 'ADMIN'
              ? 'INDIVIDUAL_ADMIN_GRANT'
              : source,
        endsAt: live[0]?.endsAt ?? null,
      };
    });
  }
  async reportAccess(
    userId: string,
    state: {
      currentWeek: number;
      currentNodeCode: string;
      completedNodeCodes: string[];
    },
    normalAnalytics: boolean,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const rows = await this.decisions(
      userId,
      [
        {
          resourceType: 'PERFORMANCE_ANALYTICS',
          resourceId: 'performance',
          normalView: normalAnalytics,
        },
        ...[1, 2, 3, 4].map((week) => ({
          resourceType: 'WEEKLY_REPORT',
          resourceId: String(week),
          normalView: normalAnalytics && normalWeekView(state, week),
        })),
        {
          resourceType: 'FINAL_REPORT',
          resourceId: 'final',
          normalView:
            normalAnalytics &&
            (state.currentNodeCode === 'FINAL_REPORT' ||
              state.completedNodeCodes.includes('FINAL_REPORT')),
        },
      ],
      db,
    );
    if (
      !rows[0].view &&
      (await this.allows(userId, 'FEATURE', 'analytics', 'VIEW', db))
    ) {
      rows[0].view = true;
      rows[0].source = 'ADMIN';
      rows[0].reason = 'INDIVIDUAL_ADMIN_GRANT';
    }
    return { performance: rows[0], weeks: rows.slice(1, 5), final: rows[5] };
  }
}
