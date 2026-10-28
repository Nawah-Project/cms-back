import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ADMIN_ACCESS_KEY,
  ADMIN_FULL_ACCESS_KEY,
  type AdminAccessRequirement,
  hasAdminAccess,
} from './admin-access';

interface RequestWithUser extends Request {
  user?: { id: string };
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const userId = request.user?.id;
    if (!userId) throw new UnauthorizedException();

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isRootAdmin: true, adminPermissions: true },
    });
    if (user?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Administrator access required');
    }

    const fullAccessOnly = this.reflector.getAllAndOverride<boolean>(
      ADMIN_FULL_ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (fullAccessOnly && !user.isRootAdmin) {
      throw new ForbiddenException('Full administrator access required');
    }

    const requirement =
      this.reflector.getAllAndOverride<AdminAccessRequirement>(
        ADMIN_ACCESS_KEY,
        [context.getHandler(), context.getClass()],
      );
    if (!requirement) {
      if (!user.isRootAdmin) {
        throw new ForbiddenException(
          'This administrator has no access to this section',
        );
      }
      return true;
    }
    const required =
      requirement.level ??
      (request.method === 'GET' || request.method === 'HEAD'
        ? 'READ'
        : 'WRITE');
    if (
      !hasAdminAccess(
        user.adminPermissions,
        requirement.sections,
        required,
        user.isRootAdmin,
      )
    ) {
      throw new ForbiddenException(
        required === 'WRITE'
          ? 'Write access to this administrator section is required'
          : 'Read access to this administrator section is required',
      );
    }
    return true;
  }
}
