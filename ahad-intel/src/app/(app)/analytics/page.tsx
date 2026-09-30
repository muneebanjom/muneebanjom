import type { Metadata } from 'next';
import { requireSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { analyticsSnapshot } from '@/lib/analytics';
import { formatUsd } from '@/lib/utils';
import { AccessDenied, Card, CardHeader, PageHeader, StatTile } from '@/components/ui/primitives';
import {
  BarSeries, ConversionChart, DataTable, DistributionChart, FunnelChart, RevenueChart, TrendChart,
} from '@/components/charts';

export const metadata: Metadata = { title: 'Analytics' };
export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const session = await requireSession();
  if (!can(session.role, 'analytics:read')) {
    return <AccessDenied area="analytics" />;
  }

  const s = await analyticsSnapshot(session.workspaceId, 90);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Where the opportunities are coming from, which angles land, and where the team is spending attention for nothing. Last 90 days."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <StatTile label="Leads" value={s.totals.leads} />
        <StatTile label="Contacted" value={s.totals.contacted} />
        <StatTile label="Reply rate" value={`${s.totals.replyRate}%`} tone={s.totals.replyRate >= 15 ? 'ok' : 'neutral'} />
        <StatTile label="Qualification rate" value={`${s.totals.qualificationRate}%`} hint="Of leads that replied" />
        <StatTile label="Meeting rate" value={`${s.totals.meetingRate}%`} hint="Of leads contacted" />
        <StatTile label="Open pipeline" value={formatUsd(s.totals.pipelineValueUsd)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Pipeline by stage" subtitle="Leads that reached each stage, with stage-to-stage conversion" />
          <FunnelChart data={s.funnel} />
        </Card>

        <Card>
          <CardHeader
            title="Daily recommendations"
            subtitle={`Feed size over time · acceptance rate ${s.recommendationAcceptance.rate}% (${s.recommendationAcceptance.accepted + s.recommendationAcceptance.actioned} of ${s.recommendationAcceptance.total})`}
          />
          <TrendChart data={s.feedTrend} />
          <DataTable data={s.feedTrend} valueLabel="Recommendations" />
        </Card>

        <Card>
          <CardHeader title="Leads by country" subtitle="Where the pool actually sits" />
          <BarSeries data={s.leadsByCountry.slice(0, 10)} colorIndex={0} />
          <DataTable data={s.leadsByCountry} valueLabel="Leads" />
        </Card>

        <Card>
          <CardHeader title="Leads by vertical" />
          <BarSeries data={s.leadsByVertical.slice(0, 10)} colorIndex={1} />
          <DataTable data={s.leadsByVertical} valueLabel="Leads" />
        </Card>

        <Card>
          <CardHeader title="Leads by persona" />
          <BarSeries data={s.leadsByPersona.slice(0, 10)} colorIndex={2} horizontal />
          <DataTable data={s.leadsByPersona} valueLabel="Leads" />
        </Card>

        <Card>
          <CardHeader title="Leads by campaign" />
          <BarSeries data={s.leadsByCampaign.slice(0, 10)} colorIndex={3} horizontal />
          <DataTable data={s.leadsByCampaign} valueLabel="Leads" />
        </Card>

        <Card>
          <CardHeader title="ICP fit distribution" subtitle="How much of the pool genuinely matches the ICP" />
          <DistributionChart data={s.fitDistribution} colorIndex={0} />
          <DataTable data={s.fitDistribution} valueLabel="Leads" />
        </Card>

        <Card>
          <CardHeader title="Intent distribution" subtitle="How much of the pool shows live buying signals" />
          <DistributionChart data={s.intentDistribution} colorIndex={2} />
          <DataTable data={s.intentDistribution} valueLabel="Leads" />
        </Card>

        <Card>
          <CardHeader title="Engagement by region" subtitle="Share of leads that reached a reply or beyond" />
          <ConversionChart data={s.conversionByRegion} />
          <DataTable data={s.conversionByRegion} valueLabel="Engaged" suffix="%" />
        </Card>

        <Card>
          <CardHeader title="Engagement by vertical" subtitle="Which sectors respond to Ahad's proposition" />
          <ConversionChart data={s.conversionByVertical} />
          <DataTable data={s.conversionByVertical} valueLabel="Engaged" suffix="%" />
        </Card>

        <Card>
          <CardHeader title="Offer angle performance" subtitle="Which positioning converts into conversations" />
          <ConversionChart data={s.anglePerformance} />
          <DataTable data={s.anglePerformance} valueLabel="Engaged" suffix="%" />
        </Card>

        <Card>
          <CardHeader title="Message variation performance" subtitle="Reply rate per approved template variant — this is what weights the variation picker" />
          <ConversionChart data={s.templatePerformance} />
          <DataTable data={s.templatePerformance} valueLabel="Reply rate" suffix="%" />
        </Card>

        <Card>
          <CardHeader title="Source performance" subtitle="Records contributed by each data source" />
          <BarSeries data={s.sourcePerformance} colorIndex={4} horizontal />
          <DataTable data={s.sourcePerformance} valueLabel="Records" />
        </Card>

        <Card>
          <CardHeader title="Pipeline value by segment" subtitle="Open estimated value by region and vertical" />
          <RevenueChart data={s.revenueBySegment} />
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader
          title="What this should tell you"
          subtitle="The questions these charts exist to answer"
        />
        <ul className="grid gap-2 text-sm text-muted sm:grid-cols-2">
          <li><strong className="text-ink">Which geographies produce opportunities?</strong> Engagement by region, read against leads by country — a big pool with low engagement is a misallocation.</li>
          <li><strong className="text-ink">Which verticals respond?</strong> Engagement by vertical. Feed the winners back into the ICP weights.</li>
          <li><strong className="text-ink">Which personas engage?</strong> Leads by persona against engagement — if CISOs reply and CIOs do not, change who you target, not the message.</li>
          <li><strong className="text-ink">Which angles convert?</strong> Offer angle performance decides what the daily feed should lead with.</li>
          <li><strong className="text-ink">Where is time being wasted?</strong> Segments with volume and zero engagement, and dismissed recommendations.</li>
          <li><strong className="text-ink">Do the daily picks work?</strong> Recommendation acceptance rate alongside the reply and meeting rates.</li>
        </ul>
      </Card>
    </>
  );
}
