import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ApplicationOutcome } from '../src/applications/enums/application-outcome.enum';
import { ApplicationStage } from '../src/applications/enums/application-stage.enum';
import { PrismaService } from '../src/prisma/prisma.service';
import { prepareProgramMember } from './program-fixture';
import { resetTestDatabase } from './reset-test-database';

interface ProgressMember {
  memberId: string;
  userId: string;
  name: string;
  avatar: string | null;
  portfolioUrl: string | null;
  hasCv: boolean;
  isCurrentUser: boolean;
  lastUpdatedAt: string | null;
  counts: Record<string, number>;
}

interface RecentProgressEvent {
  id: string;
  memberId: string;
  member: { id: string; name: string; avatar: string | null };
  application: {
    id: string;
    jobTitle: string;
    companyName: string;
    jobUrl: string | null;
  };
  fromStage: ApplicationStage | null;
  toStage: ApplicationStage;
  outcome: ApplicationOutcome | null;
  changedAt: string;
}

function progressRows(response: { body: unknown }): ProgressMember[] {
  return response.body as ProgressMember[];
}

describe('Members progress (e2e)', () => {
  let app: NestExpressApplication;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;
  let prisma: PrismaService;
  const agents = new Map<string, ReturnType<typeof request.agent>>();
  const ids = new Map<string, string>();

  const previousAssignment=process.env.ASSIGN_GROUP_ON_REGISTER;
  beforeAll(async () => {
    process.env.ASSIGN_GROUP_ON_REGISTER='true';
    process.env.NODE_ENV = 'test';
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

    const accounts = [
      { key: 'current', name: 'Nora Current' },
      { key: 'alpha', name: 'Alice Alpha' },
      { key: 'beta', name: 'Ben Beta' },
      ...Array.from({ length: 7 }, (_, index) => ({
        key: `filler-${index}`,
        name: `Filler ${index}`,
      })),
      { key: 'outside', name: 'Outside User' },
      { key: 'unassigned', name: 'Unassigned User' },
    ];
    for (const account of accounts) {
      const agent = request.agent(server);
      const result = await agent
        .post('/auth/register')
        .send({
          name: account.name,
          email: `${account.key}@members.example.com`,
          password: 'SecurePass123!',
        })
        .expect(201);
      await prepareProgramMember(prisma, result.body.id as string);
      agents.set(account.key, agent);
      ids.set(account.key, result.body.id as string);
    }

    const seedApplications = [
      ...Array.from({ length: 2 }, (_, index) => ({
        stage: ApplicationStage.APPLIED,
        outcome: ApplicationOutcome.NONE,
        marker: `current-applied-${index}`,
      })),
      {
        stage: ApplicationStage.INTERVIEW,
        outcome: ApplicationOutcome.NONE,
        marker: 'current-interview',
      },
      {
        stage: ApplicationStage.DECISION,
        outcome: ApplicationOutcome.NONE,
        marker: 'current-decision',
      },
      {
        stage: ApplicationStage.CLOSED,
        outcome: ApplicationOutcome.ACCEPTED,
        marker: 'current-closed-accepted',
      },
      {
        stage: ApplicationStage.CLOSED,
        outcome: ApplicationOutcome.REJECTED,
        marker: 'current-closed-rejected',
      },
    ];
    await prisma.application.createMany({
      data: seedApplications.map(({ stage, outcome, marker }) => ({
        userId: ids.get('current')!,
        companyName: `PRIVATE COMPANY ${marker}`,
        jobTitle: `PRIVATE TITLE ${marker}`,
        applicationDate: '2026-01-01',
        location: 'PRIVATE LOCATION',
        applicationMethod: null,
        jobUrl: `https://private.example/${marker}`,
        stage: stage as never,
        outcome: outcome as never,
      })),
    });
    await prisma.application.create({
      data: {
        userId: ids.get('beta')!,
        companyName: 'PRIVATE BETA COMPANY',
        jobTitle: 'PRIVATE BETA TITLE',
        applicationDate: '2026-01-02',
        location: 'PRIVATE BETA LOCATION',
        applicationMethod: null,
        jobUrl: 'https://private.example/beta',
        stage: ApplicationStage.DECISION as never,
        outcome: ApplicationOutcome.NONE as never,
      },
    });
    await prisma.application.create({
      data: {
        userId: ids.get('outside')!,
        companyName: 'OUTSIDE SECRET COMPANY',
        jobTitle: 'OUTSIDE SECRET TITLE',
        applicationDate: '2026-01-03',
        location: 'OUTSIDE SECRET LOCATION',
        applicationMethod: null,
        jobUrl: 'https://private.example/outside',
        stage: ApplicationStage.CLOSED as never,
        outcome: ApplicationOutcome.WITHDRAWN as never,
      },
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('requires authentication', async () => {
    await request(server).get('/members/progress').expect(401);
    await request(server).get('/members/progress/recent').expect(401);
  });

  it('returns real application and stage activity from the current group only and respects the limit', async () => {
    const currentAgent = agents.get('current')!;
    const betaAgent = agents.get('beta')!;

    const currentCreate = await currentAgent
      .post('/applications')
      .send({ companyName: 'Shared Co A', jobTitle: 'UX Designer' })
      .expect(201);
    const currentApplicationId = currentCreate.body.id as string;

    // Application creation appears as an initial activity without a prior stage.
    const initialActivity = await currentAgent
      .get('/members/progress/activity')
      .expect(200);
    expect(initialActivity.body[0]).toMatchObject({
      memberId: ids.get('current'),
      fromStage: null,
      toStage: ApplicationStage.APPLIED,
      application: { id: currentApplicationId, companyName: 'Shared Co A' },
    });

    await currentAgent
      .patch(`/applications/${currentApplicationId}`)
      .send({ stage: ApplicationStage.INTERVIEW })
      .expect(200);
    // Editing details at the same stage does not create another event.
    await currentAgent
      .patch(`/applications/${currentApplicationId}`)
      .send({ jobUrl: 'https://private.example/current' })
      .expect(200);

    const betaCreate = await betaAgent
      .post('/applications')
      .send({ companyName: 'Shared Co B', jobTitle: 'Product Designer' })
      .expect(201);
    const betaApplicationId = betaCreate.body.id as string;
    await betaAgent
      .patch(`/applications/${betaApplicationId}`)
      .send({ stage: ApplicationStage.INTERVIEW })
      .expect(200);
    await currentAgent
      .patch(`/applications/${currentApplicationId}`)
      .send({ stage: ApplicationStage.DECISION })
      .expect(200);

    const outsideCreate = await agents
      .get('outside')!
      .post('/applications')
      .send({ companyName: 'Outside Co', jobTitle: 'Private Role' })
      .expect(201);
    await agents
      .get('outside')!
      .patch(`/applications/${outsideCreate.body.id as string}`)
      .send({ stage: ApplicationStage.INTERVIEW })
      .expect(200);

    const response = await currentAgent
      .get('/members/progress/activity?limit=10')
      .expect(200);
    const events = response.body as RecentProgressEvent[];
    const transitions = events.filter((event) => event.fromStage !== null);
    expect(transitions.slice(0, 3).map((event) => event.member.id)).toEqual([
      ids.get('current'),
      ids.get('beta'),
      ids.get('current'),
    ]);
    expect(
      transitions.slice(0, 3).map((event) => [event.fromStage, event.toStage]),
    ).toEqual([
      [ApplicationStage.INTERVIEW, ApplicationStage.DECISION],
      [ApplicationStage.APPLIED, ApplicationStage.INTERVIEW],
      [ApplicationStage.APPLIED, ApplicationStage.INTERVIEW],
    ]);
    expect(events.some((event) => event.member.id === ids.get('outside'))).toBe(
      false,
    );
    expect(transitions[0]).toMatchObject({
      member: { id: ids.get('current'), name: 'Nora Current', avatar: null },
      application: { companyName: 'Shared Co A', jobTitle: 'UX Designer' },
      fromStage: ApplicationStage.INTERVIEW,
      toStage: ApplicationStage.DECISION,
      outcome: null,
    });
    expect(transitions[0]).not.toHaveProperty('member.email');
    expect(transitions[0].application.jobUrl).toBe(
      'https://private.example/current',
    );
    expect(transitions[0].application).not.toHaveProperty('location');

    const limited = await currentAgent
      .get('/members/progress/activity?limit=1')
      .expect(200);
    expect(limited.body).toHaveLength(1);
    expect((limited.body as RecentProgressEvent[])[0].member.id).toBe(
      ids.get('current'),
    );
  });

  it('returns only active members in the current user’s group and prioritizes recent meaningful activity', async () => {
    const response = await agents
      .get('current')!
      .get('/members/progress')
      .expect(200);
    const members = progressRows(response);
    expect(members.slice(0, 3).map((member) => member.userId)).toEqual([
      ids.get('current'),
      ids.get('beta'),
      ids.get('alpha'),
    ]);
    expect(members.slice(0, 3).map((member) => member.name)).toEqual([
      'Nora Current',
      'Ben Beta',
      'Alice Alpha',
    ]);
    expect(members[0].isCurrentUser).toBe(true);
    expect(members.slice(1).every((member) => !member.isCurrentUser)).toBe(
      true,
    );
    expect(members.some((member) => member.userId === ids.get('outside'))).toBe(
      false,
    );
    expect(members).toHaveLength(10);
  });

  it('aggregates stage counts from applications and counts CLOSED once regardless of outcome', async () => {
    const response = await agents
      .get('current')!
      .get('/members/progress')
      .expect(200);
    expect(response.body[0]).toEqual({
      memberId: ids.get('current'),
      userId: ids.get('current'),
      name: 'Nora Current',
      avatar: null,
      portfolioUrl: 'https://example.com/synthetic',
      hasCv: true,
      hasAcceptedApplication: true,
      isCurrentUser: true,
      lastUpdatedAt: expect.any(String),
      counts: { applied: 2, assignment: 0, interview: 1, decision: 2, closed: 2 },
    });
    const beta = response.body.find(
      (member: ProgressMember) => member.userId === ids.get('beta'),
    );
    expect(beta!.counts).toEqual({
      applied: 0,
      assignment: 0,
      interview: 1,
      decision: 1,
      closed: 0,
    });
  });

  it('returns all-zero counts for a visible member with no applications', async () => {
    const response = await agents
      .get('current')!
      .get('/members/progress')
      .expect(200);
    const alpha = response.body.find(
      (member: ProgressMember) => member.userId === ids.get('alpha'),
    );
    expect(alpha!.counts).toEqual({
      applied: 0,
      assignment: 0,
      interview: 0,
      decision: 0,
      closed: 0,
    });
  });

  it('does not expose email, application records, or private application fields', async () => {
    const response = await agents
      .get('current')!
      .get('/members/progress')
      .expect(200);
    for (const member of response.body) {
      expect(Object.keys(member).sort()).toEqual([
        'avatar',
        'counts',
        'hasAcceptedApplication',
        'hasCv',
        'isCurrentUser',
        'lastUpdatedAt',
        'memberId',
        'name',
        'portfolioUrl',
        'userId',
      ]);
      expect(Object.keys(member.counts).sort()).toEqual([
        'applied',
        'assignment',
        'closed',
        'decision',
        'interview',
      ]);
    }
    const serialized = JSON.stringify(response.body);
    for (const secret of [
      '@members.example.com',
      'PRIVATE COMPANY',
      'PRIVATE TITLE',
      'PRIVATE LOCATION',
      'private.example',
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('does not reveal another group to a member of only one group', async () => {
    const response = await agents
      .get('alpha')!
      .get('/members/progress')
      .expect(200);
    const members = progressRows(response);
    expect(members.map((member) => member.userId)).toEqual(
      expect.arrayContaining([
        ids.get('alpha'),
        ids.get('beta'),
        ids.get('current'),
      ]),
    );
    expect(response.body).toHaveLength(10);
  });

  it('uses one application aggregation query for the cohort instead of one query per member', async () => {
    const querySpy = jest.spyOn(prisma.application, 'groupBy');
    await agents.get('current')!.get('/members/progress').expect(200);
    expect(querySpy).toHaveBeenCalledTimes(3);
    querySpy.mockRestore();
  });
});
