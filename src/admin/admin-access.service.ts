import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ADMIN_SECTIONS,
  type AdminAccessLevel,
  type AdminPermissionMap,
  publicAdminAccess,
} from './admin-access';
import { UpdateAdminAccessDto } from './dto/update-admin-access.dto';

@Injectable()
export class AdminAccessService {
  constructor(private readonly prisma: PrismaService) {}

  private item(admin: {
    id: string;
    name: string;
    email: string;
    isRootAdmin: boolean;
    adminPermissions: Prisma.JsonValue | null;
    updatedAt: Date;
  }) {
    return {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      updatedAt: admin.updatedAt,
      access: publicAdminAccess(admin.adminPermissions, admin.isRootAdmin),
    };
  }

  async list() {
    const admins = await this.prisma.user.findMany({
      where: { role: UserRole.ADMIN },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
      select: {
        id: true,
        name: true,
        email: true,
        isRootAdmin: true,
        adminPermissions: true,
        updatedAt: true,
      },
    });
    return {
      sections: ADMIN_SECTIONS,
      items: admins.map((admin) => this.item(admin)),
    };
  }

  private restrictedPermissions(dto: UpdateAdminAccessDto): AdminPermissionMap {
    const raw = dto.permissions ?? {};
    const unknown = Object.keys(raw).filter(
      (key) => !ADMIN_SECTIONS.includes(key as (typeof ADMIN_SECTIONS)[number]),
    );
    if (unknown.length)
      throw new BadRequestException('Unknown administrator section');
    const permissions: AdminPermissionMap = {};
    for (const section of ADMIN_SECTIONS) {
      const level = raw[section];
      if (level === undefined || level === null || level === 'NONE') continue;
      if (level !== 'READ' && level !== 'WRITE') {
        throw new BadRequestException(
          'Administrator access must be READ or WRITE',
        );
      }
      permissions[section] = level as AdminAccessLevel;
    }
    if (!Object.keys(permissions).length) {
      throw new BadRequestException(
        'Choose at least one administrator section',
      );
    }
    return permissions;
  }

  async update(actorId: string, targetId: string, dto: UpdateAdminAccessDto) {
    if (actorId === targetId) {
      throw new ForbiddenException(
        'You cannot change your own administrator access',
      );
    }
    const next = this.restrictedPermissions(dto);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({
        where: { id: targetId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isRootAdmin: true,
          adminPermissions: true,
          updatedAt: true,
        },
      });
      if (!current || current.role !== UserRole.ADMIN) {
        throw new NotFoundException('Administrator account not found');
      }
      if (current.isRootAdmin) {
        throw new ForbiddenException(
          'Root administrator permissions cannot be changed',
        );
      }
      const updated = await tx.user.update({
        where: { id: targetId },
        data: {
          adminPermissions: next as Prisma.InputJsonValue,
        },
        select: {
          id: true,
          name: true,
          email: true,
          isRootAdmin: true,
          adminPermissions: true,
          updatedAt: true,
        },
      });
      await tx.adminPermissionAudit.create({
        data: {
          actorId,
          targetId,
          previous:
            current.adminPermissions === null
              ? Prisma.DbNull
              : (current.adminPermissions as Prisma.InputJsonValue),
          next: next as Prisma.InputJsonValue,
        },
      });
      return this.item(updated);
    });
  }
}
