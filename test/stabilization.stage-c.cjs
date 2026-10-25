const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdtemp, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
if (
  process.env.NODE_ENV !== 'test' ||
  !process.env.TEST_DATABASE_URL ||
  new URL(process.env.TEST_DATABASE_URL).pathname !== '/cms_test'
)
  throw Error('Disposable cms_test required');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const request = require('supertest'),
  cookieParser = require('cookie-parser');
let app, db, sender, storage;
const password = 'SyntheticPass123!';
const { AppModule } = require('../dist/app.module');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { EmailSenderService } = require('../dist/auth/email-sender.service');
const { EmailVerifierService } = require('../dist/auth/email-verifier.service');
const { AuthService } = require('../dist/auth/auth.service');
const {
  AdminNotificationsService,
} = require('../dist/admin/notifications/admin-notifications.service');
before(async () => {
  storage = await mkdtemp(join(tmpdir(), 'nawah-stage-c-'));
  process.env.CV_STORAGE_DIR = storage;
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider('CV_STORAGE_DIR')
    .useValue(storage)
    .overrideProvider(EmailVerifierService)
    .useValue({ validateEmailAddress: async () => {} })
    .compile();
  db = module.get(PrismaService);
  sender = module.get(EmailSenderService);
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
});
after(async () => {
  await app?.close();
  await rm(storage, { recursive: true, force: true });
});
async function register() {
  const agent = request.agent(app.getHttpServer()),
    email = randomUUID() + '@example.invalid';
  const r = await agent
    .post('/auth/register')
    .send({ name: 'Synthetic HTTP participant', email, password })
    .expect(201);
  return { agent, email, id: r.body.id, code: sender.lastSentOtpForTest.code };
}
async function ready(u) {
  await u.agent.post('/auth/verify-email').send({ code: u.code }).expect(200);
  await u.agent
    .patch('/profile')
    .send({
      portfolioUrl: 'https://example.com/portfolio',
      targetJobTitle: 'Engineer',
    })
    .expect(200);
  await u.agent
    .post('/profile/cv')
    .attach('file', Buffer.from('%PDF-1.7\nSynthetic CV ' + u.id), {
      filename: 'synthetic.pdf',
      contentType: 'application/pdf',
    })
    .expect(201);
}
test('HTTP: register, OTP errors, readiness, profile and valid PDF upload, then all 25 nodes and relogin', async () => {
  const u = await register();
  await u.agent.get('/journey/state').expect(403);
  await u.agent.post('/auth/verify-email').send({ code: '000000' }).expect(400);
  await u.agent.post('/auth/verify-email').send({ code: u.code }).expect(200);
  await u.agent.get('/applications').expect(403);
  await u.agent
    .patch('/profile')
    .send({
      portfolioUrl: 'https://example.com/portfolio',
      targetJobTitle: 'Engineer',
    })
    .expect(200);
  await u.agent
    .post('/profile/cv')
    .attach('file', Buffer.from('wrong'), {
      filename: 'wrong.docx',
      contentType: 'application/octet-stream',
    })
    .expect(400);
  await u.agent
    .post('/profile/cv')
    .attach('file', Buffer.from('%PDF-1.7\nSynthetic journey CV'), {
      filename: 'synthetic.pdf',
      contentType: 'application/pdf',
    })
    .expect(201);
  await u.agent
    .post('/journey/side-tasks')
    .send({
      nodeCode: 'W3_REVIEW',
      type: 'WEEKLY_REVIEW',
      reviewSummary: 'future',
    })
    .expect(403);
  const nodes = await db.journeyNode.findMany({
    orderBy: { orderIndex: 'asc' },
  });
  let logged = 0;
  for (const n of nodes) {
    const saved = await db.userJourneyState.findUniqueOrThrow({
      where: { userId: u.id },
    });
    assert.equal(saved.currentNodeCode, n.code, `entered ${n.code}`);
    if (n.code === 'FINAL_REPORT') break;
    // Fixture clock only: no quotas or production timestamps are changed.
    await db.userJourneyState.update({
      where: { userId: u.id },
      data: {
        currentNodeStartedAt: new Date(),
        weekStartedAt: new Date(Date.now() - 9 * 86400000),
      },
    });
    for (let i = 0; i < n.requiredAppsCount; i++) {
      await u.agent
        .post('/applications')
        .send({
          companyName: `Synthetic ${n.code} ${i}`,
          jobTitle: 'Engineer',
          isTailored: i < n.requiredTailoredCount,
        })
        .expect(201);
      logged++;
    }
    for (let i = 0; i < n.requiredPostsCount; i++) {
      const dto = {
        nodeCode: n.code,
        type: 'LINKEDIN_POST',
        postUrl: `https://linkedin.com/posts/${u.id}-${n.code}-${i}`,
      };
      const first = await u.agent
        .post('/journey/side-tasks')
        .send(dto)
        .expect(201);
      const retry = await u.agent
        .post('/journey/side-tasks')
        .send(dto)
        .expect(201);
      assert.equal(first.body.submission.id, retry.body.submission.id);
    }
    for (let i = 0; i < n.requiredOutreachCount; i++)
      await u.agent
        .post('/journey/side-tasks')
        .send({
          nodeCode: n.code,
          type: 'OUTREACH_CONTACT',
          contactName: 'Synthetic ' + i,
          companyName: 'Test company',
          contactMethod: 'LinkedIn',
        })
        .expect(201);
    if (n.nodeType === 'REVIEW_STATION')
      await u.agent
        .post('/journey/side-tasks')
        .send({
          nodeCode: n.code,
          type: 'WEEKLY_REVIEW',
          reviewSummary: 'Reflection for ' + n.code,
        })
        .expect(201);
    const progress = await u.agent.get('/journey/state').expect(200);
    assert.ok(
      progress.body.state.completedNodeCodes.includes(n.code),
      `completed ${n.code}`,
    );
    if (n.code === 'TASK_0') {
      assert.equal(progress.body.features.groups, true);
      await u.agent.get('/members/progress').expect(200);
      assert.equal(progress.body.features.professionalTasks, false);
    }
    for (const code of progress.body.state.unlockedInsightCodes)
      await u.agent.post('/journey/insights/' + code + '/read').expect(201);
    if (n.code === 'W3_M2') {
      const refreshed = await u.agent.get('/journey/state').expect(200);
      assert.equal(refreshed.body.features.professionalTasks, true);
      await u.agent
        .post('/tasks')
        .send({ title: 'Synthetic practice' })
        .expect(201);
    }
  }
  const report = await u.agent.get('/journey/reports').expect(200);
  assert.equal(report.body.overall.logged, logged);
  assert.equal(report.body.overall.reviews, 3);
  assert.equal(report.body.finalAvailable, true);
  assert.equal(report.body.completed, false);
  await u.agent.post('/journey/final-report/complete').expect(201);
  await u.agent.post('/journey/final-report/complete').expect(201);
  await u.agent.post('/auth/logout').expect(204);
  await u.agent.get('/journey/state').expect(401);
  await u.agent
    .post('/auth/login')
    .send({ email: u.email, password })
    .expect(200);
  const restored = await u.agent.get('/journey/reports').expect(200);
  assert.equal(restored.body.completed, true);
  assert.equal(restored.body.completedNodeCodes.length, 25);
});
test('HTTP: group progress visible, private opportunity details hidden, sharing opt-in and cross-group CV isolated', async () => {
  const a = await register(),
    b = await register(),
    c = await register();
  for (const u of [a, b, c]) await ready(u);
  const g = await db.group.create({
      data: { name: 'Synthetic privacy ' + randomUUID() },
    }),
    other = await db.group.create({
      data: { name: 'Synthetic outside ' + randomUUID() },
    });
  for (const u of [a, b, c]) {
    await db.membership.upsert({
      where: { userId: u.id },
      create: { userId: u.id, groupId: u === c ? other.id : g.id },
      update: { groupId: u === c ? other.id : g.id },
    });
    await db.userJourneyState.update({
      where: { userId: u.id },
      data: {
        currentWeek: 1,
        currentNodeCode: 'W1_M1',
        completedNodeCodes: ['TASK_0'],
      },
    });
  }
  const privateApp = await b.agent
    .post('/applications')
    .send({
      companyName: 'Private Employer',
      jobTitle: 'Private Role',
      jobUrl: 'https://private.example.com',
      sharedWithGroup: false,
    })
    .expect(201);
  let feed = await a.agent.get('/members/progress/activity').expect(200);
  assert.ok(!JSON.stringify(feed.body).includes('Private Employer'));
  let detail = await a.agent.get('/members/progress/' + b.id).expect(200);
  assert.ok(!JSON.stringify(detail.body).includes('Private Employer'));
  await b.agent
    .patch('/applications/' + privateApp.body.id)
    .send({ sharedWithGroup: true })
    .expect(200);
  feed = await a.agent.get('/members/progress/activity').expect(200);
  assert.ok(JSON.stringify(feed.body).includes('Private Employer'));
  await c.agent.get('/members/progress/' + b.id).expect(404);
  await c.agent.get('/users/' + b.id + '/cv').expect(403);
  await a.agent.get('/users/' + b.id + '/cv').expect(200);
});
test('SMTP failure keeps created account recoverable and pending verification; fresh-code resend succeeds', async () => {
  const original = sender.sendVerificationOtp;
  sender.sendVerificationOtp = async () => {
    throw Error('Synthetic SMTP failure');
  };
  let u;
  try {
    u = await register();
  } finally {
    sender.sendVerificationOtp = original;
  }
  const me = await u.agent.get('/auth/me').expect(200);
  assert.equal(me.body.emailVerified, false);
  await u.agent.get('/journey/state').expect(403);
  await db.user.update({
    where: { id: u.id },
    data: { emailVerificationSentAt: new Date(Date.now() - 61000) },
  });
  await u.agent.post('/auth/resend-verification').expect(200);
  await u.agent
    .post('/auth/verify-email')
    .send({ code: sender.lastSentOtpForTest.code })
    .expect(200);
});
test('OTP email logs redact content, historical API responses redact, and retry refuses old verification messages', async () => {
  const mail = new EmailSenderService(db);
  mail.getSmtpConfig = () => ({
    host: 'synthetic',
    port: 25,
    secure: false,
    from: 'test@example.invalid',
  });
  mail.sendSmtpMail = async () => {};
  await mail.sendVerificationOtp({
    to: 'synthetic@example.invalid',
    name: 'Synthetic',
    code: '654321',
  });
  const log = await db.emailDeliveryLog.findFirstOrThrow({
    where: { recipientEmail: 'synthetic@example.invalid' },
    orderBy: { createdAt: 'desc' },
  });
  assert.ok(!JSON.stringify(log).includes('654321'));
  const legacy = await db.emailDeliveryLog.create({
    data: {
      recipientEmail: 'old@example.invalid',
      subject: 'Old code 987654',
      bodyText: '987654',
      errorMessage: 'Legacy error with OTP 987654',
      bodyHtml: '987654',
      type: 'VERIFICATION_OTP',
      status: 'FAILED',
    },
  });
  const service = new AdminNotificationsService(db, mail),
    result = await service.getLogs({ page: 1, limit: 50 });
  assert.ok(!JSON.stringify(result).includes('987654'));
  const {AdminService}=require('../dist/admin/admin.service');
  const operations=await new AdminService(db).getOperationsStats();
  assert.ok(!JSON.stringify(operations).includes('987654'));
  await assert.rejects(
    service.retryLog(legacy.id),
    (e) => e.getStatus() === 400,
  );
});
