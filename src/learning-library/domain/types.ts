export type Range = { start: number; end: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type Chapter = Range & { id: string; title: string };
export type Book = {
  id: string;
  title: string;
  author: string;
  purpose: string;
  cover: string;
  subjects: string[];
  sectors: string[];
  tags: string[];
  status: 'planned' | 'reading' | 'paused' | 'reference' | 'finished';
  archived: boolean;
  currentEditionId: string;
  createdAt: string;
};
export type Edition = {
  id: string;
  bookId: string;
  label: string;
  fingerprint: string;
  bytes: number;
  filename: string;
  pageCount: number;
  chapters: Chapter[];
  pageLabels: string[];
  storage: 'local' | 'server';
  assetId?: string;
  createdAt: string;
};
export type Note = {
  id: string;
  bookId: string;
  editionId?: string;
  page?: number;
  chapterId?: string;
  scope: 'book' | 'page' | 'selection' | 'chapter';
  printedLabel?: string;
  quote: string;
  rectangles: Rect[];
  body: string;
  tags: string[];
  updatedAt: string;
};
export type MapNode = {
  id: string;
  kind: 'book' | 'chapter' | 'note' | 'idea';
  refId: string;
  title: string;
  x: number;
  y: number;
  collapsed: boolean;
};
export type MapEdge = {
  id: string;
  source: string;
  target: string;
  kind: 'prepares' | 'deepens' | 'applies' | 'contrasts';
  reason: string;
};
export type KnowledgeMap = {
  id: string;
  title: string;
  topics: string[];
  rootId: string;
  nodes: MapNode[];
  edges: MapEdge[];
};
export type Goal = {
  id: string;
  title: string;
  question: string;
  editionId?: string;
  ranges: Range[];
  summary: string;
  application: string;
  review: string;
  reviewAt: string;
  stage: 'reading' | 'applying' | 'reviewing' | 'done';
  founderLink: string;
};
export type ReadingEvent = Range & {
  id: string;
  editionId: string;
  kind: 'visited' | 'confirmed';
  at: string;
};
export type LibraryDocument = {
  formatVersion: 1;
  id: string;
  revision: number;
  books: Book[];
  editions: Edition[];
  notes: Note[];
  maps: KnowledgeMap[];
  goals: Goal[];
  reading: ReadingEvent[];
  positions: Record<string, { page: number; updatedAt: string }>;
  commands: { id: string; content: string }[];
};
export type Command = {
  id: string;
  type: string;
  payload: Record<string, any>;
  at?: string;
};
export type Weekly = {
  newPages: number;
  rereadPages: number;
  visitedPages: number;
  books: number;
  confirmations: number;
};
export type OutlineItem = { title: string; page: number; level: number };
export type PdfInspection = {
  pageCount: number;
  title: string;
  author: string;
  cover: string;
  outline: OutlineItem[];
  pageLabels: string[];
};
