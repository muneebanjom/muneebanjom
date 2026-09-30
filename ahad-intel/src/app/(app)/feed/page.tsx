import type { Metadata } from 'next';
import type { PersonaCategory, Region, Vertical } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { feedDateKey, formatDate } from '@/lib/utils';
import { PERSONA_LABELS, REGION_LABELS, VERTICAL_LABELS, enumOptions } from '@/lib/domain';
import { Badge, Button, EmptyState, PageHeader, StatTile } from '@/components/ui/primitives';
import { FeedCard, type FeedCardData } from '@/components/feed/feed-card';
import { generateTodaysFeedAction } from './actions';

export const metadata: Metadata = { title: "Today's Top 10" };
export const dynamic = 'force-dynamic';

interface SearchParams {
  region?: string;
  vertical?: string;
  persona?: string;
  campaign?: string;
  owner?: string;
  status?: string;
}

export default async function FeedPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession();
  const feedDate = feedDateKey();

  const [feed, recommendations, campaigns, members] = await Promise.all([
    prisma.dailyFeed.findUnique({
      where: { workspaceId_feedDate: { workspaceId: session.workspaceId, feedDate } },
    }),
    prisma.recommendation.findMany({
      where: { workspaceId: session.workspaceId, feedDate },
      orderBy: { rank: 'asc' },
      include: {
        lead: {
          include: {
            contact: { select: { fullName: true, title: true, personaCategory: true, linkedinUrl: true } },
            account: { select: { id: true, name: true, country: true, region: true, vertical: true } },
          },
        },
      },
    }),
    prisma.campaign.findMany({ where: { workspaceId: session.workspaceId, isActive: true }, select: { id: true, name: true } }),
    prisma.membership.findMany({
      where: { workspaceId: session.workspaceId, role: { in: ['OWNER', 'ADMIN', 'MANAGER', 'REP'] } },
      include: { user: { select: { id: true, name: true } } },
    }),
  ]);

  const variantIds = recommendations.map((r) => r.suggestedVariantId).filter((id): id is string => Boolean(id));
  const variants = variantIds.length
    ? await prisma.messageTemplate.findMany({ where: { id: { in: variantIds } }, select: { id: true, name: true } })
    : [];
  const variantName = new Map(variants.map((v) => [v.id, v.name]));

  const filtered = recommendations.filter((r) => {
    if (searchParams.region && r.lead.account.region !== searchParams.region) return false;
    if (searchParams.vertical && r.lead.account.vertical !== searchParams.vertical) return false;
    if (searchParams.persona && r.lead.contact.personaCategory !== searchParams.persona) return false;
    if (searchParams.campaign && r.lead.campaignId !== searchParams.campaign) return false;
    if (searchParams.owner && r.assigneeId !== searchParams.owner) return false;
    if (searchParams.status && r.status !== searchParams.status) return false;
    return true;
  });

  const cards: FeedCardData[] = filtered.map((r) => ({
    id: r.id,
    rank: r.rank,
    status: r.status,
    isManualOverride: r.isManualOverride,
    reason: r.reason,
    reasonBullets: r.reasonBullets,
    suggestedAngle: r.suggestedAngle,
    suggestedChannel: r.suggestedChannel,
    messageAngleNote: r.messageAngleNote,
    urgencyNote: r.urgencyNote,
    nextBestAction: r.nextBestAction,
    fitScore: r.fitScore,
    intentScore: r.intentScore,
    urgencyScore: r.urgencyScore,
    priorityScore: r.priorityScore,
    variantName: r.suggestedVariantId ? variantName.get(r.suggestedVariantId) ?? null : null,
    assigneeId: r.assigneeId,
    lead: {
      id: r.lead.id,
      stage: r.lead.stage,
      touchCount: r.lead.touchCount,
      lastTouchAt: r.lead.lastTouchAt,
      contactName: r.lead.contact.fullName,
      contactTitle: r.lead.contact.title,
      personaCategory: r.lead.contact.personaCategory,
      linkedinUrl: r.lead.contact.linkedinUrl,
      accountId: r.lead.account.id,
      accountName: r.lead.account.name,
      country: r.lead.account.country,
      region: r.lead.account.region,
      vertical: r.lead.account.vertical,
    },
  }));

  const assignees = members.map((m) => ({ id: m.user.id, name: m.user.name }));
  const pending = recommendations.filter((r) => r.status === 'PENDING').length;
  const regionsInFeed = new Set(recommendations.map((r) => r.lead.account.region)).size;
  const verticalsInFeed = new Set(recommendations.map((r) => r.lead.account.vertical)).size;

  return (
    <>
      <PageHeader
        title="Daily Priority Feed"
        description={`The ten prospects worth a personal approach today — ${formatDate(feedDate)}. Each one carries the reason it is here, the angle to lead with and the next action.`}
        actions={
          can(session.role, 'feed:generate') ? (
            <>
              <form action={generateTodaysFeedAction}>
                <Button type="submit" variant={recommendations.length === 0 ? 'primary' : 'secondary'}>
                  {recommendations.length === 0 ? "Generate today's feed" : 'Generate if missing'}
                </Button>
              </form>
              <form action={generateTodaysFeedAction}>
                <input type="hidden" name="force" value="1" />
                <Button type="submit" variant="ghost">Regenerate</Button>
              </form>
            </>
          ) : null
        }
      />

      {recommendations.length === 0 ? (
        <EmptyState
          title="No feed for today yet"
          description={
            can(session.role, 'feed:generate')
              ? 'Generate the feed to rank your prospect pool against the active ICP. Nothing is sent — the feed only tells the team who to approach and how.'
              : 'Ask a manager or analyst to generate today’s feed.'
          }
        />
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="In today's feed" value={recommendations.length} hint={`From a pool of ${feed?.candidatePoolSize ?? 0} eligible leads`} />
            <StatTile label="Awaiting a decision" value={pending} tone={pending > 0 ? 'warn' : 'ok'} hint="Accept, snooze or dismiss to train the engine" />
            <StatTile label="Regions covered" value={regionsInFeed} hint="Diversified so the team is not stuck in one market" />
            <StatTile label="Verticals covered" value={verticalsInFeed} hint="Capped per vertical to spread coverage" />
          </div>

          <form method="get" className="card mb-5 flex flex-wrap items-end gap-3 p-4">
            <FilterSelect name="region" label="Region" value={searchParams.region} options={enumOptions(REGION_LABELS)} />
            <FilterSelect name="vertical" label="Vertical" value={searchParams.vertical} options={enumOptions(VERTICAL_LABELS)} />
            <FilterSelect name="persona" label="Persona" value={searchParams.persona} options={enumOptions(PERSONA_LABELS)} />
            <FilterSelect
              name="campaign"
              label="Campaign"
              value={searchParams.campaign}
              options={campaigns.map((c) => ({ value: c.id, label: c.name }))}
            />
            <FilterSelect
              name="owner"
              label="Owner"
              value={searchParams.owner}
              options={assignees.map((a) => ({ value: a.id, label: a.name }))}
            />
            <FilterSelect
              name="status"
              label="Status"
              value={searchParams.status}
              options={[
                { value: 'PENDING', label: 'Pending' },
                { value: 'ACCEPTED', label: 'Accepted' },
                { value: 'ACTIONED', label: 'Actioned' },
                { value: 'SNOOZED', label: 'Snoozed' },
                { value: 'DISMISSED', label: 'Dismissed' },
              ]}
            />
            <Button type="submit" variant="secondary">Apply</Button>
            <a href="/feed" className="focus-ring rounded-xl px-2.5 py-2 text-xs text-muted hover:text-ink">Clear</a>
          </form>

          {cards.length === 0 ? (
            <EmptyState title="No recommendations match these filters" description="Clear the filters to see the full feed." />
          ) : (
            <div className="space-y-4">
              {cards.map((item) => (
                <FeedCard
                  key={item.id}
                  item={item}
                  assignees={assignees}
                  canAct={can(session.role, 'feed:act')}
                  canAssign={can(session.role, 'feed:assign')}
                  canDraft={can(session.role, 'draft:write')}
                />
              ))}
            </div>
          )}

          <p className="mt-6 text-xs text-muted">
            Diversity policy for this feed: one lead per account, at most three per vertical, five per region,
            four per persona and four per owner. Caps relax automatically if the pool is too small to fill ten slots.
            {feed?.candidatePoolSize ? (
              <> Ranked from <Badge>{feed.candidatePoolSize}</Badge> eligible leads.</>
            ) : null}
          </p>
        </>
      )}
    </>
  );
}

function FilterSelect({
  name, label, value, options,
}: {
  name: string;
  label: string;
  value?: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="min-w-[140px]">
      <label htmlFor={`filter-${name}`} className="label">{label}</label>
      <select id={`filter-${name}`} name={name} defaultValue={value ?? ''} className="input mt-1 py-1.5 text-xs">
        <option value="">All</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

