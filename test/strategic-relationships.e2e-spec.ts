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
import {blank} from '../src/strategic-relationships/domain/relationship-document';
import { resetTestDatabase } from './reset-test-database';

describe('Strategic relationships isolation, ownership and durable concurrency', () => {
  let app: NestExpressApplication, db: PrismaService;
  let root: any, writer: any, reader: any, outsider: any, member: any;
  const base = '/admin/strategic-relationships';
  const document = () => JSON.parse(JSON.stringify(blank()));
  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).overrideGuard(ThrottlerGuard).useValue({ canActivate: () => true }).compile();
    db = m.get(PrismaService); await resetTestDatabase(db);
    app = m.createNestApplication<NestExpressApplication>(); app.use(cookieParser()); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    const passwordHash = await bcrypt.hash('SyntheticPass123!', 4);
    const account = async (role: 'ADMIN'|'USER', permissions = {}, isRootAdmin = false) => {
      const id = randomUUID(), email = id + '@example.com';
      await db.user.create({ data: { id, email, name: 'Synthetic founder QA', passwordHash, role, isRootAdmin, emailVerified: true, adminPermissions: permissions } });
      return { id, email, agent: request.agent(app.getHttpServer()) };
    };
    root = await account('ADMIN', {}, true); writer = await account('ADMIN', { STRATEGIC_RELATIONSHIPS: 'WRITE' }); reader = await account('ADMIN', { STRATEGIC_RELATIONSHIPS: 'READ' }); outsider = await account('ADMIN', { UX_LAB: 'WRITE' }); member = await account('USER');
    await app.init();
    for (const a of [root, writer, reader, outsider, member]) await a.agent.post('/auth/login').send({ email: a.email, password: 'SyntheticPass123!' }).expect(200);
  });
  beforeEach(async()=>{await db.strategicRelationshipsWorkspace.deleteMany();});
  afterAll(async () => { await app?.close(); });
  it('denies anonymous/member/unassigned admin, supports READ, and requires no programme profile', async () => {
    await request(app.getHttpServer()).get(base + '/template').expect(401);
    await member.agent.get(base + '/template').expect(403); await outsider.agent.get(base + '/workspaces').expect(403);
    expect((await reader.agent.get(base + '/access').expect(200)).body.canWrite).toBe(false);
    expect((await root.agent.get(base + '/access').expect(200)).body.canWrite).toBe(true);
    const template = (await writer.agent.get(base + '/template').expect(200)).body; expect(template.people).toHaveLength(0);expect(template.mode).toBe('personal');
    await reader.agent.post(base + '/workspaces').send({ requestId: randomUUID(), document: document() }).expect(403);
    await member.agent.get('/applications').expect(403);
  });
  it('creation is idempotent under retries, owner-scoped and private', async () => {
    const body = { requestId: randomUUID(), document: document() };
    const [a,b] = await Promise.all([writer.agent.post(base + '/workspaces').send(body).expect(201), writer.agent.post(base + '/workspaces').send(body).expect(201)]);
    expect(a.body.id).toBe(b.body.id); expect(a.body.revision).toBe(0); expect(a.body.document.id).toBe(a.body.id);
    await writer.agent.post(base + '/workspaces').send({ ...body, document: { ...body.document, settings:{...body.document.settings,activePhase:'backend'} } }).expect(409);
    await reader.agent.get(base + '/workspaces/' + a.body.id).expect(404); await outsider.agent.get(base + '/workspaces/' + a.body.id).expect(403);
    await writer.agent.get(base + '/workspaces/' + a.body.id).expect(200).expect('Cache-Control', 'private, no-store');
    expect((await reader.agent.get(base + '/workspaces').expect(200)).body.items).toHaveLength(0);
  });
  it('Root and other owners cannot read or modify a different personal workspace',async()=>{const c=(await writer.agent.post(base+'/workspaces').send({requestId:randomUUID(),document:document()}).expect(201)).body;await root.agent.get(base+'/workspaces/'+c.id).expect(404);await root.agent.patch(base+'/workspaces/'+c.id).send({requestId:randomUUID(),expectedRevision:0,document:document()}).expect(404);});
  it('READ cannot update even its own data', async () => {
    const row = await db.strategicRelationshipsWorkspace.create({ data: { ownerId: reader.id, title: 'Synthetic reader plan', document: document(), createRequestId: randomUUID(), createHash: 'synthetic' } });
    await reader.agent.get(base + '/workspaces/' + row.id).expect(200);
    await reader.agent.patch(base + '/workspaces/' + row.id).send({ requestId: randomUUID(), expectedRevision: 0, document: document() }).expect(403);
  });
  it('updates persist across reads; concurrent retries do not duplicate mutations', async () => {
    const c = (await writer.agent.post(base + '/workspaces').send({ requestId: randomUUID(), document: document() }).expect(201)).body;
    const next = document(); next.settings.activePhase='backend';
    const body = { requestId: randomUUID(), expectedRevision: 0, document: next };
    const [a,b] = await Promise.all([writer.agent.patch(base + '/workspaces/' + c.id).send(body), writer.agent.patch(base + '/workspaces/' + c.id).send(body)]);
    expect(a.status).toBe(200); expect(b.status).toBe(200); expect(a.body.revision).toBe(1); expect(b.body.revision).toBe(1);
    expect(await db.strategicRelationshipsMutation.count({ where: { workspaceId: c.id } })).toBe(1);
    expect((await writer.agent.get(base + '/workspaces/' + c.id).expect(200)).body.document.settings.activePhase).toBe('backend');
    await writer.agent.patch(base + '/workspaces/' + c.id).send({ ...body, document: document() }).expect(409);
  });
  it('concurrent different writes and stale revisions cannot silently overwrite each other', async () => {
    const c = (await writer.agent.post(base + '/workspaces').send({ requestId: randomUUID(), document: document() }).expect(201)).body;
    const [a,b] = await Promise.all(['A','B'].map(title => writer.agent.patch(base + '/workspaces/' + c.id).send({ requestId: randomUUID(), expectedRevision: 0, document: {...document(),settings:{...document().settings,activePhase:title}} })));
    expect([a.status,b.status].sort()).toEqual([200,409]);
    await writer.agent.patch(base + '/workspaces/' + c.id).send({ requestId: randomUUID(), expectedRevision: 0, document: document() }).expect(409);
    expect((await writer.agent.get(base + '/workspaces/' + c.id).expect(200)).body.revision).toBe(1);
  });
  it('validates nested data server-side and exposes no member endpoint', async () => {
    const d:any=document();d.ownerId=writer.id;
    await root.agent.post(base+'/workspaces').send({requestId:randomUUID(),document:d}).expect(400);delete d.ownerId;d.mode='training';
    await root.agent.post(base+'/workspaces').send({requestId:randomUUID(),document:d}).expect(400);d.mode='personal';d.settings.startDate='2026-02-30';
    await root.agent.post(base+'/workspaces').send({requestId:randomUUID(),document:d}).expect(400);
    await member.agent.get('/strategic-relationships/workspaces').expect(404);
  });
  it('does not mutate programme progress, consulting, research, permissions, or CV records', async () => {
    const snapshot = async () => ({ users: await db.user.findMany({ select: { id: true, role: true, adminPermissions: true, isRootAdmin: true } }), journey: await db.userJourneyState.findMany(), founder:await db.founderWorkspace.findMany(),consulting: await db.careerConsultingCase.findMany(), research: await db.individualResearchCase.findMany(), cv: await db.userCv.findMany() });
    const before = await snapshot(); const c = (await root.agent.post(base + '/workspaces').send({ requestId: randomUUID(), document: document() }).expect(201)).body;
    await root.agent.patch(base + '/workspaces/' + c.id).send({ requestId: randomUUID(), expectedRevision: 0, document: document() }).expect(200);
    expect(await snapshot()).toEqual(before);
  });
});
