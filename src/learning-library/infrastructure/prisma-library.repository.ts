import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { LibraryRepository } from '../library.port';
import type { Command, LibraryDocument } from '../domain/types';
import { blank, execute } from '../domain/model';
import { checkedCommand, checkedDocument } from './input';
const tables = {
  books: 'learningBook',
  editions: 'learningEdition',
  notes: 'learningNote',
  maps: 'learningMap',
  goals: 'learningGoal',
  reading: 'learningReading',
  positions: 'learningPosition',
};
@Injectable()
export class PrismaLibraryRepository extends LibraryRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }
  private async read(db: any, ownerId: string): Promise<LibraryDocument> {
    const row = await db.learningLibrary.findUnique({ where: { ownerId } });
    const doc = blank();
    doc.id = ownerId;
    doc.revision = row?.revision || 0;
    for (const [key, table] of Object.entries(tables)) {
      const rows = await db[table].findMany({
        where: { ownerId },
        orderBy: { id: 'asc' },
      });
      if (key === 'positions')
        doc.positions = Object.fromEntries(rows.map((r) => [r.id, r.data]));
      else doc[key] = rows.map((r) => r.data);
    }
    const assets = await db.learningAsset.findMany({
      where: { ownerId, status: 'READY' },
    });
    for (const e of doc.editions) {
      const asset = assets.find((a) => a.editionId === e.id);
      e.storage = asset ? 'server' : 'local';
      if (asset) e.assetId = asset.id;
      else delete e.assetId;
    }
    return doc;
  }
  load(ownerId: string) {
    return this.prisma.$transaction((db) => this.read(db, ownerId), {
      isolationLevel: 'RepeatableRead',
    });
  }
  async mutate(ownerId: string, expectedRevision: number, raw: Command) {
    const command = checkedCommand(raw);
    const hash = createHash('sha256')
      .update(JSON.stringify(command))
      .digest('hex');
    return this.prisma.$transaction(
      async (db: any) => {
        await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ownerId}, 1804))`;
        const before = await this.read(db, ownerId),
          receipt = await db.learningMutation.findUnique({
            where: { ownerId_id: { ownerId, id: command.id } },
          });
        if (receipt) {
          if (receipt.hash !== hash)
            throw new ConflictException({ code: 'REQUEST_CONFLICT' });
          return before;
        }
        if (before.revision !== expectedRevision)
          throw new ConflictException({ code: 'REVISION_CONFLICT' });
        let after: LibraryDocument;
        if (command.type === 'restore') {
          after = checkedDocument(command.payload.document);
          after = structuredClone(after);
          after.id = ownerId;
          after.revision = before.revision + 1;
          after.commands = [];
          // A restore merges metadata only. Existing identities cannot silently change edition contents.
          for (const e of before.editions) {
            const other = after.editions.find((x) => x.id === e.id);
            if (
              other &&
              ['fingerprint', 'bytes', 'pageCount', 'bookId'].some(
                (k) => other[k] !== e[k],
              )
            )
              throw new ConflictException({ code: 'DIFFERENT_EDITION' });
          }
          for (const key of [
            'books',
            'editions',
            'notes',
            'maps',
            'goals',
            'reading',
          ] as const)
            after[key] = [
              ...before[key].filter(
                (x) => !after[key].some((y) => y.id === x.id),
              ),
              ...after[key],
            ] as any;
          after.positions = { ...before.positions, ...after.positions };
          checkedDocument(after);
        } else {
          try {
            after = execute(before, command);
          } catch (e) {
            throw new BadRequestException({
              code: e.message || 'INVALID_LIBRARY',
            });
          }
          checkedDocument(after);
        }
        for (const [key, table] of Object.entries(tables)) {
          const previous =
            key === 'positions'
              ? Object.entries(before.positions).map(([id, data]) => ({
                  id,
                  ...data,
                }))
              : before[key];
          const next =
            key === 'positions'
              ? Object.entries(after.positions).map(([id, data]) => ({
                  id,
                  ...data,
                }))
              : after[key];
          for (const item of next) {
            const old = previous.find((x) => x.id === item.id);
            if (JSON.stringify(old) === JSON.stringify(item)) continue;
            const data =
              key === 'positions'
                ? { page: item.page, updatedAt: item.updatedAt }
                : item;
            const extra =
              key === 'editions' ? { fingerprint: item.fingerprint } : {};
            await db[table].upsert({
              where: { ownerId_id: { ownerId, id: item.id } },
              create: { ownerId, id: item.id, data, ...extra },
              update: { data, ...extra },
            });
          }
          const removed = previous
            .filter((x) => !next.some((y) => x.id === y.id))
            .map((x) => x.id);
          if (removed.length)
            await db[table].deleteMany({
              where: { ownerId, id: { in: removed } },
            });
        }
        await db.learningLibrary.upsert({
          where: { ownerId },
          create: { id: ownerId, ownerId, revision: after.revision },
          update: { revision: after.revision },
        });
        await db.learningMutation.create({
          data: { ownerId, id: command.id, hash, revision: after.revision },
        });
        return this.read(db, ownerId);
      },
      { timeout: 30000 },
    );
  }
}
