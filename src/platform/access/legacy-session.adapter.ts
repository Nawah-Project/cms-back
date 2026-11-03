import { SessionAuthenticator } from './session.port';
// Identity-only adapter. Programme eligibility is intentionally not checked here.
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../../auth/auth.service';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../auth/auth.constants';
import { setAuthCookies } from '../../auth/auth-cookie.util';
import type { Response } from 'express';

interface RequestWithAuth extends Request {
  user?: { id: string; email: string };
}

@Injectable()
export class LegacySessionAdapter extends SessionAuthenticator {
  constructor(private readonly auth: AuthService) { super(); }

  async authenticate(request: RequestWithAuth, response: Response) {
    const cookies = request.cookies as Record<string, string> | undefined;
    const token = cookies?.[ACCESS_COOKIE];
    const header = request.headers.authorization;
    if (!token && header?.startsWith('Bearer ')) {
      request.user = await this.auth.verifyAccessToken(header.slice(7));
      return request.user;
    }

    try {
      request.user = await this.auth.verifyAccessToken(token || '');
    } catch (accessError) {
      const refreshToken = cookies?.[REFRESH_COOKIE];
      if (!refreshToken) throw accessError;
      const tokens = await this.auth.refresh(refreshToken);
      setAuthCookies(response, tokens);
      request.user = await this.auth.verifyAccessToken(tokens.accessToken);
    }
    return request.user!;
  }
}
