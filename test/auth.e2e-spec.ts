import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthProvider } from '@prisma/client';
import { AuthService } from '../src/auth/auth.service';
import { EmailSenderService } from '../src/auth/email-sender.service';
import { SocialAuthService } from '../src/auth/social-auth.service';
import { AccountLinkRequiredError } from '../src/auth/social-auth.errors';
import { prepareProgramMember } from './program-fixture';
import { resetTestDatabase } from './reset-test-database';

describe('Authentication and application ownership (e2e)', () => {
  let app: NestExpressApplication;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await resetTestDatabase(module.get(PrismaService));
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
    await app?.close();
  });

  const register = (email: string) =>
    request.agent(server).post('/auth/register').send({
      name: 'Test User',
      email,
      password: 'SecurePass123!',
    });

  it('registers and returns only the public user while setting HttpOnly cookies', async () => {
    const response = await register('register@example.com').expect(201);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: 'Test User',
        email: 'register@example.com',
      }),
    );
    expect(response.body.passwordHash).toBeUndefined();
    const users = app.get(PrismaService);
    const savedUser = await users.user.findUnique({
      where: { email: 'register@example.com' },
      select: { id: true, passwordHash: true },
    });
    expect(savedUser!.passwordHash).toBeTruthy();
    expect(savedUser!.passwordHash).not.toBe('SecurePass123!');
    expect(
      await bcrypt.compare('SecurePass123!', savedUser!.passwordHash!),
    ).toBe(true);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(
      cookies.some(
        (cookie) =>
          cookie.startsWith('access_token=') && /httponly/i.test(cookie),
      ),
    ).toBe(true);
    expect(
      cookies.some(
        (cookie) =>
          cookie.startsWith('refresh_token=') && /httponly/i.test(cookie),
      ),
    ).toBe(true);
  });

  it('rejects duplicate accounts and weak passwords', async () => {
    await register('duplicate@example.com').expect(201);
    await request(server)
      .post('/auth/register')
      .send({
        name: 'Duplicate',
        email: 'duplicate@example.com',
        password: 'SecurePass123!',
      })
      .expect(409);
    await request(server)
      .post('/auth/register')
      .send({
        name: 'Weak',
        email: 'weak@example.com',
        password: 'password',
      })
      .expect(400);
    await request(server)
      .post('/auth/register')
      .send({
        name: 'Disposable',
        email: 'fake@tempmail.com',
        password: 'SecurePass123!',
      })
      .expect(400);
  });

  it('verifies email with a 6-digit OTP code and enforces resend cooldown', async () => {
    const emailSender = app.get(EmailSenderService);
    const agent = request.agent(server);
    const regRes = await agent
      .post('/auth/register')
      .send({
        name: 'Verify User',
        email: 'verify-otp@example.com',
        password: 'SecurePass123!',
      })
      .expect(201);

    expect(regRes.body.emailVerified).toBe(false);
    const sentOtp = emailSender.lastSentOtpForTest;
    expect(sentOtp?.to).toBe('verify-otp@example.com');
    expect(sentOtp?.code).toMatch(/^\d{6}$/);

    // Resend immediately should hit the 60s cooldown
    await agent.post('/auth/resend-verification').expect(400);

    // Wrong 6-digit code should fail
    const wrongCode = sentOtp!.code === '000000' ? '111111' : '000000';
    await agent
      .post('/auth/verify-email')
      .send({ code: wrongCode })
      .expect(400);

    // Correct 6-digit code should verify the user
    const verifyRes = await agent
      .post('/auth/verify-email')
      .send({ code: sentOtp!.code })
      .expect(200);
    expect(verifyRes.body.emailVerified).toBe(true);

    const meRes = await agent.get('/auth/me').expect(200);
    expect(meRes.body.emailVerified).toBe(true);
  });

  it('logs in, restores /me from a cookie, and rejects invalid credentials', async () => {
    await register('login@example.com').expect(201);
    const agent = request.agent(server);
    await agent
      .post('/auth/login')
      .send({ email: 'login@example.com', password: 'SecurePass123!' })
      .expect(200);
    const me = await agent.get('/auth/me').expect(200);
    expect(me.body).toEqual(
      expect.objectContaining({
        email: 'login@example.com',
        name: 'Test User',
      }),
    );
    expect(me.body.passwordHash).toBeUndefined();
    await request(server)
      .post('/auth/login')
      .send({ email: 'login@example.com', password: 'incorrect' })
      .expect(401);
  });

  it('rotates refresh cookies, rejects revoked refresh tokens, and clears cookies on logout', async () => {
    const agent = request.agent(server);
    const registrationCookies = (
      await agent
        .post('/auth/register')
        .send({
          name: 'Refresh User',
          email: 'refresh@example.com',
          password: 'SecurePass123!',
        })
        .expect(201)
    ).headers['set-cookie'] as unknown as string[];
    const originalCookies = (await agent.post('/auth/refresh').expect(200))
      .headers['set-cookie'] as unknown as string[];
    expect(
      originalCookies.some(
        (cookie) =>
          cookie.startsWith('refresh_token=') && /httponly/i.test(cookie),
      ),
    ).toBe(true);
    const oldRefreshCookie = registrationCookies
      .find((cookie) => cookie.startsWith('refresh_token='))!
      .split(';')[0];
    const newRefreshCookie = originalCookies
      .find((cookie) => cookie.startsWith('refresh_token='))!
      .split(';')[0];
    expect(newRefreshCookie).not.toBe(oldRefreshCookie);
    await request(server)
      .post('/auth/refresh')
      .set('Cookie', oldRefreshCookie)
      .expect(401);
    await agent.post('/auth/logout').expect(204);
    await agent.get('/auth/me').expect(401);
    await agent.post('/auth/refresh').expect(401);
  });

  it('silently renews an expired access cookie using the refresh cookie', async () => {
    const response = await request(server)
      .post('/auth/register')
      .send({
        name: 'Renew User',
        email: 'renew@example.com',
        password: 'SecurePass123!',
      })
      .expect(201);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    const refreshCookie = cookies
      .find((cookie) => cookie.startsWith('refresh_token='))!
      .split(';')[0];
    const renewed = await request(server)
      .get('/auth/me')
      .set('Cookie', [`access_token=expired`, refreshCookie].join('; '))
      .expect(200);
    expect(renewed.body.email).toBe('renew@example.com');
    expect(
      (renewed.headers['set-cookie'] as unknown as string[]).some((cookie) =>
        cookie.startsWith('access_token='),
      ),
    ).toBe(true);
  });

  it('requires a valid cookie and does not trust a caller supplied x-user-id', async () => {
    await request(server)
      .get('/auth/me')
      .set('x-user-id', 'somebody-else')
      .expect(401);
    await request(server)
      .get('/applications')
      .set('x-user-id', 'somebody-else')
      .expect(401);
  });

  it('restricts each user to their own applications', async () => {
    const first = request.agent(server);
    await first
      .post('/auth/register')
      .send({
        name: 'Owner One',
        email: 'owner-one@example.com',
        password: 'SecurePass123!',
      })
      .expect(201);
    const owner=await app.get(PrismaService).user.findUniqueOrThrow({where:{email:'owner-one@example.com'}});
    await prepareProgramMember(app.get(PrismaService),owner.id);
    const created = await first
      .post('/applications')
      .send({ companyName: 'Private Co', jobTitle: 'Engineer' })
      .expect(201);

    const second = request.agent(server);
    await second
      .post('/auth/register')
      .send({
        name: 'Owner Two',
        email: 'owner-two@example.com',
        password: 'SecurePass123!',
      })
      .expect(201);
    const other=await app.get(PrismaService).user.findUniqueOrThrow({where:{email:'owner-two@example.com'}});
    await prepareProgramMember(app.get(PrismaService),other.id);
    await second.get(`/applications/${created.body.id}`).expect(404);
    await second
      .patch(`/applications/${created.body.id}`)
      .send({ jobTitle: 'Changed' })
      .expect(404);
    await second.delete(`/applications/${created.body.id}`).expect(404);
    const list = await second.get('/applications').expect(200);
    expect(list.body.total).toBe(0);
  });

  it('creates one internal user and identity, deferring membership until activation', async () => {
    const auth = app.get(AuthService);
    const prisma = app.get(PrismaService);
    const firstLogin = await auth.signInWithProvider({
      provider: AuthProvider.GOOGLE,
      providerSubject: 'google-sub-123',
      providerEmail: 'social@example.com',
      name: 'Social User',
    });
    const secondLogin = await auth.signInWithProvider({
      provider: AuthProvider.GOOGLE,
      providerSubject: 'google-sub-123',
      providerEmail: 'changed@example.com',
      name: 'Changed Name',
    });

    expect(secondLogin.user.id).toBe(firstLogin.user.id);
    expect(
      await prisma.authIdentity.count({
        where: {
          provider: AuthProvider.GOOGLE,
          providerSubject: 'google-sub-123',
        },
      }),
    ).toBe(1);
    const stored = await prisma.user.findUnique({
      where: { id: firstLogin.user.id },
      select: { name: true, email: true, passwordHash: true, membership: true },
    });
    expect(stored).toMatchObject({
      name: 'Social User',
      email: 'social@example.com',
      passwordHash: null,
    });
    expect(stored?.membership).toBeNull();
  });

  it('does not silently link a Google identity to an existing email/password account', async () => {
    await register('existing-account@example.com').expect(201);
    const auth = app.get(AuthService);
    await expect(
      auth.signInWithProvider({
        provider: AuthProvider.GOOGLE,
        providerSubject: 'unlinked-google-sub-123',
        providerEmail: 'existing-account@example.com',
        name: 'Existing User',
      }),
    ).rejects.toBeInstanceOf(AccountLinkRequiredError);
    expect(
      await app.get(PrismaService).authIdentity.count({
          where: { providerSubject: 'unlinked-google-sub-123' },
      }),
    ).toBe(0);
  });

  it('redirects a verified Google callback into the normal HttpOnly session', async () => {
    const auth = app.get(AuthService);
    const socialAuth = app.get(SocialAuthService);
    const signedIn = await auth.signInWithProvider({
      provider: AuthProvider.GOOGLE,
      providerSubject: 'callback-google-sub',
      providerEmail: 'callback@example.com',
      name: 'Callback User',
    });
    const completeLogin = jest
      .spyOn(socialAuth, 'completeGoogleLogin')
      .mockResolvedValue(signedIn);
    const agent = request.agent(server);
    const callback = await agent
      .get('/auth/google/callback?code=one-time-code&state=test-state')
      .set(
        'Cookie',
        'oauth_google_state=test-state; oauth_google_nonce=test-nonce',
      )
      .expect(302);

    const frontendOrigin = (
      process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
    )
      .split(',')[0]
      .trim();
    expect(callback.headers.location).toBe(`${frontendOrigin}/`);
    expect(
      (callback.headers['set-cookie'] as unknown as string[]).some(
        (cookie) =>
          cookie.startsWith('access_token=') && /httponly/i.test(cookie),
      ),
    ).toBe(true);
    await agent.get('/auth/me').expect(200);
    expect(completeLogin).toHaveBeenCalledWith(
      'one-time-code',
      'test-state',
      'test-state',
      'test-nonce',
    );
    completeLogin.mockRestore();
  });
});
