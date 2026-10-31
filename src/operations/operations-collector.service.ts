import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response, NextFunction } from 'express';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RESEARCH_QA_ID } from '../members/organized-entry';
import {
  normalizedRoute,
  normalizedMethod,
} from '../observability/metrics.registry';
import { OperationsPolicyService } from './operations-policy.service';
import {
  LATENCY_BUCKETS,
  percentileUpper,
  cpuCounters,
  metric,
  cairoDay,
  severity,
  OpsSettings,
} from './operations.model';
const freshCounters = () => ({
  requests: 0,
  errors: 0,
  clientErrors: 0,
  rateLimited: 0,
  aborted: 0,
  bytesOut: 0,
  buckets: LATENCY_BUCKETS.map(() => 0),
});
export type OpsSample = {
  capturedAt: string;
  startedAt: string;
  windowSeconds: number;
  requests: number;
  errors: number;
  clientErrors: number;
  rateLimited: number;
  aborted: number;
  bytesOut: number;
  buckets: number[];
  clientP95Ms: number | null;
  clientSamples: number;
  clientBuckets: number[];
  activeUsers: number;
  inFlight: number;
  p95Ms: number | null;
  errorPercent: number | null;
  rps: number;
  host: {
    cpu: number | null;
    memory: number | null;
    memoryTotalBytes: number | null;
    memoryAvailableBytes: number | null;
    swapUsedBytes: number | null;
    swapTotalBytes: number | null;
    diskFreeBytes: number | null;
    diskTotalBytes: number | null;
    rootFreeBytes: number | null;
    txMbps: number | null;
    rxMbps: number | null;
    source: string;
    available: boolean;
  };
  storage: {
    bytes: number;
    files: number;
    diskAvailableBytes: number;
    diskTotalBytes: number;
  };
  process: {
    rssBytes: number;
    cpuPercent: number;
    eventLoopP95Ms: number;
    uptimeSeconds: number;
  };
  services: {
    frontend: { available: boolean | null; ms: number | null };
    tunnel: { available: boolean | null; ms: number | null };
  };
  database: {
    available: boolean;
    pingMs: number | null;
    connections: number | null;
    maxConnections: number | null;
    sizeBytes: number | null;
  };
  routes: {
    route: string;
    method: string;
    requests: number;
    errors: number;
    p95Ms: number | null;
  }[];
};
@Injectable()
export class OperationsCollectorService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(OperationsCollectorService.name);
  private clientBuckets = LATENCY_BUCKETS.map(() => 0);
  private browserBudget = new Map<string, { at: number; count: number }>();
  private counters = freshCounters();
  private inFlight = 0;
  private users = new Map<string, number>();
  private routes = new Map<
    string,
    {
      route: string;
      method: string;
      requests: number;
      errors: number;
      buckets: number[];
    }
  >();
  private timer?: NodeJS.Timeout;
  private busy = false;
  private since = Date.now();
  private startedAt = new Date().toISOString();
  private loop = monitorEventLoopDelay({ resolution: 20 });
  private lastProcessCpu = process.cpuUsage();
  private lastProcessAt = Date.now();
  private previousHost: {
    at: number;
    cpu: ReturnType<typeof cpuCounters>;
    tx: number | null;
    rx: number | null;
  } | null = null;
  private latest: OpsSample | null = null;
  private persistenceAt: string | null = null;
  private lastWarning = 0;
  middleware() {
    return (
      req: Request & { user?: { id: string; role?: string } },
      res: Response,
      next: NextFunction,
    ) => {
      const path = req.path;
      if (
        req.method === 'OPTIONS' ||
        /^\/(metrics|health)(\/|$)/.test(path) ||
        path.startsWith('/admin/operations') ||
        path.startsWith('/operations/browser-timings')
      )
        return next();
      const start = performance.now();
      let size = 0,
        finished = false;
      const write = res.write,
        end = res.end;
      const count = (chunk: any, encoding?: any) => {
        if (typeof chunk === 'string')
          size += Buffer.byteLength(
            chunk,
            typeof encoding === 'string' && Buffer.isEncoding(encoding)
              ? encoding
              : 'utf8',
          );
        else if (Buffer.isBuffer(chunk) || ArrayBuffer.isView(chunk))
          size += chunk.byteLength;
      };
      (res as any).write = function (chunk: any, ...args: any[]) {
        count(chunk, args[0]);
        return (write as any).call(this, chunk, ...args);
      };
      (res as any).end = function (chunk: any, ...args: any[]) {
        count(chunk, args[0]);
        return (end as any).call(this, chunk, ...args);
      };
      this.inFlight++;
      const complete = (aborted: boolean) => {
        if (finished) return;
        finished = true;
        this.inFlight = Math.max(0, this.inFlight - 1);
        const status = aborted ? 499 : res.statusCode,
          elapsed = performance.now() - start;
        const c = this.counters;
        c.requests++;
        c.bytesOut += size;
        if (status >= 500) c.errors++;
        if (status >= 400 && status < 500) c.clientErrors++;
        if (status === 429) c.rateLimited++;
        if (aborted) c.aborted++;
        const bucket = LATENCY_BUCKETS.findIndex((v) => elapsed <= v);
        if (status < 400) c.buckets[bucket]++;
        const route = normalizedRoute(req),
          method = normalizedMethod(req.method),
          key = method + ' ' + route;
        if (!this.routes.has(key) && this.routes.size < 150)
          this.routes.set(key, {
            route,
            method,
            requests: 0,
            errors: 0,
            buckets: LATENCY_BUCKETS.map(() => 0),
          });
        const r = this.routes.get(key);
        if (r) {
          r.requests++;
          if (status >= 500) r.errors++;
          if (status < 400) r.buckets[bucket]++;
        }
        const u = req.user;
        const passive =
          /^\/(auth\/(me|refresh)|notifications|ux-analytics|ux-lab\/assignment|experience)(\/|$)/.test(
            path,
          );
        const labEvents = path === '/ux-lab/events';
        const actualEngagement =
          labEvents &&
          Array.isArray(req.body?.events) &&
          req.body.events.some(
            (e: any) => e.name === 'engaged' || e.name === 'view',
          );
        if (
          status < 400 &&
          u?.role === 'USER' &&
          u.id !== RESEARCH_QA_ID &&
          !passive &&
          (!labEvents || actualEngagement)
        ) {
          if (this.users.size < 50000 || this.users.has(u.id))
            this.users.set(u.id, Date.now());
        }
      };
      res.once('finish', () => complete(false));
      res.once('close', () => complete(!res.writableFinished));
      next();
    };
  }
  browserTimings(userId: string, role: string | undefined, timings: number[]) {
    if (role !== 'USER' || userId === RESEARCH_QA_ID) return { accepted: 0 };
    const now = Date.now();
    for (const [id, entry] of this.browserBudget)
      if (entry.at < now - 60000) this.browserBudget.delete(id);
    const budget = this.browserBudget.get(userId) ?? { at: now, count: 0 };
    if (this.browserBudget.size >= 30000 && !this.browserBudget.has(userId))
      return { accepted: 0 };
    const accepted = timings.slice(0, Math.max(0, 60 - budget.count));
    budget.count += accepted.length;
    this.browserBudget.set(userId, budget);
    for (const duration of accepted) {
      const bucket = LATENCY_BUCKETS.findIndex((v) => duration <= v);
      this.clientBuckets[bucket]++;
    }
    return { accepted: accepted.length };
  }
  onApplicationBootstrap() {
    if (process.env.OPS_COLLECTOR_ENABLED === 'false') return;
    this.loop.enable();
    this.timer = setInterval(() => void this.collect(), 30000);
    this.timer.unref();
    setTimeout(() => void this.collect(), 1000).unref();
  }
  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    this.loop.disable();
  }
  private async host(now: number): Promise<OpsSample['host']> {
    const source = process.env.OPS_NODE_EXPORTER_URL,
      device = process.env.OPS_NETWORK_DEVICE;
    const blank = {
      cpu: null,
      memory: null,
      memoryTotalBytes: null,
      memoryAvailableBytes: null,
      swapUsedBytes: null,
      swapTotalBytes: null,
      diskFreeBytes: null,
      diskTotalBytes: null,
      rootFreeBytes: null,
      txMbps: null,
      rxMbps: null,
      source: device ? `node_exporter · ${device}` : 'node_exporter',
      available: false,
    };
    if (!source) return blank;
    try {
      const response = await fetch(source, {
        signal: AbortSignal.timeout(2000),
      });
      if (!response.ok) throw Error('exporter');
      const text = await response.text(),
        cpu = cpuCounters(text),
        mem = metric(text, 'node_memory_MemTotal_bytes'),
        available = metric(text, 'node_memory_MemAvailable_bytes'),
        swapTotal = metric(text, 'node_memory_SwapTotal_bytes'),
        swapFree = metric(text, 'node_memory_SwapFree_bytes');
      const tx = device
          ? metric(text, 'node_network_transmit_bytes_total', { device })
          : null,
        rx = device
          ? metric(text, 'node_network_receive_bytes_total', { device })
          : null;
      const previous = this.previousHost,
        seconds = previous ? (now - previous.at) / 1000 : 0;
      const rate = (v: number | null, p: number | null) =>
        seconds > 0 && v != null && p != null && v >= p
          ? ((v - p) * 8) / seconds / 1e6
          : null;
      const delta = cpu && previous?.cpu ? cpu.total - previous.cpu.total : 0;
      const used =
        delta > 0 && cpu && previous?.cpu
          ? Math.min(
              100,
              Math.max(0, (1 - (cpu.idle - previous.cpu.idle) / delta) * 100),
            )
          : null;
      this.previousHost = { at: now, cpu, tx, rx };
      return {
        ...blank,
        cpu: used,
        memory: mem && available != null ? (1 - available / mem) * 100 : null,
        memoryTotalBytes: mem,
        memoryAvailableBytes: available,
        swapUsedBytes:
          swapTotal != null && swapFree != null ? swapTotal - swapFree : null,
        swapTotalBytes: swapTotal,
        diskFreeBytes: metric(text, 'node_filesystem_avail_bytes', {
          mountpoint: '/data',
        }),
        diskTotalBytes: metric(text, 'node_filesystem_size_bytes', {
          mountpoint: '/data',
        }),
        rootFreeBytes: metric(text, 'node_filesystem_avail_bytes', {
          mountpoint: '/',
        }),
        txMbps: rate(tx, previous?.tx ?? null),
        rxMbps: rate(rx, previous?.rx ?? null),
        available: true,
      };
    } catch {
      this.previousHost = null;
      return blank;
    }
  }
  private async probe(url?: string) {
    if (!url) return { available: null, ms: null };
    const start = performance.now();
    try {
      const r = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      await r.arrayBuffer();
      return { available: r.ok, ms: performance.now() - start };
    } catch {
      return { available: false, ms: null };
    }
  }
  async collect() {
    if (this.busy) return;
    this.busy = true;
    const now = Date.now(),
      seconds = Math.max(0.001, (now - this.since) / 1000),
      c = this.counters,
      routes = [...this.routes.values()];
    this.counters = freshCounters();
    this.routes.clear();
    const clientBuckets = this.clientBuckets;
    this.clientBuckets = LATENCY_BUCKETS.map(() => 0);
    this.since = now;
    for (const [id, time] of this.users)
      if (time < now - 300000) this.users.delete(id);
    try {
      const [host, frontend, tunnel, storage] = await Promise.all([
        this.host(now),
        this.probe(process.env.OPS_FRONTEND_HEALTH_URL),
        this.probe(process.env.OPS_TUNNEL_READY_URL),
        this.policy.storage(),
      ]);
      let database: OpsSample['database'] = {
        available: false,
        pingMs: null,
        connections: null,
        maxConnections: null,
        sizeBytes: null,
      };
      const ping = performance.now();
      try {
        const [db] = await this.prisma.$queryRaw<
          { connections: number; maxConnections: number; sizeBytes: bigint }[]
        >`SELECT (SELECT count(*)::int FROM pg_stat_activity) AS connections,current_setting('max_connections')::int AS "maxConnections",pg_database_size(current_database()) AS "sizeBytes"`;
        database = {
          available: true,
          pingMs: performance.now() - ping,
          connections: db.connections,
          maxConnections: db.maxConnections,
          sizeBytes: Number(db.sizeBytes),
        };
      } catch {}
      const cpu = process.cpuUsage(),
        cpuDelta =
          cpu.user -
          this.lastProcessCpu.user +
          cpu.system -
          this.lastProcessCpu.system,
        wall = now - this.lastProcessAt;
      this.lastProcessCpu = cpu;
      this.lastProcessAt = now;
      const sample: OpsSample = {
        ...c,
        capturedAt: new Date(now).toISOString(),
        startedAt: this.startedAt,
        windowSeconds: seconds,
        clientBuckets,
        clientP95Ms: percentileUpper(clientBuckets),
        clientSamples: clientBuckets.reduce((a, b) => a + b, 0),
        activeUsers: this.users.size,
        inFlight: this.inFlight,
        p95Ms: percentileUpper(c.buckets),
        errorPercent: c.requests ? (c.errors / c.requests) * 100 : null,
        rps: c.requests / seconds,
        host,
        database,
        services: { frontend, tunnel },
        storage,
        process: {
          rssBytes: process.memoryUsage().rss,
          cpuPercent: wall > 0 ? (cpuDelta / (wall * 1000)) * 100 : 0,
          eventLoopP95Ms: Number(this.loop.percentile(95)) / 1e6,
          uptimeSeconds: process.uptime(),
        },
        routes: routes
          .map((r) => ({ ...r, p95Ms: percentileUpper(r.buckets) }))
          .sort((a, b) => (b.p95Ms ?? 0) - (a.p95Ms ?? 0))
          .slice(0, 10),
      };
      this.loop.reset();
      this.latest = sample;
      try {
        await this.prisma.operationsSample.create({
          data: {
            id: randomUUID(),
            capturedAt: new Date(now),
            value: sample as unknown as Prisma.InputJsonValue,
          },
        });
        this.persistenceAt = sample.capturedAt;
        // Retain fourteen days. Monitoring never grows indefinitely.
        await this.prisma.operationsSample.deleteMany({
          where: { capturedAt: { lt: new Date(now - 14 * 86400000) } },
        });
      } catch {
        if (now - this.lastWarning > 300000) {
          this.logger.warn('Operations sample persistence unavailable');
          this.lastWarning = now;
        }
      }
    } catch {
      if (now - this.lastWarning > 300000) {
        this.logger.warn('Operations sampling unavailable');
        this.lastWarning = now;
      }
    } finally {
      this.busy = false;
    }
  }
  private alerts(
    s: OpsSample | null,
    settings: OpsSettings,
    storage: { bytes: number; diskAvailableBytes: number },
  ) {
    const items: {
      key: string;
      severity: string;
      value: number | null;
      warn: number;
      critical: number;
    }[] = [];
    const add = (
      key: string,
      value: number | null | undefined,
      warn: number,
      critical: number,
    ) =>
      items.push({
        key,
        value: value ?? null,
        severity: severity(value, warn, critical),
        warn,
        critical,
      });
    add('active', s?.activeUsers, settings.activeWarn, settings.activeCritical);
    add(
      'latency',
      s?.p95Ms,
      settings.latencyWarnMs,
      settings.latencyCriticalMs,
    );
    add(
      'clientLatency',
      s?.clientP95Ms,
      settings.latencyWarnMs,
      settings.latencyCriticalMs,
    );
    add(
      'errors',
      s && s.requests >= 20 ? s.errorPercent : null,
      settings.errorWarnPercent,
      settings.errorCriticalPercent,
    );
    add('cpu', s?.host.cpu, settings.cpuWarn, settings.cpuCritical);
    add('memory', s?.host.memory, settings.memoryWarn, settings.memoryCritical);
    add('loop', s?.process.eventLoopP95Ms, 100, 250);
    add(
      'connections',
      s?.database.connections != null && s?.database.maxConnections
        ? (s.database.connections / s.database.maxConnections) * 100
        : null,
      70,
      90,
    );
    if (s && !s.database.available)
      items.push({
        key: 'database',
        severity: 'CRITICAL',
        value: null,
        warn: 0,
        critical: 0,
      });
    if (s?.services)
      for (const key of ['frontend', 'tunnel'] as const)
        if (s.services[key].available === false)
          items.push({
            key,
            severity: 'CRITICAL',
            value: null,
            warn: 0,
            critical: 0,
          });
    if (s && s.requests < 20 && s.errors > 0)
      items.push({
        key: 'fewErrors',
        severity: 'WARNING',
        value: s.errors,
        warn: 1,
        critical: 20,
      });
    add('cv', (storage.bytes / (settings.cvQuotaMiB * 1048576)) * 100, 80, 95);
    if (storage.diskAvailableBytes < settings.diskReserveMiB * 1048576)
      items.push({
        key: 'disk',
        severity: 'CRITICAL',
        value: storage.diskAvailableBytes,
        warn: settings.diskReserveMiB * 1048576,
        critical: settings.diskReserveMiB * 1048576,
      });
    return items;
  }
  async dashboard(minutes: number) {
    const now = new Date(),
      since = new Date(now.getTime() - minutes * 60000);
    const [settings, storage, history, members, audit] = await Promise.all([
      this.policy.settings(),
      this.policy.storage(),
      this.prisma.operationsSample.findMany({
        where: { capturedAt: { gte: since } },
        orderBy: { capturedAt: 'asc' },
        take: 20170,
      }),
      this.prisma.user.count({
        where: { role: 'USER', id: { not: RESEARCH_QA_ID } },
      }),
      this.prisma.operationsSettingsAudit.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, revision: true, createdAt: true, next: true },
      }),
    ]);
    const samples = history.map((h) => h.value as unknown as OpsSample),
      latest = this.latest ?? samples.at(-1) ?? null;
    const groupMinutes = minutes <= 60 ? 1 : minutes <= 1440 ? 15 : 60,
      groups = new Map<number, OpsSample[]>();
    for (const sample of samples) {
      const key =
        Math.floor(
          new Date(sample.capturedAt).getTime() / (groupMinutes * 60000),
        ) *
        groupMinutes *
        60000;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(sample);
    }
    const series = [...groups].map(([time, rows]) => {
      const sum = (
          key:
            | 'requests'
            | 'errors'
            | 'rateLimited'
            | 'bytesOut'
            | 'windowSeconds',
        ) => rows.reduce((v, s) => v + s[key], 0),
        buckets = LATENCY_BUCKETS.map((_, i) =>
          rows.reduce((v, s) => v + s.buckets[i], 0),
        );
      const max = (get: (s: OpsSample) => number | null) => {
        const values = rows.map(get).filter((v): v is number => v != null);
        return values.length ? Math.max(...values) : null;
      };
      return {
        time: new Date(time).toISOString(),
        active: max((s) => s.activeUsers),
        rps: sum('requests') / sum('windowSeconds'),
        p95: percentileUpper(buckets),
        clientP95: percentileUpper(
          LATENCY_BUCKETS.map((_, i) =>
            rows.reduce((v, s) => v + (s.clientBuckets?.[i] ?? 0), 0),
          ),
        ),
        errors: sum('requests')
          ? (sum('errors') / sum('requests')) * 100
          : null,
        cpu: max((s) => s.host.cpu),
        memory: max((s) => s.host.memory),
        tx: max((s) => s.host.txMbps),
        rx: max((s) => s.host.rxMbps),
        cvMiB: max((s) => (s.storage ? s.storage.bytes / 1048576 : null)),
        requests: sum('requests'),
        rateLimited: sum('rateLimited'),
        bytesOut: sum('bytesOut'),
        samples: rows.length,
      };
    });
    // Calendar-day peak is independent of the selected chart range.
    const todayRows =
      minutes >= 2880
        ? samples
        : (
            await this.prisma.operationsSample.findMany({
              where: {
                capturedAt: { gte: new Date(now.getTime() - 48 * 3600000) },
              },
              orderBy: { capturedAt: 'asc' },
            })
          ).map((h) => h.value as unknown as OpsSample);
    const day = cairoDay(now);
    const today = todayRows.filter((s) => cairoDay(s.capturedAt) === day);
    const peak = (get: (s: OpsSample) => number | null) => {
      const sorted = today
        .filter((s) => get(s) != null)
        .sort((a, b) => get(b)! - get(a)!);
      return sorted.length
        ? { value: get(sorted[0]), at: sorted[0].capturedAt }
        : null;
    };
    return {
      generatedAt: now.toISOString(),
      settings,
      members,
      storage,
      latest,
      series,
      peaks: {
        active: peak((s) => s.activeUsers),
        rps: peak((s) => s.rps),
        latency: peak((s) => s.p95Ms),
      },
      coverage: {
        first: history[0]?.capturedAt ?? null,
        last: history.at(-1)?.capturedAt ?? null,
        persistedAt: this.persistenceAt,
        stale:
          !latest ||
          now.getTime() - new Date(latest.capturedAt).getTime() > 90000,
        sampleSeconds: 30,
        retentionDays: 14,
        bucketMinutes: groupMinutes,
      },
      alerts: this.alerts(latest, settings, storage),
      audit,
    };
  }
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: OperationsPolicyService,
  ) {}
}
