import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth.service';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../auth.constants';
import { setAuthCookies } from '../auth-cookie.util';
import type { Response } from 'express';

interface RequestWithAuth extends Request {
  user?: { id: string; email: string };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const response = context.switchToHttp().getResponse<Response>();
    const cookies = request.cookies as Record<string, string> | undefined;
    const token = cookies?.[ACCESS_COOKIE];
    const header = request.headers.authorization;
    if (!token && header?.startsWith('Bearer ')) {
      request.user = await this.auth.verifyAccessToken(header.slice(7));
      await this.auth.assertProgramReady(request.user.id, request.path);
      return true;
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
    await this.auth.assertProgramReady(request.user!.id, request.path);
    return true;
  }
}
