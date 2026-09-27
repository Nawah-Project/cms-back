import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetTestDatabase } from './reset-test-database';

describe('Professional development tasks (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: ReturnType<typeof request.agent>;
  let member: ReturnType<typeof request.agent>;
  let stranger: ReturnType<typeof request.agent>;
  let adminId: string;
  let memberId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = module.get(PrismaService);
    await resetTestDatabase(prisma);
    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    async function register(key: string) {
      const agent = request.agent(app.getHttpServer());
      const response = await agent
        .post('/auth/register')
        .send({
          name: key,
          email: `${key}@tasks.example.com`,
          password: 'SecurePass123!',
        })
        .expect(201);
      return { agent, id: response.body.id as string };
    }
    const adminAccount = await register('task-admin');
    const memberAccount = await register('task-member');
    const strangerAccount = await register('task-stranger');
    admin = adminAccount.agent;
    adminId = adminAccount.id;
    member = memberAccount.agent;
    memberId = memberAccount.id;
    stranger = strangerAccount.agent;
    await prisma.user.update({
      where: { id: adminId },
      data: { role: UserRole.ADMIN },
    });
  });

  afterAll(async () => app?.close());

  it('enforces ownership, admin assignment, checklist progress, private notes, and unread feedback', async () => {
    await request(app.getHttpServer()).get('/tasks').expect(401);
    await member
      .post(`/admin/users/${memberId}/tasks`)
      .send({ title: 'Forbidden assignment' })
      .expect(403);

    const created = await admin
      .post(`/admin/users/${memberId}/tasks`)
      .send({
        title: 'Prepare portfolio case study',
        description: 'Write a concise case study.',
        priority: 'HIGH',
        mentorPriority: false,
        checklist: [
          { title: 'Choose a project' },
          { title: 'Describe outcomes' },
        ],
      })
      .expect(201);
    const taskId = created.body.id as string;
    expect(created.body).toMatchObject({
      userId: memberId,
      createdById: adminId,
      status: 'TODO',
      priority: 'HIGH',
      mentorPriority: false,
      progress: { completed: 0, total: 2 },
      overdue: false,
    });

    await member
      .get('/tasks')
      .expect(200)
      .expect((response) => {
        expect(
          response.body.items.map((task: { id: string }) => task.id),
        ).toContain(taskId);
      });
    await stranger.get(`/tasks/${taskId}`).expect(404);
    await stranger
      .post(`/tasks/${taskId}/notes`)
      .send({ content: 'Not my task' })
      .expect(404);

    const checklistItemId = created.body.checklist[0].id as string;
    await member
      .patch(`/tasks/${taskId}/checklist/${checklistItemId}`)
      .send({ completed: true })
      .expect(200);
    await admin
      .patch(`/admin/tasks/${taskId}/checklist/${checklistItemId}`)
      .send({ title: 'Select one project' })
      .expect(200);
    await admin
      .patch(`/admin/tasks/${taskId}/checklist/${checklistItemId}`)
      .send({ completed: false })
      .expect(400);

    await member
      .post(`/tasks/${taskId}/notes`)
      .send({ content: 'My private planning note' })
      .expect(201);
    await admin.get(`/admin/tasks/${taskId}/feedback`).expect(200).expect([]);
    await admin
      .post(`/admin/tasks/${taskId}/feedback`)
      .send({ content: 'Show the measured impact.' })
      .expect(201);
    await admin
      .get(`/admin/tasks/${taskId}/feedback`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveLength(1);
        expect(response.body[0].type).toBe('MENTOR_FEEDBACK');
      });
    await admin
      .get(`/admin/tasks/${taskId}`)
      .expect(200)
      .expect((response) => {
        expect(
          response.body.notes.every(
            (note: { type: string }) => note.type === 'MENTOR_FEEDBACK',
          ),
        ).toBe(true);
      });

    await member
      .get('/dashboard/professional-development')
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          totalActiveTasks: 1,
          TODO: 1,
          unreadMentorFeedbackCount: 1,
        });
      });
    const notes = await member.get(`/tasks/${taskId}/notes`).expect(200);
    expect(notes.body).toHaveLength(2);
    const feedbackId = notes.body.find(
      (note: { type: string }) => note.type === 'MENTOR_FEEDBACK',
    ).id as string;
    await member.patch(`/tasks/${taskId}/notes/${feedbackId}/read`).expect(200);
    await member
      .get('/dashboard/professional-development')
      .expect(200)
      .expect((response) => {
        expect(response.body.unreadMentorFeedbackCount).toBe(0);
      });
    await member
      .patch(`/tasks/${taskId}/status`)
      .send({ status: 'DONE', mentorPriority: true })
      .expect(400);
    await member
      .patch(`/tasks/${taskId}/status`)
      .send({ status: 'DONE' })
      .expect(200);
    await member
      .get('/dashboard/professional-development')
      .expect(200)
      .expect((response) => {
        expect(response.body.totalActiveTasks).toBe(0);
      });
  });
});
