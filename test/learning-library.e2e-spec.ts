import { randomUUID, createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { mkdir, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { requestBodyParsers } from '../src/config/body-parsers';
import { LibraryFilesService } from '../src/learning-library/infrastructure/library-files.service';
import { resetTestDatabase } from './reset-test-database';
const base = '/admin/learning-library',
  hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
describe('Private learning library production contracts', () => {
  let app: NestExpressApplication,
    db: PrismaService,
    files: LibraryFilesService,
    root: any,
    writer: any,
    reader: any,
    other: any,
    member: any;
  const pdf = Buffer.from('%PDF-1.7\nSynthetic learning test document\n%%EOF');
  const fixture = (bytes = pdf) => {
    const id = randomUUID(),
      eid = randomUUID();
    return {
      book: {
        id,
        title: 'Synthetic test book',
        author: 'QA',
        purpose: 'A reviewable question',
        cover: '',
        subjects: ['UX'],
        sectors: ['Education'],
        tags: [],
        status: 'reading',
        archived: false,
        currentEditionId: eid,
        createdAt: new Date().toISOString(),
      },
      edition: {
        id: eid,
        bookId: id,
        label: 'First',
        fingerprint: hash(bytes),
        bytes: bytes.length,
        filename: 'test.pdf',
        pageCount: 30,
        chapters: [],
        pageLabels: [],
        storage: 'local',
        createdAt: new Date().toISOString(),
      },
    };
  };
  const save = async (
    a: any,
    type: string,
    payload: any,
    revision?: number,
    id = randomUUID(),
  ) => {
    const current =
      revision ?? (await a.agent.get(base).expect(200)).body.revision;
    return a.agent
      .post(base + '/commands')
      .send({ expectedRevision: current, command: { id, type, payload } });
  };
  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    db = m.get(PrismaService);
    files = m.get(LibraryFilesService);
    await resetTestDatabase(db);
    app = m.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    app.use(...requestBodyParsers());
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    const passwordHash = await bcrypt.hash('SyntheticPass123!', 4);
    async function account(
      role: 'USER' | 'ADMIN',
      permissions = {},
      isRootAdmin = false,
    ) {
      const id = randomUUID(),
        email = id + '@example.invalid';
      await db.user.create({
        data: {
          id,
          email,
          name: 'Synthetic learning test',
          role,
          passwordHash,
          emailVerified: true,
          isRootAdmin,
          adminPermissions: permissions,
        },
      });
      const agent = request.agent(app.getHttpServer());
      await agent
        .post('/auth/login')
        .send({ email, password: 'SyntheticPass123!' })
        .expect(200);
      return { id, agent };
    }
    root = await account('ADMIN', {}, true);
    writer = await account('ADMIN', { LEARNING_LIBRARY: 'WRITE' });
    reader = await account('ADMIN', { LEARNING_LIBRARY: 'READ' });
    other = await account('ADMIN', { UX_LAB: 'WRITE' });
    member = await account('USER');
  });
  beforeEach(async () => {
    for (const t of [
      'learningMutation',
      'learningAsset',
      'learningPosition',
      'learningReading',
      'learningGoal',
      'learningMap',
      'learningNote',
      'learningEdition',
      'learningBook',
      'learningLibrary',
    ])
      await db[t].deleteMany();
  });
  afterAll(async () => {
    await app?.close();
  });
  it('rejects anonymous, member, unassigned admin and unverified email without programme prerequisites', async () => {
    await request(app.getHttpServer()).get(base).expect(401);
    await member.agent.get(base).expect(403);
    await other.agent.get(base).expect(403);
    await reader.agent
      .get(base)
      .expect(200)
      .expect('Cache-Control', 'private, no-store');
    expect(await db.learningLibrary.count()).toBe(0);
    await writer.agent.get(base + '/access').expect(200);
    await db.user.update({
      where: { id: writer.id },
      data: { emailVerified: false },
    });
    await writer.agent.get(base).expect(403);
    await db.user.update({
      where: { id: writer.id },
      data: { emailVerified: true },
    });
  });
  it('denies every write for READ, including range receipts and uploads', async () => {
    const f = fixture();
    expect((await save(reader, 'register', f)).status).toBe(403);
    await reader.agent
      .post(base + '/transfers')
      .send({ editionId: f.edition.id })
      .expect(403);
    await reader.agent
      .post(base + '/commands')
      .send({
        expectedRevision: 0,
        command: {
          id: randomUUID(),
          type: 'confirm',
          payload: { editionId: f.edition.id, start: 10, end: 12 },
        },
      })
      .expect(403);
  });
  it('persists separate resources and retries idempotently before revision checks', async () => {
    const f = fixture(),
      id = randomUUID(),
      payload = {
        expectedRevision: 0,
        command: { id, type: 'register', payload: f },
      };
    const [a, b] = await Promise.all([
      writer.agent.post(base + '/commands').send(payload),
      writer.agent.post(base + '/commands').send(payload),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.revision).toBe(1);
    expect(await db.learningBook.count()).toBe(1);
    expect(await db.learningMutation.count()).toBe(1);
    expect((await root.agent.get(base)).body.books).toHaveLength(0);
    await writer.agent
      .post(base + '/commands')
      .send({
        ...payload,
        command: {
          ...payload.command,
          payload: { ...f, book: { ...f.book, title: 'Changed' } },
        },
      })
      .expect(409);
  });
  it('rejects stale changes and malformed ownership or cross-domain fields', async () => {
    const f = fixture();
    expect((await save(writer, 'register', f)).status).toBe(201);
    const results = await Promise.all(
      ['One', 'Two'].map((title) =>
        save(writer, 'book', { id: f.book.id, changes: { title } }, 1),
      ),
    );
    expect(results.map((x) => x.status).sort()).toEqual([201, 409]);
    expect(
      (
        await save(writer, 'book', {
          id: f.book.id,
          changes: { ownerId: root.id },
        })
      ).status,
    ).toBe(400);
    expect((await save(writer, '__proto__', {})).status).toBe(400);
  });
  it('keeps notes and page coverage after server deletion, and cannot expose another owner’s asset', async () => {
    const f = fixture();
    expect((await save(writer, 'register', f)).status).toBe(201);
    expect(
      (
        await save(writer, 'note', {
          note: {
            id: randomUUID(),
            bookId: f.book.id,
            editionId: f.edition.id,
            page: 15,
            scope: 'page',
            quote: '',
            rectangles: [{ x: 0.1, y: 0.2, width: 0.2, height: 0.1 }],
            body: 'Private idea',
            tags: [],
            updatedAt: new Date().toISOString(),
          },
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await save(writer, 'confirm', {
          editionId: f.edition.id,
          start: 12,
          end: 15,
        })
      ).status,
    ).toBe(201);
    const a = (
      await writer.agent
        .post(base + '/transfers')
        .send({ editionId: f.edition.id })
        .expect(201)
    ).body;
    await root.agent.get(base + '/files/' + a.id).expect(404);
    await root.agent.delete(base + '/transfers/' + a.id).expect(404);
    await writer.agent
      .post(
        base + '/transfers/' + a.id + '/chunks?offset=0&sha256=' + hash(pdf),
      )
      .set('Content-Type', 'application/octet-stream')
      .send(pdf)
      .expect(201);
    await writer.agent
      .post(base + '/transfers/' + a.id + '/finish')
      .expect(201);
    await writer.agent
      .get(base + '/files/' + a.id)
      .set('Range', 'bytes=0-7')
      .expect(206)
      .expect('Content-Range', 'bytes 0-7/' + pdf.length)
      .expect('Cache-Control', 'private, no-store');
    await writer.agent.delete(base + '/transfers/' + a.id).expect(200);
    const d = (await writer.agent.get(base)).body;
    expect(d.notes).toHaveLength(1);
    expect(d.reading).toHaveLength(1);
    expect(d.editions[0].storage).toBe('local');
  });
  it('resumes interrupted chunks and rejects wrong offsets, corrupted chunks, and incomplete completion', async () => {
    const big = Buffer.concat([pdf, Buffer.alloc(1024 ** 2, 65)]),
      f = fixture(big);
    expect((await save(writer, 'register', f)).status).toBe(201);
    const a = (
        await writer.agent
          .post(base + '/transfers')
          .send({ editionId: f.edition.id })
      ).body,
      first = big.subarray(0, 1024 ** 2),
      tail = big.subarray(first.length);
    await writer.agent
      .post(
        base + '/transfers/' + a.id + '/chunks?offset=0&sha256=' + hash(pdf),
      )
      .set('Content-Type', 'application/octet-stream')
      .send(first)
      .expect(400);
    await writer.agent
      .post(
        base + '/transfers/' + a.id + '/chunks?offset=1&sha256=' + hash(first),
      )
      .set('Content-Type', 'application/octet-stream')
      .send(first)
      .expect(409);
    await writer.agent
      .post(
        base + '/transfers/' + a.id + '/chunks?offset=0&sha256=' + hash(first),
      )
      .set('Content-Type', 'application/octet-stream')
      .send(first)
      .expect(201);
    expect(
      (
        await writer.agent
          .post(base + '/transfers')
          .send({ editionId: f.edition.id })
      ).body.offset,
    ).toBe(first.length);
    await writer.agent
      .post(base + '/transfers/' + a.id + '/finish')
      .expect(400);
    await writer.agent
      .post(
        base + '/transfers/' + a.id + '/chunks?offset=0&sha256=' + hash(first),
      )
      .set('Content-Type', 'application/octet-stream')
      .send(first)
      .expect(201);
    await writer.agent
      .post(
        base +
          '/transfers/' +
          a.id +
          '/chunks?offset=' +
          first.length +
          '&sha256=' +
          hash(tail),
      )
      .set('Content-Type', 'application/octet-stream')
      .send(tail)
      .expect(201);
    await writer.agent
      .post(base + '/transfers/' + a.id + '/finish')
      .expect(201);
    await writer.agent
      .post(base + '/transfers/' + a.id + '/finish')
      .expect(201);
    expect((await writer.agent.get(base)).body.editions[0].storage).toBe(
      'server',
    );
  });
  it('reserves quota for incomplete files and rejects a corrupt final content hash', async () => {
    const f = fixture();
    expect((await save(writer, 'register', f)).status).toBe(201);
    await db.learningAsset.create({
      data: {
        ownerId: writer.id,
        editionId: randomUUID(),
        bytes: files.quota,
        fingerprint: 'a'.repeat(64),
      },
    });
    await writer.agent
      .post(base + '/transfers')
      .send({ editionId: f.edition.id })
      .expect(400);
    await db.learningAsset.deleteMany();
    const a = (
        await writer.agent
          .post(base + '/transfers')
          .send({ editionId: f.edition.id })
      ).body,
      wrong = Buffer.from(pdf);
    wrong[20] ^= 1;
    await writer.agent
      .post(
        base + '/transfers/' + a.id + '/chunks?offset=0&sha256=' + hash(wrong),
      )
      .set('Content-Type', 'application/octet-stream')
      .send(wrong)
      .expect(201);
    await writer.agent
      .post(base + '/transfers/' + a.id + '/finish')
      .expect(400);
    expect((await writer.agent.get(base)).body.editions[0].storage).toBe(
      'local',
    );
  });
  it('adopts only explicit regular files from the owner inbox; path traversal and symlinks fail', async () => {
    const f = fixture();
    expect((await save(writer, 'register', f)).status).toBe(201);
    const a = (
        await writer.agent
          .post(base + '/transfers')
          .send({ editionId: f.edition.id })
      ).body,
      dir = join(files.inbox, writer.id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'explicit.pdf'), pdf);
    await symlink('/etc/passwd', join(dir, 'escape.pdf')).catch(() => {});
    const list = (await writer.agent.get(base + '/inbox')).body;
    expect(list.items.some((x) => x.name === 'escape.pdf')).toBe(false);
    await writer.agent
      .post(base + '/transfers/' + a.id + '/import')
      .send({ name: '../explicit.pdf' })
      .expect(400);
    await writer.agent
      .post(base + '/transfers/' + a.id + '/import')
      .send({ name: 'explicit.pdf' })
      .expect(201);
  });
  it('export/restore retains identity and references without modifying other domains', async () => {
    const snapshot = async () => ({
      users: await db.user.findMany({
        select: { id: true, role: true, adminPermissions: true },
      }),
      journey: await db.userJourneyState.findMany(),
      cv: await db.userCv.findMany(),
      consulting: await db.careerConsultingCase.findMany(),
      founder: await db.founderWorkspace.findMany(),
    });
    const before = await snapshot(),
      f = fixture();
    expect((await save(writer, 'register', f)).status).toBe(201);
    const exported = (await writer.agent.get(base + '/export')).body;
    expect((await save(writer, 'restore', { document: exported })).status).toBe(
      201,
    );
    expect((await writer.agent.get(base)).body.books).toHaveLength(1);
    expect(await snapshot()).toEqual(before);
  });
 it('creates a Founder task only through its explicit contract with its own authorization and idempotency',async()=>{
  const template=(await root.agent.get('/admin/founder-workspace/template')).body;
  const plan=(await root.agent.post('/admin/founder-workspace/plans').send({requestId:randomUUID(),document:template}).expect(201)).body;
  const taskId=randomUUID(),task={requestId:taskId,taskId,expectedRevision:plan.revision,title:'Synthetic explicit reading task',cycleId:plan.document.cycles[0].id,laneId:plan.document.lanes[0].id,start:plan.document.cycles[0].start,end:plan.document.cycles[0].start,hours:1,resourceUrl:'https://example.invalid/admin/learning/practice'};
  await reader.agent.post('/admin/founder-workspace/plans/'+plan.id+'/tasks').send(task).expect(403);
  await root.agent.post('/admin/founder-workspace/plans/'+plan.id+'/tasks').send(task).expect(201);
  await root.agent.post('/admin/founder-workspace/plans/'+plan.id+'/tasks').send(task).expect(201);
  const updated=(await root.agent.get('/admin/founder-workspace/plans/'+plan.id)).body;
  expect(updated.document.tasks.filter(x=>x.id===taskId)).toHaveLength(1);
  expect(updated.document.tasks.find(x=>x.id===taskId).status).toBe('planned');
 });

});
