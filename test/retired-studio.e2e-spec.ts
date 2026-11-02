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
import { JourneyEngineService } from '../src/journey-engine/journey-engine.service';
import { TasksService } from '../src/tasks/tasks.service';
import { FeedbackService } from '../src/feedback/feedback.service';
import {
  publicAdminAccess,
  normalizeAdminPermissions,
} from '../src/admin/admin-access';
import { JOURNEY_GUIDANCE_CATALOG } from '../src/feedback/journey-guidance.catalog';
import { resetTestDatabase } from './reset-test-database';

describe('Retired P0 — no routes or exceptional programme access', () => {
  let app: NestExpressApplication,
    db: PrismaService,
    journey: JourneyEngineService,
    tasks: TasksService,
    feedback: FeedbackService;
  let root: any, member: any, archived: any;
  const code = JOURNEY_GUIDANCE_CATALOG[0].code;
  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    db = m.get(PrismaService);
    journey = m.get(JourneyEngineService);
    tasks = m.get(TasksService);
    feedback = m.get(FeedbackService);
    await resetTestDatabase(db);
    const passwordHash = await bcrypt.hash('SyntheticPass123!', 4);
    async function account(isRoot: boolean) {
      const id = randomUUID();
      const u = await db.user.create({
        data: {
          id,
          email: id + '@example.com',
          name: 'Synthetic retirement verification',
          emailVerified: true,
          passwordHash,
          role: isRoot ? 'ADMIN' : 'USER',
          isRootAdmin: isRoot,
          adminPermissions: isRoot ? { INDIVIDUAL_RESEARCH: 'WRITE' } : {},
        },
      });
      return { ...u, agent: null as any };
    }
    root = await account(true);
    member = await account(false);
    app = m.createNestApplication<NestExpressApplication>();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    for (const u of [root, member]) {
      u.agent = request.agent(app.getHttpServer());
      await u.agent
        .post('/auth/login')
        .send({ email: u.email, password: 'SyntheticPass123!' })
        .expect(200);
    }
    archived = await db.individualResearchCase.create({
      data: {
        userId: member.id,
        ownerId: root.id,
        title: 'Synthetic retained P0 archive',
        goal: 'Former fixture only',
        hypothesis: 'Must not grant access',
        status: 'ACTIVE',
        consentStatus: 'GIVEN',
        requestId: randomUUID(),
        retentionUntil: new Date(Date.now() + 30 * 86400000),
      },
    });
    for (const [resourceType, resourceId] of [
      ['FEATURE', 'analytics'],
      ['FEATURE', 'professionalTasks'],
      ['FEATURE', 'tableView'],
      ['GUIDANCE', code],
      ['FINAL_REPORT', 'final'],
    ])
      await db.individualAccessOverride.create({
        data: {
          caseId: archived.id,
          userId: member.id,
          resourceType,
          resourceId,
          permission: resourceType === 'FINAL_REPORT' ? 'VIEW' : 'INTERACT',
          reason: 'Synthetic historical grant must be ignored',
          issuedBy: root.id,
          startsAt: new Date(Date.now() - 86400000),
          requestId: randomUUID(),
        },
      });
  });
  afterAll(async () => {
    await app?.close();
  });
  it('removes every P0 controller for root, member and anonymous requests', async () => {
    for (const a of [root.agent, member.agent, request(app.getHttpServer())]) {
      for (const path of [
        '/admin/individual-research/cases',
        '/admin/individual-research/candidates',
        '/individual-research/participation',
        '/admin/individual-research/cases/' + archived.id,
      ])
        await a.get(path).expect(404);
      await a
        .post('/admin/individual-research/cases')
        .send({ requestId: randomUUID() })
        .expect(404);
      await a
        .post('/admin/individual-research/cases/' + archived.id + '/overrides')
        .send({ requestId: randomUUID() })
        .expect(404);
    }
    expect(
      normalizeAdminPermissions({
        INDIVIDUAL_RESEARCH: 'WRITE',
        UX_LAB: 'READ',
        CAREER_CONSULTING: 'WRITE',
      }),
    ).toEqual({ UX_LAB: 'READ', CAREER_CONSULTING: 'WRITE' });
    expect(publicAdminAccess({}, true).permissions).not.toHaveProperty(
      'INDIVIDUAL_RESEARCH',
    );
  });
  it('ignores historical active grants and preserves normal Journey, task and guidance gates', async () => {
    const summary = await journey.getJourneyStateSummary(member.id);
    expect(summary.features).toEqual({
      analytics: false,
      groups: false,
      tableView: false,
      professionalTasks: false,
    });
    expect(summary).not.toHaveProperty('individualAccess');
    const state = await db.userJourneyState.findUniqueOrThrow({
      where: { userId: member.id },
    });
    await expect(tasks.assertProfDevUnlocked(member.id)).rejects.toThrow();
    await expect(journey.getReports(member.id)).rejects.toThrow();
    await expect(journey.markInsightRead(member.id, code)).rejects.toThrow();
    const lockedPost = await db.feedbackPost.findFirstOrThrow({
      where: { unlockTriggerCode: code },
    });
    await expect(
      feedback.getForMember(member.id, lockedPost.id),
    ).rejects.toThrow();
    await expect(feedback.markRead(member.id, lockedPost.id)).rejects.toThrow();
    expect(
      await db.userJourneyState.findUnique({ where: { userId: member.id } }),
    ).toEqual(state);
    await db.userJourneyState.update({
      where: { userId: member.id },
      data: { canUseTableView: true, unlockedInsightCodes: [code] },
    });
    expect(
      (await journey.getJourneyStateSummary(member.id)).features.tableView,
    ).toBe(true);
    expect((await feedback.getForMember(member.id, lockedPost.id)).id).toBe(
      lockedPost.id,
    );
  });
  it('retains archive rows without exposing them, and leaves consulting/catalog/maps available to Root', async () => {
    const snapshot = await db.individualResearchCase.findUnique({
      where: { id: archived.id },
    });
    await root.agent.get('/admin/career-consulting/catalog').expect(200);
    await root.agent
      .get('/admin/career-consulting/roadmaps/template')
      .expect(200);
    await root.agent.get('/admin/career-consulting/cases').expect(200);
    expect(
      await db.individualResearchCase.findUnique({
        where: { id: archived.id },
      }),
    ).toEqual(snapshot);
    expect(
      await db.individualAccessOverride.count({
        where: { caseId: archived.id },
      }),
    ).toBe(5);
    expect(await db.careerConsultingCase.count()).toBe(0);
  });
});
