import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GroupAssignmentService } from '../src/members/group-assignment.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { prepareProgramMember } from './program-fixture';
import { resetTestDatabase } from './reset-test-database';

describe('Automatic group assignment (PostgreSQL e2e)', () => {
  let app: NestExpressApplication;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;
  let prisma: PrismaService;
  let assignment: GroupAssignmentService;

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
    assignment = app.get(GroupAssignmentService);
  });

  afterAll(async () => { await app?.close(); });

  const registration = async (number: number) => {
    const response = await request(server)
      .post('/auth/register')
      .send({
        name: `Member ${number}`,
        email: `member-${number}@example.com`,
        password: 'SecurePass123!',
      }).expect(201);
    expect(await prisma.membership.findUnique({ where: { userId: response.body.id } })).toBeNull();
    await prepareProgramMember(prisma, response.body.id as string);
    await assignment.assignUserToGroup(response.body.id as string);
    return response;
  };

  it('assigns ready members sequentially to three full groups and serializes concurrent registrations safely', async () => {
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
            (_, i) => `member-${i + 1}@example.com`,
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
      expect((await registration(number)).status).toBe(201);
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
                email: 'overflow@example.com',
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
            where: { email: 'member-1@example.com' },
          })
        ).id,
      },
    });
    const legacyUser = await prisma.user.create({
      data: {
        name: 'Legacy member',
        email: 'legacy@example.com',
        passwordHash: 'already-hashed',
        targetJobTitle: 'Engineer',
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

  it('rolls back group creation and membership together when placement fails', async () => {
    const member = await prisma.user.create({
      data: { name: 'Rollback', email: 'rollback@example.com', passwordHash: 'synthetic', targetJobTitle: 'Unique rollback specialty' },
    });
    const groupsBefore = await prisma.group.count();
    await expect(assignment.withAssignmentLock(async (tx) => {
      await assignment.assignUser(tx, member.id);
      throw new Error('failure after placement');
    })).rejects.toThrow('failure after placement');
    expect(await prisma.membership.findUnique({ where: { userId: member.id } })).toBeNull();
    expect(await prisma.group.count()).toBe(groupsBefore);
  });

  it('requires a specialization and isolates different specializations', async () => {
    const unknown = await prisma.user.create({ data: { name: 'Unknown', email: 'unknown@example.com', passwordHash: 'synthetic' } });
    await expect(assignment.assignUserToGroup(unknown.id)).rejects.toThrow('Choose a specialization');
    const designer = await prisma.user.create({ data: { name: 'Designer', email: 'designer@example.com', passwordHash: 'synthetic', targetJobTitle: 'UI/UX Designer' } });
    const groupId = await assignment.assignUserToGroup(designer.id);
    const members = await prisma.membership.findMany({ where: { groupId }, include: { user: true } });
    expect(members).toHaveLength(1);
    expect(members[0].user.targetJobTitle).toBe('UI/UX Designer');
  });
});
