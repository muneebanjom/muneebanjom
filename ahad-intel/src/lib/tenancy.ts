import './server-guard';

/**
 * Tenant isolation helpers. Every tenant-scoped read/write funnels through a
 * `workspaceId` filter; mutations on a fetched entity additionally assert that
 * the row belongs to the caller's workspace, so a guessed id from another tenant
 * fails closed rather than silently succeeding.
 */
export class TenantMismatchError extends Error {
  constructor(entity: string) {
    super(`${entity} does not belong to the current workspace`);
    this.name = 'TenantMismatchError';
  }
}

export function assertSameWorkspace(
  entity: { workspaceId: string } | null | undefined,
  workspaceId: string,
  entityName = 'Record',
): asserts entity is { workspaceId: string } {
  if (!entity || entity.workspaceId !== workspaceId) throw new TenantMismatchError(entityName);
}

/** Spread into any `where` clause: `where: { ...scope(ws), id }`. */
export function scope(workspaceId: string) {
  return { workspaceId } as const;
}
