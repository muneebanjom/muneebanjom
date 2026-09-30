import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { relativeTime } from '@/lib/utils';
import { AccessDenied, Badge, Card, EmptyState, LinkButton, PageHeader, StatTile } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Audit log' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

const SEVERITY_TONE: Record<string, 'neutral' | 'info' | 'warn' | 'danger'> = {
  info: 'neutral', notice: 'info', warning: 'warn', critical: 'danger',
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: { action?: string; severity?: string; actor?: string; page?: string };
}) {
  const session = await requireSession();
  if (!can(session.role, 'audit:read')) {
    return <AccessDenied area="the audit log" requiredRole="owners and admins" />;
  }

  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);
  const where = {
    workspaceId: session.workspaceId,
    ...(searchParams.action ? { action: { contains: searchParams.action, mode: 'insensitive' as const } } : {}),
    ...(searchParams.severity ? { severity: searchParams.severity } : {}),
    ...(searchParams.actor ? { actorEmail: { contains: searchParams.actor, mode: 'insensitive' as const } } : {}),
  };

  const [events, total, bySeverity] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.groupBy({ by: ['severity'], where: { workspaceId: session.workspaceId }, _count: { _all: true } }),
  ]);

  const countOf = (severity: string) => bySeverity.find((s) => s.severity === severity)?._count._all ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every privileged action, with the actor, the entity and a redacted record of what changed. Contact details and credentials are never written here."
        actions={<LinkButton href="/api/v1/export/audit">Export CSV</LinkButton>}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total events" value={total} />
        <StatTile label="Critical" value={countOf('critical')} tone={countOf('critical') > 0 ? 'danger' : 'neutral'} hint="Integrations, roles, opt-outs" />
        <StatTile label="Warnings" value={countOf('warning')} tone="warn" />
        <StatTile label="Notices" value={countOf('notice')} tone="info" />
      </div>

      <Card className="mb-5 p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1">
            <label htmlFor="a-action" className="label">Action contains</label>
            <input id="a-action" name="action" defaultValue={searchParams.action ?? ''} placeholder="draft.approve" className="input mt-1 py-1.5 text-xs" />
          </div>
          <div className="min-w-[180px] flex-1">
            <label htmlFor="a-actor" className="label">Actor email contains</label>
            <input id="a-actor" name="actor" defaultValue={searchParams.actor ?? ''} className="input mt-1 py-1.5 text-xs" />
          </div>
          <div className="min-w-[140px]">
            <label htmlFor="a-severity" className="label">Severity</label>
            <select id="a-severity" name="severity" defaultValue={searchParams.severity ?? ''} className="input mt-1 py-1.5 text-xs">
              <option value="">All</option>
              <option value="info">Info</option>
              <option value="notice">Notice</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <button type="submit" className="focus-ring rounded-xl border border-line px-3.5 py-2 text-sm text-ink transition hover:bg-surface2">
            Filter
          </button>
          <a href="/audit" className="focus-ring rounded-xl px-2.5 py-2 text-xs text-muted hover:text-ink">Clear</a>
        </form>
      </Card>

      {events.length === 0 ? (
        <EmptyState title="No audit events match" description="Adjust the filters to widen the search." />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-line bg-surface2 text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-4 py-2.5 font-medium">Actor</th>
                  <th className="px-4 py-2.5 font-medium">Action</th>
                  <th className="px-4 py-2.5 font-medium">Entity</th>
                  <th className="px-4 py-2.5 font-medium">Changes (redacted)</th>
                  <th className="px-4 py-2.5 font-medium">Severity</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-b border-line/60 align-top last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted">
                      {relativeTime(event.createdAt)}
                      <span className="block">{event.createdAt.toISOString().slice(0, 19).replace('T', ' ')}Z</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-ink">
                      {event.actorEmail ?? 'system'}
                      {event.ip ? <span className="block text-muted">{event.ip}</span> : null}
                    </td>
                    <td className="px-4 py-2.5"><code className="text-xs text-ink">{event.action}</code></td>
                    <td className="px-4 py-2.5 text-xs text-muted">
                      {event.entityType}
                      {event.entityId ? <span className="block font-mono text-[10px]">{event.entityId.slice(0, 12)}…</span> : null}
                    </td>
                    <td className="px-4 py-2.5">
                      {event.changes ? (
                        <pre className="max-w-md overflow-x-auto rounded-lg bg-surface2 p-2 text-[10px] text-muted">
                          {JSON.stringify(event.changes, null, 1)}
                        </pre>
                      ) : <span className="text-xs text-muted">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={SEVERITY_TONE[event.severity] ?? 'neutral'}>{event.severity}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-muted">
            <span>Page {page} of {totalPages} · {total} events</span>
            <div className="flex gap-2">
              {page > 1 ? <a href={`/audit?page=${page - 1}`} className="focus-ring rounded-lg px-2 py-1 hover:bg-surface2 hover:text-ink">Previous</a> : null}
              {page < totalPages ? <a href={`/audit?page=${page + 1}`} className="focus-ring rounded-lg px-2 py-1 hover:bg-surface2 hover:text-ink">Next</a> : null}
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
