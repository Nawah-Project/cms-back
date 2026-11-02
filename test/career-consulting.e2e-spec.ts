import { randomUUID } from 'node:crypto';
import { readFile, access, mkdir, writeFile, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import * as bcrypt from 'bcryptjs';
import { ProfileService } from '../src/profile/profile.service';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CareerConsultingService } from '../src/career-consulting/consulting.service';
import { ConsultingFilesService } from '../src/career-consulting/consulting-files.service';
import { OperationsPolicyService } from '../src/operations/operations-policy.service';
import { AccountDeletionService } from '../src/admin/account-deletion.service';
import { AccountCvCleanupService } from '../src/admin/account-cv-cleanup.service';
import { CV_STORAGE_DIR } from '../src/profile/profile.constants';
import { CONSULTING_CATALOG } from '../src/career-consulting/catalog';
import { resetTestDatabase } from './reset-test-database';

describe('Career Consulting — isolated PostgreSQL and private files', () => {
  let app: NestExpressApplication,
    db: PrismaService,
    service: CareerConsultingService,
    files: ConsultingFilesService,
    policy: OperationsPolicyService;
  let root: any, reader: any, outsider: any, lab: any, hash: string;
  const rid = () => ({ requestId: randomUUID() });
  const future = () => new Date(Date.now() + 30 * 86400000).toISOString();
  const a = (id: string) => `/admin/career-consulting/cases/${id}`;
  const m = (id: string) => `/career-consulting/cases/${id}`;
  const pdf = Buffer.from('%PDF-1.7\n1 0 obj <</Type /Catalog>> endobj\n%%EOF');
  async function account(
    name: string,
    permissions?: Record<string, string>,
    isRoot = false,
    verified = true,
  ) {
    const id = randomUUID();
    const u = await db.user.create({
      data: {
        id,
        name,
        email: `${id}@example.com`,
        passwordHash: hash,
        emailVerified: verified,
        ...(permissions || isRoot
          ? {
              role: 'ADMIN',
              isRootAdmin: isRoot,
              adminPermissions: permissions ?? {},
            }
          : {}),
      },
    });
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/login')
      .send({ email: u.email, password: 'SyntheticPass123!' })
      .expect(200);
    return { id, agent, email: u.email };
  }
  async function create(u: any, extra = {}) {
    return (
      await root.agent
        .post('/admin/career-consulting/cases')
        .send({
          ...rid(),
          userId: u.id,
          title: 'Synthetic career case',
          purpose: 'Explore the person’s career question with evidence',
          retentionUntil: future(),
          ...extra,
        })
        .expect(201)
    ).body;
  }
  async function active(u: any, extra = {}) {
    const c = await create(u, extra);
    await root.agent
      .post(a(c.id) + '/state')
      .send({ ...rid(), action: 'INVITE' })
      .expect(201);
    await u.agent
      .post(m(c.id) + '/accept')
      .send({
        ...rid(),
        confirmed: true,
        agreementVersion: 'career-service-v1',
      })
      .expect(201);
    return c;
  }
  async function detail(c: any) {
    return (await root.agent.get(a(c.id)).expect(200)).body;
  }
  async function work(
    c: any,
    kind: string,
    data: any,
    notes = 'STAFF-PRIVATE-MARKER',
  ) {
    const d = await detail(c);
    const old =
      kind === 'WORK' ? d.items.find((x: any) => x.kind === 'WORK') : null;
    const url = a(c.id) + '/items' + (old ? '/' + old.id : '');
    const body = {
      ...rid(),
      kind,
      title: 'Synthetic ' + kind,
      data,
      privateNotes: notes,
      language: 'en',
      ...(old ? { revision: old.revision } : {}),
    };
    const saved = (
      await (old ? root.agent.patch(url) : root.agent.post(url))
        .send(body)
        .expect(old ? 200 : 201)
    ).body;
    return (await detail(c)).items.find((i: any) => i.id === saved.id);
  }
  async function publish(c: any, item: any, key = rid()) {
    return (
      await root.agent
        .post(a(c.id) + `/items/${item.id}/publish`)
        .send({ ...key, revision: item.revision })
        .expect(201)
    ).body;
  }
  beforeAll(async () => {
    hash = await bcrypt.hash('SyntheticPass123!', 4);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    db = module.get(PrismaService);
    service = module.get(CareerConsultingService);
    files = module.get(ConsultingFilesService);
    policy = module.get(OperationsPolicyService);
    await resetTestDatabase(db);
    await db.user.create({
      data: {
        name: 'Synthetic seed root',
        email: 'seed@example.com',
        passwordHash: hash,
        role: 'ADMIN',
        isRootAdmin: true,
        emailVerified: true,
      },
    });
    app = module.createNestApplication<NestExpressApplication>();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    root = await account('Synthetic root', {}, true);
    reader = await account('Assigned reader', { CAREER_CONSULTING: 'READ' });
    outsider = await account('Unassigned writer', {
      CAREER_CONSULTING: 'WRITE',
    });
    lab = await account('Research only', {
      UX_LAB: 'WRITE',
      INDIVIDUAL_RESEARCH: 'WRITE',
    });
  });
  afterAll(async () => {
    await app?.close();
  });
  it('is independent of CV, specialism, research and programme readiness, and enforces case ACL/READ', async () => {
    const u = await account('No CV or specialism'),
      other = await account('Other client'),
      unverified = await account('Unverified', undefined, false, false);
    const baseline = await db.userJourneyState.findMany({
      orderBy: { userId: 'asc' },
    });
    const key = { ...rid(), retentionUntil: future() };
    const c = await create(u, { ...key, allowedAdminIds: [reader.id] });
    expect((await create(u, { ...key, allowedAdminIds: [reader.id] })).id).toBe(
      c.id,
    );
    await u.agent.get(m(c.id)).expect(404);
    await outsider.agent.get(a(c.id)).expect(404);
    await lab.agent.get('/admin/career-consulting/catalog').expect(403);
    await reader.agent.get(a(c.id)).expect(200);
    await reader.agent
      .post(a(c.id) + '/state')
      .send({ ...rid(), action: 'INVITE' })
      .expect(403);
    await root.agent
      .post(a(c.id) + '/items')
      .send({
        ...rid(),
        kind: 'EVIDENCE',
        title: 'Forbidden before agreement',
        data: {},
      })
      .expect(403);
    await root.agent
      .post(a(c.id) + '/state')
      .send({ ...rid(), action: 'INVITE' })
      .expect(201);
    await u.agent
      .get('/career-consulting/availability')
      .expect(200)
      .expect((r) => expect(r.body.available).toBe(true));
    await other.agent.get(m(c.id)).expect(404);
    await unverified.agent.get('/career-consulting/availability').expect(403);
    await u.agent
      .post(m(c.id) + '/accept')
      .send({
        ...rid(),
        confirmed: false,
        agreementVersion: 'career-service-v1',
      })
      .expect(400);
    await u.agent
      .post(m(c.id) + '/accept')
      .send({
        ...rid(),
        confirmed: true,
        agreementVersion: 'career-service-v1',
      })
      .expect(201);
    await u.agent.get('/applications').expect(403);
    expect(await db.userCv.count({ where: { userId: u.id } })).toBe(0);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: u.id } })).targetJobTitle,
    ).toBeNull();
    expect(
      await db.userJourneyState.findMany({ orderBy: { userId: 'asc' } }),
    ).toEqual(baseline);
    expect(await db.individualResearchCase.count()).toBe(0);
  });
  for (const scenario of ['unclear-direction', 'clear-goal-search-not-working'])
    it(`completes two-role practice: ${scenario}, private drafts, versioned review and client decision`, async () => {
      const u = await account('Synthetic ' + scenario),
        c = await active(u);
      const baseline = await db.userJourneyState.findUnique({
        where: { userId: u.id },
      });
      const w = await work(c, 'WORK', {
        presentingConcern:
          scenario === 'unclear-direction'
            ? 'I need a direction before I have a CV'
            : 'I know the role, interviews are not happening',
        goal: 'Choose an evidence-based next step',
        criteria: 'A tested next step linked to the person’s priorities',
        context: 'Check constraints and evidence before assuming a CV issue',
        nextActor: 'TOGETHER',
        nextStep: 'Review two concrete examples',
      });
      await publish(c, w);
      const session = await work(c, 'SESSION', {
        goal: 'Understand context and agree a useful question',
        agenda: 'What has happened? What would help?',
        scheduledAt: new Date().toISOString(),
        stage: 'HELD',
        summary: 'We agreed to compare evidence before deciding.',
        followUp: 'An adapted qualitative activity',
        meetingUrl: 'https://example.com/meeting',
      });
      await publish(c, session);
      const item = await work(c, 'ACTIVITY', {
        catalogId:
          scenario === 'unclear-direction'
            ? 'experience-evidence'
            : 'search-audit',
        goal: 'Explore the agreed question',
        rationale: 'Fits this question, without assuming a single cause',
        expectedOutput: 'Concrete examples and questions to verify',
      });
      const key = rid(),
        p = await publish(c, item, key);
      expect((await publish(c, item, key)).id).toBe(p.id);
      expect((await publish(c, item)).id).toBe(p.id);
      const person = (await u.agent.get(m(c.id)).expect(200)).body;
      expect(JSON.stringify(person)).not.toContain('STAFF-PRIVATE-MARKER');
      expect(person.items).toBeUndefined();
      const publication = person.publications.find((x: any) => x.id === p.id);
      const answerKey = publication.content.prompts[0].key;
      const answers = { [answerKey]: 'CLIENT-PRIVATE-DRAFT' };
      await u.agent
        .post(m(c.id) + '/response-draft')
        .send({ ...rid(), publicationId: p.id, answers, revision: 0 })
        .expect(201);
      expect(JSON.stringify(await detail(c))).not.toContain(
        'CLIENT-PRIVATE-DRAFT',
      );
      const privateCopy = (await u.agent.get(m(c.id)).expect(200)).body;
      expect(privateCopy.drafts[0].answers[answerKey]).toBe(
        'CLIENT-PRIVATE-DRAFT',
      );
      const draftRevision = privateCopy.drafts[0].revision;
      const submitKey = rid(),
        payload = {
          ...submitKey,
          publicationId: p.id,
          answers,
          revision: draftRevision,
        };
      const sub = (
        await u.agent
          .post(m(c.id) + '/submissions')
          .send(payload)
          .expect(201)
      ).body;
      expect(
        (
          await u.agent
            .post(m(c.id) + '/submissions')
            .send(payload)
            .expect(201)
        ).body.id,
      ).toBe(sub.id);
      await root.agent
        .post(a(c.id) + `/submissions/${sub.id}/review`)
        .send({
          ...rid(),
          body: 'This specific example supports our working understanding.',
          nextStep: 'Test one alternative before committing',
          revision: 0,
        })
        .expect(201);
      const next = (await u.agent.get(m(c.id)).expect(200)).body.drafts[0];
      const repeated = (
        await u.agent
          .post(m(c.id) + '/submissions')
          .send({
            ...rid(),
            publicationId: p.id,
            answers,
            revision: next.revision,
          })
          .expect(201)
      ).body;
      expect(repeated.id).toBe(sub.id);
      const sub2 = (
        await u.agent
          .post(m(c.id) + '/submissions')
          .send({
            ...rid(),
            publicationId: p.id,
            answers: { [answerKey]: 'A revised example after review' },
            revision: next.revision,
          })
          .expect(201)
      ).body;
      expect(sub2.id).not.toBe(sub.id);
      const reviewed = await db.careerConsultingReview.findUniqueOrThrow({
        where: { submissionId: sub.id },
      });
      expect(reviewed.submissionId).not.toBe(sub2.id);
      await root.agent
        .patch(a(c.id) + `/items/${item.id}`)
        .send({
          ...rid(),
          kind: 'ACTIVITY',
          title: 'Changed activity',
          data: item.draft,
          privateNotes: 'Private',
          revision: item.revision + 1,
        })
        .expect(409);
      const rec = await work(c, 'RECOMMENDATION', {
        advice: 'Test one role through a short evidence-gathering step',
        reasons:
          'Examples support this, but a market assumption remains untested',
        alternatives:
          'Another role is possible, with a different learning cost',
        limitations:
          'No current demand conclusion without a dated local source',
        nextStep: 'Arrange one information interview, then reconsider',
      });
      const rp = await publish(c, rec);
      await u.agent
        .post(m(c.id) + '/decisions')
        .send({
          ...rid(),
          publicationId: rp.id,
          choice: 'REQUEST_CHANGE',
          body: 'I prefer to compare a second option first',
        })
        .expect(201);
      await u.agent
        .post(m(c.id) + '/comments')
        .send({
          ...rid(),
          targetKind: 'PUBLICATION',
          targetId: rp.id,
          body: 'Can we change the goal before choosing?',
        })
        .expect(201);
      await work(c, 'WORK', {
        ...w.draft,
        beforeNow:
          'The person compared evidence and chose a feasible next step, not a guaranteed job',
        futureSteps: 'Review the next experiment in two weeks',
      }).then((i) => publish(c, i));
      await root.agent
        .post(a(c.id) + '/state')
        .send({ ...rid(), action: 'COMPLETE' })
        .expect(201);
      await u.agent
        .post(m(c.id) + '/comments')
        .send({
          ...rid(),
          targetKind: 'CASE',
          body: 'Cannot add new work to a closed case',
        })
        .expect(403);
      expect(
        await db.userJourneyState.findUnique({ where: { userId: u.id } }),
      ).toEqual(baseline);
      const audit = await db.careerConsultingEvent.findMany({
        where: { caseId: c.id },
      });
      expect(JSON.stringify(audit)).not.toContain('CLIENT-PRIVATE-DRAFT');
      expect(JSON.stringify(audit)).not.toContain('STAFF-PRIVATE-MARKER');
    });
  it('binds request identity to the target, rejects nested private content and enforces withdrawal', async () => {
    const u = await account('Withdrawal client'),
      c = await active(u);
    const one = await work(c, 'EVIDENCE', {
        sourceType: 'CLIENT_ACCOUNT',
        source: 'Conversation today',
        body: 'Reported experience',
      }),
      two = await work(c, 'EVIDENCE', {
        sourceType: 'OBSERVATION',
        source: 'Observed work',
        body: 'A different source',
      });
    const key = rid();
    await publish(c, one, key);
    await root.agent
      .post(a(c.id) + `/items/${two.id}/publish`)
      .send({ ...key, revision: two.revision })
      .expect(409);
    await root.agent
      .patch(a(c.id) + `/items/${one.id}`)
      .send({
        ...rid(),
        kind: 'EVIDENCE',
        title: 'Malicious field',
        revision: one.revision,
        data: { ...one.draft, privateNotes: 'Never publish' },
      })
      .expect(400);
    await u.agent
      .post(m(c.id) + '/programme-sharing')
      .send({ ...rid(), enabled: true })
      .expect(201);
    await root.agent
      .get(a(c.id) + '/programme')
      .expect(200)
      .expect((r) => expect(r.body.shared).toBe(true));
    await u.agent
      .post(m(c.id) + '/withdraw')
      .send(rid())
      .expect(201);
    await root.agent
      .post(a(c.id) + '/items')
      .send({
        ...rid(),
        kind: 'SESSION',
        title: 'Work must stop',
        data: { goal: 'Cannot proceed' },
      })
      .expect(403);
    await u.agent
      .post(m(c.id) + '/comments')
      .send({ ...rid(), targetKind: 'CASE', body: 'Blocked' })
      .expect(403);
    await root.agent
      .get(a(c.id) + '/programme')
      .expect(200)
      .expect((r) => expect(r.body.shared).toBe(false));
    await u.agent.get(m(c.id)).expect(200);
  });
  it('protects private PDFs, includes quota, preserves files from old CV cleanup, and queues deletion', async () => {
    const u = await account('File client'),
      other = await account('Other file client'),
      c = await active(u);
    const key = rid();
    const before = await policy.storage();
    const up = () =>
      u.agent
        .post(m(c.id) + '/files')
        .field('requestId', key.requestId)
        .attach('file', pdf, {
          filename: 'private-work.pdf',
          contentType: 'application/pdf',
        });
    const f = (await up().expect(201)).body;
    expect((await up().expect(201)).body.id).toBe(f.id);
    expect((await policy.storage()).consultingBytes).toBe(
      before.consultingBytes + pdf.length,
    );
    const row = await db.careerConsultingFile.findUniqueOrThrow({
      where: { id: f.id },
    });
    expect(row.storageKey).toMatch(/^career-consulting\//);
    await root.agent.get(a(c.id) + `/files/${f.id}`).expect(404);
    expect((await detail(c)).files.some((x: any) => x.id === f.id)).toBe(false);
    await other.agent.get(m(c.id) + `/files/${f.id}`).expect(404);
    await request(app.getHttpServer())
      .get(m(c.id) + `/files/${f.id}`)
      .expect(401);
    await u.agent
      .get(m(c.id) + `/files/${f.id}`)
      .expect(200)
      .expect('Cache-Control', 'private, no-store');
    const past = new Date(Date.now() - 2 * 86400000);
    await utimes(files.path(row.storageKey), past, past);
    const oldCleaner = app.get(AccountCvCleanupService);
    await db.cvDeletionJob.create({ data: { storageKey: row.storageKey } });
    await oldCleaner.processPending();
    await app.get(ProfileService).cleanupOrphanedFiles();
    await db.cvDeletionJob.deleteMany({
      where: { storageKey: row.storageKey },
    });
    await access(files.path(row.storageKey));
    await u.agent
      .post(m(c.id) + `/files/${f.id}/share`)
      .send(rid())
      .expect(201);
    await root.agent.get(a(c.id) + `/files/${f.id}`).expect(200);
    await root.agent.delete(a(c.id)).send(rid()).expect(200);
    await files.processPending();
    await expect(access(files.path(row.storageKey))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(
      await db.careerConsultingFile.count({ where: { caseId: c.id } }),
    ).toBe(0);
  });
  it('shares only the current account CV by explicit client permission and revokes subsequent access', async () => {
    const u = await account('Current CV resource client'),
      c = await active(u),
      key = randomUUID() + '.pdf';
    await mkdir(CV_STORAGE_DIR, { recursive: true });
    await writeFile(join(CV_STORAGE_DIR, key), pdf);
    await db.userCv.create({
      data: {
        userId: u.id,
        originalName: 'current.pdf',
        mimeType: 'application/pdf',
        size: pdf.length,
        storageKey: key,
      },
    });
    await root.agent.get(a(c.id) + '/programme-cv').expect(403);
    await u.agent
      .post(m(c.id) + '/programme-sharing')
      .send({ ...rid(), enabled: true })
      .expect(201);
    await root.agent
      .get(a(c.id) + '/programme-cv')
      .expect(200)
      .expect('Cache-Control', 'private, no-store');
    await outsider.agent.get(a(c.id) + '/programme-cv').expect(404);
    await u.agent
      .post(m(c.id) + '/programme-sharing')
      .send({ ...rid(), enabled: false })
      .expect(201);
    await root.agent.get(a(c.id) + '/programme-cv').expect(403);
  });
  it('serializes consultation uploads against the shared CV storage quota', async () => {
    const u = await account('Quota client'),
      c = await active(u);
    const original = await db.operationsSettings.findUnique({
      where: { id: 'main' },
    });
    await db.operationsSettings.upsert({
      where: { id: 'main' },
      create: { id: 'main', value: { cvQuotaMiB: 1, diskReserveMiB: 0 } },
      update: { value: { cvQuotaMiB: 1, diskReserveMiB: 0 } },
    });
    try {
      const large = Buffer.concat([pdf, Buffer.alloc(700 * 1024)]);
      const send = () =>
        u.agent
          .post(m(c.id) + '/files')
          .field('requestId', randomUUID())
          .attach('file', large, {
            filename: 'quota.pdf',
            contentType: 'application/pdf',
          });
      const results = await Promise.all([send(), send()]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 403]);
    } finally {
      if (original)
        await db.operationsSettings.update({
          where: { id: 'main' },
          data: { value: original.value! },
        });
      else await db.operationsSettings.delete({ where: { id: 'main' } });
    }
  });
  it('retention and permanent account deletion include consultation files; no silent retention extension', async () => {
    const u = await account('Retention client'),
      c = await active(u);
    const retentionRevision = (await detail(c)).revision;
    await root.agent
      .patch(a(c.id))
      .send({
        ...rid(),
        revision: retentionRevision,
        retentionUntil: new Date(Date.now() + 60 * 86400000).toISOString(),
      })
      .expect(409);
    const f = (
      await u.agent
        .post(m(c.id) + '/files')
        .field('requestId', randomUUID())
        .attach('file', pdf, {
          filename: 'expires.pdf',
          contentType: 'application/pdf',
        })
        .expect(201)
    ).body;
    const row = await db.careerConsultingFile.findUniqueOrThrow({
      where: { id: f.id },
    });
    await db.careerConsultingCase.update({
      where: { id: c.id },
      data: { retentionUntil: new Date(Date.now() - 1000) },
    });
    expect((await service.purgeExpired()).deleted).toBe(1);
    await files.processPending();
    await expect(access(files.path(row.storageKey))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    const victim = await account('Account deletion client'),
      vc = await active(victim);
    const vf = (
      await victim.agent
        .post(m(vc.id) + '/files')
        .field('requestId', randomUUID())
        .attach('file', pdf, {
          filename: 'delete-with-account.pdf',
          contentType: 'application/pdf',
        })
        .expect(201)
    ).body;
    const vrow = await db.careerConsultingFile.findUniqueOrThrow({
      where: { id: vf.id },
    });
    await app.get(AccountDeletionService).delete(root.id, victim.id, {
      confirmation: 'DELETE_PERMANENTLY',
      email: victim.email,
    });
    await files.processPending();
    expect(
      await db.careerConsultingCase.count({ where: { userId: victim.id } }),
    ).toBe(0);
    await expect(access(files.path(vrow.storageKey))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
  it('rejects consultation telemetry at the marketing API and exposes authored nonclinical references', async () => {
    const before = await db.marketingEvent.count();
    await request(app.getHttpServer())
      .post('/marketing/events')
      .send({
        visitorId: randomUUID(),
        sessionId: randomUUID(),
        type: 'PAGE_VIEW',
        path: '/career-consulting?case=private-identity',
        deviceType: 'desktop',
      })
      .expect(201);
    expect(await db.marketingEvent.count()).toBe(before);
    const catalog = (
      await root.agent.get('/admin/career-consulting/catalog').expect(200)
    ).body;
    expect(catalog.lessons).toHaveLength(6);
    expect(catalog.activities).toHaveLength(7);
    for (const l of CONSULTING_CATALOG.lessons)
      expect(l.sources.length).toBeGreaterThan(0);
  });
});
