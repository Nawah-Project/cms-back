import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from '@prometheus-io/client';

export const metricsRegistry = new Registry();
metricsRegistry.setDefaultLabels({
  environment: process.env.OBSERVABILITY_ENV ?? 'unknown',
  service: 'api',
});
collectDefaultMetrics({ register: metricsRegistry, prefix: 'nawah_' });

const labelNames = ['route', 'method', 'status_code'] as const;

export const httpRequests = new Counter({
  name: 'http_requests_total',
  help: 'Completed HTTP requests, grouped by normalized route, method, and status code.',
  labelNames,
  registers: [metricsRegistry],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds by normalized route, method, and status code.',
  labelNames,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const httpRequestsInFlight = new Gauge({
  name: 'http_requests_in_flight',
  help: 'Current HTTP requests in flight by normalized route and method.',
  labelNames: ['route', 'method'],
  registers: [metricsRegistry],
});

export const databaseQueryDuration = new Histogram({
  name: 'database_query_duration_seconds',
  help: 'Duration of successful Prisma PostgreSQL queries; SQL and parameters are not retained.',
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
});

const externalDependencyRequests = new Counter({
  name: 'external_dependency_requests_total',
  help: 'External dependency requests by fixed dependency, operation, and outcome.',
  labelNames: ['dependency', 'operation', 'outcome'],
  registers: [metricsRegistry],
});
const externalDependencyDuration = new Histogram({
  name: 'external_dependency_duration_seconds',
  help: 'External dependency request duration by fixed dependency, operation, and outcome.',
  labelNames: ['dependency', 'operation', 'outcome'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export function recordExternalDependency(
  operation: 'token_exchange' | 'jwks',
  outcome: 'success' | 'http_error' | 'network_error',
  durationSeconds: number,
): void {
  const labels = { dependency: 'google_oauth', operation, outcome };
  externalDependencyRequests.labels(labels).inc();
  externalDependencyDuration.labels(labels).observe(durationSeconds);
}

export function normalizedRoute(request: {
  route?: { path?: string | string[] };
  baseUrl?: string;
}): string {
  const path = request.route?.path;
  if (typeof path === 'string') {
    const base = request.baseUrl ?? '';
    const fullPath = `${base}${path}`.replace(/\/{2,}/g, '/');
    return fullPath.startsWith('/') ? fullPath : `/${fullPath}`;
  }
  if (Array.isArray(path) && path.every((part) => typeof part === 'string')) {
    return path.map((part) => `${request.baseUrl ?? ''}${part}`).join('|');
  }
  return 'unmatched';
}

export function normalizedMethod(method: string): string {
  const known = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);
  return known.has(method) ? method : 'OTHER';
}
