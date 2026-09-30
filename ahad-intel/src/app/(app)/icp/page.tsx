import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import {
  ANGLE_LABELS, MATURITY_LABELS, PERSONA_LABELS, REGION_LABELS, SIZE_LABELS,
  TRIGGER_LABELS, VERTICAL_LABELS, enumOptions,
} from '@/lib/domain';
import { DEFAULT_WEIGHTS } from '@/lib/scoring/types';
import { pct, round } from '@/lib/utils';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/primitives';
import { IcpForm, type IcpFormValues } from './icp-form';
import { setDefaultIcpAction } from './actions';
import { rescoreWorkspaceAction } from '../leads/actions';

export const metadata: Metadata = { title: 'ICP builder' };
export const dynamic = 'force-dynamic';

const ENGAGED = ['REPLIED', 'QUALIFIED', 'MEETING_BOOKED', 'OPPORTUNITY', 'WON'];

export default async function IcpPage({ searchParams }: { searchParams: { profile?: string } }) {
  const session = await requireSession();

  const [profiles, leads] = await Promise.all([
    prisma.icpProfile.findMany({ where: { workspaceId: session.workspaceId }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
    prisma.lead.findMany({
      where: { workspaceId: session.workspaceId },
      select: {
        stage: true, fitScore: true, intentScore: true,
        account: { select: { vertical: true, region: true, isRegulated: true } },
        contact: { select: { personaCategory: true } },
      },
    }),
  ]);

  const active = profiles.find((p) => p.id === searchParams.profile) ?? profiles.find((p) => p.isDefault) ?? profiles[0] ?? null;

  /**
   * Evidence-led prioritisation: which segments actually produce engagement,
   * and which absorb attention without returning it. Shown next to the ICP so
   * the operator tunes the definition against outcomes, not instinct.
   */
  const rank = <T extends string>(key: (l: (typeof leads)[number]) => T, label: (k: T) => string) => {
    const map = new Map<T, { total: number; engaged: number; fit: number }>();
    for (const lead of leads) {
      const k = key(lead);
      const entry = map.get(k) ?? { total: 0, engaged: 0, fit: 0 };
      entry.total += 1;
      entry.fit += lead.fitScore;
      if (ENGAGED.includes(lead.stage)) entry.engaged += 1;
      map.set(k, entry);
    }
    return [...map.entries()]
      .map(([k, v]) => ({
        key: k,
        label: label(k),
        total: v.total,
        avgFit: round(v.fit / v.total),
        engagement: pct(v.engaged, v.total),
      }))
      .sort((a, b) => b.engagement - a.engagement || b.avgFit - a.avgFit);
  };

  const verticals = rank((l) => l.account.vertical, (k) => VERTICAL_LABELS[k]);
  const personas = rank((l) => l.contact.personaCategory, (k) => PERSONA_LABELS[k]);
  const regions = rank((l) => l.account.region, (k) => REGION_LABELS[k]);

  const values: IcpFormValues = active
    ? {
        id: active.id,
        name: active.name,
        description: active.description ?? '',
        regions: active.regions,
        countries: active.countries,
        verticals: active.verticals,
        companySizes: active.companySizes,
        personaCategories: active.personaCategories,
        triggers: active.triggers,
        offerAngles: active.offerAngles,
        minComplianceMaturity: active.minComplianceMaturity,
        minSecurityMaturity: active.minSecurityMaturity,
        minTransformationMaturity: active.minTransformationMaturity,
        minAiReadiness: active.minAiReadiness,
        minEmployees: active.minEmployees,
        maxEmployees: active.maxEmployees,
        weights: { ...DEFAULT_WEIGHTS, ...((active.weights ?? {}) as Record<string, number>) },
        notes: active.notes ?? '',
      }
    : {
        name: '', description: '', regions: ['UAE', 'KSA', 'GCC'], countries: ['AE', 'SA'],
        verticals: [], companySizes: ['MID', 'LARGE', 'ENTERPRISE'], personaCategories: [],
        triggers: [], offerAngles: [],
        minComplianceMaturity: 'ESTABLISHED', minSecurityMaturity: 'ESTABLISHED',
        minTransformationMaturity: 'ESTABLISHED', minAiReadiness: 'DEVELOPING',
        minEmployees: 200, maxEmployees: null,
        weights: { ...DEFAULT_WEIGHTS }, notes: '',
      };

  const canEdit = can(session.role, 'icp:write');

  return (
    <>
      <PageHeader
        title="ICP builder"
        description="Define what a good customer looks like. Everything downstream — scoring, ranking and the daily feed — reads from this."
        actions={
          canEdit ? (
            <form action={rescoreWorkspaceAction}>
              <Button type="submit">Apply to existing leads</Button>
            </form>
          ) : null
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {profiles.map((profile) => (
          <Link key={profile.id} href={`/icp?profile=${profile.id}`} className="focus-ring rounded-full">
            <Badge tone={profile.id === active?.id ? 'brand' : 'neutral'}>
              {profile.name}{profile.isDefault ? ' · default' : ''}
            </Badge>
          </Link>
        ))}
        {canEdit ? (
          <Link href="/icp?profile=new" className="focus-ring rounded-full">
            <Badge tone="neutral">+ New profile</Badge>
          </Link>
        ) : null}
        {active && !active.isDefault && canEdit ? (
          <form action={setDefaultIcpAction} className="ml-2">
            <input type="hidden" name="id" value={active.id} />
            <Button type="submit" size="sm">Make this the default</Button>
          </form>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title={active ? `Editing “${active.name}”` : 'New ICP profile'}
              subtitle="Scoring is deterministic: the definition here is exactly what the engine applies."
            />
            {canEdit ? (
              <IcpForm
                values={searchParams.profile === 'new' ? { ...values, id: undefined, name: '' } : values}
                options={{
                  regions: enumOptions(REGION_LABELS),
                  verticals: enumOptions(VERTICAL_LABELS),
                  companySizes: enumOptions(SIZE_LABELS),
                  personas: enumOptions(PERSONA_LABELS),
                  triggers: enumOptions(TRIGGER_LABELS),
                  angles: enumOptions(ANGLE_LABELS),
                  maturities: enumOptions(MATURITY_LABELS),
                }}
              />
            ) : (
              <EmptyState title="Read-only" description="Your role can view the ICP but not change it." />
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="What to prioritise" subtitle="Ranked by the engagement each segment actually produced" />
            <Priority title="Verticals" rows={verticals.slice(0, 5)} />
            <Priority title="Personas" rows={personas.slice(0, 5)} className="mt-4" />
            <Priority title="Regions" rows={regions.slice(0, 5)} className="mt-4" />
          </Card>

          {verticals.length > 3 ? (
            <Card>
              <CardHeader title="Consider deprioritising" subtitle="Volume without engagement — attention spent for little return" />
              <ul className="space-y-2 text-sm">
                {verticals
                  .filter((v) => v.total >= 3 && v.engagement === 0)
                  .slice(0, 4)
                  .map((v) => (
                    <li key={v.key} className="flex items-center justify-between gap-2">
                      <span className="text-ink">{v.label}</span>
                      <span className="text-xs text-muted">{v.total} leads · no engagement</span>
                    </li>
                  ))}
                {verticals.filter((v) => v.total >= 3 && v.engagement === 0).length === 0 ? (
                  <li className="text-sm text-muted">Nothing is obviously wasting time yet.</li>
                ) : null}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="How fit is calculated" />
            <ul className="space-y-2 text-xs text-muted">
              <li><strong className="text-ink">Geography</strong> — named country 100%, target region 80%, adjacent region 40%.</li>
              <li><strong className="text-ink">Vertical</strong> — in the list 100%, an adjacent regulated sector 60%.</li>
              <li><strong className="text-ink">Persona</strong> — category match scaled by seniority; title keywords add, exclusions zero it.</li>
              <li><strong className="text-ink">Company size</strong> — band match 100%, one band out 60%, floors gate hard.</li>
              <li><strong className="text-ink">Maturity gap</strong> — peaks at a two-level gap to your target posture.</li>
              <li><strong className="text-ink">Strategic value</strong> — the analyst-set value on the account record.</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

function Priority({
  title, rows, className,
}: {
  title: string;
  rows: Array<{ key: string; label: string; total: number; avgFit: number; engagement: number }>;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="label mb-2">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No data yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-ink">{row.label}</span>
              <span className="shrink-0 text-xs text-muted">
                {row.engagement}% engaged · fit {row.avgFit} · {row.total} leads
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
