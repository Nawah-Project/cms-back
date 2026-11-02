import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConsultingRoadmapService } from '../src/career-consulting/roadmap.service';
import { resetTestDatabase } from './reset-test-database';

describe('Consultant-only preparation roadmaps', () => {
  let app: NestExpressApplication,
    db: PrismaService,
    service: ConsultingRoadmapService;
  let root: any, owner: any, reader: any, outsider: any, member: any, lab: any;
  const url = '/admin/career-consulting/roadmaps';
  const content = {
    context: 'SYNTHETIC-PRIVATE-CONTEXT',
    notes: { prepare: 'PRIVATE-PREPARATION' },
    observations: [
      { kind: 'QUESTION', text: 'What changed?', source: 'Synthetic' },
    ],
    sources: [
      {
        title: 'Example source',
        url: 'https://example.com/jobs',
        checked: '2026-11-02',
        status: 'Illustrative only',
        summary: 'Not a real vacancy',
      },
    ],
  };
  const body = () => ({
    requestId: randomUUID(),
    title: 'Synthetic preparation',
    content,
    retentionUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
  });
  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    db = m.get(PrismaService);
    service = m.get(ConsultingRoadmapService);
    await resetTestDatabase(db);
    app = m.createNestApplication<NestExpressApplication>();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    const hash = await bcrypt.hash('SyntheticPass123!', 4);
    async function account(
      role: 'ADMIN' | 'USER',
      permissions = {},
      isRootAdmin = false,
    ) {
      const id = randomUUID(),
        email = id + '@example.com';
      await db.user.create({
        data: {
          id,
          email,
          name: 'Synthetic',
          role,
          adminPermissions: permissions,
          isRootAdmin,
          emailVerified: true,
          passwordHash: hash,
        },
      });
      return { id, email, agent: request.agent(app.getHttpServer()) };
    }
    root = await account('ADMIN', {}, true);
    owner = await account('ADMIN', { CAREER_CONSULTING: 'WRITE' });
    reader = await account('ADMIN', { CAREER_CONSULTING: 'READ' });
    outsider = await account('ADMIN', { CAREER_CONSULTING: 'WRITE' });
    member = await account('USER');
    lab = await account('ADMIN', { UX_LAB: 'WRITE' });
    await app.init();
    for (const a of [root, owner, reader, outsider, member, lab])
      await a.agent
        .post('/auth/login')
        .send({ email: a.email, password: 'SyntheticPass123!' })
        .expect(200);
  });
  afterAll(async () => {
    await app?.close();
  });
  it('scopes lists and content to owner/root, grants no member endpoint, and never creates cases or Journey progress', async () => {
    const before = {
      cases: await db.careerConsultingCase.count(),
      journey: await db.userJourneyState.findMany(),
      permissions: await db.user.findMany({
        select: {
          id: true,
          role: true,
          adminPermissions: true,
          isRootAdmin: true,
        },
      }),
    };
    await request(app.getHttpServer())
      .get(url + '/template')
      .expect(401);
    await member.agent.get(url).expect(403);
    await lab.agent.get(url).expect(403);
    const template = (await reader.agent.get(url + '/template').expect(200))
      .body;
    expect(template.nodes.map((n: any) => n.id)).toEqual(expect.arrayContaining(["agreement", "self", "market", "decide", "followup"]));
    expect(template.edges.some((e: any) => e.return)).toBe(true);
    expect(JSON.stringify(template)).not.toContain('SYNTHETIC-PRIVATE');
    const requestBody = body();
    const [a, b] = await Promise.all([
      owner.agent.post(url).send(requestBody).expect(201),
      owner.agent.post(url).send(requestBody).expect(201),
    ]);
    expect(a.body.id).toBe(b.body.id);
    await owner.agent
      .post(url)
      .send({ ...requestBody, title: 'Different payload' })
      .expect(409);
    await root.agent
      .get(url + '/' + a.body.id)
      .expect(200)
      .expect('Cache-Control', 'private, no-store');
    await outsider.agent.get(url + '/' + a.body.id).expect(404);
    expect((await outsider.agent.get(url).expect(200)).body.items).toEqual([]);
    await reader.agent.get(url + '/' + a.body.id).expect(404);
    await member.agent
      .get('/career-consulting/roadmaps/' + a.body.id)
      .expect(404);
    const ownRead = await db.careerConsultingRoadmap.create({
      data: {
        ownerId: reader.id,
        title: 'Reader own map',
        content,
        retentionUntil: new Date(Date.now() + 86400000),
        requestId: randomUUID(),
        requestHash: 'synthetic',
      },
    });
    await reader.agent.get(url + '/' + ownRead.id).expect(200);
    await reader.agent.post(url).send(body()).expect(403);
    await reader.agent
      .patch(url + '/' + ownRead.id)
      .send({
        requestId: randomUUID(),
        revision: 1,
        title: 'Edited title',
        content,
      })
      .expect(403);
    await reader.agent.delete(url + '/' + ownRead.id).expect(403);
    expect(await db.careerConsultingCase.count()).toBe(before.cases);
    expect(await db.userJourneyState.findMany()).toEqual(before.journey);
    expect(
      await db.user.findMany({
        select: {
          id: true,
          role: true,
          adminPermissions: true,
          isRootAdmin: true,
        },
      }),
    ).toEqual(before.permissions);
  });
  it('preserves edits with revisions and idempotence and rejects unsafe source URLs/unknown stages', async () => {
    const c = (await owner.agent.post(url).send(body()).expect(201)).body;
    const update = {
      requestId: randomUUID(),
      revision: 1,
      title: 'Updated preparation',
      content: {
        ...content,
        notes: { self: 'Private preparation, not a session record' },
      },
    };
    const changed = (
      await owner.agent
        .patch(url + '/' + c.id)
        .send(update)
        .expect(200)
    ).body;
    expect(changed.revision).toBe(2);
    expect(changed.retentionUntil).toBe(c.retentionUntil);
    expect(
      (
        await owner.agent
          .patch(url + '/' + c.id)
          .send(update)
          .expect(200)
      ).body.revision,
    ).toBe(2);
    await owner.agent
      .patch(url + '/' + c.id)
      .send({ ...update, requestId: randomUUID() })
      .expect(409);
    await owner.agent
      .patch(url + '/' + c.id)
      .send({ ...update, title: 'Reused key changed payload' })
      .expect(409);
    await owner.agent
      .post(url)
      .send({
        ...body(),
        content: {
          ...content,
          sources: [{ ...content.sources[0], url: 'javascript:alert(1)' }],
        },
      })
      .expect(400);
    await owner.agent
      .post(url)
      .send({
        ...body(),
        content: { ...content, notes: { imaginary: 'Unknown stage' } },
      })
      .expect(400);
    await owner.agent
      .post(url)
      .send({ ...body(), ownerId: outsider.id })
      .expect(400);
    await owner.agent
      .post(url)
      .send({
        ...body(),
        retentionUntil: new Date(Date.now() + 400 * 86400000).toISOString(),
      })
      .expect(400);
  });
  it('does not expose or silently extend expired maps; retention and deletion affect maps only', async () => {
    const c = (await owner.agent.post(url).send(body()).expect(201)).body;
    await db.careerConsultingRoadmap.update({
      where: { id: c.id },
      data: { retentionUntil: new Date(Date.now() - 1000) },
    });
    await root.agent.get(url + '/' + c.id).expect(404);
    expect(
      (await owner.agent.get(url).expect(200)).body.items.some(
        (m: any) => m.id === c.id,
      ),
    ).toBe(false);
    await service.purgeExpired();
    expect(
      await db.careerConsultingRoadmap.findUnique({ where: { id: c.id } }),
    ).toBeNull();
    const d = (await owner.agent.post(url).send(body()).expect(201)).body;
    await outsider.agent.delete(url + '/' + d.id).expect(200);
    expect(
      await db.careerConsultingRoadmap.findUnique({ where: { id: d.id } }),
    ).not.toBeNull();
    await owner.agent.delete(url + '/' + d.id).expect(200);
    await owner.agent.delete(url + '/' + d.id).expect(200);
    expect(
      await db.careerConsultingRoadmap.findUnique({ where: { id: d.id } }),
    ).toBeNull();
  });
});
