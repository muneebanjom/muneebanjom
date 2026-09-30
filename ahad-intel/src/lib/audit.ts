import './server-guard';
import { prisma } from './db';
import { requestContext, type SessionUser } from './auth';

const PII_KEYS = /^(email|phone|emailEnc|phoneEnc|passwordHash|credentials|credentialsEnc|apiKey|token|secret)/i;

/** Mask PII and secrets before anything reaches the audit trail. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth-limit]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = PII_KEYS.test(k) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 500) return `${value.slice(0, 500)}…`;
  if (typeof value === 'bigint') return value.toString();
  return value;
}

export interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  changes?: unknown;
  severity?: 'info' | 'notice' | 'warning' | 'critical';
}

export async function audit(session: SessionUser, input: AuditInput): Promise<void> {
  const ctx = requestContext();
  try {
    await prisma.auditEvent.create({
      data: {
        workspaceId: session.workspaceId,
        actorId: session.userId,
        actorEmail: session.email,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        changes: (redact(input.changes) ?? undefined) as never,
        severity: input.severity ?? 'info',
        ip: ctx.ip,
        userAgent: ctx.userAgent?.slice(0, 300),
      },
    });
  } catch (error) {
    // Auditing must never break the user's action, but must be observable.
    console.error('[audit] failed to persist audit event', { action: input.action, error });
  }
}

/** System-initiated events (cron, worker) with no interactive actor. */
export async function auditSystem(workspaceId: string, input: AuditInput): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        workspaceId,
        actorEmail: 'system',
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        changes: (redact(input.changes) ?? undefined) as never,
        severity: input.severity ?? 'info',
      },
    });
  } catch (error) {
    console.error('[audit] failed to persist system audit event', { action: input.action, error });
  }
}
