import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CONSULTING_CATALOG } from './catalog';
export const ITEM_KINDS = [
  'WORK',
  'ACTIVITY',
  'SESSION',
  'RECOMMENDATION',
  'EVIDENCE',
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const CONSULTING_KEY =
  /^career-consulting\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/i;
export const AGREEMENT_VERSION = 'career-service-v1';
export type Prompt = {
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'ranked' | 'matrix';
};
function invalid(): never {
  throw new BadRequestException('Invalid consultation content');
}
function safe(v: unknown, depth = 0): void {
  if (depth > 8) invalid();
  if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      if (['__proto__', 'constructor', 'prototype'].includes(k)) invalid();
      safe(x, depth + 1);
    }
}
export function object(v: unknown): Record<string, any> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) invalid();
  safe(v);
  if (Buffer.byteLength(JSON.stringify(v)) > 65536) invalid();
  return v as Record<string, any>;
}
export function str(v: unknown, max = 6000): string {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string' || v.length > max) invalid();
  return v.trim();
}
export function ids(v: unknown, max = 8): string[] {
  if (v === undefined) return [];
  if (
    !Array.isArray(v) ||
    v.length > max ||
    v.some(
      (x) =>
        typeof x !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          x,
        ),
    )
  )
    invalid();
  return [...new Set(v as string[])];
}
export function https(v: unknown): string {
  const s = str(v, 2048);
  if (!s) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' || u.username || u.password) invalid();
    return u.href;
  } catch {
    invalid();
  }
}
export function date(v: unknown): string {
  const s = str(v, 60);
  if (!s) return '';
  const d = new Date(s);
  if (!/^\d{4}-\d\d-\d\dT/.test(s) || !Number.isFinite(d.getTime())) invalid();
  return d.toISOString();
}
export function cleanDraft(
  kind: string,
  value: unknown,
  locale = 'ar',
): Record<string, any> {
  const v = object(value);
  const ar = locale !== 'en';
  const t = (x: { ar: string; en: string }) => (ar ? x.ar : x.en);
  const out: Record<string, any> = {};
  const fields: Record<string, string[]> = {
    WORK: [
      'presentingConcern',
      'goal',
      'criteria',
      'context',
      'nextStep',
      'nextActor',
      'beforeNow',
      'futureSteps',
    ],
    ACTIVITY: [
      'catalogId',
      'goal',
      'rationale',
      'expectedOutput',
      'instructions',
    ],
    SESSION: ['goal', 'agenda', 'summary', 'followUp', 'stage'],
    RECOMMENDATION: [
      'advice',
      'reasons',
      'alternatives',
      'limitations',
      'nextStep',
    ],
    EVIDENCE: ['sourceType', 'source', 'region', 'body', 'limitations'],
  };
  if (!fields[kind]) invalid();
  const extra: Record<string, string[]> = {
    WORK: ['followUpAt'],
    ACTIVITY: [
      'prompts',
      'deadline',
      'fileIds',
      'language',
      'sources',
      'catalogVersion',
    ],
    SESSION: ['scheduledAt', 'meetingUrl', 'fileIds', 'materialIds'],
    RECOMMENDATION: ['followUpAt', 'fileIds'],
    EVIDENCE: ['observedAt', 'fileIds'],
  };
  if (
    Object.keys(v).some((k) => ![...fields[kind], ...extra[kind]].includes(k))
  )
    invalid();
  for (const k of fields[kind]) out[k] = str(v[k]);
  for (const k of ['followUpAt', 'scheduledAt', 'deadline', 'observedAt'])
    if (extra[kind].includes(k)) out[k] = date(v[k]);
  if (extra[kind].includes('fileIds')) out.fileIds = ids(v.fileIds);
  if (extra[kind].includes('materialIds')) out.materialIds = ids(v.materialIds);
  if (kind === 'SESSION') {
    out.meetingUrl = https(v.meetingUrl);
    out.stage = out.stage || 'PLANNED';
    if (!['PLANNED', 'IN_SESSION', 'HELD'].includes(out.stage)) invalid();
  }
  if (
    kind === 'WORK' &&
    !['', 'CLIENT', 'CONSULTANT', 'TOGETHER'].includes(out.nextActor)
  )
    invalid();
  if (
    kind === 'EVIDENCE' &&
    ![
      '',
      'CLIENT_ACCOUNT',
      'WORK_SAMPLE',
      'OBSERVATION',
      'MARKET_RESOURCE',
      'WORKING_INTERPRETATION',
    ].includes(out.sourceType)
  )
    invalid();
  if (kind === 'ACTIVITY') {
    const template = CONSULTING_CATALOG.activities.find(
      (a) => a.id === out.catalogId,
    );
    if (!template && out.catalogId !== 'custom') invalid();
    out.language = ar ? 'ar' : 'en';
    out.catalogVersion = CONSULTING_CATALOG.version;
    if (v.prompts !== undefined && !Array.isArray(v.prompts)) invalid();
    const raw =
      v.prompts ??
      template?.fields.map((f) => ({ ...f, label: t(f.label) })) ??
      [];
    if (raw.length > 12) invalid();
    out.prompts = raw.map((p: unknown) => {
      const f = object(p);
      if (Object.keys(f).some((k) => !['key', 'label', 'kind'].includes(k)))
        invalid();
      const key = str(f.key, 50),
        label = str(f.label, 500),
        kind = str(f.kind, 20);
      if (
        !/^[a-z][a-z0-9-]{0,49}$/.test(key) ||
        !label ||
        !['text', 'textarea', 'ranked', 'matrix'].includes(kind)
      )
        invalid();
      return { key, label, kind };
    });
    if (
      new Set(out.prompts.map((p: Prompt) => p.key)).size !== out.prompts.length
    )
      invalid();
    out.sources = template?.sources ?? [];
    out.rationale = out.rationale || (template ? t(template.purpose) : '');
    out.expectedOutput =
      out.expectedOutput || (template ? t(template.expectedOutput) : '');
  }
  return out;
}
export function publishContent(
  kind: string,
  title: string,
  draft: unknown,
): Record<string, any> {
  // Build a fresh allowlisted snapshot; no private note or original draft object is spread.
  const d = cleanDraft(kind, draft, object(draft).language);
  const required: Record<string, string[]> = {
    WORK: ['goal', 'criteria'],
    ACTIVITY: ['goal', 'rationale', 'expectedOutput'],
    SESSION: ['goal'],
    RECOMMENDATION: [
      'advice',
      'reasons',
      'alternatives',
      'limitations',
      'nextStep',
    ],
    EVIDENCE: ['sourceType', 'source', 'body'],
  };
  if (
    kind === 'EVIDENCE' &&
    d.sourceType === 'MARKET_RESOURCE' &&
    (!d.region || !d.observedAt)
  )
    throw new BadRequestException(
      'A market resource needs its country and verification date',
    );
  if (kind === 'SESSION' && d.stage === 'HELD' && !d.summary)
    throw new BadRequestException('Add the shared session summary');
  if (
    required[kind].some((k) => !d[k]) ||
    (kind === 'ACTIVITY' && !d.prompts.length)
  )
    throw new BadRequestException(
      'Complete the goal, rationale and expected content before publishing',
    );
  return { title, ...d };
}
export function cleanAnswers(
  content: unknown,
  answers: unknown,
): Record<string, any> {
  const c = object(content),
    v = object(answers);
  const prompts = c.prompts as Prompt[];
  if (!Array.isArray(prompts)) invalid();
  if (Object.keys(v).some((k) => !prompts.some((p) => p.key === k))) invalid();
  const out: Record<string, any> = {};
  for (const p of prompts) {
    const x = v[p.key];
    if (x === undefined) continue;
    if (p.kind === 'ranked') {
      if (!Array.isArray(x) || x.length > 20) invalid();
      out[p.key] = x.map((a) => str(a, 600)).filter(Boolean);
    } else if (p.kind === 'matrix') {
      if (!Array.isArray(x) || x.length > 12) invalid();
      out[p.key] = x.map((row) => {
        const a = object(row);
        if (
          Object.keys(a).some(
            (k) =>
              ![
                'option',
                'evidence',
                'benefits',
                'limits',
                'unknowns',
              ].includes(k),
          )
        )
          invalid();
        return Object.fromEntries(
          ['option', 'evidence', 'benefits', 'limits', 'unknowns'].map((k) => [
            k,
            str(a[k], 1500),
          ]),
        );
      });
    } else out[p.key] = str(x, 12000);
  }
  if (Buffer.byteLength(JSON.stringify(out)) > 50000) invalid();
  return out;
}
function canonical(v: any): any {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .filter((k) => k !== 'requestId')
        .map((k) => [k, canonical(v[k])]),
    );
  return v;
}
export function fingerprint(value: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}
