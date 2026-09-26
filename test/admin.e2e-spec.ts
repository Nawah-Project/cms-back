import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetTestDatabase } from './reset-test-database';

describe('Admin group management and monitoring (PostgreSQL e2e)', () => {
  let app: NestExpressApplication;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
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

  afterAll(async () => app?.close());

  async function register(key: string) {
    const agent = request.agent(server);
    const response = await agent
      .post('/auth/register')
      .send({
        name: `Admin test ${key}`,
        email: `${key}@admin.example.com`,
        password: 'SecurePass123!',
      })
      .expect(201);
    return { agent, userId: response.body.id as string };
  }

  it('enforces admin access, preserves removed-user data, reuses the oldest freed slot, and reports monitoring', async () => {
    const admin = await register('admin');
    await prisma.user.update({
      where: { id: admin.userId },
      data: { role: UserRole.ADMIN },
    });
    const firstGroupMembers: Array<{
      agent: ReturnType<typeof request.agent>;
      userId: string;
    }> = [];
    for (let i = 0; i < 9; i += 1)
      firstGroupMembers.push(await register(`g1-${i}`));
    const warningUser = await register('warning');
    const criticalUser = await register('critical');
    const neverUser = await register('never');

    const groups = await prisma.group.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const firstGroup = groups.find((group) => group.name === 'Group 1')!;
    const secondGroup = groups.find((group) => group.name === 'Group 2')!;
    const removedUser = firstGroupMembers[0];
    const application = await removedUser.agent
      .post('/applications')
      .send({
        companyName: 'Retained Company',
        jobTitle: 'Backend Engineer',
      })
      .expect(201);
    await removedUser.agent
      .patch(`/applications/${application.body.id as string}`)
      .send({ stage: 'INTERVIEW' })
      .expect(200);

    const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000);
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000);
    await prisma.application.create({
      data: {
        userId: warningUser.userId,
        companyName: 'Warning Company',
        jobTitle: 'Designer',
        applicationDate: '2026-09-01',
        stage: 'APPLIED',
        outcome: 'NONE',
        createdAt: fourDaysAgo,
        updatedAt: fourDaysAgo,
      },
    });
    await prisma.application.create({
      data: {
        userId: criticalUser.userId,
        companyName: 'Critical Company',
        jobTitle: 'Engineer',
        applicationDate: '2026-08-01',
        stage: 'INTERVIEW',
        outcome: 'NONE',
        createdAt: eightDaysAgo,
        updatedAt: eightDaysAgo,
      },
    });

    await request(server).get('/admin/monitoring/overview').expect(401);
    await firstGroupMembers[1].agent.get('/admin/monitoring/users').expect(403);
    await firstGroupMembers[1].agent
      .delete(`/admin/groups/${firstGroup.id}/members/${removedUser.userId}`)
      .expect(403);

    await admin.agent
      .delete(`/admin/groups/${firstGroup.id}/members/${removedUser.userId}`)
      .expect(200)
      .expect({
        success: true,
        groupId: firstGroup.id,
        userId: removedUser.userId,
        membershipRemoved: true,
      });
    expect(
      await prisma.membership.findUnique({
        where: { userId: removedUser.userId },
      }),
    ).toBeNull();
    expect(
      await prisma.user.findUnique({ where: { id: removedUser.userId } }),
    ).not.toBeNull();
    expect(
      await prisma.application.count({
        where: { id: application.body.id as string },
      }),
    ).toBe(1);
    expect(
      await prisma.applicationStageTransition.count({
        where: { applicationId: application.body.id as string },
      }),
    ).toBe(1);
    const progress = await admin.agent.get('/members/progress').expect(200);
    expect(
      progress.body.some(
        (member: { userId: string }) => member.userId === removedUser.userId,
      ),
    ).toBe(false);

    const detailWhileUnassigned = await admin.agent
      .get(`/admin/monitoring/users/${removedUser.userId}`)
      .expect(200);
    expect(detailWhileUnassigned.body.user.group).toBeNull();
    expect(detailWhileUnassigned.body.applicationsCount).toBe(1);
    expect(
      detailWhileUnassigned.body.recentActivities.some(
        (event: { type: string }) => event.type === 'APPLICATION_STAGE_CHANGED',
      ),
    ).toBe(true);

    const replacement = await register('replacement');
    expect(
      await prisma.membership.findUniqueOrThrow({
        where: { userId: replacement.userId },
      }),
    ).toMatchObject({ groupId: firstGroup.id });
    const reassignment = await admin.agent
      .post(`/admin/users/${removedUser.userId}/group-assignment`)
      .send({ groupId: secondGroup.id })
      .expect(201);
    expect(reassignment.body.group).toMatchObject({
      id: secondGroup.id,
      name: 'Group 2',
    });

    const monitoringUsers = await admin.agent
      .get('/admin/monitoring/users?limit=50')
      .expect(200);
    const findUser = (id: string) =>
      monitoringUsers.body.items.find((item: { id: string }) => item.id === id);
    expect(findUser(warningUser.userId)).toMatchObject({
      activityStatus: 'WARNING',
      inactivityDays: 4,
      applicationsCount: 1,
    });
    expect(findUser(criticalUser.userId)).toMatchObject({
      activityStatus: 'CRITICAL',
      inactivityDays: 8,
      applicationsCount: 1,
    });
    expect(findUser(neverUser.userId)).toMatchObject({
      activityStatus: 'NEVER_ACTIVE',
      inactivityDays: null,
      applicationsCount: 0,
    });
    expect(findUser(removedUser.userId).currentStageCounts.interview).toBe(1);
    expect(findUser(removedUser.userId)).not.toHaveProperty('passwordHash');

    const groupsMonitoring = await admin.agent
      .get('/admin/monitoring/groups')
      .expect(200);
    expect(
      groupsMonitoring.body.items.find(
        (group: { id: string }) => group.id === firstGroup.id,
      ),
    ).toMatchObject({ capacity: 10, availableSlots: 0, memberCount: 10 });
    expect(
      groupsMonitoring.body.items.find(
        (group: { id: string }) => group.id === secondGroup.id,
      ),
    ).toMatchObject({
      memberCount: 4,
      warningMembers: 1,
      criticalMembers: 1,
      neverActiveMembers: 1,
    });
    expect(
      (await admin.agent.get('/admin/monitoring/overview').expect(200)).body,
    ).toMatchObject({ usersCount: 14, groupsCount: 2, applicationsCount: 3 });
    expect(
      (await admin.agent.get('/admin/monitoring/activity?limit=5').expect(200))
        .body.items.length,
    ).toBeGreaterThan(0);
    expect(
      (
        await admin.agent
          .get(`/admin/monitoring/users/${warningUser.userId}`)
          .expect(200)
      ).body.recentApplications[0],
    ).toMatchObject({ companyName: 'Warning Company' });

    const lastActivityBeforeProfileEdit = findUser(
      criticalUser.userId,
    ).lastActivityAt;
    await prisma.user.update({
      where: { id: criticalUser.userId },
      data: { name: 'Profile edited without job activity' },
    });
    const updatedMonitoring = await admin.agent
      .get('/admin/monitoring/users?limit=50')
      .expect(200);
    expect(
      updatedMonitoring.body.items.find(
        (item: { id: string }) => item.id === criticalUser.userId,
      ).lastActivityAt,
    ).toBe(lastActivityBeforeProfileEdit);
  }, 30000);
});
