// Pure contract validation: no Nest, Prisma, auth, storage, or network imports.
type Row = Record<string, any>;
export type WorkspaceDocument = Row & {
  formatVersion: 1;
  id: string;
  title: string;
  revision: number;
  cycles: Row[];
  tasks: Row[];
  lanes: Row[];
  practices: Row[];
  evidence: Row[];
  reviews: Row[];
  history: Row[];
  settings: Row;
};
export class InvalidWorkspace extends Error {
  constructor(public readonly code: string) { super(code); }
}
const bad = (code: string): never => { throw new InvalidWorkspace(code); };
const text = (v: unknown, n: number, required = false) => {
  if (typeof v !== 'string' || v.length > n || (required && !v.trim())) bad('TEXT');
};
const date = (v: unknown): number => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return bad('DATE');
  const n = Date.parse(v + 'T00:00:00Z');
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== v) bad('DATE');
  return n;
};
const rows = (v: unknown, max: number): Row[] => {
  if (!Array.isArray(v) || v.length > max) return bad('FORMAT');
  const ids = new Set<string>();
  for (const row of v) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) bad('FORMAT');
    text(row.id, 150, true);
    if (!/^[A-Za-z0-9_-]+$/.test(row.id) || ids.has(row.id)) bad('IDENTIFIER');
    ids.add(row.id);
  }
  return v;
};
const link = (v: unknown) => {
  if (!v) return;
  text(v, 2048);
  try { const u = new URL(v as string); if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) bad('URL'); }
  catch { bad('URL'); }
};
const ref = (v: unknown, values: Row[]) => values.some(row => row.id === v);
const hours = (v: unknown, max: number) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) bad('HOURS'); };
export function validateWorkspaceDocument(value: unknown): WorkspaceDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return bad('FORMAT');
  const d = value as WorkspaceDocument;
  if (new TextEncoder().encode(JSON.stringify(d)).byteLength > 750000) bad('PLAN_TOO_LARGE');
  if (d.formatVersion !== 1 || !Number.isSafeInteger(d.revision) || d.revision < 0) bad('FORMAT');
  const allowed = ['formatVersion', 'id', 'title', 'revision', 'cycles', 'tasks', 'lanes', 'practices', 'evidence', 'reviews', 'history', 'settings'];
  if (Object.keys(d).some(k => !allowed.includes(k))) bad('UNKNOWN_FIELD');
  text(d.id, 150, true); text(d.title, 200, true);
  rows(d.cycles, 100); rows(d.tasks, 2500); rows(d.lanes, 30); rows(d.practices, 100); rows(d.evidence, 2000); rows(d.reviews, 200);
  if (!d.cycles.length || !d.lanes.length || !d.settings || d.settings.timeZone !== 'Africa/Cairo') bad('FORMAT');
  if (!ref(d.settings.currentCycleId, d.cycles) || !Array.isArray(d.settings.dayHours) || d.settings.dayHours.length !== 7) bad('CAPACITY');
  d.settings.dayHours.forEach((n: unknown) => hours(n, 16));
  for (const c of d.cycles) {
    text(c.titleAr, 220, true); text(c.titleEn, 220, true); text(c.goalAr, 3000); text(c.goalEn, 3000);
    if ((date(c.end) - date(c.start)) / 86400000 !== 14) bad('CYCLE');
  }
  for (const l of d.lanes) {
    text(l.labelAr, 80, true); text(l.labelEn, 80, true); if (typeof l.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(l.color)) bad('COLOR');
  }
  for (const t of d.tasks) {
    text(t.title, 220, true); if (t.titleEn != null) text(t.titleEn, 220);
    text(t.notes || '', 8000); text(t.deliverable || '', 3000); text(t.blocker || '', 1000);
    if (!ref(t.cycleId, d.cycles) || !ref(t.laneId, d.lanes) || (t.practiceId && !ref(t.practiceId, d.practices))) bad('REFERENCE');
    if (!['planned', 'active', 'blocked', 'done'].includes(t.status) || !['execution', 'learning', 'testing', 'teaching', 'review'].includes(t.kind)) bad('FORMAT');
    const n = (date(t.end) - date(t.start)) / 86400000; if (n < 0 || n > 366) bad('DATE_RANGE');
    hours(t.hours, 1000); hours(t.actualHours, 10000); if (t.deadline) date(t.deadline); link(t.resourceUrl);
    if (t.actualStart) date(t.actualStart); if (t.actualEnd) date(t.actualEnd);
    if (t.dependsOn && (!ref(t.dependsOn, d.tasks) || t.dependsOn === t.id)) bad('DEPENDENCY');
    if (t.timeStart || t.timeEnd) {
      if (t.start !== t.end || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t.timeStart) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t.timeEnd) || t.timeEnd <= t.timeStart) bad('TIME');
    }
  }
  const graph = new Map(d.tasks.map(t => [t.id, t.dependsOn]));
  for (const t of d.tasks) {
    const visited = new Set([t.id]); let id = t.dependsOn;
    while (id) { if (visited.has(id)) bad('DEPENDENCY_CYCLE'); visited.add(id); id = graph.get(id); }
  }
  for (const p of d.practices) {
    text(p.titleAr, 150, true); text(p.titleEn, 150, true); text(p.gap || '', 2000);
    if (!['assisted', 'understand', 'manage', 'transfer', 'teach', 'train'].includes(p.level)) bad('FORMAT');
    if (!Array.isArray(p.evidenceIds) || p.evidenceIds.length > 100 || p.evidenceIds.some((id: unknown) => !ref(id, d.evidence))) bad('REFERENCE');
    if (p.verified && !p.evidenceIds.length) bad('EVIDENCE_REQUIRED'); if (p.reviewDate) date(p.reviewDate);
  }
  for (const e of d.evidence) {
    text(e.title, 200, true); text(e.content, 12000); text(e.limitations, 2000); link(e.url); date(e.date);
    if ((e.taskId && !ref(e.taskId, d.tasks)) || (e.practiceId && !ref(e.practiceId, d.practices))) bad('REFERENCE');
  }
  for (const r of d.reviews) {
    if (!ref(r.cycleId, d.cycles) || !Array.isArray(r.answers) || r.answers.length !== 5) bad('REFERENCE');
    r.answers.forEach((a: unknown) => text(a, 8000)); text(r.decision || '', 3000); date(r.date);
  }
  if (!Array.isArray(d.history) || d.history.length > 2000) bad('FORMAT');
  for (const entry of d.history) { text(entry?.label, 250, true); if (typeof entry.at !== 'string' || !Number.isFinite(Date.parse(entry.at))) bad('DATE'); }
  // Explicit projection prevents unknown top-level account/permission fields crossing the boundary.
  return JSON.parse(JSON.stringify(d)) as WorkspaceDocument;
}
