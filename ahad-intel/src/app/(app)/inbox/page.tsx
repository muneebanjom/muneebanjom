import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { CHANNEL_LABELS, SENTIMENT_LABELS, STAGE_LABELS, enumOptions } from '@/lib/domain';
import { relativeTime } from '@/lib/utils';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, StatTile } from '@/components/ui/primitives';
import { bookMeetingAction, logReplyAction, markReplyHandledAction } from './actions';

export const metadata: Metadata = { title: 'Inbox & replies' };
export const dynamic = 'force-dynamic';

export default async function InboxPage({ searchParams }: { searchParams: { filter?: string } }) {
  const session = await requireSession();
  const showHandled = searchParams.filter === 'all';

  const [replies, counts, contactedLeads] = await Promise.all([
    prisma.reply.findMany({
      where: { workspaceId: session.workspaceId, ...(showHandled ? {} : { isHandled: false }) },
      orderBy: { receivedAt: 'desc' },
      take: 50,
      include: {
        lead: {
          include: {
            contact: { select: { fullName: true, title: true } },
            account: { select: { name: true } },
            owner: { select: { name: true } },
          },
        },
      },
    }),
    prisma.reply.groupBy({ by: ['sentiment'], where: { workspaceId: session.workspaceId }, _count: { _all: true } }),
    prisma.lead.findMany({
      where: {
        workspaceId: session.workspaceId,
        stage: { in: ['CONTACTED', 'REPLIED', 'QUALIFIED'] },
        contact: { optedOut: false },
      },
      select: { id: true, contact: { select: { fullName: true } }, account: { select: { name: true } } },
      orderBy: { lastTouchAt: 'desc' },
      take: 200,
    }),
  ]);

  const countOf = (sentiment: string) => counts.find((c) => c.sentiment === sentiment)?._count._all ?? 0;
  const canWrite = can(session.role, 'lead:write');

  return (
    <>
      <PageHeader
        title="Inbox & replies"
        description="Log what came back. Sentiment, buying signals and objections are extracted automatically and are yours to correct."
        actions={
          <Link
            href={showHandled ? '/inbox' : '/inbox?filter=all'}
            className="focus-ring rounded-xl border border-line px-3.5 py-2 text-sm text-ink transition hover:bg-surface2"
          >
            {showHandled ? 'Show unhandled only' : 'Show all replies'}
          </Link>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Positive" value={countOf('POSITIVE')} tone="ok" />
        <StatTile label="Neutral" value={countOf('NEUTRAL')} />
        <StatTile label="Negative" value={countOf('NEGATIVE')} tone="warn" />
        <StatTile label="Opt-outs" value={countOf('UNSUBSCRIBE')} tone="danger" hint="Suppressed everywhere, automatically" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {replies.length === 0 ? (
            <EmptyState
              title={showHandled ? 'No replies logged yet' : 'Nothing waiting on you'}
              description="Log a reply on the right as soon as one comes in, so scoring and template performance stay accurate."
            />
          ) : (
            replies.map((reply) => (
              <Card key={reply.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/leads/${reply.leadId}`} className="focus-ring text-sm font-semibold text-ink hover:text-brand">
                    {reply.lead.contact.fullName}
                  </Link>
                  <span className="text-sm text-muted">· {reply.lead.account.name}</span>
                  <Badge tone={reply.sentiment === 'POSITIVE' ? 'ok' : reply.sentiment === 'NEGATIVE' || reply.sentiment === 'UNSUBSCRIBE' ? 'danger' : 'neutral'}>
                    {SENTIMENT_LABELS[reply.sentiment]}
                  </Badge>
                  <Badge>{CHANNEL_LABELS[reply.channel]}</Badge>
                  <Badge>{STAGE_LABELS[reply.lead.stage]}</Badge>
                  {reply.isHandled ? <Badge tone="info">handled</Badge> : null}
                  <span className="ml-auto text-xs text-muted">{relativeTime(reply.receivedAt)}</span>
                </div>

                <p className="mt-3 whitespace-pre-wrap rounded-xl bg-surface2 p-3 text-sm text-ink">{reply.body}</p>
                {reply.summary ? <p className="mt-2 text-xs text-muted">{reply.summary}</p> : null}

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {reply.buyingSignals.map((s) => <Badge key={s} tone="ok">{s}</Badge>)}
                  {reply.objections.map((o) => <Badge key={o} tone="warn">{o}</Badge>)}
                </div>

                {reply.lead.nextBestAction ? (
                  <p className="mt-3 rounded-xl border border-line p-3 text-sm text-ink">
                    <span className="label mr-2">Next best action</span>
                    {reply.lead.nextBestAction}
                  </p>
                ) : null}

                {canWrite && !reply.isHandled ? (
                  <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-line pt-3">
                    <form action={markReplyHandledAction}>
                      <input type="hidden" name="replyId" value={reply.id} />
                      <Button type="submit" size="sm">Mark handled</Button>
                    </form>
                    <form action={bookMeetingAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="leadId" value={reply.leadId} />
                      <div>
                        <label htmlFor={`m-${reply.id}`} className="label">Book a meeting</label>
                        <input id={`m-${reply.id}`} name="scheduledAt" type="datetime-local" required className="input mt-1 py-1.5 text-xs" />
                      </div>
                      <Button type="submit" size="sm" variant="primary">Book</Button>
                    </form>
                    <span className="text-xs text-muted">Owner: {reply.lead.owner?.name ?? 'Unassigned'}</span>
                  </div>
                ) : null}
              </Card>
            ))
          )}
        </div>

        {canWrite ? (
          <Card className="h-fit">
            <CardHeader title="Log a reply" subtitle="Paste what they sent. Classification happens on save." />
            <form action={logReplyAction} className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="r-lead" className="block text-xs font-medium text-ink">Lead</label>
                <select id="r-lead" name="leadId" required className="input">
                  <option value="">Select a lead…</option>
                  {contactedLeads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.contact.fullName} — {lead.account.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="r-channel" className="block text-xs font-medium text-ink">Channel</label>
                <select id="r-channel" name="channel" defaultValue="LINKEDIN_MESSAGE" className="input">
                  {enumOptions(CHANNEL_LABELS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="r-body" className="block text-xs font-medium text-ink">Their message</label>
                <textarea id="r-body" name="body" required rows={6} className="input resize-y" placeholder="Paste the reply exactly as received." />
              </div>
              <Button type="submit" variant="primary">Log reply</Button>
              <p className="text-xs text-muted">
                A reply that asks not to be contacted is treated as an opt-out: the contact is suppressed
                and every pending draft for them is archived.
              </p>
            </form>
          </Card>
        ) : null}
      </div>
    </>
  );
}
