import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { SessionAuthenticator } from './session.port';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionAuthenticator) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    request.user = await this.sessions.authenticate(request, context.switchToHttp().getResponse());
    return true;
  }
}
