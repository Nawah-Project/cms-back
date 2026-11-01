import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { IndividualResearchService } from '../src/individual-research/individual-research.service';
import { resetTestDatabase } from './reset-test-database';

describe('Individual Experience Studio (isolated PostgreSQL)', () => {
  let app: NestExpressApplication,
    prisma: PrismaService,
    studio: IndividualResearchService;
  let root: any, reader: any, outsider: any, labOnly: any;
  let hash: string;
  const rid = () => ({ requestId: randomUUID() });
  const future = () => new Date(Date.now() + 30 * 86400000).toISOString();
  async function account(
    name: string,
    permissions?: Record<string, string>,
    isRoot = false,
  ) {
    const id = randomUUID();
    const u = await prisma.user.create({
      data: {
        id,
        name,
        email: `${id}@example.com`,
        passwordHash: hash,
        emailVerified: true,
        targetJobTitle: 'Engineer',
        portfolioUrl: 'https://example.com/synthetic',
        ...(permissions || isRoot
          ? {
              role: 'ADMIN' as const,
              isRootAdmin: isRoot,
              adminPermissions: permissions ?? {},
            }
          : {}),
      },
    });
    if (u.role === 'USER') {
      await prisma.userCv.create({
        data: {
          userId: id,
          originalName: 'synthetic.pdf',
          mimeType: 'application/pdf',
          size: 12,
          storageKey: `${id}.pdf`,
        },
      });
      await prisma.userJourneyState.create({
        data: {
          userId: id,
          currentWeek: 0,
          currentNodeCode: 'TASK_0',
          completedNodeCodes: [],
          unlockedInsightCodes: [],
          readInsightCodes: [],
        },
      });
    }
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/login')
      .send({ email: u.email, password: 'SyntheticPass123!' })
      .expect(200);
    return { id, agent };
  }
  async function draft(user: any) {
    return (
      await root.agent
        .post('/admin/individual-research/cases')
        .send({
          ...rid(),
          userId: user.id,
          title: 'Synthetic individual case',
          goal: 'Understand an evidenced career obstacle',
          hypothesis: 'A clearer example may help explain professional value',
          retentionUntil: future(),
        })
        .expect(201)
    ).body;
  }
  async function active(user: any) {
    const c = await draft(user);
    await root.agent
      .post(`/admin/individual-research/cases/${c.id}/consent`)
      .send({
        ...rid(),
        confirmed: true,
        method: 'WRITTEN',
        consentAt: new Date().toISOString(),
        evidence:
          'Synthetic participant explicitly agreed to research, notes and retention.',
      })
      .expect(201);
    await root.agent
      .patch(`/admin/individual-research/cases/${c.id}`)
      .send({ ...rid(), status: 'ACTIVE' })
      .expect(200);
    return c;
  }
  function grant(
    c: any,
    type: string,
    id: string,
    permission = 'VIEW',
    extra = {},
  ) {
    return root.agent
      .post(`/admin/individual-research/cases/${c.id}/overrides`)
      .send({
        ...rid(),
        resourceType: type,
        resourceId: id,
        permission,
        reason: 'Synthetic individual research viewing intervention',
        startsAt: new Date(Date.now() - 1000).toISOString(),
        ...extra,
      });
  }
  const snapshot = (id: string) =>
    prisma.userJourneyState.findUniqueOrThrow({ where: { userId: id } });
  beforeAll(async () => {
    hash = await bcrypt.hash('SyntheticPass123!', 4);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    prisma = module.get(PrismaService);
    studio = module.get(IndividualResearchService);
    await resetTestDatabase(prisma);
    await prisma.user.create({
      data: {
        id: randomUUID(),
        name: 'Synthetic seed admin',
        email: 'seed@example.com',
        role: 'ADMIN',
        isRootAdmin: true,
        passwordHash: hash,
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
    reader = await account('Synthetic read', { INDIVIDUAL_RESEARCH: 'READ' });
    outsider = await account('Other case writer', {
      INDIVIDUAL_RESEARCH: 'WRITE',
    });
    labOnly = await account('Lab only', { UX_LAB: 'WRITE' });
  });
  afterAll(async () => {
    await app?.close();
  });
  it('creates one draft only, blocks unconsented activation and never changes other members', async () => {
    const u = await account('Participant A'),
      other = await account('Participant B');
    const before = await snapshot(u.id),
      otherBefore = await snapshot(other.id);
    const key = rid();
    const data = {
      ...key,
      userId: u.id,
      title: 'Synthetic retry case',
      goal: 'A concrete research purpose',
      hypothesis: 'A testable professional hypothesis',
      retentionUntil: future(),
    };
    const first = await root.agent
      .post('/admin/individual-research/cases')
      .send(data)
      .expect(201);
    const again = await root.agent
      .post('/admin/individual-research/cases')
      .send(data)
      .expect(201);
    expect(again.body.id).toBe(first.body.id);
    await root.agent
      .patch(`/admin/individual-research/cases/${first.body.id}`)
      .send({ ...rid(), status: 'ACTIVE' })
      .expect(400);
    await grant(first.body, 'PERFORMANCE_ANALYTICS', 'performance').expect(403);
    expect(await snapshot(u.id)).toEqual(before);
    expect(await snapshot(other.id)).toEqual(otherBefore);
  });
  it('enforces section permission AND per-case authorization, including read-only staff', async () => {
    const u = await account('Private participant'),
      c = await active(u);
    await root.agent
      .patch(`/admin/individual-research/cases/${c.id}`)
      .send({ ...rid(), allowedAdminIds: [reader.id] })
      .expect(200);
    await reader.agent
      .get(`/admin/individual-research/cases/${c.id}`)
      .expect(200);
    await reader.agent
      .patch(`/admin/individual-research/cases/${c.id}`)
      .send({ ...rid(), nextStep: 'Forbidden edit' })
      .expect(403);
    await outsider.agent
      .get(`/admin/individual-research/cases/${c.id}`)
      .expect(404);
    await labOnly.agent
      .get(`/admin/individual-research/cases/${c.id}`)
      .expect(403);
    await u.agent.get(`/admin/individual-research/cases/${c.id}`).expect(403);
    const items = await outsider.agent
      .get('/admin/individual-research/cases')
      .expect(200);
    expect(items.body.items.some((x: any) => x.id === c.id)).toBe(false);
  });
  it('grants only a specific early weekly report; preserves actual state and ordinary node rules', async () => {
    const u = await account('Early weekly'),
      c = await active(u),
      before = await snapshot(u.id);
    const nodes = await prisma.journeyNode.findMany({
      orderBy: { code: 'asc' },
    });
    await u.agent.get('/journey/reports?scope=week:2').expect(403);
    await grant(c, 'WEEKLY_REPORT', '2').expect(201);
    const report = await u.agent
      .get('/journey/reports?scope=week:2')
      .expect(200);
    expect(report.body.scope).toBe('week:2');
    expect(report.body.weeks.find((w: any) => w.week === 2).logged).toBe(0);
    expect(
      report.body.access.weeks.find((w: any) => w.resourceId === '2').source,
    ).toBe('ADMIN');
    expect(report.body.completed).toBe(false);
    expect(report.body.currentNodeCode).toBe('TASK_0');
    expect(report.body.finalAvailable).toBe(false);
    await u.agent.get('/journey/reports').expect(403);
    await u.agent.get('/journey/reports?scope=week:3').expect(403);
    expect(await snapshot(u.id)).toEqual(before);
    expect(
      await prisma.journeyNode.findMany({ orderBy: { code: 'asc' } }),
    ).toEqual(nodes);
  });
  it('early performance analytics is a real snapshot, without completing Mission 0', async () => {
    const u = await account('Early analytics'),
      c = await active(u);
    await prisma.application.create({
      data: {
        userId: u.id,
        companyName: 'Synthetic one',
        jobTitle: 'Engineer',
        applicationDate: '2026-11-01',
        journeyWeek: 0,
      },
    });
    const before = await snapshot(u.id);
    await grant(c, 'PERFORMANCE_ANALYTICS', 'performance').expect(201);
    const report = await u.agent.get('/journey/reports').expect(200);
    expect(report.body.overall.logged).toBe(1);
    expect(report.body.completedNodeCodes).toEqual([]);
    expect(report.body.currentWeek).toBe(0);
    expect(await snapshot(u.id)).toEqual(before);
  });
  it('final report VIEW never grants completion or fabricated milestones', async () => {
    const u = await account('Final view'),
      c = await active(u),
      before = await snapshot(u.id);
    await grant(c, 'FINAL_REPORT', 'final', 'INTERACT').expect(400);
    await grant(c, 'FINAL_REPORT', 'final').expect(201);
    const r = await u.agent.get('/journey/reports?scope=final').expect(200);
    expect(r.body.completed).toBe(false);
    expect(r.body.finalAvailable).toBe(false);
    await u.agent.post('/journey/final-report/complete').expect(403);
    expect(await snapshot(u.id)).toEqual(before);
  });
  it('guidance VIEW reveals content, not a read or a completion, and both read APIs enforce it', async () => {
    const u = await account('Early guidance'),
      c = await active(u),
      code = 'INSIGHT_W1_INTERVIEW_BASIC';
    const post = await prisma.feedbackPost.findFirstOrThrow({
      where: { unlockTriggerCode: code },
    });
    const before = await snapshot(u.id);
    await u.agent.get(`/feedback/${post.id}`).expect(404);
    await grant(c, 'GUIDANCE', code).expect(201);
    await u.agent.get(`/feedback/${post.id}`).expect(200);
    await u.agent.post(`/feedback/${post.id}/read`).expect(403);
    await u.agent.post(`/journey/insights/${code}/read`).expect(403);
    expect(await prisma.feedbackRead.count({ where: { userId: u.id } })).toBe(
      0,
    );
    expect(await snapshot(u.id)).toEqual(before);
  });
  it('revoke removes only exceptional access, and expiration/scheduling/pausing are enforced by the API', async () => {
    const u = await account('Revoke'),
      c = await active(u);
    const g = await grant(c, 'PERFORMANCE_ANALYTICS', 'performance').expect(
      201,
    );
    await u.agent.get('/journey/reports').expect(200);
    await root.agent
      .post(
        `/admin/individual-research/cases/${c.id}/overrides/${g.body.id}/revoke`,
      )
      .send(rid())
      .expect(201);
    await u.agent.get('/journey/reports').expect(403);
    await grant(c, 'PERFORMANCE_ANALYTICS', 'performance', 'VIEW', {
      startsAt: new Date(Date.now() - 10000).toISOString(),
      endsAt: new Date(Date.now() - 5000).toISOString(),
    }).expect(201);
    await u.agent.get('/journey/reports').expect(403);
    await grant(c, 'PERFORMANCE_ANALYTICS', 'performance', 'VIEW', {
      startsAt: new Date(Date.now() + 100000).toISOString(),
    }).expect(201);
    await u.agent.get('/journey/reports').expect(403);
    await grant(c, 'PERFORMANCE_ANALYTICS', 'performance').expect(201);
    await root.agent
      .patch(`/admin/individual-research/cases/${c.id}`)
      .send({ ...rid(), status: 'PAUSED' })
      .expect(200);
    await u.agent.get('/journey/reports').expect(403);
  });
  it('professional Tasks distinguish VIEW and INTERACT at server endpoints', async () => {
    const u = await account('Early tasks'),
      c = await active(u);
    await u.agent.get('/tasks').expect(403);
    await grant(c, 'FEATURE', 'professionalTasks').expect(201);
    await u.agent.get('/tasks').expect(200);
    await u.agent
      .post('/tasks')
      .send({ title: 'Should not be allowed' })
      .expect(403);
    await grant(c, 'FEATURE', 'professionalTasks', 'INTERACT').expect(201);
    await u.agent
      .post('/tasks')
      .send({ title: 'An actual participant action' })
      .expect(201);
    expect((await snapshot(u.id)).completedNodeCodes).toEqual([]);
  });
  it('private sessions and observations do not become feedback or group/marketing evidence', async () => {
    const u = await account('Internal notes'),
      c = await active(u);
    const marker = 'PRIVATE SYNTHETIC STATEMENT DO NOT PUBLISH';
    const key = rid();
    await root.agent
      .post(`/admin/individual-research/cases/${c.id}/sessions`)
      .send({
        ...key,
        kind: 'COACHING',
        heldAt: new Date().toISOString(),
        goal: 'Clarify a career choice',
        participantStatements: marker,
        researcherObservations: 'A descriptive observation only',
        hypotheses: 'An unverified alternative explanation',
      })
      .expect(201);
    await root.agent
      .post(`/admin/individual-research/cases/${c.id}/sessions`)
      .send({
        ...key,
        kind: 'COACHING',
        heldAt: new Date().toISOString(),
        goal: 'Clarify a career choice',
        participantStatements: marker,
      })
      .expect(201);
    await root.agent
      .post(`/admin/individual-research/cases/${c.id}/observations`)
      .send({
        ...rid(),
        kind: 'PARTICIPANT_STATEMENT',
        lens: 'ABILITIES',
        content: marker,
        status: 'NEEDS_EVIDENCE',
        isBarrier: true,
      })
      .expect(201);
    expect(
      await prisma.individualCaseSession.count({ where: { caseId: c.id } }),
    ).toBe(1);
    expect(
      await prisma.feedbackPost.count({ where: { targetUserId: u.id } }),
    ).toBe(0);
    expect(
      JSON.stringify(await prisma.domainEventLog.findMany()),
    ).not.toContain(marker);
    expect(
      JSON.stringify(await prisma.marketingEvent.findMany()),
    ).not.toContain(marker);
    const member = await u.agent
      .get('/individual-research/participation')
      .expect(200);
    expect(JSON.stringify(member.body)).not.toContain(marker);
    expect(JSON.stringify(member.body)).not.toContain('hypothesis');
  });
  it('publishes only explicit member-facing content through existing services, idempotently', async () => {
    const u = await account('Interventions'),
      c = await active(u);
    const key = rid(),
      body = {
        ...key,
        kind: 'TASK',
        title: 'Evidence of one skill',
        content: 'Write one example from your actual work',
        publishConfirmed: true,
      };
    await Promise.all([
      root.agent
        .post(`/admin/individual-research/cases/${c.id}/interventions`)
        .send(body)
        .expect(201),
      root.agent
        .post(`/admin/individual-research/cases/${c.id}/interventions`)
        .send(body)
        .expect(201),
    ]);
    expect(await prisma.task.count({ where: { userId: u.id } })).toBe(1);
    expect(
      await prisma.individualCasePlanItem.count({ where: { caseId: c.id } }),
    ).toBe(1);
    const feed = {
      ...rid(),
      kind: 'FEEDBACK',
      title: 'A public-to-member recommendation',
      content: 'Use a real project example without inventing numbers.',
      publishConfirmed: true,
    };
    await root.agent
      .post(`/admin/individual-research/cases/${c.id}/interventions`)
      .send(feed)
      .expect(201);
    await root.agent
      .post(`/admin/individual-research/cases/${c.id}/interventions`)
      .send(feed)
      .expect(201);
    expect(
      await prisma.feedbackPost.count({ where: { targetUserId: u.id } }),
    ).toBe(1);
    expect(
      await prisma.emailDeliveryLog.count({ where: { userId: u.id } }),
    ).toBe(0);
    await root.agent
      .post(`/admin/individual-research/cases/${c.id}/interventions`)
      .send({
        ...rid(),
        kind: 'FEEDBACK',
        title: 'Not published',
        content: 'Must remain unpublished',
        publishConfirmed: false,
      })
      .expect(400);
  });
  it('does not link another participant resources or sessions', async () => {
    const u = await account('Resource A'),
      other = await account('Resource B'),
      c = await active(u);
    const task = await prisma.task.create({
      data: {
        userId: other.id,
        createdById: root.id,
        source: 'MENTOR_ASSIGNED',
        title: 'Other task',
      },
    });
    await root.agent
      .post(`/admin/individual-research/cases/${c.id}/plan`)
      .send({
        ...rid(),
        title: 'Invalid link',
        completionCondition: 'An actual verified outcome',
        taskId: task.id,
      })
      .expect(400);
    await grant(c, 'FEATURE', 'groups').expect(400);
    await grant(c, 'FEATURE', 'guidance').expect(400);
    await grant(c, 'GUIDANCE', 'UNKNOWN_SYNTHETIC_GUIDANCE').expect(400);
    await root.agent
      .patch(`/admin/individual-research/cases/${c.id}`)
      .send({ ...rid(), goal: 'A purpose not covered by the original consent' })
      .expect(409);
    await root.agent
      .patch(`/admin/individual-research/cases/${c.id}`)
      .send({
        ...rid(),
        retentionUntil: new Date(Date.now() + 60 * 86400000).toISOString(),
      })
      .expect(409);
  });
  it('participant withdrawal revokes access and retains only authorized case history', async () => {
    const u = await account('Withdraw'),
      other = await account('Cannot withdraw another'),
      c = await active(u);
    await grant(c, 'PERFORMANCE_ANALYTICS', 'performance').expect(201);
    await other.agent
      .post(`/individual-research/participation/${c.id}/withdraw`)
      .send(rid())
      .expect(404);
    await prisma.userCv.delete({ where: { userId: u.id } }); // Withdrawal remains available without a ready profile.
    await u.agent
      .post(`/individual-research/participation/${c.id}/withdraw`)
      .send(rid())
      .expect(201);
    await u.agent.get('/journey/reports').expect(403);
    const row = await prisma.individualResearchCase.findUniqueOrThrow({
      where: { id: c.id },
    });
    expect(row.consentStatus).toBe('WITHDRAWN');
    expect(row.status).toBe('PAUSED');
    await root.agent
      .patch(`/admin/individual-research/cases/${c.id}`)
      .send({ ...rid(), status: 'ACTIVE' })
      .expect(400);
  });
  it('account deletion cascades all private research records, retention purge is isolated', async () => {
    const u = await account('To delete'),
      c = await active(u);
    await grant(c, 'PERFORMANCE_ANALYTICS', 'performance').expect(201);
    await prisma.user.delete({ where: { id: u.id } });
    expect(
      await prisma.individualResearchCase.count({ where: { id: c.id } }),
    ).toBe(0);
    expect(
      await prisma.individualAccessOverride.count({ where: { caseId: c.id } }),
    ).toBe(0);
    expect(
      await prisma.individualCaseEvent.count({ where: { caseId: c.id } }),
    ).toBe(0);
    const expiredUser = await account('Expired retention'),
      expired = await active(expiredUser);
    await prisma.individualResearchCase.update({
      where: { id: expired.id },
      data: { retentionUntil: new Date(Date.now() - 1000) },
    });
    await studio.purgeExpired();
    expect(
      await prisma.individualResearchCase.findUnique({
        where: { id: expired.id },
      }),
    ).toBeNull();
    expect(
      await prisma.user.findUnique({ where: { id: expiredUser.id } }),
    ).not.toBeNull();
  });
  it('ordinary progress still works after a view intervention and old report data is preserved', async () => {
    const u = await account('Ordinary progress'),
      c = await active(u);
    const before = await snapshot(u.id);
    await grant(c, 'PERFORMANCE_ANALYTICS', 'performance').expect(201);
    await u.agent
      .post('/applications')
      .send({ companyName: 'Real synthetic application', jobTitle: 'Engineer' })
      .expect(201);
    expect((await snapshot(u.id)).currentNodeCode).toBe(before.currentNodeCode);
    expect(await prisma.application.count({ where: { userId: u.id } })).toBe(1);
    const r = await u.agent.get('/journey/reports').expect(200);
    expect(r.body.overall.logged).toBe(1);
  });
  it('retains genuine previous-week comparison and shows read-only charts without fabricated completion', async () => {
    const u = await account('Comparison participant'),
      c = await active(u);
    for (const week of [1, 2])
      await prisma.application.create({
        data: {
          userId: u.id,
          companyName: 'Synthetic observed week ' + week,
          jobTitle: 'Engineer',
          applicationDate: '2026-11-01',
          journeyWeek: week,
        },
      });
    await grant(c, 'WEEKLY_REPORT', '2').expect(201);
    const report = await u.agent
      .get('/journey/reports?scope=week:2')
      .expect(200);
    expect(report.body.weeks.map((w: any) => [w.week, w.logged])).toEqual([
      [1, 1],
      [2, 1],
    ]);
    expect(
      report.body.weeklyStages.find((w: any) => w.week === 1).available,
    ).toBe(false);
    await grant(c, 'PERFORMANCE_ANALYTICS', 'performance').expect(201);
    const performance = await u.agent.get('/journey/reports').expect(200);
    expect(performance.body.analyticsAccess.pipeline).toBe(true);
    expect(performance.body.manualUpdate.eligible).toBe(false);
    expect(performance.body.completedNodeCodes).toEqual([]);
  });
  it('supports follow-up, evidence status and manual plan verification without completing a JourneyNode', async () => {
    const u = await account('Plan participant'),
      c = await active(u);
    const session = await root.agent
      .post(`/admin/individual-research/cases/${c.id}/sessions`)
      .send({
        ...rid(),
        kind: 'CONSULTING',
        heldAt: new Date().toISOString(),
        goal: 'Review actual examples',
      })
      .expect(201);
    await root.agent
      .patch(
        `/admin/individual-research/cases/${c.id}/sessions/${session.body.id}`,
      )
      .send({
        ...rid(),
        followUpStatus: 'DONE',
        outcome: 'Participant provided one actual example',
      })
      .expect(200);
    const observation = await root.agent
      .post(`/admin/individual-research/cases/${c.id}/observations`)
      .send({
        ...rid(),
        sessionId: session.body.id,
        kind: 'HYPOTHESIS',
        lens: 'BUSINESS_IMPACT',
        content: 'An explicit example might improve clarity',
        status: 'NEEDS_EVIDENCE',
      })
      .expect(201);
    await root.agent
      .patch(
        `/admin/individual-research/cases/${c.id}/observations/${observation.body.id}`,
      )
      .send({
        ...rid(),
        status: 'RESOLVED',
        evidence: 'Actual example discussed in follow-up',
      })
      .expect(200);
    const item = await root.agent
      .post(`/admin/individual-research/cases/${c.id}/plan`)
      .send({
        ...rid(),
        title: 'Document one example',
        completionCondition: 'Researcher verifies the written example',
        nodeCode: 'TASK_0',
      })
      .expect(201);
    await root.agent
      .patch(`/admin/individual-research/cases/${c.id}/plan/${item.body.id}`)
      .send({ ...rid(), status: 'DONE' })
      .expect(200);
    expect((await snapshot(u.id)).completedNodeCodes).toEqual([]);
    const detail = await root.agent
      .get(`/admin/individual-research/cases/${c.id}`)
      .expect(200);
    expect(
      detail.body.accessOverview.some((a: any) => a.source === 'LOCKED'),
    ).toBe(true);
    expect(detail.body.sessions[0].followUpStatus).toBe('DONE');
    expect(detail.body.observations[0].status).toBe('RESOLVED');
  });
  it('serializes simultaneous intervention retries and rejects invalid resource and consent changes', async () => {
    const u = await account('Concurrent participant'),
      c = await active(u);
    const body = {
      ...rid(),
      kind: 'TASK',
      title: 'One concurrent task',
      content: 'Only one real assigned task',
      publishConfirmed: true,
    };
    const responses = await Promise.all(
      [1, 2].map(() =>
        root.agent
          .post(`/admin/individual-research/cases/${c.id}/interventions`)
          .send(body),
      ),
    );
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(responses[0].body.id).toBe(responses[1].body.id);
    expect(await prisma.task.count({ where: { userId: u.id } })).toBe(1);
    await grant(c, 'FEATURE', 'groups').expect(400);
    await grant(c, 'FEATURE', 'guidance').expect(400);
    await grant(c, 'GUIDANCE', 'UNKNOWN_SYNTHETIC_GUIDANCE').expect(400);
    await root.agent
      .patch(`/admin/individual-research/cases/${c.id}`)
      .send({ ...rid(), goal: 'A purpose not covered by the original consent' })
      .expect(409);
    await root.agent
      .patch(`/admin/individual-research/cases/${c.id}`)
      .send({
        ...rid(),
        retentionUntil: new Date(Date.now() + 60 * 86400000).toISOString(),
      })
      .expect(409);
    await grant(c, 'PLAN_ITEM', responses[0].body.id).expect(400);
    await root.agent
      .post(`/admin/individual-research/cases/${c.id}/consent`)
      .send({
        ...rid(),
        confirmed: true,
        method: 'WRITTEN',
        consentAt: new Date().toISOString(),
        evidence:
          'Changing consent text must not silently replace the original',
      })
      .expect(409);
  });
});
