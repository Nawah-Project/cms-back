import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthProvider, Prisma } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
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

export interface PublicUser {
  id: string;
  name: string;
  email: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly groupAssignment: GroupAssignmentService,
  ) {}

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

  private toPublicUser(user: PublicUser): PublicUser {
    return { id: user.id, name: user.name, email: user.email };
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

  async register(
    dto: RegisterDto,
  ): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const email = dto.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      const user = await this.groupAssignment.withAssignmentLock(
        async (transaction) => {
          const created = await transaction.user.create({
            data: { name: dto.name.trim(), email, passwordHash },
            select: { id: true, name: true, email: true },
          });
          await this.groupAssignment.assignUser(transaction, created.id);
          return created;
        },
      );
      const tokens = await this.issueTokens(user);
      return { user, tokens };
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
      select: { id: true, name: true, email: true, passwordHash: true },
    });
    if (
      !user?.passwordHash ||
      !(await bcrypt.compare(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const publicUser = this.toPublicUser(user);
    return { user: publicUser, tokens: await this.issueTokens(publicUser) };
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
            user: { select: { id: true, name: true, email: true } },
          },
        });
        if (identity) return identity.user;

        if (!providerEmail) {
          throw new Error('The provider did not return a verified email');
        }

        const emailAccount = await transaction.user.findUnique({
          where: { email: providerEmail },
          select: { id: true },
        });
        if (emailAccount) throw new AccountLinkRequiredError();

        const createdUser = await transaction.user.create({
          data: {
            name: input.name?.trim() || providerEmail.split('@')[0],
            email: providerEmail,
            passwordHash: null,
          },
          select: { id: true, name: true, email: true },
        });
        await transaction.authIdentity.create({
          data: {
            userId: createdUser.id,
            provider: input.provider,
            providerSubject: input.providerSubject,
            providerEmail,
          },
        });
        await this.groupAssignment.assignUser(transaction, createdUser.id);
        return createdUser;
      },
    );

    return { user, tokens: await this.issueTokens(user) };
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
      select: { id: true, name: true, email: true, refreshTokenHash: true },
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
      select: { id: true, name: true, email: true },
    });
    if (!user) throw new UnauthorizedException('Invalid session');
    return user;
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
