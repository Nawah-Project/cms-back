import {
  INACTIVITY_CRITICAL_DAYS,
  INACTIVITY_WARNING_DAYS,
} from './admin.constants';

export type ActivityStatus = 'ACTIVE' | 'WARNING' | 'CRITICAL' | 'NEVER_ACTIVE';

export interface ActivityState {
  inactivityDays: number | null;
  activityStatus: ActivityStatus;
}

export function getActivityState(
  lastActivityAt: Date | null,
  now = new Date(),
): ActivityState {
  if (!lastActivityAt) {
    return { inactivityDays: null, activityStatus: 'NEVER_ACTIVE' };
  }
  const inactivityDays = Math.max(
    0,
    Math.floor((now.getTime() - lastActivityAt.getTime()) / 86_400_000),
  );
  return {
    inactivityDays,
    activityStatus:
      inactivityDays >= INACTIVITY_CRITICAL_DAYS
        ? 'CRITICAL'
        : inactivityDays >= INACTIVITY_WARNING_DAYS
          ? 'WARNING'
          : 'ACTIVE',
  };
}
