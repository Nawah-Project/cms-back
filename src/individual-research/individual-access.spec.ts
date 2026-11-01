import type { PrismaService } from '../prisma/prisma.service';
import {
  IndividualAccessService,
  overrideSource,
  normalWeekView,
} from './individual-access.service';
describe('Individual access never represents journey completion', () => {
  const now = new Date('2026-11-01T12:00:00Z');
  const grant = {
    status: 'ACTIVE',
    startsAt: new Date('2026-11-01T10:00:00Z'),
    endsAt: null,
    case: {
      status: 'ACTIVE',
      consentStatus: 'GIVEN',
      retentionUntil: new Date('2026-12-01'),
    },
  };
  it('requires explicit active consent and time bounds', () => {
    expect(overrideSource(grant, now)).toBe('ADMIN');
    expect(
      overrideSource({ ...grant, startsAt: new Date('2026-11-02') }, now),
    ).toBe('SCHEDULED');
    expect(
      overrideSource(
        { ...grant, endsAt: new Date('2026-11-01T11:00:00Z') },
        now,
      ),
    ).toBe('EXPIRED');
    expect(overrideSource({ ...grant, status: 'REVOKED' }, now)).toBe(
      'REVOKED',
    );
    for (const status of ['DRAFT', 'PAUSED', 'COMPLETED'])
      expect(
        overrideSource({ ...grant, case: { ...grant.case, status } }, now),
      ).toBe('LOCKED');
    expect(
      overrideSource(
        { ...grant, case: { ...grant.case, consentStatus: 'WITHDRAWN' } },
        now,
      ),
    ).toBe('LOCKED');
  });
  it('preserves ordinary weekly access without granting completions', () => {
    const state = {
      currentWeek: 0,
      currentNodeCode: 'TASK_0',
      completedNodeCodes: [],
    };
    expect([1, 2, 3, 4].map((w) => normalWeekView(state, w))).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(
      normalWeekView(
        { ...state, currentNodeCode: 'W2_REVIEW', currentWeek: 2 },
        2,
      ),
    ).toBe(true);
    expect(
      normalWeekView(
        { ...state, currentNodeCode: 'FINAL_REPORT', currentWeek: 4 },
        4,
      ),
    ).toBe(true);
    expect(state.completedNodeCodes).toEqual([]);
  });
  it('preserves normal access after revocation and never returns the private grant reason to the member', async () => {
    const row = {
      ...grant,
      startsAt: new Date(Date.now() - 1000),
      case: { ...grant.case, retentionUntil: new Date(Date.now() + 86400000) },
      resourceType: 'WEEKLY_REPORT',
      resourceId: '2',
      permission: 'VIEW',
      reason: 'PRIVATE RESEARCH REASON',
    };
    const findMany = jest.fn().mockResolvedValue([row]);
    const service = new IndividualAccessService({
      individualAccessOverride: { findMany },
    } as unknown as PrismaService);
    const resources = [
      { resourceType: 'WEEKLY_REPORT', resourceId: '2', normalView: false },
    ];
    const granted = await service.decisions('synthetic-member', resources);
    expect(granted[0]).toMatchObject({
      source: 'ADMIN',
      view: true,
      interact: false,
      reason: 'INDIVIDUAL_ADMIN_GRANT',
    });
    expect(JSON.stringify(granted)).not.toContain(row.reason);
    findMany.mockResolvedValue([{ ...row, status: 'REVOKED' }]);
    const natural = await service.decisions('synthetic-member', [
      { ...resources[0], normalView: true },
    ]);
    expect(natural[0]).toMatchObject({
      source: 'NORMAL',
      view: true,
      reason: 'NORMAL_JOURNEY',
    });
  });
});
