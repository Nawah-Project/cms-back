import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthProvider, Prisma, UserRole } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  ACCESS_TOKEN_SECRET,
  ACCESS_TTL_SECONDS,
  REFRESH_TOKEN_SECRET,
  REFRESH_TTL_SECONDS,
} from './auth.constants';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { GroupAssignmentService } from '../members/group-assignment.service';
import { AccountLinkRequiredError } from './social-auth.errors';
import { EmailVerifierService } from './email-verifier.service';
import { EmailSenderService } from './email-sender.service';

export const OTP_TTL_MINUTES = 15;
export const OTP_TTL_MS = OTP_TTL_MINUTES * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role?: UserRole;
  emailVerified?: boolean;
  targetJobTitle?: string | null;
  verificationDelivery?: 'SENT' | 'FAILED';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly emailVerifier: EmailVerifierService;
  private readonly emailSender: EmailSenderService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly groupAssignment: GroupAssignmentService,
    @Optional() emailVerifier?: EmailVerifierService,
    @Optional() emailSender?: EmailSenderService,
  ) {
    this.emailVerifier = emailVerifier ?? new EmailVerifierService();
    this.emailSender = emailSender ?? new EmailSenderService();
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private matchesRefreshToken(token: string, storedHash: string): boolean {
    const candidate = Buffer.from(this.hashRefreshToken(token), 'hex');
    const stored = Buffer.from(storedHash, 'hex');
    return (
      candidate.length === stored.length && timingSafeEqual(candidate, stored)
    );
  }

  private generateOtpCode(): string {
    return randomInt(100_000, 1_000_000).toString();
  }

  private hashOtpCode(code: string): string {
    return createHash('sha256').update(code.trim()).digest('hex');
  }

  private matchesOtpCode(code: string, storedHash: string): boolean {
    const candidate = Buffer.from(this.hashOtpCode(code), 'hex');
    const stored = Buffer.from(storedHash, 'hex');
    return (
      candidate.length === stored.length && timingSafeEqual(candidate, stored)
    );
  }

  private shouldRequireEmailOtp(): boolean {
    return true;
  }

  async assertProgramReady(userId: string, path: string): Promise<void> {
    // Onboarding and session recovery remain accessible before program readiness.
    if (
      !/^\/(?:api\/)?(?:applications|dashboard|journey|tasks|members|feedback|notifications)(?:\/|$)/.test(
        path,
      )
    )
      return;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        emailVerified: true,
        targetJobTitle: true,
        portfolioUrl: true,
        cv: { select: { id: true } },
      },
    });
    if (user?.role === 'ADMIN') return;
    if (!user?.emailVerified)
      throw new ForbiddenException(
        'Verify your email before starting the program',
      );
    if (!user.targetJobTitle?.trim() || !user.portfolioUrl || !user.cv)
      throw new ForbiddenException(
        'Complete your profile and upload a CV before starting the program',
      );
  }

  private async deliverOtp(params: {
    to: string;
    name: string;
    code: string;
    expiresInMinutes: number;
  }): Promise<'SENT' | 'FAILED'> {
    try {
      await this.emailSender.sendVerificationOtp(params);
      return 'SENT';
    } catch {
      return 'FAILED';
    } // Account exists: keep authenticated verification/retry available.
  }

  private toPublicUser(user: PublicUser): PublicUser {
    const rawVerified = user.emailVerified ?? false;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      emailVerified: this.shouldRequireEmailOtp() ? rawVerified : true,
      targetJobTitle: user.targetJobTitle ?? null,
    };
  }

  private async issueTokens(user: PublicUser): Promise<TokenPair> {
    const payload = {
      sub: user.id,
      email: user.email,
      jti: randomUUID(),
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { ...payload, tokenType: 'access' },
        {
          secret: ACCESS_TOKEN_SECRET,
          expiresIn: ACCESS_TTL_SECONDS,
          issuer: 'cms-api',
          audience: 'cms-web',
        },
      ),
      this.jwt.signAsync(
        { ...payload, tokenType: 'refresh' },
        {
          secret: REFRESH_TOKEN_SECRET,
          expiresIn: REFRESH_TTL_SECONDS,
          issuer: 'cms-api',
          audience: 'cms-web',
        },
      ),
    ]);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: this.hashRefreshToken(refreshToken) },
    });
    return { accessToken, refreshToken };
  }

  private shouldAssignGroupOnRegister(): boolean {
    return (
      process.env.ASSIGN_GROUP_ON_REGISTER?.trim().toLowerCase() === 'true'
    );
  }

  private async ensureInitialJourneyState(
    transaction: Prisma.TransactionClient,
    userId: string,
    isGroupUnlocked: boolean,
  ): Promise<void> {
    if (transaction.userJourneyState?.upsert) {
      await transaction.userJourneyState.upsert({
        where: { userId },
        update: {},
        create: {
          userId,
          currentWeek: 0,
          currentNodeCode: 'TASK_0',
          isGroupUnlocked,
        },
      });
    } else if (transaction.userJourneyState?.create) {
      await transaction.userJourneyState.create({
        data: {
          userId,
          currentWeek: 0,
          currentNodeCode: 'TASK_0',
          isGroupUnlocked,
        },
      });
    }
  }

  async register(
    dto: RegisterDto,
  ): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const email = dto.email.trim().toLowerCase();
    await this.emailVerifier.validateEmailAddress(email);

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const assignOnRegister = this.shouldAssignGroupOnRegister();
    const shouldRequireOtp = this.shouldRequireEmailOtp();
    const otpCode = this.generateOtpCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
    const codeHash = shouldRequireOtp ? this.hashOtpCode(otpCode) : null;

    try {
      const user = await this.groupAssignment.withAssignmentLock(
        async (transaction) => {
          const created = await transaction.user.create({
            data: {
              name: dto.name.trim(),
              email,
              passwordHash,
              emailVerified: !shouldRequireOtp,
              emailVerifiedAt: shouldRequireOtp ? null : now,
              emailVerificationCodeHash: codeHash,
              emailVerificationExpiresAt: shouldRequireOtp ? expiresAt : null,
              emailVerificationSentAt: shouldRequireOtp ? now : null,
              emailVerificationAttempts: 0,
            },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              emailVerified: true,
            },
          });
          if (assignOnRegister) {
            await this.groupAssignment.assignUser(transaction, created.id);
          }
          await this.ensureInitialJourneyState(
            transaction,
            created.id,
            assignOnRegister,
          );
          return created;
        },
      );

      let verificationDelivery: 'SENT' | 'FAILED' = 'SENT';
      if (shouldRequireOtp) {
        verificationDelivery = await this.deliverOtp({
          to: user.email,
          name: user.name,
          code: otpCode,
          expiresInMinutes: OTP_TTL_MINUTES,
        });
      }

      const publicUser = this.toPublicUser(user);
      const tokens = await this.issueTokens(publicUser);
      return { user: { ...publicUser, verificationDelivery }, tokens };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        role: true,
        emailVerified: true,
        emailVerificationExpiresAt: true,
        emailVerificationSentAt: true,
      },
    });
    if (
      !user?.passwordHash ||
      !(await bcrypt.compare(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }

    let verificationDelivery: 'SENT' | 'FAILED' | undefined;
    if (!user.emailVerified) {
      const now = new Date();
      const cooldownElapsed =
        !user.emailVerificationSentAt ||
        now.getTime() - user.emailVerificationSentAt.getTime() >=
          OTP_RESEND_COOLDOWN_MS;
      const codeExpired =
        !user.emailVerificationExpiresAt ||
        user.emailVerificationExpiresAt.getTime() <= now.getTime();

      if (cooldownElapsed || codeExpired) {
        const otpCode = this.generateOtpCode();
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            emailVerificationCodeHash: this.hashOtpCode(otpCode),
            emailVerificationExpiresAt: new Date(now.getTime() + OTP_TTL_MS),
            emailVerificationSentAt: now,
            emailVerificationAttempts: 0,
          },
        });
        verificationDelivery = await this.deliverOtp({
          to: user.email,
          name: user.name,
          code: otpCode,
          expiresInMinutes: OTP_TTL_MINUTES,
        });
      }
    }

    const publicUser = this.toPublicUser(user);
    return {
      user: { ...publicUser, verificationDelivery },
      tokens: await this.issueTokens(publicUser),
    };
  }

  async verifyEmail(userId: string, code: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
        emailVerificationCodeHash: true,
        emailVerificationExpiresAt: true,
        emailVerificationAttempts: true,
      },
    });
    if (!user) throw new UnauthorizedException('Invalid session');
    if (user.emailVerified) {
      return this.toPublicUser(user);
    }

    if (user.emailVerificationAttempts >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException(
        'Too many failed attempts. Please request a new verification code.',
      );
    }

    if (
      !user.emailVerificationCodeHash ||
      !user.emailVerificationExpiresAt ||
      user.emailVerificationExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException(
        'Verification code has expired. Please request a new one.',
      );
    }

    if (!this.matchesOtpCode(code, user.emailVerificationCodeHash)) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationAttempts: { increment: 1 },
        },
      });
      throw new BadRequestException('Invalid verification code');
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
        emailVerificationCodeHash: null,
        emailVerificationExpiresAt: null,
        emailVerificationAttempts: 0,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
      },
    });

    return this.toPublicUser(updated);
  }

  async resendVerification(userId: string): Promise<{
    sent: boolean;
    emailVerified: boolean;
    cooldownSeconds: number;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        emailVerificationSentAt: true,
      },
    });
    if (!user) throw new UnauthorizedException('Invalid session');
    if (user.emailVerified) {
      return { sent: false, emailVerified: true, cooldownSeconds: 0 };
    }

    const now = new Date();
    if (user.emailVerificationSentAt) {
      const elapsedMs = now.getTime() - user.emailVerificationSentAt.getTime();
      if (elapsedMs < OTP_RESEND_COOLDOWN_MS) {
        const remainingSeconds = Math.ceil(
          (OTP_RESEND_COOLDOWN_MS - elapsedMs) / 1000,
        );
        throw new BadRequestException(
          `Please wait ${remainingSeconds} seconds before requesting a new verification code`,
        );
      }
    }

    const otpCode = this.generateOtpCode();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationCodeHash: this.hashOtpCode(otpCode),
        emailVerificationExpiresAt: new Date(now.getTime() + OTP_TTL_MS),
        emailVerificationSentAt: now,
        emailVerificationAttempts: 0,
      },
    });

    await this.emailSender.sendVerificationOtp({
      to: user.email,
      name: user.name,
      code: otpCode,
      expiresInMinutes: OTP_TTL_MINUTES,
    });

    return {
      sent: true,
      emailVerified: false,
      cooldownSeconds: OTP_RESEND_COOLDOWN_MS / 1000,
    };
  }

  async signInWithProvider(input: {
    provider: AuthProvider;
    providerSubject: string;
    providerEmail?: string | null;
    name?: string | null;
  }): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const providerEmail = input.providerEmail?.trim().toLowerCase() || null;
    const user = await this.groupAssignment.withAssignmentLock(
      async (transaction) => {
        const identity = await transaction.authIdentity.findUnique({
          where: {
            provider_providerSubject: {
              provider: input.provider,
              providerSubject: input.providerSubject,
            },
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                emailVerified: true,
              },
            },
          },
        });
        if (identity) {
          if (!identity.user.emailVerified) {
            return transaction.user.update({
              where: { id: identity.user.id },
              data: {
                emailVerified: true,
                emailVerifiedAt: new Date(),
                emailVerificationCodeHash: null,
                emailVerificationExpiresAt: null,
              },
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                emailVerified: true,
              },
            });
          }
          return identity.user;
        }

        if (!providerEmail) {
          throw new Error('The provider did not return a verified email');
        }

        const emailAccount = await transaction.user.findUnique({
          where: { email: providerEmail },
          select: { id: true, role: true },
        });
        if (emailAccount) throw new AccountLinkRequiredError();

        const createdUser = await transaction.user.create({
          data: {
            name: input.name?.trim() || providerEmail.split('@')[0],
            email: providerEmail,
            passwordHash: null,
            emailVerified: true,
            emailVerifiedAt: new Date(),
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            emailVerified: true,
          },
        });
        await transaction.authIdentity.create({
          data: {
            userId: createdUser.id,
            provider: input.provider,
            providerSubject: input.providerSubject,
            providerEmail,
          },
        });
        const assignOnRegister = this.shouldAssignGroupOnRegister();
        if (assignOnRegister) {
          await this.groupAssignment.assignUser(transaction, createdUser.id);
        }
        await this.ensureInitialJourneyState(
          transaction,
          createdUser.id,
          assignOnRegister,
        );
        return createdUser;
      },
    );

    const publicUser = this.toPublicUser(user);
    return { user: publicUser, tokens: await this.issueTokens(publicUser) };
  }

  async refresh(refreshToken?: string): Promise<TokenPair> {
    if (!refreshToken) throw new UnauthorizedException('Invalid refresh token');
    let payload: { sub: string; email: string; tokenType?: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: REFRESH_TOKEN_SECRET,
        issuer: 'cms-api',
        audience: 'cms-web',
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.tokenType !== 'refresh')
      throw new UnauthorizedException('Invalid refresh token');
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        name: true,
        email: true,
        refreshTokenHash: true,
        role: true,
        emailVerified: true,
      },
    });
    if (
      !user?.refreshTokenHash ||
      !this.matchesRefreshToken(refreshToken, user.refreshTokenHash)
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return this.issueTokens(this.toPublicUser(user));
  }

  async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) return;
    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        tokenType?: string;
      }>(refreshToken, {
        secret: REFRESH_TOKEN_SECRET,
        issuer: 'cms-api',
        audience: 'cms-web',
      });
      if (payload.tokenType !== 'refresh') return;
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, refreshTokenHash: true },
      });
      if (
        user?.refreshTokenHash &&
        this.matchesRefreshToken(refreshToken, user.refreshTokenHash)
      ) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { refreshTokenHash: null },
        });
      }
    } catch {
      // Logout remains idempotent for absent, expired, or invalid cookies.
    }
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
        targetJobTitle: true,
      },
    });
    if (!user) throw new UnauthorizedException('Invalid session');
    return this.toPublicUser(user);
  }

  async verifyAccessToken(
    token: string,
  ): Promise<{ id: string; email: string }> {
    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        email: string;
        tokenType?: string;
      }>(token, {
        secret: ACCESS_TOKEN_SECRET,
        issuer: 'cms-api',
        audience: 'cms-web',
      });
      if (!payload.sub || payload.tokenType !== 'access')
        throw new Error('Wrong token type');
      return { id: payload.sub, email: payload.email };
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
