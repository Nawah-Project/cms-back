import { BadRequestException } from '@nestjs/common';
import type { Command, LibraryDocument } from '../domain/types';
import { validate } from '../domain/model';
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function check(ok: unknown) {
  if (!ok)
    throw new BadRequestException({
      code: 'INVALID_LIBRARY',
      message: 'Invalid library input',
    });
}
function object(v: any, keys: string[]) {
  check(v && typeof v === 'object' && !Array.isArray(v));
  check(Object.keys(v).every((k) => keys.includes(k)));
}
function id(v: any) {
  check(typeof v === 'string' && uuid.test(v));
}
function text(v: any, max = 30000) {
  check(typeof v === 'string' && v.length <= max);
}
function texts(v: any, max = 100) {
  check(Array.isArray(v) && v.length <= max);
  v.forEach((x) => text(x, 300));
}
function records(v: any, max = 10000) {
  check(Array.isArray(v) && v.length <= max);
  v.forEach((x) => id(x.id));
}
export function checkedDocument(v: any): LibraryDocument {
  object(v, [
    'formatVersion',
    'id',
    'revision',
    'books',
    'editions',
    'notes',
    'maps',
    'goals',
    'reading',
    'positions',
    'commands',
  ]);
  id(v.id);
  for (const key of ['books', 'editions', 'notes', 'maps', 'goals', 'reading'])
    records(v[key], key === 'reading' ? 100000 : 10000);
  check(JSON.stringify(v).length <= 32 * 1024 ** 2);
  for (const b of v.books) {
    object(b, [
      'id',
      'title',
      'author',
      'purpose',
      'cover',
      'subjects',
      'sectors',
      'tags',
      'status',
      'archived',
      'currentEditionId',
      'createdAt',
    ]);
    id(b.currentEditionId);
    text(b.title, 300);
    text(b.author, 1000);
    text(b.purpose);
    text(b.cover, 200000);
    for (const k of ['subjects', 'sectors', 'tags']) texts(b[k]);
    check(
      ['planned', 'reading', 'paused', 'reference', 'finished'].includes(
        b.status,
      ),
    );
    check(typeof b.archived === 'boolean');
  }
  check(
    new Set(v.editions.map((e) => e.fingerprint)).size === v.editions.length,
  );
  check(
    new Set(
      v.editions.flatMap((e) =>
        Array.isArray(e.chapters) ? e.chapters.map((c) => c.id) : [],
      ),
    ).size === v.editions.reduce((n, e) => n + (e.chapters?.length || 0), 0),
  );
  for (const e of v.editions) {
    object(e, [
      'id',
      'bookId',
      'label',
      'fingerprint',
      'bytes',
      'filename',
      'pageCount',
      'chapters',
      'pageLabels',
      'storage',
      'assetId',
      'createdAt',
    ]);
    id(e.bookId);
    text(e.label, 300);
    text(e.filename, 1000);
    text(e.fingerprint, 64);
    records(e.chapters, 1000);
    for (const c of e.chapters) {
      object(c, ['id', 'title', 'start', 'end']);
      text(c.title, 1000);
    }
    texts(e.pageLabels, 100000);
    check(['local', 'server'].includes(e.storage));
    if (e.assetId) id(e.assetId);
  }
  for (const n of v.notes) {
    object(n, [
      'id',
      'bookId',
      'editionId',
      'page',
      'chapterId',
      'scope',
      'printedLabel',
      'quote',
      'rectangles',
      'body',
      'tags',
      'updatedAt',
    ]);
    id(n.bookId);
    if (n.editionId) id(n.editionId);
    if (n.chapterId) id(n.chapterId);
    text(n.body);
    text(n.quote, 5000);
    texts(n.tags);
    check(Array.isArray(n.rectangles) && n.rectangles.length <= 1000);
    for (const r of n.rectangles) object(r, ['x', 'y', 'width', 'height']);
    if (n.printedLabel) text(n.printedLabel, 300);
  }
  for (const m of v.maps) {
    object(m, ['id', 'title', 'topics', 'rootId', 'nodes', 'edges']);
    id(m.rootId);
    text(m.title, 1000);
    texts(m.topics);
    records(m.nodes, 1000);
    records(m.edges, 5000);
    for (const n of m.nodes) {
      object(n, ['id', 'kind', 'refId', 'title', 'x', 'y', 'collapsed']);
      check(['book', 'chapter', 'note', 'idea'].includes(n.kind));
      if (n.kind !== 'idea') id(n.refId);
      text(n.title, 1000);
      check(
        typeof n.collapsed === 'boolean' &&
          Math.abs(n.x) < 100000 &&
          Math.abs(n.y) < 100000,
      );
    }
    for (const e of m.edges) {
      object(e, ['id', 'source', 'target', 'kind', 'reason']);
      text(e.reason, 6000);
    }
  }
  for (const g of v.goals) {
    object(g, [
      'id',
      'title',
      'question',
      'editionId',
      'ranges',
      'summary',
      'application',
      'review',
      'reviewAt',
      'stage',
      'founderLink',
    ]);
    if (g.editionId) id(g.editionId);
    for (const k of [
      'title',
      'question',
      'summary',
      'application',
      'review',
      'founderLink',
      'reviewAt',
    ])
      text(g[k]);
    check(['reading', 'applying', 'reviewing', 'done'].includes(g.stage));
    check(Array.isArray(g.ranges) && g.ranges.length <= 1000);
  }
  for (const e of v.reading) {
    object(e, ['id', 'editionId', 'start', 'end', 'kind', 'at']);
    id(e.editionId);
  }
  object(v.positions, Object.keys(v.positions || {}));
  for (const [key, p] of Object.entries(v.positions)) {
    id(key);
    object(p, ['page', 'updatedAt']);
  }
  check(Array.isArray(v.commands) && v.commands.length <= 1000);
  try {
    return validate(v);
  } catch {
    throw new BadRequestException({
      code: 'INVALID_LIBRARY',
      message: 'Invalid library references or ranges',
    });
  }
}
export function checkedCommand(v: any): Command {
  object(v, ['id', 'type', 'payload']);
  id(v.id);
  text(v.type, 30);
  const keys: Record<string, string[]> = {
    register: ['book', 'edition', 'bookId'],
    book: ['id', 'changes'],
    chapters: ['id', 'chapters'],
    position: ['editionId', 'page', 'recordVisit'],
    confirm: ['editionId', 'start', 'end'],
    note: ['note'],
    'remove-note': ['id'],
    map: ['map'],
    goal: ['goal'],
    restore: ['document'],
  };
  check(Object.hasOwn(keys, v.type));
  object(v.payload, keys[v.type]);
  if (v.type === 'book') {
    object(v.payload.changes, [
      'title',
      'author',
      'purpose',
      'cover',
      'subjects',
      'sectors',
      'tags',
      'status',
      'archived',
    ]);
  }
  if (v.type === 'register') {
    check(
      v.payload.edition?.storage === 'local' && !v.payload.edition?.assetId,
    );
  }
  return v;
}
