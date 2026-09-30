import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { feedDateKey, formatUsd, relativeTime } from '@/lib/utils';
import { ANGLE_LABELS, VERTICAL_LABELS, countryName } from '@/lib/domain';
import { analyticsSnapshot } from '@/lib/analytics';
import { aiProviderName } from '@/lib/ai';
import {
  Badge, Button, Card, CardHeader, EmptyState, LinkButton, PageHeader, ScoreRing, StatTile,
} from '@/components/ui/primitives';
import { FunnelChart } from '@/components/charts';
import { generateTodaysFeedAction } from './feed/actions';

export const metadata: Metadata = { title: 'Overview' };
export const dynamic = 'force-dynamic';

type AlertTone = 'warn' | 'info' | 'danger' | 'neutral';

export default async function OverviewPage() {
  const session = await requireSession();
  const feedDate = feedDateKey();

  const [snapshot, todaysFeed, myTasks, unhandledReplies, pendingDrafts, connectedIntegrations, icp] = await Promise.all([
    analyticsSnapshot(session.workspaceId, 90),
    prisma.recommendation.findMany({
      where: { workspaceId: session.workspaceId, feedDate },
      orderBy: { rank: 'asc' },
      take: 5,
      include: {
        lead: {
          include: {
            contact: { select: { fullName: true, title: true } },
            account: { select: { name: true, country: true, vertical: true } },
          },
        },
      },
    }),
    prisma.task.findMany({
      where: { workspaceId: session.workspaceId, assigneeId: session.userId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      orderBy: { dueAt: 'asc' },
      take: 5,
    }),
    prisma.reply.count({ where: { workspaceId: session.workspaceId, isHandled: false } }),
    prisma.draftMessage.count({ where: { workspaceId: session.workspaceId, status: 'PENDING_APPROVAL' } }),
    prisma.integration.count({ where: { workspaceId: session.workspaceId, status: 'CONNECTED' } }),
    prisma.icpProfile.findFirst({ where: { workspaceId: session.workspaceId, isActive: true }, orderBy: { isDefault: 'desc' } }),
  ]);

  const alerts: Array<{ label: string; href: string; tone: AlertTone }> = [];
  if (unhandledReplies > 0) alerts.push({ label: `${unhandledReplies} unhandled repl${unhandledReplies === 1 ? 'y' : 'ies'}`, href: '/inbox', tone: 'warn' });
  if (pendingDrafts > 0) alerts.push({ label: `${pendingDrafts} draft${pendingDrafts === 1 ? '' : 's'} awaiting approval`, href: '/drafts', tone: 'info' });
  if (todaysFeed.length === 0) alerts.push({ label: 'No daily feed generated today', href: '/feed', tone: 'warn' });
  if (!icp) alerts.push({ label: 'No active ICP defined', href: '/icp', tone: 'danger' });
  if (connectedIntegrations === 0) alerts.push({ label: 'No data source connected', href: '/integrations', tone: 'neutral' });

  return (
    <>
      <PageHeader
        title={`Good day, ${session.name.split(' ')[0]}`}
        description={`${session.workspaceName} · ${icp ? `active ICP: ${icp.name}` : 'no active ICP'} · AI provider: ${aiProviderName()}`}
        actions={<LinkButton href="/feed" variant="primary">Open today&apos;s feed</LinkButton>}
      />

      {alerts.length > 0 ? (
        <div className="mb-6 flex flex-wrap gap-2">
          {alerts.map((alert) => (
            <Link key={alert.href} href={alert.href} className="focus-ring rounded-full">
              <Badge tone={alert.tone}>{alert.label} →</Badge>
            </Link>
          ))}
        </div>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Leads in play"
          value={snapshot.totals.leads}
          hint={`${snapshot.totals.accounts} accounts · ${snapshot.totals.contacts} contacts`}
        />
        <StatTile
          label="Reply rate"
          value={`${snapshot.totals.replyRate}%`}
          tone={snapshot.totals.replyRate >= 15 ? 'ok' : 'neutral'}
          hint={`${snapshot.totals.replied} of ${snapshot.totals.contacted} contacted`}
        />
        <StatTile
          label="Meetings booked"
          value={snapshot.totals.meetings}
          hint={`${snapshot.totals.meetingRate}% of contacted leads`}
        />
        <StatTile
          label="Open pipeline"
          value={formatUsd(snapshot.totals.pipelineValueUsd)}
          hint={`${snapshot.totals.opportunities} opportunities`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Today's top prospects"
            subtitle="The first five of today's ten. Open the feed for full reasoning, angles and actions."
            action={<LinkButton href="/feed" size="sm">View all</LinkButton>}
          />
          {todaysFeed.length === 0 ? (
            <EmptyState
              title="No feed generated yet today"
              description="Rank your pool against the active ICP to produce today's ten recommended customers."
              action={
                can(session.role, 'feed:generate') ? (
                  <form action={generateTodaysFeedAction}>
                    <Button type="submit" variant="primary">Generate now</Button>
                  </form>
                ) : undefined
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {todaysFeed.map((rec) => (
                <li key={rec.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface2 text-xs font-bold tabular-nums text-ink">
                    {rec.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/leads/${rec.leadId}`} className="focus-ring block truncate text-sm font-medium text-ink hover:text-brand">
                      {rec.lead.contact.fullName}
                      <span className="font-normal text-muted"> — {rec.lead.account.name}</span>
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-muted">{rec.reason}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge tone="brand">{ANGLE_LABELS[rec.suggestedAngle]}</Badge>
                      <Badge>{countryName(rec.lead.account.country)}</Badge>
                      <Badge>{VERTICAL_LABELS[rec.lead.account.vertical]}</Badge>
                    </div>
                  </div>
                  <ScoreRing value={rec.priorityScore} size={44} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Pipeline" subtitle="Leads that have reached each stage" />
            <FunnelChart data={snapshot.funnel} />
          </Card>

          <Card>
            <CardHeader title="Your next actions" subtitle="Tasks assigned to you" />
            {myTasks.length === 0 ? (
              <p className="text-sm text-muted">Nothing outstanding. Work today&apos;s feed.</p>
            ) : (
              <ul className="space-y-2.5">
                {myTasks.map((task) => (
                  <li key={task.id} className="text-sm">
                    <p className="text-ink">{task.title}</p>
                    <p className="text-xs text-muted">
                      {task.dueAt ? `Due ${relativeTime(task.dueAt)}` : 'No due date'} · {task.status.toLowerCase().replace('_', ' ')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
