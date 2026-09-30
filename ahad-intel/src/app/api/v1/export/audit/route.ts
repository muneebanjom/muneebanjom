import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

function csvEscape(value: unknown): string {
  const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

/** Exportable audit trail. Payloads were already redacted when written. */
export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!can(session.role, 'audit:read')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const events = await prisma.auditEvent.findMany({
    where: { workspaceId: session.workspaceId },
    orderBy: { createdAt: 'desc' },
    take: 10_000,
  });

  const header = ['timestamp', 'actor', 'action', 'entityType', 'entityId', 'severity', 'ip', 'changes'];
  const rows = events.map((event) =>
    [
      event.createdAt.toISOString(),
      event.actorEmail ?? 'system',
      event.action,
      event.entityType,
      event.entityId ?? '',
      event.severity,
      event.ip ?? '',
      event.changes,
    ].map(csvEscape).join(','),
  );

  await audit(session, {
    action: 'audit.export',
    entityType: 'AuditEvent',
    changes: { rows: events.length },
    severity: 'notice',
  });

  return new NextResponse([header.join(','), ...rows].join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="audit-${session.workspaceSlug}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
