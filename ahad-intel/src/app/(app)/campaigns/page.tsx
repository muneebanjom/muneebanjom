import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import {
  ANGLE_LABELS, CHANNEL_LABELS, PERSONA_LABELS, REGION_LABELS, VERTICAL_LABELS, enumOptions,
} from '@/lib/domain';
import { pct } from '@/lib/utils';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/primitives';
import { CampaignForm } from './campaign-form';
import { populateCampaignAction, toggleCampaignAction } from './actions';

export const metadata: Metadata = { title: 'Campaigns' };
export const dynamic = 'force-dynamic';

const ENGAGED = ['REPLIED', 'QUALIFIED', 'MEETING_BOOKED', 'OPPORTUNITY', 'WON'] as const;

export default async function CampaignsPage() {
  const session = await requireSession();

  const campaigns = await prisma.campaign.findMany({
    where: { workspaceId: session.workspaceId },
    orderBy: [{ isActive: 'desc' }, { priority: 'desc' }],
    include: {
      leads: { select: { stage: true, priorityScore: true } },
      _count: { select: { leads: true, drafts: true } },
    },
  });

  const canEdit = can(session.role, 'campaign:write');

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Segment the market by region, vertical, persona and offer angle. Campaign priority feeds directly into daily ranking."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {campaigns.length === 0 ? (
            <EmptyState title="No campaigns yet" description="Create your first campaign to group prospects by offer and market." />
          ) : (
            campaigns.map((campaign) => {
              const engaged = campaign.leads.filter((l) => (ENGAGED as readonly string[]).includes(l.stage)).length;
              const avgPriority = campaign.leads.length
                ? Math.round(campaign.leads.reduce((s, l) => s + l.priorityScore, 0) / campaign.leads.length)
                : 0;

              return (
                <Card key={campaign.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold text-ink">{campaign.name}</h2>
                        <Badge tone={campaign.isActive ? 'ok' : 'neutral'}>{campaign.isActive ? 'active' : 'paused'}</Badge>
                        <Badge tone="brand">{ANGLE_LABELS[campaign.offerAngle]}</Badge>
                        <Badge>priority {campaign.priority}</Badge>
                      </div>
                      {campaign.goal ? <p className="mt-1 text-sm text-muted">{campaign.goal}</p> : null}
                    </div>
                    <div className="flex gap-2">
                      {canEdit ? (
                        <>
                          <form action={populateCampaignAction}>
                            <input type="hidden" name="campaignId" value={campaign.id} />
                            <Button type="submit" size="sm">Add matching leads</Button>
                          </form>
                          <form action={toggleCampaignAction}>
                            <input type="hidden" name="campaignId" value={campaign.id} />
                            <Button type="submit" size="sm" variant="ghost">{campaign.isActive ? 'Pause' : 'Resume'}</Button>
                          </form>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Metric label="Leads" value={campaign._count.leads} />
                    <Metric label="Engaged" value={`${pct(engaged, campaign.leads.length)}%`} />
                    <Metric label="Drafts" value={campaign._count.drafts} />
                    <Metric label="Avg priority" value={avgPriority} />
                  </dl>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {campaign.regions.map((r) => <Badge key={r}>{REGION_LABELS[r]}</Badge>)}
                    {campaign.verticals.map((v) => <Badge key={v}>{VERTICAL_LABELS[v]}</Badge>)}
                    {campaign.personaCategories.map((p) => <Badge key={p}>{PERSONA_LABELS[p]}</Badge>)}
                    {campaign.channels.map((c) => <Badge key={c} tone="info">{CHANNEL_LABELS[c]}</Badge>)}
                  </div>
                </Card>
              );
            })
          )}
        </div>

        {canEdit ? (
          <Card className="h-fit">
            <CardHeader title="New campaign" subtitle="Segmentation here also decides which leads it can absorb." />
            <CampaignForm
              regions={enumOptions(REGION_LABELS)}
              verticals={enumOptions(VERTICAL_LABELS)}
              personas={enumOptions(PERSONA_LABELS)}
              angles={enumOptions(ANGLE_LABELS)}
              channels={enumOptions(CHANNEL_LABELS)}
            />
          </Card>
        ) : null}
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-surface2 p-3">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}
