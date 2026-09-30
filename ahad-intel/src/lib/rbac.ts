import type { Role } from '@prisma/client';

/**
 * Permission model: least privilege, additive by role rank.
 * A permission is granted when the actor's role appears in its allow-list.
 */
export const PERMISSIONS = {
  'workspace:read': ['OWNER', 'ADMIN', 'MANAGER', 'REP', 'ANALYST', 'VIEWER'],
  'workspace:write': ['OWNER', 'ADMIN'],
  'member:manage': ['OWNER', 'ADMIN'],
  'icp:read': ['OWNER', 'ADMIN', 'MANAGER', 'REP', 'ANALYST', 'VIEWER'],
  'icp:write': ['OWNER', 'ADMIN', 'MANAGER', 'ANALYST'],
  'settings:write': ['OWNER', 'ADMIN'],
  'lead:read': ['OWNER', 'ADMIN', 'MANAGER', 'REP', 'ANALYST', 'VIEWER'],
  'lead:write': ['OWNER', 'ADMIN', 'MANAGER', 'REP', 'ANALYST'],
  'lead:assign': ['OWNER', 'ADMIN', 'MANAGER'],
  'pii:read': ['OWNER', 'ADMIN', 'MANAGER', 'REP', 'ANALYST'],
  'pii:export': ['OWNER', 'ADMIN'],
  'feed:read': ['OWNER', 'ADMIN', 'MANAGER', 'REP', 'ANALYST', 'VIEWER'],
  'feed:act': ['OWNER', 'ADMIN', 'MANAGER', 'REP'],
  'feed:assign': ['OWNER', 'ADMIN', 'MANAGER'],
  'feed:generate': ['OWNER', 'ADMIN', 'MANAGER', 'ANALYST'],
  'campaign:read': ['OWNER', 'ADMIN', 'MANAGER', 'REP', 'ANALYST', 'VIEWER'],
  'campaign:write': ['OWNER', 'ADMIN', 'MANAGER'],
  'draft:read': ['OWNER', 'ADMIN', 'MANAGER', 'REP', 'ANALYST', 'VIEWER'],
  'draft:write': ['OWNER', 'ADMIN', 'MANAGER', 'REP'],
  'draft:approve': ['OWNER', 'ADMIN', 'MANAGER'],
  'draft:send': ['OWNER', 'ADMIN', 'MANAGER', 'REP'],
  'template:write': ['OWNER', 'ADMIN', 'MANAGER'],
  'integration:read': ['OWNER', 'ADMIN', 'MANAGER'],
  'integration:write': ['OWNER', 'ADMIN'],
  'import:write': ['OWNER', 'ADMIN', 'MANAGER', 'ANALYST'],
  'enrich:run': ['OWNER', 'ADMIN', 'MANAGER', 'ANALYST'],
  'analytics:read': ['OWNER', 'ADMIN', 'MANAGER', 'ANALYST', 'VIEWER'],
  'audit:read': ['OWNER', 'ADMIN'],
  'ai:use': ['OWNER', 'ADMIN', 'MANAGER', 'REP', 'ANALYST'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export class ForbiddenError extends Error {
  constructor(permission: Permission, role: Role) {
    super(`Role ${role} is not permitted to ${permission}`);
    this.name = 'ForbiddenError';
  }
}

export function assertPermission(role: Role, permission: Permission): void {
  if (!can(role, permission)) throw new ForbiddenError(permission, role);
}

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  REP: 'Sales rep',
  ANALYST: 'Analyst',
  VIEWER: 'Viewer',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OWNER: 'Full control including workspace deletion and billing.',
  ADMIN: 'Manages settings, integrations, members and audit access.',
  MANAGER: 'Runs campaigns, assigns work and approves outreach.',
  REP: 'Works assigned leads, drafts and logs replies. Cannot approve their own sends.',
  ANALYST: 'Imports, enriches, scores and tunes the ICP. Cannot send outreach.',
  VIEWER: 'Read-only access to leads, feed and analytics.',
};
