import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const id = context.switchToHttp().getRequest().user?.id;
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { emailVerified: true },
    });
    if (!user?.emailVerified)
      throw new ForbiddenException('Verified email required');
    return true;
  }
}
