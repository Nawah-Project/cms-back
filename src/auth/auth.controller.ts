import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { clearAuthCookies, setAuthCookies } from './auth-cookie.util';
import { REFRESH_COOKIE } from './auth.constants';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SocialAuthService } from './social-auth.service';
import { AccountLinkRequiredError } from './social-auth.errors';
import {
  clearOAuthStateCookies,
  oauthNonceCookieName,
  oauthStateCookieName,
  setOAuthStateCookies,
} from './oauth-cookie.util';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly socialAuth: SocialAuthService,
  ) {}

  @Get('google')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  google(@Res() response: Response) {
    try {
      const request = this.socialAuth.createAuthorizationRequest('google');
      setOAuthStateCookies(response, 'google', request.state, request.nonce);
      return response.redirect(request.url);
    } catch {
      return response.redirect(this.frontendRedirect('google_unavailable'));
    }
  }

  @Get('google/callback')
  async googleCallback(
    @Req() request: Request & { cookies?: Record<string, string> },
    @Res() response: Response,
  ) {
    let redirectTo: string;
    try {
      const code = this.stringValue(request.query.code);
      if (request.query.error || !code) throw new Error('Google login failed');
      const result = await this.socialAuth.completeGoogleLogin(
        code,
        this.stringValue(request.query.state) ?? '',
        this.readCookie(request, oauthStateCookieName('google')),
        this.readCookie(request, oauthNonceCookieName('google')),
      );
      setAuthCookies(response, result.tokens);
      redirectTo = this.frontendRedirect();
    } catch (error) {
      redirectTo = this.frontendRedirect(
        this.safeSocialError(error, 'google_unavailable'),
      );
    }
    clearOAuthStateCookies(response, 'google');
    return response.redirect(redirectTo);
  }

  @Post('register')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 50, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.register(dto);
    setAuthCookies(response, result.tokens);
    return result.user;
  }

  @Post('login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(dto);
    setAuthCookies(response, result.tokens);
    return result.user;
  }

  @Post('logout')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request & { cookies?: Record<string, string> },
    @Res({ passthrough: true }) response: Response,
  ) {
    const cookies = request.cookies as Record<string, string> | undefined;
    await this.auth.logout(cookies?.[REFRESH_COOKIE]);
    clearAuthCookies(response);
  }

  @Post('refresh')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request & { cookies?: Record<string, string> },
    @Res({ passthrough: true }) response: Response,
  ) {
    const cookies = request.cookies as Record<string, string> | undefined;
    const tokens = await this.auth.refresh(cookies?.[REFRESH_COOKIE]);
    setAuthCookies(response, tokens);
    return { success: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() request: Request & { user: { id: string } }) {
    return this.auth.me(request.user.id);
  }

  private frontendRedirect(error?: string): string {
    const frontendOrigin =
      process.env.FRONTEND_ORIGIN?.split(',')[0]?.trim() ||
      'http://localhost:5173';
    const destination = new URL('/', frontendOrigin);
    if (error) {
      destination.pathname = '/auth/login';
      destination.searchParams.set('socialError', error);
    }
    return destination.toString();
  }

  private safeSocialError(
    error: unknown,
    fallback: 'google_unavailable',
  ): string {
    return error instanceof AccountLinkRequiredError
      ? 'account_link_required'
      : fallback;
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private readCookie(request: Request, name: string): string | undefined {
    const cookies = (request as unknown as { cookies?: unknown }).cookies;
    if (!cookies || typeof cookies !== 'object') return undefined;
    return this.stringValue((cookies as Record<string, unknown>)[name]);
  }
}
