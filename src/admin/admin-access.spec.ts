import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  ADMIN_ACCESS_KEY,
  ADMIN_FULL_ACCESS_KEY,
  hasAdminAccess,
  publicAdminAccess,
} from './admin-access';
import { AdminGuard } from './admin.guard';

describe('administrator section access', () => {
  test('root has every section with write access', () => {
    const access = publicAdminAccess(null, true);
    expect(access.isRoot).toBe(true);
    expect(access.canManageAdmins).toBe(true);
    expect(access.permissions.UX_LAB).toBe('WRITE');
    expect(hasAdminAccess({}, ['OPERATIONS'], 'WRITE', true)).toBe(true);
  });

  test('specialized read access cannot write or open another section', () => {
    const permissions = { UX_LAB: 'READ' };
    expect(hasAdminAccess(permissions, ['UX_LAB'], 'READ')).toBe(true);
    expect(hasAdminAccess(permissions, ['UX_LAB'], 'WRITE')).toBe(false);
    expect(hasAdminAccess(permissions, ['COMMUNITY'], 'READ')).toBe(false);
  });

  test('missing and malformed permissions fail closed for specialized admins', () => {
    expect(hasAdminAccess(null, ['UX_LAB'], 'READ')).toBe(false);
    expect(hasAdminAccess(['UX_LAB'], ['UX_LAB'], 'READ')).toBe(false);
  });
});

describe('AdminGuard', () => {
  const context = (method = 'GET') =>
    ({
      getHandler: () => 'handler',
      getClass: () => 'class',
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 'admin-id' }, method }),
      }),
    }) as unknown as ExecutionContext;

  const guard = (account: any, requirement: any, rootOnly = false) => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(account) },
    } as any;
    const reflector = {
      getAllAndOverride: jest.fn((key: string) =>
        key === ADMIN_FULL_ACCESS_KEY
          ? rootOnly
          : key === ADMIN_ACCESS_KEY
            ? requirement
            : undefined,
      ),
    } as any;
    return new AdminGuard(prisma, reflector);
  };

  test('allows a specialized UX reader to GET the UX section', async () => {
    const access = guard(
      {
        role: UserRole.ADMIN,
        isRootAdmin: false,
        adminPermissions: { UX_LAB: 'READ' },
      },
      { sections: ['UX_LAB'] },
    );
    await expect(access.canActivate(context('GET'))).resolves.toBe(true);
  });

  test('denies the same specialized admin a write request', async () => {
    const access = guard(
      {
        role: UserRole.ADMIN,
        isRootAdmin: false,
        adminPermissions: { UX_LAB: 'READ' },
      },
      { sections: ['UX_LAB'] },
    );
    await expect(access.canActivate(context('PATCH'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  test('only root can enter administrator access management', async () => {
    const access = guard(
      {
        role: UserRole.ADMIN,
        isRootAdmin: false,
        adminPermissions: { COMMUNITY: 'WRITE' },
      },
      undefined,
      true,
    );
    await expect(access.canActivate(context('GET'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
