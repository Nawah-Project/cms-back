import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GroupAssignmentService } from '../src/members/group-assignment.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetTestDatabase } from './reset-test-database';

describe('Automatic group assignment (PostgreSQL e2e)', () => {
  let app: NestExpressApplication;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;
  let prisma: PrismaService;
  let assignment: GroupAssignmentService;

  const previousAssignment=process.env.ASSIGN_GROUP_ON_REGISTER;
  beforeAll(async () => {
    process.env.ASSIGN_GROUP_ON_REGISTER='true';
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
    assignment = app.get(GroupAssignmentService);
  });

  afterAll(async () => { if(previousAssignment===undefined)delete process.env.ASSIGN_GROUP_ON_REGISTER;else process.env.ASSIGN_GROUP_ON_REGISTER=previousAssignment;await app?.close(); });

  const registration = (number: number) =>
    request(server)
      .post('/auth/register')
      .send({
        name: `Member ${number}`,
        email: `member-${number}@cohorts.example.com`,
        password: 'SecurePass123!',
      });

  it('assigns 30 sequential registrations to three full groups and serializes concurrent registrations safely', async () => {
    const sequentialResponses: { status: number }[] = [];
    for (let number = 1; number <= 21; number += 1)
      sequentialResponses.push(await registration(number));
    sequentialResponses.forEach((response) =>
      expect(response.status).toBe(201),
    );

    let allGroups = await prisma.group.findMany({ orderBy: { name: 'asc' } });
    expect(allGroups.map(({ name }) => name)).toEqual([
      'Group 1',
      'Group 2',
      'Group 3',
    ]);
    const sequentialUsers = await prisma.user.findMany({
      where: {
        email: {
          in: Array.from(
            { length: 21 },
            (_, i) => `member-${i + 1}@cohorts.example.com`,
          ),
        },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    const sequentialMemberships = await prisma.membership.findMany();
    const membershipByUser = new Map(
      sequentialMemberships.map(({ userId, groupId }) => [userId, groupId]),
    );
    sequentialUsers.forEach((user, index) =>
      expect(membershipByUser.get(user.id)).toBe(
        allGroups[Math.floor(index / 10)].id,
      ),
    );

    for (let number = 22; number <= 29; number += 1)
      await registration(number).expect(201);
    const concurrentResponses = await Promise.all([
      registration(30),
      registration(31),
    ]);
    concurrentResponses.forEach((response) =>
      expect(response.status).toBe(201),
    );

    allGroups = await prisma.group.findMany({ orderBy: { name: 'asc' } });
    expect(allGroups.map(({ name }) => name)).toEqual([
      'Group 1',
      'Group 2',
      'Group 3',
      'Group 4',
    ]);
    const memberCounts = await Promise.all(
      allGroups.map(({ id }) =>
        prisma.membership.count({ where: { groupId: id } }),
      ),
    );
    expect(memberCounts).toEqual([10, 10, 10, 1]);

    const firstTen = await prisma.membership.findMany({
      where: { groupId: allGroups[0].id },
    });
    expect(new Set(firstTen.map(({ userId }) => userId)).size).toBe(10);
    await expect(
      prisma.membership.create({
        data: { userId: firstTen[0].userId, groupId: allGroups[1].id },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.membership.create({
        data: { userId: sequentialUsers[0].id, groupId: allGroups[0].id },
      }),
    ).rejects.toThrow();
    // The database trigger, independently of the application service, enforces capacity.
    await expect(
      prisma.membership.create({
        data: {
          userId: (
            await prisma.user.create({
              data: {
                name: 'Overflow',
                email: 'overflow@cohorts.example.com',
                passwordHash: 'test-hash',
              },
            })
          ).id,
          groupId: allGroups[0].id,
        },
      }),
    ).rejects.toThrow();
  }, 30000);

  it('explicitly assigns an unassigned legacy member while keeping existing memberships unchanged', async () => {
    const existing = await prisma.membership.findUniqueOrThrow({
      where: {
        userId: (
          await prisma.user.findUniqueOrThrow({
            where: { email: 'member-1@cohorts.example.com' },
          })
        ).id,
      },
    });
    const legacyUser = await prisma.user.create({
      data: {
        name: 'Legacy member',
        email: 'legacy@cohorts.example.com',
        passwordHash: 'already-hashed',
      },
    });
    await assignment.assignUserToGroup(legacyUser.id);
    expect(
      await prisma.membership.findUnique({
        where: { userId: existing.userId },
      }),
    ).toMatchObject({ groupId: existing.groupId });
    const legacyMembership = await prisma.membership.findUniqueOrThrow({
      where: { userId: legacyUser.id },
    });
    expect(legacyMembership.groupId).toBe(
      (await prisma.group.findFirstOrThrow({ where: { name: 'Group 4' } })).id,
    );
  });

  it('rolls back user creation and group assignment together when assignment fails', async () => {
    const spy = jest
      .spyOn(assignment, 'assignUser')
      .mockRejectedValueOnce(new Error('assignment failed'));
    await request(server)
      .post('/auth/register')
      .send({
        name: 'Rollback Member',
        email: 'rollback@cohorts.example.com',
        password: 'SecurePass123!',
      })
      .expect(500);
    spy.mockRestore();
    expect(
      await prisma.user.findUnique({
        where: { email: 'rollback@cohorts.example.com' },
      }),
    ).toBeNull();
  });
});
