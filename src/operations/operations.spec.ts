import { EventEmitter } from 'node:events';
import {
  mailQuotaAlerts,
  LATENCY_BUCKETS,
  percentileUpper,
  cpuCounters,
  metric,
  cairoDay,
  severity,
} from './operations.model';
import { OperationsCollectorService } from './operations-collector.service';
import { OPS_DEFAULTS } from './operations.model';
import {
  OperationsPolicyService,
  RegistrationClosedException,
} from './operations-policy.service';
const buckets = (values: number[]) => {
  const b = LATENCY_BUCKETS.map(() => 0);
  for (const v of values) b[LATENCY_BUCKETS.findIndex((x) => v <= x)]++;
  return b;
};
describe('Operational decision measurements', () => {
  test('mail exhaustion is a critical operating signal and old failures are not current alerts', () => {
    const alerts = mailQuotaAlerts({
      daily: { percentUsed: 99 },
      monthly: { percentUsed: 82 },
      recentLogs: [
        {
          status: 'FAILED',
          createdAt: new Date(Date.now() - 7200000).toISOString(),
        },
      ],
    });
    expect(alerts.map((a) => [a.key, a.severity])).toEqual([
      ['mailDaily', 'CRITICAL'],
      ['mailMonthly', 'WARNING'],
    ]);
  });
  test('P95 merges observations rather than averaging percentile values', () => {
    const a = buckets(Array(100).fill(10)),
      b = buckets([9000]);
    expect(percentileUpper(a.map((v, i) => v + b[i]))).toBe(10);
    expect(percentileUpper(b)).toBe(10000);
    expect(percentileUpper(buckets([]))).toBeNull();
  });
  test('CPU accounting excludes overlapping guest counters and parses exact metric labels', () => {
    expect(
      cpuCounters(
        'node_cpu_seconds_total{cpu="0",mode="idle"} 80\nnode_cpu_seconds_total{cpu="0",mode="user"} 20\nnode_cpu_seconds_total{cpu="0",mode="guest"} 5',
      ),
    ).toEqual({ total: 100, idle: 80 });
    expect(
      metric(
        'node_network_transmit_bytes_total{device="eno10"} 9\nnode_network_transmit_bytes_total{device="eno1"} 3',
        'node_network_transmit_bytes_total',
        { device: 'eno1' },
      ),
    ).toBe(3);
    expect(severity(null, 70, 85)).toBe('UNKNOWN');
  });
  test('calendar day is Cairo rather than host UTC', () =>
    expect(cairoDay('2026-10-27T22:30:00Z')).toBe('2026-10-28'));
  test('middleware records finish status once, real bytes, and one account across tabs', () => {
    const collector = new OperationsCollectorService({} as any, {} as any),
      middleware = collector.middleware();
    for (let i = 0; i < 2; i++) {
      const response: any = new EventEmitter();
      response.statusCode = 200;
      response.writableFinished = true;
      response.write = () => true;
      response.end = () => response;
      middleware(
        {
          path: '/applications',
          method: 'GET',
          route: { path: '/applications' },
          user: { id: 'user', role: 'USER' },
        } as any,
        response,
        () => {},
      );
      response.write(Buffer.from('abc'));
      response.end('de');
      response.emit('finish');
      response.emit('close');
    }
    expect((collector as any).counters.requests).toBe(2);
    expect((collector as any).counters.bytesOut).toBe(10);
    expect((collector as any).users.size).toBe(1);
    expect((collector as any).inFlight).toBe(0);
  });
  test('passive polling and admin requests do not inflate active-member counts', () => {
    const collector = new OperationsCollectorService({} as any, {} as any),
      middleware = collector.middleware();
    for (const [path, role] of [
      ['/notifications', 'USER'],
      ['/auth/me', 'USER'],
      ['/applications', 'ADMIN'],
    ]) {
      const r: any = new EventEmitter();
      r.statusCode = 200;
      r.write = () => true;
      r.end = () => r;
      r.writableFinished = true;
      middleware(
        { path, method: 'GET', user: { id: path, role } } as any,
        r,
        () => {},
      );
      r.emit('finish');
    }
    expect((collector as any).users.size).toBe(0);
  });
  test('500s and 429s are separate; 5xx is not a successful-latency observation', () => {
    const c = new OperationsCollectorService({} as any, {} as any);
    for (const statusCode of [500, 429]) {
      const r: any = new EventEmitter();
      r.statusCode = statusCode;
      r.write = () => true;
      r.end = () => r;
      r.writableFinished = true;
      c.middleware()(
        { path: '/applications', method: 'GET' } as any,
        r,
        () => {},
      );
      r.emit('finish');
    }
    expect((c as any).counters.errors).toBe(1);
    expect((c as any).counters.rateLimited).toBe(1);
    expect(percentileUpper((c as any).counters.buckets)).toBeNull();
  });
  test('browser timings exclude admins, bound per-account ingestion and do not retain URLs', () => {
    const c = new OperationsCollectorService({} as any, {} as any);
    expect(c.browserTimings('admin', 'ADMIN', [30]).accepted).toBe(0);
    for (let i = 0; i < 4; i++)
      c.browserTimings('member', 'USER', Array(20).fill(500));
    expect(
      (c as any).clientBuckets.reduce((a: number, b: number) => a + b, 0),
    ).toBe(60);
  });
  test('paused and capped registration gate only creation, with OPEN default preserved', async () => {
    const db: any = {
      operationsSettings: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { count: jest.fn().mockResolvedValue(200) },
    };
    const p = new OperationsPolicyService(db);
    await expect(p.assertRegistration()).resolves.toBeUndefined();
    db.operationsSettings.findUnique.mockResolvedValue({
      value: { ...OPS_DEFAULTS, admissionMode: 'PAUSED' },
    });
    await expect(p.assertRegistration()).rejects.toBeInstanceOf(
      RegistrationClosedException,
    );
    db.operationsSettings.findUnique.mockResolvedValue({
      value: { ...OPS_DEFAULTS, admissionMode: 'LIMITED', maxMembers: 200 },
    });
    await expect(p.assertRegistration()).rejects.toBeInstanceOf(
      RegistrationClosedException,
    );
    db.user.count.mockResolvedValue(199);
    await expect(p.assertRegistration()).resolves.toBeUndefined();
  });
  test('sampling failure cannot crash the API', async () => {
    const c = new OperationsCollectorService(
      {} as any,
      { storage: () => Promise.reject(Error('disk unavailable')) } as any,
    );
    await expect(c.collect()).resolves.toBeUndefined();
    expect((c as any).busy).toBe(false);
  });
});
