import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { ApplicationStage } from '../src/applications/enums/application-stage.enum';
import { ApplicationOutcome } from '../src/applications/enums/application-outcome.enum';
import { ApplicationMethod } from '../src/applications/enums/application-method.enum';
import { PrismaService } from '../src/prisma/prisma.service';
import { prepareProgramMember } from './program-fixture';
import { resetTestDatabase } from './reset-test-database';

describe('Applications (e2e)', () => {
  let app: INestApplication;
  const agents = new Map<string, ReturnType<typeof request.agent>>();
  const asUser = (id: string) => agents.get(id)!;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await resetTestDatabase(moduleFixture.get(PrismaService));

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    for (const id of [
      'user-test-1',
      'user-filter-test',
      'user-dashboard-test',
      'user-owner',
      'user-stranger',
    ]) {
      const agent = request.agent(app.getHttpServer());
      const account = await agent
        .post('/auth/register')
        .send({
          name: id,
          email: `${id}@example.com`,
          password: 'SecurePass123!',
        })
        .expect(201);
      await prepareProgramMember(moduleFixture.get(PrismaService), account.body.id as string);
      agents.set(id, agent);
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /applications', () => {
    it('should create an application with default values', async () => {
      const response = await asUser('user-test-1')
        .post('/applications')

        .send({
          companyName: 'Vodafone',
          jobTitle: 'UX Designer',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.userId).toEqual(expect.any(String));
      expect(response.body.companyName).toBe('Vodafone');
      expect(response.body.jobTitle).toBe('UX Designer');
      expect(response.body.stage).toBe(ApplicationStage.APPLIED);
      expect(response.body.outcome).toBe(ApplicationOutcome.NONE);

      const today = new Date().toISOString().split('T')[0];
      expect(response.body.applicationDate).toBe(today);
      expect(response.body.location).toBeNull();
      expect(response.body.applicationMethod).toBeNull();
      expect(response.body.jobUrl).toBeNull();
    });

    it('should create an application with full valid payload', async () => {
      const response = await asUser('user-test-1')
        .post('/applications')

        .send({
          companyName: 'Google',
          jobTitle: 'Frontend Engineer',
          applicationDate: '2026-05-10',
          location: 'Remote',
          applicationMethod: ApplicationMethod.LINKEDIN,
          jobUrl: 'https://www.linkedin.com/jobs/view/123456789',
        })
        .expect(201);

      expect(response.body.companyName).toBe('Google');
      expect(response.body.jobTitle).toBe('Frontend Engineer');
      expect(response.body.applicationDate).toBe('2026-05-10');
      expect(response.body.location).toBe('Remote');
      expect(response.body.applicationMethod).toBe(ApplicationMethod.LINKEDIN);
      expect(response.body.jobUrl).toBe(
        'https://www.linkedin.com/jobs/view/123456789',
      );
    });

    it('should reject when companyName is missing or empty', async () => {
      await asUser('user-test-1')
        .post('/applications')

        .send({
          jobTitle: 'Product Designer',
        })
        .expect(400);

      await asUser('user-test-1')
        .post('/applications')

        .send({
          companyName: '',
          jobTitle: 'Product Designer',
        })
        .expect(400);
    });

    it('should reject when jobTitle is missing or empty', async () => {
      await asUser('user-test-1')
        .post('/applications')

        .send({
          companyName: 'Acme',
        })
        .expect(400);
    });

    it('should reject invalid URL format in jobUrl', async () => {
      const res = await asUser('user-test-1')
        .post('/applications')

        .send({
          companyName: 'Acme',
          jobTitle: 'Engineer',
          jobUrl: 'not-a-valid-url',
        })
        .expect(400);

      expect(JSON.stringify(res.body)).toContain('jobUrl');
    });

    it('should reject invalid enum values', async () => {
      await asUser('user-test-1')
        .post('/applications')

        .send({
          companyName: 'Acme',
          jobTitle: 'Engineer',
          applicationMethod: 'INVALID_METHOD',
        })
        .expect(400);

      await asUser('user-test-1')
        .post('/applications')

        .send({
          companyName: 'Acme',
          jobTitle: 'Engineer',
          stage: 'INVALID_STAGE',
        })
        .expect(400);
    });

    it('should reject creating CLOSED application without valid outcome', async () => {
      await asUser('user-test-1')
        .post('/applications')

        .send({
          companyName: 'Acme',
          jobTitle: 'Engineer',
          stage: ApplicationStage.CLOSED,
        })
        .expect(400);

      await asUser('user-test-1')
        .post('/applications')

        .send({
          companyName: 'Acme',
          jobTitle: 'Engineer',
          stage: ApplicationStage.CLOSED,
          outcome: ApplicationOutcome.NONE,
        })
        .expect(400);
    });

    it('should reject creating non-CLOSED application with outcome other than NONE', async () => {
      await asUser('user-test-1')
        .post('/applications')

        .send({
          companyName: 'Acme',
          jobTitle: 'Engineer',
          stage: ApplicationStage.APPLIED,
          outcome: ApplicationOutcome.ACCEPTED,
        })
        .expect(400);
    });

    it('should forbid non-whitelisted fields like userId from request body', async () => {
      await asUser('user-test-1')
        .post('/applications')

        .send({
          companyName: 'Acme',
          jobTitle: 'Engineer',
          userId: 'attacker-id',
        })
        .expect(400);
    });
  });

  describe('GET /applications', () => {
    const userId = 'user-filter-test';

    beforeAll(async () => {
      await asUser(userId)
        .post('/applications')

        .send({
          companyName: 'Apple',
          jobTitle: 'iOS Developer',
          applicationDate: '2026-01-01',
          stage: ApplicationStage.APPLIED,
        });

      await asUser(userId)
        .post('/applications')

        .send({
          companyName: 'Microsoft',
          jobTitle: 'Frontend Engineer',
          applicationDate: '2026-02-01',
          stage: ApplicationStage.INTERVIEW,
        });

      await asUser(userId)
        .post('/applications')

        .send({
          companyName: 'Amazon',
          jobTitle: 'Cloud Architect',
          applicationDate: '2026-03-01',
          stage: ApplicationStage.CLOSED,
          outcome: ApplicationOutcome.REJECTED,
        });
    });

    it('should list all applications for the user', async () => {
      const res = await asUser(userId)
        .get('/applications')

        .expect(200);

      expect(res.body.total).toBe(3);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.page).toBe(1);
    });

    it('should filter by stage', async () => {
      const res = await asUser(userId)
        .get('/applications?stage=INTERVIEW')

        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.data[0].companyName).toBe('Microsoft');
    });

    it('should filter by outcome', async () => {
      const res = await asUser(userId)
        .get('/applications?outcome=REJECTED')

        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.data[0].companyName).toBe('Amazon');
    });

    it('should search by company or job title', async () => {
      const res = await asUser(userId)
        .get('/applications?search=frontend')

        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.data[0].companyName).toBe('Microsoft');
    });

    it('should paginate and sort', async () => {
      const res = await asUser(userId)
        .get('/applications?limit=2&page=1&sortOrder=DESC')

        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.total).toBe(3);
      expect(res.body.totalPages).toBe(2);
      expect(res.body.data[0].companyName).toBe('Amazon');
    });
  });

  describe('GET /applications/dashboard', () => {
    const userId = 'user-dashboard-test';

    beforeAll(async () => {
      // 2 APPLIED
      for (let i = 0; i < 2; i++) {
        await asUser(userId)
          .post('/applications')

          .send({ companyName: `App ${i}`, jobTitle: 'Dev' });
      }
      // 1 INTERVIEW
      const interview = await asUser(userId)
        .post('/applications')

        .send({ companyName: 'Int 1', jobTitle: 'Dev' });
      await asUser(userId)
        .patch(`/applications/${interview.body.id}`)

        .send({ stage: ApplicationStage.INTERVIEW });

      // 1 CLOSED ACCEPTED
      await asUser(userId)
        .post('/applications')

        .send({
          companyName: 'Closed 1',
          jobTitle: 'Dev',
          stage: ApplicationStage.CLOSED,
          outcome: ApplicationOutcome.ACCEPTED,
        });
    });

    it('should return aggregated dashboard statistics', async () => {
      const res = await asUser(userId)
        .get('/applications/dashboard')

        .expect(200);

      expect(res.body).toMatchObject({
        active: {
          total: 3,
          applied: 2,
          interview: 1,
          decision: 0,
        },
        closed: {
          total: 1,
          accepted: 1,
          rejected: 0,
          withdrawn: 0,
        },
      });
      const recentApplications = (
        res.body as { recentApplications: Array<{ companyName: string }> }
      ).recentApplications;
      expect(recentApplications).toHaveLength(4);
      expect(
        recentApplications.every((item) =>
          ['App 0', 'App 1', 'Int 1', 'Closed 1'].includes(item.companyName),
        ),
      ).toBe(true);
    });
  });

  describe('GET, PATCH, DELETE /applications/:id and User Isolation', () => {
    let createdAppId: string;
    const userA = 'user-owner';
    const userB = 'user-stranger';

    beforeAll(async () => {
      const res = await asUser(userA)
        .post('/applications')

        .send({
          companyName: 'Stripe',
          jobTitle: 'Backend Engineer',
          location: 'Remote',
        });
      createdAppId = res.body.id;
    });

    it('should allow owner to get single application', async () => {
      const res = await asUser(userA)
        .get(`/applications/${createdAppId}`)

        .expect(200);

      expect(res.body.id).toBe(createdAppId);
      expect(res.body.companyName).toBe('Stripe');
    });

    it('should prevent stranger from viewing the application (user isolation)', async () => {
      await asUser(userB)
        .get(`/applications/${createdAppId}`)

        .expect(404);
    });

    it('should prevent stranger from updating the application', async () => {
      await asUser(userB)
        .patch(`/applications/${createdAppId}`)

        .send({ jobTitle: 'Hacked' })
        .expect(404);
    });

    it('should prevent stranger from deleting the application', async () => {
      await asUser(userB)
        .delete(`/applications/${createdAppId}`)

        .expect(404);
    });

    it('should allow owner to update fields and validate stage transition', async () => {
      // 1. Move to INTERVIEW (outcome stays NONE)
      const res1 = await asUser(userA)
        .patch(`/applications/${createdAppId}`)

        .send({
          stage: ApplicationStage.INTERVIEW,
          location: 'Cairo, Egypt',
        })
        .expect(200);

      expect(res1.body.stage).toBe(ApplicationStage.INTERVIEW);
      expect(res1.body.outcome).toBe(ApplicationOutcome.NONE);
      expect(res1.body.location).toBe('Cairo, Egypt');

      // 2. Reject moving to CLOSED without outcome
      await asUser(userA)
        .patch(`/applications/${createdAppId}`)

        .send({ stage: ApplicationStage.CLOSED })
        .expect(400);

      // 3. Move to CLOSED with outcome ACCEPTED
      const res2 = await asUser(userA)
        .patch(`/applications/${createdAppId}`)

        .send({
          stage: ApplicationStage.CLOSED,
          outcome: ApplicationOutcome.ACCEPTED,
        })
        .expect(200);

      expect(res2.body.stage).toBe(ApplicationStage.CLOSED);
      expect(res2.body.outcome).toBe(ApplicationOutcome.ACCEPTED);

      // 4. Move away from CLOSED back to APPLIED -> outcome resets to NONE
      const res3 = await asUser(userA)
        .patch(`/applications/${createdAppId}`)

        .send({ stage: ApplicationStage.APPLIED })
        .expect(200);

      expect(res3.body.stage).toBe(ApplicationStage.APPLIED);
      expect(res3.body.outcome).toBe(ApplicationOutcome.NONE);
    });

    it('should allow owner to permanently delete the application', async () => {
      await asUser(userA)
        .delete(`/applications/${createdAppId}`)

        .expect(200);

      await asUser(userA)
        .get(`/applications/${createdAppId}`)

        .expect(404);

      await asUser(userA)
        .delete(`/applications/${createdAppId}`)

        .expect(404);
    });
  });
});
