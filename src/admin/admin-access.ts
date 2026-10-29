import { SetMetadata } from '@nestjs/common';

export const ADMIN_ACCESS_KEY = 'nawah:admin-access';
export const ADMIN_FULL_ACCESS_KEY = 'nawah:admin-full-access';

export const ADMIN_SECTIONS = [
  'OVERVIEW',
  'COMMUNITY',
  'MENTORING',
  'JOURNEY',
  'REPORTS',
  'UX_LAB',
  'MARKETING',
  'OPERATIONS',
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];
export type AdminAccessLevel = 'READ' | 'WRITE';
export type AdminPermissionMap = Partial<
  Record<AdminSection, AdminAccessLevel>
>;

export interface AdminAccessRequirement {
  sections: AdminSection[];
  level?: AdminAccessLevel;
}

export const AdminAccess = (
  sections: AdminSection | AdminSection[],
  level?: AdminAccessLevel,
) =>
  SetMetadata(ADMIN_ACCESS_KEY, {
    sections: Array.isArray(sections) ? sections : [sections],
    level,
  } satisfies AdminAccessRequirement);

export const AdminFullAccess = () => SetMetadata(ADMIN_FULL_ACCESS_KEY, true);

export function normalizeAdminPermissions(value: unknown): AdminPermissionMap {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  return Object.fromEntries(
    ADMIN_SECTIONS.flatMap((section) => {
      const level = raw[section];
      return level === 'READ' || level === 'WRITE' ? [[section, level]] : [];
    }),
  ) as AdminPermissionMap;
}

export function hasAdminAccess(
  value: unknown,
  sections: readonly AdminSection[],
  required: AdminAccessLevel,
  isRootAdmin = false,
): boolean {
  if (isRootAdmin) return true;
  const permissions = normalizeAdminPermissions(value);
  return sections.some((section) => {
    const level = permissions[section];
    return level === 'WRITE' || (required === 'READ' && level === 'READ');
  });
}

export function publicAdminAccess(value: unknown, isRootAdmin = false) {
  const permissions = normalizeAdminPermissions(value);
  return {
    isRoot: isRootAdmin,
    fullAccess: isRootAdmin,
    canManageAdmins: isRootAdmin,
    permissions: isRootAdmin
      ? Object.fromEntries(ADMIN_SECTIONS.map((section) => [section, 'WRITE']))
      : permissions,
  };
}
