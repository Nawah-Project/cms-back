import { getActivityState } from './activity-status.util';

describe('getActivityState', () => {
  const now = new Date('2026-09-26T12:00:00.000Z');

  it('marks less than three days as active', () => {
    expect(getActivityState(new Date('2026-09-24T12:00:01.000Z'), now)).toEqual(
      {
        inactivityDays: 1,
        activityStatus: 'ACTIVE',
      },
    );
    expect(
      getActivityState(new Date('2026-09-23T12:00:00.000Z'), now)
        .activityStatus,
    ).toBe('WARNING');
  });

  it('marks three through six days as warning and seven or more as critical', () => {
    expect(getActivityState(new Date('2026-09-23T12:00:00.000Z'), now)).toEqual(
      {
        inactivityDays: 3,
        activityStatus: 'WARNING',
      },
    );
    expect(getActivityState(new Date('2026-09-19T12:00:00.000Z'), now)).toEqual(
      {
        inactivityDays: 7,
        activityStatus: 'CRITICAL',
      },
    );
  });

  it('handles a user without meaningful activity', () => {
    expect(getActivityState(null, now)).toEqual({
      inactivityDays: null,
      activityStatus: 'NEVER_ACTIVE',
    });
  });
});
