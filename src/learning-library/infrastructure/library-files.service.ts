import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { constants, createReadStream } from 'node:fs';
import {
  open,
  mkdir,
  lstat,
  readdir,
  unlink,
  rename,
  realpath,
} from 'node:fs/promises';
import { join, isAbsolute, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import type { Response, Request } from 'express';
const MiB = 1024 ** 2;
const failure = (code: string) => new BadRequestException({ code });
@Injectable()
export class LibraryFilesService implements OnModuleInit {
  readonly root = resolve(
    process.env.LEARNING_STORAGE_DIR || '/app/private-storage/learning',
  );
  readonly inbox = resolve(
    process.env.LEARNING_INBOX_DIR || '/app/private-storage/learning-inbox',
  );
  readonly maxBytes = Number(process.env.LEARNING_BOOK_MAX_BYTES || 500 * MiB);
  readonly quota = BigInt(process.env.LEARNING_QUOTA_BYTES || 20 * 1024 ** 3);
  private active = new Set<string>();
  constructor(private readonly prisma: PrismaService) {}
  async onModuleInit() {
    const cv=resolve(process.env.CV_STORAGE_DIR||'/app/private-storage/cvs');
    if(this.root===this.inbox||this.root.startsWith(this.inbox+'/')||this.inbox.startsWith(this.root+'/'))throw Error('Private library roots must be separate');
    for (const dir of [this.root, this.inbox]) {
      if(dir===cv||dir.startsWith(cv+'/')||cv.startsWith(dir+'/'))throw Error('Library storage cannot overlap CV storage');
      if (!isAbsolute(dir) || dir.includes('/cvs/'))
        throw Error('Learning storage must be private and separate');
      await mkdir(dir, { recursive: true, mode: 0o700 });
      if ((await lstat(dir)).isSymbolicLink() || await realpath(dir)!==dir)
        throw Error('Learning storage cannot be a symlink');
    }
  }
  private async folder(owner: string) {
    const dir = join(this.root, owner);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    if ((await lstat(dir)).isSymbolicLink() || await realpath(dir)!==dir) throw failure('STORAGE');
    return dir;
  }
  private async asset(owner: string, id: string) {
    const a = await this.prisma.learningAsset.findFirst({
      where: { ownerId: owner, id },
    });
    if (!a) throw new NotFoundException();
    return a;
  }
  private async exclusive<T>(
    owner: string,
    work: () => Promise<T>,
  ): Promise<T> {
    if (this.active.has(owner))
      throw new ConflictException({ code: 'TRANSFER_BUSY' });
    this.active.add(owner);
    try {
      return await work();
    } finally {
      this.active.delete(owner);
    }
  }
  async list(owner: string) {
    const assets = await this.prisma.learningAsset.findMany({
      where: { ownerId: owner },
      orderBy: { createdAt: 'asc' },
    });
    return {
      quotaBytes: Number(this.quota),
      maxBookBytes: this.maxBytes,
      usedBytes: assets.reduce((n, a) => n + Number(a.bytes), 0),
      items: assets.map(
        ({ id, editionId, status, offset, bytes, fingerprint }) => ({
          id,
          editionId,
          status,
          offset: Number(offset),
          bytes: Number(bytes),
          fingerprint,
        }),
      ),
    };
  }
  async start(owner: string, editionId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${owner}, 1805))`;
      const edition = await tx.learningEdition.findUnique({
        where: { ownerId_id: { ownerId: owner, id: editionId } },
      });
      if (!edition) throw new NotFoundException();
      const e = edition.data as any;
      const old = await tx.learningAsset.findUnique({
        where: { ownerId_editionId: { ownerId: owner, editionId } },
      });
      if (old)
        return {
          id: old.id,
          offset: Number(old.offset),
          status: old.status,
          bytes: Number(old.bytes),
        };
      if (e.bytes > this.maxBytes) throw failure('FILE_SIZE');
      const used = await tx.learningAsset.aggregate({
        where: { ownerId: owner },
        _sum: { bytes: true },
      });
      if ((used._sum.bytes || 0n) + BigInt(e.bytes) > this.quota)
        throw failure('QUOTA');
      const a = await tx.learningAsset.create({
        data: {
          ownerId: owner,
          editionId,
          bytes: BigInt(e.bytes),
          fingerprint: e.fingerprint,
        },
      });
      return { id: a.id, offset: 0, status: a.status, bytes: Number(a.bytes) };
    });
  }
  async chunk(
    owner: string,
    id: string,
    offset: number,
    hash: string,
    buffer: Buffer,
  ) {
    return this.exclusive(owner, async () => {
      const began = Date.now();
      if (
        !Buffer.isBuffer(buffer) ||
        !buffer.length ||
        buffer.length > MiB ||
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        !/^[a-f0-9]{64}$/.test(hash) ||
        createHash('sha256').update(buffer).digest('hex') !== hash
      )
        throw failure('CHUNK');
      return this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${owner}, 1805))`;
          const a = await tx.learningAsset.findFirst({
            where: { id, ownerId: owner },
          });
          if (!a || a.status !== 'UPLOADING') throw new NotFoundException();
          const path = join(await this.folder(owner), id + '.part'),
            file = await open(
              path,
              constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW,
              0o600,
            );
          try {
            if (
              offset < Number(a.offset) &&
              offset + buffer.length <= Number(a.offset)
            ) {
              const prior = Buffer.alloc(buffer.length);
              await file.read(prior, 0, prior.length, offset);
              if (!prior.equals(buffer))
                throw new ConflictException({ code: 'CHUNK_CONFLICT' });
              return { offset: Number(a.offset) };
            }
            if (
              offset !== Number(a.offset) ||
              offset + buffer.length > Number(a.bytes)
            )
              throw new ConflictException({
                code: 'OFFSET',
                offset: Number(a.offset),
              });
            await file.write(buffer, 0, buffer.length, offset);
            await file.sync();
            await tx.learningAsset.update({
              where: { id },
              data: { offset: BigInt(offset + buffer.length) },
            });
            await new Promise((r) =>
              setTimeout(
                r,
                Math.max(
                  0,
                  Math.ceil((buffer.length / MiB) * 1000) -
                    (Date.now() - began),
                ),
              ),
            );
            return { offset: offset + buffer.length };
          } finally {
            await file.close();
          }
        },
        { timeout: 10000 },
      );
    });
  }
  async finish(owner: string, id: string) {
    return this.exclusive(owner, async () =>
      this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${owner}, 1805))`;
          const a = await tx.learningAsset.findFirst({
            where: { id, ownerId: owner },
          });
          if (!a) throw new NotFoundException();
          if (a.status === 'READY') return { id, status: 'READY' };
          if (a.offset !== a.bytes) throw failure('INCOMPLETE');
          const folder = await this.folder(owner),
            part = join(folder, id + '.part'),
            dest = join(folder, id + '.pdf');
          let path = part;
          try {
            await lstat(part);
          } catch {
            path = dest;
          }
          const file = await open(
            path,
            constants.O_RDONLY | constants.O_NOFOLLOW,
          );
          try {
            const stat = await file.stat();
            if (stat.size !== Number(a.bytes)) throw failure('FILE_SIZE');
            const head = Buffer.alloc(1024);
            await file.read(head, 0, 1024, 0);
            if (!head.toString('latin1').includes('%PDF-'))
              throw failure('INVALID_PDF');
            const hash = createHash('sha256');
            for await (const chunk of file.createReadStream({
              autoClose: false,
              start: 0,
            }))
              hash.update(chunk);
            if (hash.digest('hex') !== a.fingerprint) throw failure('HASH');
          } finally {
            await file.close();
          }
          if (path === part) await rename(part, dest);
          await tx.learningAsset.update({
            where: { id },
            data: { status: 'READY' },
          });
          return { id, status: 'READY' };
        },
        { timeout: 120000 },
      ),
    );
  }
  async remove(owner: string, id: string) {
    return this.exclusive(owner, async () =>
      this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${owner}, 1805))`;
        const a = await tx.learningAsset.findFirst({
          where: { id, ownerId: owner },
        });
        if (!a) throw new NotFoundException();
        const folder = await this.folder(owner);
        for (const ext of ['.part', '.pdf'])
          await unlink(join(folder, id + ext)).catch((e) => {
            if (e.code !== 'ENOENT') throw e;
          });
        await tx.learningAsset.delete({ where: { id } });
        return { removed: true, metadataPreserved: true };
      }),
    );
  }
  async download(owner: string, id: string, req: Request, res: Response) {
    const a = await this.asset(owner, id);
    if (a.status !== 'READY') throw new NotFoundException();
    for (let i = 0; this.active.has(owner); i++) {
      if (req.destroyed || i > 200)
        throw new ConflictException({ code: 'TRANSFER_BUSY' });
      await new Promise((r) => setTimeout(r, 50));
    }
    this.active.add(owner);
    let file: Awaited<ReturnType<typeof open>> | undefined;
    try {
      file = await open(
        join(await this.folder(owner), id + '.pdf'),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      const size = Number(a.bytes),
        range = req.headers.range;
      let start = 0,
        end = size - 1;
      if (range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range);
        if (!match) {
          res.status(416).setHeader('Content-Range', 'bytes */' + size);
          res.end();
          return;
        }
        start = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
        if (!Number.isSafeInteger(start) || start > end) {
          res.status(416).setHeader('Content-Range', 'bytes */' + size);
          res.end();
          return;
        }
        res
          .status(206)
          .setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      }
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', end - start + 1);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Disposition', 'inline; filename="book.pdf"');
      let sent = 0;
      const began = Date.now();
      const throttle = new Transform({
        transform(chunk, _enc, done) {
          sent += chunk.length;
          setTimeout(
            () => done(null, chunk),
            Math.max(0, Math.ceil((sent / MiB) * 1000) - (Date.now() - began)),
          );
        },
      });
      const stream = file.createReadStream({
        start,
        end,
        autoClose: false,
        highWaterMark: 64 * 1024,
      });
      await new Promise<void>((resolve, reject) => {
        const close = () => {
          stream.destroy();
          throttle.destroy();
          resolve();
        };
        res.once('close', close);
        res.once('finish', resolve);
        stream.once('error', reject);
        throttle.once('error', reject);
        stream.pipe(throttle).pipe(res);
      });
    } finally {
      this.active.delete(owner);
      await file?.close().catch(() => undefined);
    }
  }
  async inboxList(owner: string) {
    const dir = join(this.inbox, owner);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    if ((await lstat(dir)).isSymbolicLink() || await realpath(dir)!==dir) throw failure('INBOX');
    const names = await readdir(dir, { withFileTypes: true });
    const items: any[] = [];
    for (const n of names
      .filter(
        (x) => x.isFile() && !x.isSymbolicLink() && x.name.endsWith('.pdf'),
      )
      .slice(0, 500)) {
      const s = await lstat(join(dir, n.name));
      if (s.size > 0 && s.size <= this.maxBytes)
        items.push({ name: n.name, bytes: s.size });
    }
    return { items };
  }
  async importInbox(owner: string, id: string, name: string) {
    if (
      !name ||
      name.length > 300 ||
      name.includes('/') ||
      name.includes('\\') ||
      name === '.' ||
      name === '..'
    )
      throw failure('INBOX');
    const list = await this.inboxList(owner);
    if (!list.items.some((x) => x.name === name)) throw new NotFoundException();
    const a = await this.asset(owner, id);
    const path = join(this.inbox, owner, name),
      base = await realpath(join(this.inbox, owner));
    if ((await realpath(path)) !== join(base, name)) throw failure('INBOX');
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      if ((await file.stat()).size !== Number(a.bytes))
        throw failure('FILE_SIZE');
      let offset = Number(a.offset);
      while (offset < Number(a.bytes)) {
        const buffer = Buffer.alloc(Math.min(MiB, Number(a.bytes) - offset));
        const result = await file.read(buffer, 0, buffer.length, offset);
        if (result.bytesRead !== buffer.length) throw failure('INCOMPLETE');
        const out = await this.chunk(
          owner,
          id,
          offset,
          createHash('sha256').update(buffer).digest('hex'),
          buffer,
        );
        offset = out.offset;
      }
      return this.finish(owner, id);
    } finally {
      await file.close();
    }
  }
}
