import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import {
  PERSONA_LABELS, REGION_LABELS, STAGE_LABELS, VERTICAL_LABELS, countryName, enumOptions,
} from '@/lib/domain';
import { formatCount, relativeTime, truncate } from '@/lib/utils';
import { Badge, Button, Card, EmptyState, LinkButton, PageHeader, StatTile } from '@/components/ui/primitives';
import { rescoreWorkspaceAction, saveSegmentAction } from './actions';

export const metadata: Metadata = { title: 'Leads & accounts' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

interface SearchParams {
  q?: string;
  region?: string;
  vertical?: string;
  persona?: string;
  stage?: string;
  owner?: string;
  sort?: string;
  page?: string;
  view?: string;
}

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession();

  // A saved view simply replays its stored filter definition.
  let params = searchParams;
  if (searchParams.view) {
    const segment = await prisma.segment.findFirst({
      where: { workspaceId: session.workspaceId, name: searchParams.view },
    });
    if (segment) {
      const def = segment.definition as Record<string, string | null>;
      params = {
        ...searchParams,
        q: def.q ?? undefined,
        region: def.region ?? undefined,
        vertical: def.vertical ?? undefined,
        persona: def.persona ?? undefined,
        stage: def.stage ?? undefined,
        owner: def.owner ?? undefined,
      };
    }
  }

  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const where: Prisma.LeadWhereInput = {
    workspaceId: session.workspaceId,
    ...(params.stage ? { stage: params.stage as never } : {}),
    ...(params.owner ? { ownerId: params.owner } : {}),
    ...(params.region || params.vertical
      ? {
          account: {
            ...(params.region ? { region: params.region as never } : {}),
            ...(params.vertical ? { vertical: params.vertical as never } : {}),
          },
        }
      : {}),
    ...(params.persona ? { contact: { personaCategory: params.persona as never } } : {}),
    ...(params.q
      ? {
          OR: [
            { contact: { fullName: { contains: params.q, mode: 'insensitive' } } },
            { contact: { title: { contains: params.q, mode: 'insensitive' } } },
            { account: { name: { contains: params.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.LeadOrderByWithRelationInput =
    params.sort === 'fit' ? { fitScore: 'desc' }
    : params.sort === 'intent' ? { intentScore: 'desc' }
    : params.sort === 'recent' ? { updatedAt: 'desc' }
    : { priorityScore: 'desc' };

  const [leads, total, members, segments, stageCounts] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        contact: { select: { fullName: true, title: true, personaCategory: true, optedOut: true } },
        account: { select: { id: true, name: true, country: true, region: true, vertical: true, isSuppressed: true } },
        owner: { select: { name: true } },
        campaign: { select: { name: true } },
      },
    }),
    prisma.lead.count({ where }),
    prisma.membership.findMany({ where: { workspaceId: session.workspaceId }, include: { user: { select: { id: true, name: true } } } }),
    prisma.segment.findMany({ where: { workspaceId: session.workspaceId }, orderBy: { name: 'asc' } }),
    prisma.lead.groupBy({ by: ['stage'], where: { workspaceId: session.workspaceId }, _count: { _all: true } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const shortlisted = stageCounts.find((s) => s.stage === 'SHORTLISTED')?._count._all ?? 0;
  const contacted = stageCounts.find((s) => s.stage === 'CONTACTED')?._count._all ?? 0;
  const qualified = stageCounts.find((s) => s.stage === 'QUALIFIED')?._count._all ?? 0;

  const qs = (overrides: Partial<SearchParams>) => {
    const next = new URLSearchParams();
    const merged = { ...params, ...overrides, view: undefined };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, String(value));
    }
    return `/leads?${next.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Leads & accounts"
        description="Everything in the pool, with the scores that decide what surfaces in the daily feed."
        actions={
          can(session.role, 'icp:write') ? (
            <form action={rescoreWorkspaceAction}>
              <Button type="submit" variant="secondary">Rescore all leads</Button>
            </form>
          ) : null
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Leads" value={formatCount(total)} hint={total === stageCounts.reduce((s, c) => s + c._count._all, 0) ? 'All leads' : 'Matching your filters'} />
        <StatTile label="Shortlisted" value={shortlisted} hint="Accepted from the feed, not yet contacted" />
        <StatTile label="Contacted" value={contacted} hint="Awaiting a reply" />
        <StatTile label="Qualified" value={qualified} tone="ok" hint="Qualified but not yet booked" />
      </div>

      {segments.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Saved views:</span>
          {segments.map((segment) => (
            <Link key={segment.id} href={`/leads?view=${encodeURIComponent(segment.name)}`} className="focus-ring rounded-full">
              <Badge tone={searchParams.view === segment.name ? 'brand' : 'neutral'}>{segment.name}</Badge>
            </Link>
          ))}
        </div>
      ) : null}

      <Card className="mb-5 p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label htmlFor="q" className="label">Search</label>
            <input id="q" name="q" defaultValue={params.q ?? ''} placeholder="Name, title or company" className="input mt-1 py-1.5 text-xs" />
          </div>
          <Filter name="region" label="Region" value={params.region} options={enumOptions(REGION_LABELS)} />
          <Filter name="vertical" label="Vertical" value={params.vertical} options={enumOptions(VERTICAL_LABELS)} />
          <Filter name="persona" label="Persona" value={params.persona} options={enumOptions(PERSONA_LABELS)} />
          <Filter name="stage" label="Stage" value={params.stage} options={enumOptions(STAGE_LABELS)} />
          <Filter name="owner" label="Owner" value={params.owner} options={members.map((m) => ({ value: m.user.id, label: m.user.name }))} />
          <Filter
            name="sort"
            label="Sort by"
            value={params.sort}
            options={[
              { value: 'priority', label: 'Priority' },
              { value: 'fit', label: 'ICP fit' },
              { value: 'intent', label: 'Intent' },
              { value: 'recent', label: 'Recently updated' },
            ]}
          />
          <Button type="submit">Apply</Button>
          <a href="/leads" className="focus-ring rounded-xl px-2.5 py-2 text-xs text-muted hover:text-ink">Clear</a>
        </form>

        {can(session.role, 'lead:write') ? (
          <form action={saveSegmentAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
            <input type="hidden" name="q" value={params.q ?? ''} />
            <input type="hidden" name="region" value={params.region ?? ''} />
            <input type="hidden" name="vertical" value={params.vertical ?? ''} />
            <input type="hidden" name="persona" value={params.persona ?? ''} />
            <input type="hidden" name="stage" value={params.stage ?? ''} />
            <input type="hidden" name="owner" value={params.owner ?? ''} />
            <div className="min-w-[220px]">
              <label htmlFor="segment-name" className="label">Save these filters as a view</label>
              <input id="segment-name" name="name" placeholder="e.g. UAE banking CISOs" className="input mt-1 py-1.5 text-xs" />
            </div>
            <Button type="submit" size="sm">Save view</Button>
          </form>
        ) : null}
      </Card>

      {leads.length === 0 ? (
        <EmptyState
          title="No leads match"
          description="Adjust the filters, or import accounts and contacts from a compliant source."
          action={can(session.role, 'import:write') ? <LinkButton href="/integrations" variant="primary">Import data</LinkButton> : undefined}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-line bg-surface2 text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-medium">Contact</th>
                  <th className="px-4 py-2.5 font-medium">Company</th>
                  <th className="px-4 py-2.5 font-medium">Geography</th>
                  <th className="px-4 py-2.5 font-medium">Persona</th>
                  <th className="px-4 py-2.5 text-right font-medium">Fit</th>
                  <th className="px-4 py-2.5 text-right font-medium">Intent</th>
                  <th className="px-4 py-2.5 text-right font-medium">Priority</th>
                  <th className="px-4 py-2.5 font-medium">Stage</th>
                  <th className="px-4 py-2.5 font-medium">Owner</th>
                  <th className="px-4 py-2.5 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-b border-line/60 transition last:border-0 hover:bg-surface2/60">
                    <td className="px-4 py-2.5">
                      <Link href={`/leads/${lead.id}`} className="focus-ring font-medium text-ink hover:text-brand">
                        {lead.contact.fullName}
                      </Link>
                      {lead.contact.optedOut ? <Badge tone="danger" className="ml-2">opted out</Badge> : null}
                      <p className="text-xs text-muted">{truncate(lead.contact.title ?? '—', 42)}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/accounts/${lead.account.id}`} className="focus-ring text-ink hover:text-brand">
                        {truncate(lead.account.name, 30)}
                      </Link>
                      {lead.account.isSuppressed ? <Badge tone="warn" className="ml-2">suppressed</Badge> : null}
                      <p className="text-xs text-muted">{VERTICAL_LABELS[lead.account.vertical]}</p>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted">
                      <p className="text-ink">{countryName(lead.account.country)}</p>
                      <p>{REGION_LABELS[lead.account.region]}</p>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted">{PERSONA_LABELS[lead.contact.personaCategory]}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink">{lead.fitScore}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink">{lead.intentScore}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="rounded-lg bg-surface2 px-2 py-1 text-xs font-semibold tabular-nums text-ink">{lead.priorityScore}</span>
                    </td>
                    <td className="px-4 py-2.5"><Badge>{STAGE_LABELS[lead.stage]}</Badge></td>
                    <td className="px-4 py-2.5 text-xs text-muted">{lead.owner?.name ?? 'Unassigned'}</td>
                    <td className="px-4 py-2.5 text-xs text-muted">{relativeTime(lead.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-muted">
            <span>Page {page} of {totalPages} · {formatCount(total)} leads</span>
            <div className="flex gap-2">
              {page > 1 ? <Link href={qs({ page: String(page - 1) })} className="focus-ring rounded-lg px-2 py-1 hover:bg-surface2 hover:text-ink">Previous</Link> : null}
              {page < totalPages ? <Link href={qs({ page: String(page + 1) })} className="focus-ring rounded-lg px-2 py-1 hover:bg-surface2 hover:text-ink">Next</Link> : null}
            </div>
          </div>
        </Card>
      )}
    </>
  );
}

function Filter({
  name, label, value, options,
}: { name: string; label: string; value?: string; options: Array<{ value: string; label: string }> }) {
  return (
    <div className="min-w-[130px]">
      <label htmlFor={`f-${name}`} className="label">{label}</label>
      <select id={`f-${name}`} name={name} defaultValue={value ?? ''} className="input mt-1 py-1.5 text-xs">
        <option value="">All</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
