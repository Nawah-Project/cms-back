import { BadRequestException } from '@nestjs/common';
import { ROADMAP_TEMPLATE } from './roadmap-template';
const fail = (): never => {
  throw new BadRequestException('Invalid roadmap content');
};
function obj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return fail();
  return v as Record<string, unknown>;
}
function text(v: unknown, max: number): string {
  if (
    typeof v !== 'string' ||
    v.length > max ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(v)
  )
    return fail();
  return v.trim();
}
function list<T>(v: unknown, max: number, clean: (x: unknown) => T): T[] {
  if (!Array.isArray(v) || v.length > max) return fail();
  return v.map(clean);
}
export function cleanRoadmap(input: unknown) {
  const c = obj(input);
  if (Buffer.byteLength(JSON.stringify(c)) > 90000) return fail();
  const observations = list(c.observations ?? [], 25, (x) => {
    const o = obj(x);
    const kind = text(o.kind, 30);
    if (!['OBSERVED', 'SELF_REPORT', 'QUESTION', 'HYPOTHESIS'].includes(kind))
      return fail();
    return {
      kind,
      text: text(o.text, 2400),
      source: text(o.source ?? '', 300),
    };
  });
  const sources = list(c.sources ?? [], 20, (x) => {
    const s = obj(x);
    const url = text(s.url ?? '', 1500);
    if (url) {
      try {
        const u = new URL(url);
        if (u.protocol !== 'https:' || u.username || u.password) return fail();
      } catch {
        return fail();
      }
    }
    const checked = text(s.checked, 10);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(checked) ||
      !Number.isFinite(Date.parse(checked))
    )
      return fail();
    return {
      title: text(s.title, 240),
      url,
      checked,
      status: text(s.status, 300),
      summary: text(s.summary, 2200),
    };
  });
  const notes: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj(c.notes ?? {}))) {
    if (!ROADMAP_TEMPLATE.nodes.some((n) => n.id === k)) return fail();
    notes[k] = text(v, 5000);
  }
  return { context: text(c.context ?? '', 6000), observations, sources, notes };
}
