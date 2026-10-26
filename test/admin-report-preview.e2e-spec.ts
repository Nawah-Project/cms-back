import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { prepareProgramMember } from './program-fixture';
import { resetTestDatabase } from './reset-test-database';

describe('Admin report preview (disposable PostgreSQL e2e)', () => {
  let app: NestExpressApplication;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;
  let prisma: PrismaService;
  const previousAssignment = process.env.ASSIGN_GROUP_ON_REGISTER;

  beforeAll(async () => {
    // Group assignment is unrelated to report previews and would require
    // group-specific schema fixtures. Keep this integration test unassigned.
    process.env.ASSIGN_GROUP_ON_REGISTER = 'false';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = module.get(PrismaService);
    await resetTestDatabase(prisma);
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
    server = app.getHttpServer();
  });

  afterAll(async () => {
    if (previousAssignment === undefined)
      delete process.env.ASSIGN_GROUP_ON_REGISTER;
    else process.env.ASSIGN_GROUP_ON_REGISTER = previousAssignment;
    await app?.close();
  });

  async function register(key: string) {
    const agent = request.agent(server);
    const response = await agent
      .post('/auth/register')
      .send({
        name: `Report preview ${key}`,
        email: `${key}@report-preview.example.com`,
        password: 'SecurePass123!',
      })
      .expect(201);
    return { agent, userId: response.body.id as string };
  }

  it('protects previews, keeps DEMO isolated, and reads ACTUAL reports without changing progress', async () => {
    const admin = await register('admin');
    await prisma.user.update({
      where: { id: admin.userId },
      data: { role: UserRole.ADMIN },
    });
    const member = await register('member');
    await prepareProgramMember(prisma, member.userId, 1);

    const stateBefore = await prisma.userJourneyState.update({
      where: { userId: member.userId },
      data: {
        currentWeek: 1,
        currentNodeCode: 'W1_M1',
        currentNodeStartedAt: new Date(Date.now() - 60_000),
        weekStartedAt: new Date('2026-10-01T00:00:00.000Z'),
        week1StartedAt: null,
        completedNodeCodes: ['TASK_0'],
        unlockedInsightCodes: [],
        readInsightCodes: [],
        isGroupUnlocked: false,
        canUseTableView: false,
      },
    });
    await prisma.application.createMany({
      data: Array.from({ length: 10 }, (_, index) => ({
        userId: member.userId,
        companyName: `Synthetic report company ${index + 1}`,
        jobTitle: 'Synthetic role',
        applicationDate: '2026-10-26',
        journeyWeek: 1,
        stage: 'APPLIED' as const,
        outcome: 'NONE' as const,
      })),
    });
    const applicationsBefore = await prisma.application.count({
      where: { userId: member.userId },
    });

    await request(server).get('/admin/journey/reports/demo').expect(401);
    await request(server)
      .get(`/admin/journey/reports/${member.userId}`)
      .expect(401);
    await member.agent.get('/admin/journey/reports/demo').expect(403);
    await member.agent
      .get(`/admin/journey/reports/${member.userId}`)
      .expect(403);

    const demo = await admin.agent
      .get('/admin/journey/reports/demo')
      .expect(200);
    expect(demo.body.mode).toBe('DEMO');
    expect(demo.body.report.weeks.map((week: { week: number }) => week.week)).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect(demo.body.report.weeks[1].logged).toBe(0);
    expect(demo.body.report.completed).toBe(true);
    expect(await prisma.application.count({ where: { userId: member.userId } })).toBe(
      applicationsBefore,
    );

    const actual = await admin.agent
      .get(`/admin/journey/reports/${member.userId}`)
      .expect(200);
    expect(actual.body.mode).toBe('ACTUAL');
    expect(actual.body.report.weeks[1].logged).toBe(10);
    expect(actual.body.report.currentNodeCode).toBe('W1_M1');
    expect(actual.body.report.currentWeek).toBe(1);
    expect(actual.body.report.completed).toBe(false);

    const stateAfterPreview = await prisma.userJourneyState.findUniqueOrThrow({
      where: { userId: member.userId },
    });
    expect(stateAfterPreview).toEqual(stateBefore);
    expect(await prisma.application.count({ where: { userId: member.userId } })).toBe(
      applicationsBefore,
    );

    const normalMemberReport = await member.agent
      .get('/journey/reports')
      .expect(200);
    expect(normalMemberReport.body.weeks).toEqual(actual.body.report.weeks);
  });
});
