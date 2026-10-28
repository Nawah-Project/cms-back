export const OPS_DEFAULTS = {
  admissionMode: 'OPEN' as 'OPEN' | 'PAUSED' | 'LIMITED',
  maxMembers: 200,
  cvQuotaMiB: 500,
  diskReserveMiB: 1024,
  uplinkMbps: 4.5,
  activeWarn: 32,
  activeCritical: 40,
  latencyWarnMs: 1500,
  latencyCriticalMs: 3000,
  errorWarnPercent: 1,
  errorCriticalPercent: 3,
  cpuWarn: 70,
  cpuCritical: 85,
  memoryWarn: 75,
  memoryCritical: 90,
};
export type OpsSettings = typeof OPS_DEFAULTS;
export const LATENCY_BUCKETS = [
  5,
  10,
  25,
  50,
  100,
  250,
  500,
  1000,
  1500,
  2500,
  3000,
  5000,
  10000,
  30000,
  Infinity,
];
export function percentileUpper(
  buckets: number[],
  quantile = 0.95,
): number | null {
  const count = buckets.reduce((a, b) => a + b, 0);
  if (!count) return null;
  const target = Math.ceil(count * quantile);
  let sum = 0;
  for (let i = 0; i < buckets.length; i++) {
    sum += buckets[i];
    if (sum >= target)
      return Number.isFinite(LATENCY_BUCKETS[i]) ? LATENCY_BUCKETS[i] : 30001;
  }
  return null;
}
export function severity(
  value: number | null | undefined,
  warn: number,
  critical: number,
) {
  return value == null
    ? 'UNKNOWN'
    : value >= critical
      ? 'CRITICAL'
      : value >= warn
        ? 'WARNING'
        : 'OK';
}
export function metric(
  text: string,
  name: string,
  labels: Record<string, string> = {},
) {
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line.startsWith(name + '{') && !line.startsWith(name + ' ')) continue;
    if (!Object.entries(labels).every(([k, v]) => line.includes(`${k}="${v}"`)))
      continue;
    const value = Number(line.slice(line.lastIndexOf(' ') + 1));
    if (Number.isFinite(value)) return value;
  }
  return null;
}
export function cpuCounters(text: string) {
  let total = 0,
    idle = 0,
    found = false;
  for (const l of text.split('\n'))
    if (l.startsWith('node_cpu_seconds_total{')) {
      const v = Number(l.slice(l.lastIndexOf(' ') + 1));
      if (!Number.isFinite(v)) continue;
      // guest counters overlap user/nice; do not count those twice.
      if (/mode="guest(?:_nice)?"/.test(l)) continue;
      found = true;
      total += v;
      if (/mode="(?:idle|iowait)"/.test(l)) idle += v;
    }
  return found ? { total, idle } : null;
}
const cairoDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export function cairoDay(value: Date | string) {
  return cairoDateFormatter.format(new Date(value));
}

export function mailQuotaAlerts(
  mail: {
    daily: { percentUsed: number };
    monthly: { percentUsed: number };
    recentLogs: { status: string; createdAt: string }[];
  },
  now = Date.now(),
) {
  const alerts: {
    key: string;
    severity: string;
    value: number | null;
    warn: number;
    critical: number;
  }[] = [];
  for (const [key, budget] of [
    ['mailDaily', mail.daily],
    ['mailMonthly', mail.monthly],
  ] as const)
    if (budget.percentUsed >= 80)
      alerts.push({
        key,
        severity: severity(budget.percentUsed, 80, 95),
        value: budget.percentUsed,
        warn: 80,
        critical: 95,
      });
  const recentFailures = mail.recentLogs.filter(
    (l) =>
      l.status === 'FAILED' && new Date(l.createdAt).getTime() >= now - 3600000,
  ).length;
  if (recentFailures)
    alerts.push({
      key: 'mailFailed',
      severity: 'WARNING',
      value: recentFailures,
      warn: 1,
      critical: 10,
    });
  return alerts;
}
