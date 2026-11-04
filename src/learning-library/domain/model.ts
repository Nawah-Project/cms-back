import { createHash } from 'node:crypto';
import type { LibraryDocument } from './types';
const sha256 = (value: Uint8Array) =>
  createHash('sha256').update(value).digest();
// Pure learning domain. No React, network, browser storage, or foreign domains.
export const uid = () => globalThis.crypto.randomUUID();
export class LearningError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
const requireValue = (ok: any, code: string) => {
  if (!ok) throw new LearningError(code);
};
const find = (items: any[], id: string) => {
  const value = items.find((x) => x.id === id);
  requireValue(value, 'NOT_FOUND');
  return value;
};
export function blank(): LibraryDocument {
  return {
    formatVersion: 1,
    id: uid(),
    revision: 0,
    books: [],
    editions: [],
    notes: [],
    maps: [],
    goals: [],
    reading: [],
    positions: {},
    commands: [],
  };
}
export function mergeRanges(ranges: any[], pages = Infinity) {
  const result: any[] = [];
  for (const range of ranges
    .map((x) => ({ start: x.start, end: x.end }))
    .sort((a, b) => a.start - b.start)) {
    requireValue(
      Number.isInteger(range.start) &&
        Number.isInteger(range.end) &&
        range.start >= 1 &&
        range.end >= range.start &&
        range.end <= pages,
      'PAGE_RANGE',
    );
    const last = result.at(-1);
    if (last && range.start <= last.end + 1)
      last.end = Math.max(last.end, range.end);
    else result.push(range);
  }
  return result;
}
export const rangeCount = (ranges: any[]) =>
  mergeRanges(ranges).reduce((n, x) => n + x.end - x.start + 1, 0);
export function coverage(document: any, editionId: string, required?: any[]) {
  const edition = find(document.editions, editionId);
  const read = mergeRanges(
    document.reading.filter(
      (x) => x.editionId === editionId && x.kind === 'confirmed',
    ),
    edition.pageCount,
  );
  const wanted = mergeRanges(
    required?.length ? required : [{ start: 1, end: edition.pageCount }],
    edition.pageCount,
  );
  let completed = 0;
  for (const a of wanted)
    for (const b of read)
      completed += Math.max(
        0,
        Math.min(a.end, b.end) - Math.max(a.start, b.start) + 1,
      );
  const total = rangeCount(wanted);
  return {
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0,
  };
}
const cairoDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export function weekStats(document: any, from: string, until: string) {
  const calendar =
    /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(until);
  const end = calendar ? until : Date.parse(until),
    start = calendar ? from : Date.parse(from);
  requireValue(Number.isFinite(Date.parse(from)) && end > start, 'DATE');
  const rank = (x) =>
    calendar ? cairoDay.format(new Date(x.at)) : Date.parse(x.at);
  let newPages = 0,
    rereadPages = 0,
    visitedPages = 0,
    confirmations = 0;
  const books = new Set();
  for (const edition of document.editions) {
    const events = document.reading.filter(
      (x) => x.editionId === edition.id && rank(x) < end,
    );
    const before = events.filter(
      (x) => x.kind === 'confirmed' && rank(x) < start,
    );
    const current = events.filter((x) => rank(x) >= start);
    const confirmed = current.filter((x) => x.kind === 'confirmed');
    const added = rangeCount([...before, ...confirmed]) - rangeCount(before);
    newPages += added;
    rereadPages +=
      confirmed.reduce((n, x) => n + x.end - x.start + 1, 0) - added;
    visitedPages += rangeCount(current.filter((x) => x.kind === 'visited'));
    confirmations += confirmed.length;
    if (confirmed.length) books.add(edition.bookId);
  }
  return {
    newPages,
    rereadPages,
    visitedPages,
    books: books.size,
    confirmations,
  };
}
export function visibleGraph(map: any) {
  const roots = [
    map.rootId,
    ...map.nodes
      .filter((n) => !map.edges.some((e) => e.target === n.id))
      .map((n) => n.id),
  ];
  const visible = new Set(roots),
    queue = [...visible];
  while (queue.length) {
    const id = queue.shift(),
      node = map.nodes.find((x) => x.id === id);
    if (!node || node.collapsed) continue;
    for (const edge of map.edges.filter((x) => x.source === id)) {
      if (!visible.has(edge.target)) {
        visible.add(edge.target);
        queue.push(edge.target);
      }
    }
  }
  return {
    nodes: map.nodes.filter((x) => visible.has(x.id)),
    edges: map.edges.filter(
      (x) => visible.has(x.source) && visible.has(x.target),
    ),
  };
}
export function arrangeGraph(map: any) {
  const positions = new Map<string, any>([[map.rootId, { x: 570, y: 380 }]]),
    queue = [{ id: map.rootId, depth: 0, angle: 0, span: Math.PI * 2 }],
    seen = new Set([map.rootId]);
  while (queue.length) {
    const parent = queue.shift()!,
      children = map.edges
        .filter((x) => x.source === parent.id)
        .map((x) => x.target)
        .filter((id) => !seen.has(id));
    children.forEach((id, i) => {
      if (seen.has(id)) return;
      seen.add(id);
      const angle =
          parent.angle -
          parent.span / 2 +
          (parent.span * (i + 0.5)) / children.length,
        depth = parent.depth + 1;
      positions.set(id, {
        x: 570 + Math.cos(angle) * depth * 280,
        y: 380 + Math.sin(angle) * depth * 210,
      });
      queue.push({
        id,
        depth,
        angle,
        span: parent.span / Math.max(children.length, 1),
      });
    });
  }
  return map.nodes.map((x) => ({ ...x, ...positions.get(x.id) }));
}
export function validate(document: any): LibraryDocument {
  requireValue(
    document?.formatVersion === 1 &&
      Number.isInteger(document.revision) &&
      document.revision >= 0,
    'DOCUMENT',
  );
  for (const list of [
    'books',
    'editions',
    'notes',
    'maps',
    'goals',
    'reading',
    'commands',
  ])
    requireValue(Array.isArray(document[list]), 'DOCUMENT');
  for (const list of [
    'books',
    'editions',
    'notes',
    'maps',
    'goals',
    'reading',
  ]) {
    const ids = new Set();
    for (const item of document[list]) {
      requireValue(
        typeof item.id === 'string' && !ids.has(item.id),
        'DUPLICATE',
      );
      ids.add(item.id);
    }
  }
  for (const e of document.editions) {
    find(document.books, e.bookId);
    requireValue(
      /^[a-f0-9]{64}$/.test(e.fingerprint) &&
        Number.isSafeInteger(e.bytes) &&
        e.bytes > 0 &&
        e.bytes <= 500 * 1024 ** 2,
      'FILE',
    );
    requireValue(
      Number.isInteger(e.pageCount) && e.pageCount > 0 && e.pageCount <= 100000,
      'PAGE_COUNT',
    );
    mergeRanges(e.chapters, e.pageCount);
  }
  for (const book of document.books) {
    requireValue(
      typeof book.title === 'string' &&
        book.title.trim() &&
        book.title.length <= 300,
      'TITLE',
    );
    requireValue(
      book.cover.length < 200000 &&
        (!book.cover ||
          /^data:image\/(png|jpeg|webp);base64,/.test(book.cover)),
      'COVER',
    );
    requireValue(
      document.editions.some(
        (e) => e.id === book.currentEditionId && e.bookId === book.id,
      ),
      'EDITION',
    );
  }
  for (const note of document.notes) {
    find(document.books, note.bookId);
    requireValue(
      typeof note.body === 'string' &&
        note.body.trim() &&
        note.body.length <= 30000,
      'NOTE',
    );
    requireValue(
      ['book', 'page', 'selection', 'chapter'].includes(note.scope),
      'ANCHOR',
    );
    if (note.editionId) {
      const e = find(document.editions, note.editionId);
      requireValue(e.bookId === note.bookId, 'EDITION');
      if (note.page != null)
        mergeRanges([{ start: note.page, end: note.page }], e.pageCount);
    }
    requireValue(note.scope === 'book' || !!note.editionId, 'ANCHOR');
    if (note.scope === 'page' || note.scope === 'selection')
      requireValue(Number.isInteger(note.page), 'ANCHOR');
    if (note.scope === 'chapter')
      requireValue(
        find(document.editions, note.editionId).chapters.some(
          (c) => c.id === note.chapterId,
        ),
        'CHAPTER',
      );
    for (const r of note.rectangles)
      requireValue(
        [r.x, r.y, r.width, r.height].every(Number.isFinite) &&
          r.x >= 0 &&
          r.y >= 0 &&
          r.width > 0 &&
          r.height > 0 &&
          r.x + r.width <= 1.001 &&
          r.y + r.height <= 1.001,
        'RECTANGLE',
      );
  }
  for (const event of document.reading) {
    const edition = find(document.editions, event.editionId);
    mergeRanges([event], edition.pageCount);
    requireValue(
      ['visited', 'confirmed'].includes(event.kind) &&
        Number.isFinite(Date.parse(event.at)),
      'EVENT',
    );
  }
  for (const [id, pos] of Object.entries(document.positions) as [
    string,
    any,
  ][]) {
    const e = find(document.editions, id);
    mergeRanges([{ start: pos.page, end: pos.page }], e.pageCount);
  }
  for (const goal of document.goals) {
    requireValue(goal.title.trim() && goal.question.trim(), 'GOAL');
    if (goal.stage === 'done')
      requireValue(
        goal.summary.trim() && goal.application.trim() && goal.review.trim(),
        'REVIEW_REQUIRED',
      );
    if (goal.editionId)
      mergeRanges(
        goal.ranges,
        find(document.editions, goal.editionId).pageCount,
      );
    requireValue(
      !goal.founderLink ||
        /^\/admin\/founder-workspace(?:\/|$)/.test(goal.founderLink),
      'LINK',
    );
  }
  for (const map of document.maps) {
    requireValue(
      map.title.trim() && map.nodes.some((x) => x.id === map.rootId),
      'MAP',
    );
    const ids = new Set(map.nodes.map((x) => x.id));
    requireValue(ids.size === map.nodes.length, 'DUPLICATE');
    for (const n of map.nodes) {
      requireValue(Number.isFinite(n.x) && Number.isFinite(n.y), 'POSITION');
      if (n.kind === 'book') find(document.books, n.refId);
      if (n.kind === 'note') find(document.notes, n.refId);
      if (n.kind === 'chapter')
        requireValue(
          document.editions.some((e) =>
            e.chapters.some((c) => c.id === n.refId),
          ),
          'CHAPTER',
        );
    }
    for (const edge of map.edges)
      requireValue(
        ids.has(edge.source) &&
          ids.has(edge.target) &&
          edge.source !== edge.target &&
          edge.reason.trim() &&
          ['prepares', 'deepens', 'applies', 'contrasts'].includes(edge.kind),
        'EDGE',
      );
  }
  return document;
}
export function execute(
  document: LibraryDocument,
  command: any,
): LibraryDocument {
  const content = Array.from(
      sha256(
        new TextEncoder().encode(
          JSON.stringify({ type: command.type, payload: command.payload }),
        ),
      ),
      (x) => x.toString(16).padStart(2, '0'),
    ).join(''),
    old = document.commands.find((x) => x.id === command.id);
  if (old) {
    requireValue(old.content === content, 'REQUEST_CONFLICT');
    return document;
  }
  const d = structuredClone(document),
    p = command.payload,
    at = command.at || new Date().toISOString();
  switch (command.type) {
    case 'register': {
      const existing = d.editions.find(
        (x) => x.fingerprint === p.edition.fingerprint,
      );
      if (existing) return document;
      if (p.bookId) {
        find(d.books, p.bookId).currentEditionId = p.edition.id;
      } else d.books.push(p.book);
      d.editions.push(p.edition);
      break;
    }
    case 'book':
      Object.assign(find(d.books, p.id), p.changes);
      break;
    case 'chapters':
      find(d.editions, p.id).chapters = p.chapters;
      break;
    case 'position': {
      const e = find(d.editions, p.editionId);
      mergeRanges([{ start: p.page, end: p.page }], e.pageCount);
      d.positions[e.id] = { page: p.page, updatedAt: at };
      if (p.recordVisit)
        d.reading.push({
          id: command.id,
          editionId: e.id,
          start: p.page,
          end: p.page,
          kind: 'visited',
          at,
        });
      break;
    }
    case 'confirm':
      d.reading.push({
        id: command.id,
        editionId: p.editionId,
        start: p.start,
        end: p.end,
        kind: 'confirmed',
        at,
      });
      break;
    case 'note': {
      const old = d.notes.findIndex((x) => x.id === p.note.id);
      const value = { ...p.note, updatedAt: at };
      if (old < 0) d.notes.push(value);
      else d.notes[old] = value;
      break;
    }
    case 'remove-note':
      requireValue(
        !d.maps.some((m) =>
          m.nodes.some((n) => n.kind === 'note' && n.refId === p.id),
        ),
        'NOTE_REFERENCED',
      );
      d.notes = d.notes.filter((x) => x.id !== p.id);
      break;
    case 'map': {
      const i = d.maps.findIndex((x) => x.id === p.map.id);
      if (i < 0) d.maps.push(p.map);
      else d.maps[i] = p.map;
      break;
    }
    case 'goal': {
      const i = d.goals.findIndex((x) => x.id === p.goal.id);
      if (i < 0) d.goals.push(p.goal);
      else d.goals[i] = p.goal;
      break;
    }
    default:
      throw new LearningError('COMMAND');
  }
  d.commands = [...d.commands, { id: command.id, content }].slice(-1000);
  d.revision++;
  return validate(d);
}
