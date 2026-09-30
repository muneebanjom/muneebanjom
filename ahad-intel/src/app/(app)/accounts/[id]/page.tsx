import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import {
  MATURITY_LABELS, PERSONA_LABELS, PROVIDER_LABELS, REGION_LABELS, STAGE_LABELS,
  TRIGGER_LABELS, VERTICAL_LABELS, countryName,
} from '@/lib/domain';
import { formatDate, formatUsd, relativeTime } from '@/lib/utils';
import { Badge, Button, Card, CardHeader, Field, PageHeader } from '@/components/ui/primitives';
import { suppressAccountAction } from '../../leads/actions';

export const metadata: Metadata = { title: 'Account' };
export const dynamic = 'force-dynamic';

export default async function AccountDetailPage({ params }: { params: { id: string } }) {
  const session = await requireSession();

  const account = await prisma.account.findFirst({
    where: { id: params.id, workspaceId: session.workspaceId },
    include: {
      contacts: { orderBy: { fullName: 'asc' } },
      leads: {
        include: { contact: { select: { fullName: true } }, owner: { select: { name: true } } },
        orderBy: { priorityScore: 'desc' },
      },
      signals: { orderBy: { observedAt: 'desc' }, take: 15 },
      notes: { orderBy: { createdAt: 'desc' }, take: 8, include: { author: { select: { name: true } } } },
      sourceRecords: { orderBy: { retrievedAt: 'desc' }, take: 10 },
    },
  });
  if (!account) notFound();

  const maturity: Array<[string, keyof typeof MATURITY_LABELS]> = [
    ['Compliance', account.complianceMaturity],
    ['Security', account.securityMaturity],
    ['Transformation', account.transformationMaturity],
    ['AI readiness', account.aiReadiness],
  ];

  return (
    <>
      <PageHeader
        title={account.name}
        description={`${VERTICAL_LABELS[account.vertical]} · ${countryName(account.country)}${account.city ? `, ${account.city}` : ''} · ${REGION_LABELS[account.region]}`}
        actions={
          account.website ? (
            <a
              href={account.website}
              target="_blank"
              rel="noreferrer noopener"
              className="focus-ring rounded-xl border border-line px-3.5 py-2 text-sm text-ink transition hover:bg-surface2"
            >
              Website ↗
            </a>
          ) : null
        }
      />

      {account.isSuppressed ? (
        <div className="mb-5 rounded-2xl border border-warn/20 bg-warn/10 p-4 text-sm text-warn">
          <strong className="font-semibold">Suppressed.</strong> {account.suppressionReason ?? 'Excluded from recommendations.'}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="People" subtitle={`${account.contacts.length} contact${account.contacts.length === 1 ? '' : 's'} on file`} />
            <ul className="divide-y divide-line">
              {account.contacts.map((contact) => {
                const lead = account.leads.find((l) => l.contactId === contact.id);
                return (
                  <li key={contact.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      {lead ? (
                        <Link href={`/leads/${lead.id}`} className="focus-ring text-sm font-medium text-ink hover:text-brand">
                          {contact.fullName}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium text-ink">{contact.fullName}</span>
                      )}
                      <p className="text-xs text-muted">{contact.title ?? PERSONA_LABELS[contact.personaCategory]}</p>
                    </div>
                    <Badge>{PERSONA_LABELS[contact.personaCategory]}</Badge>
                    {contact.optedOut ? <Badge tone="danger">opted out</Badge> : null}
                    {lead ? (
                      <>
                        <Badge>{STAGE_LABELS[lead.stage]}</Badge>
                        <span className="text-xs tabular-nums text-muted">priority {lead.priorityScore}</span>
                      </>
                    ) : (
                      <Badge tone="neutral">no lead</Badge>
                    )}
                  </li>
                );
              })}
              {account.contacts.length === 0 ? <li className="py-2 text-sm text-muted">No contacts yet.</li> : null}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Signals" subtitle="Evidence feeding the intent and urgency scores, decayed by age" />
            <ul className="space-y-2.5">
              {account.signals.map((signal) => (
                <li key={signal.id} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">{signal.title}</span>
                    {signal.trigger ? <Badge tone="info">{TRIGGER_LABELS[signal.trigger]}</Badge> : null}
                    <Badge>weight {signal.weight}</Badge>
                    <span className="ml-auto text-xs text-muted">{relativeTime(signal.observedAt)}</span>
                  </div>
                  {signal.detail ? <p className="mt-1 text-xs text-muted">{signal.detail}</p> : null}
                  <p className="mt-1 text-xs text-muted">Source: {PROVIDER_LABELS[signal.source]}</p>
                </li>
              ))}
              {account.signals.length === 0 ? <li className="text-sm text-muted">No signals recorded. This account is a cold, fit-led approach.</li> : null}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Data provenance" subtitle="Where every field on this account came from" />
            <ul className="space-y-2">
              {account.sourceRecords.map((record) => (
                <li key={record.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge>{PROVIDER_LABELS[record.provider]}</Badge>
                  <span className="text-muted">{record.fieldsProvided.join(', ') || 'no fields recorded'}</span>
                  <span className="ml-auto text-muted">
                    {record.consentBasis.toLowerCase().replace(/_/g, ' ')} · {formatDate(record.retrievedAt)}
                  </span>
                </li>
              ))}
              {account.sourceRecords.length === 0 ? <li className="text-sm text-muted">No provenance recorded.</li> : null}
            </ul>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Firmographics" />
            <dl className="space-y-2.5 text-sm">
              <Row label="Domain" value={account.domain ?? '—'} />
              <Row label="Employees" value={account.employeeCount?.toLocaleString() ?? '—'} />
              <Row label="Revenue" value={formatUsd(account.annualRevenueUsd)} />
              <Row label="Listed" value={account.isPublic ? 'Yes' : 'No'} />
              <Row label="Regulated" value={account.isRegulated ? 'Yes' : 'No'} />
              <Row label="Strategic value" value={`${account.strategicValue}/100`} />
              <Row label="Budget potential" value={formatUsd(account.budgetPotentialUsd)} />
            </dl>
            {account.regulators.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {account.regulators.map((r) => <Badge key={r} tone="info">{r}</Badge>)}
              </div>
            ) : null}
            {account.techStack.length > 0 ? (
              <div className="mt-3">
                <p className="label mb-1.5">Technology</p>
                <div className="flex flex-wrap gap-1.5">
                  {account.techStack.map((t) => <Badge key={t}>{t}</Badge>)}
                </div>
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Maturity" subtitle="The gap to your ICP target is the opportunity" />
            <ul className="space-y-2">
              {maturity.map(([label, value]) => (
                <li key={label} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted">{label}</span>
                  <Badge tone={value === 'UNKNOWN' ? 'neutral' : value === 'ADVANCED' ? 'ok' : value === 'NASCENT' ? 'warn' : 'info'}>
                    {MATURITY_LABELS[value]}
                  </Badge>
                </li>
              ))}
            </ul>
            {account.triggers.length > 0 ? (
              <div className="mt-4">
                <p className="label mb-1.5">Buying triggers</p>
                <div className="flex flex-wrap gap-1.5">
                  {account.triggers.map((t) => <Badge key={t} tone="info">{TRIGGER_LABELS[t]}</Badge>)}
                </div>
              </div>
            ) : null}
          </Card>

          {can(session.role, 'lead:write') ? (
            <Card>
              <CardHeader title="Suppression" subtitle="Suppressed accounts never appear in the daily feed." />
              <form action={suppressAccountAction} className="space-y-2">
                <input type="hidden" name="accountId" value={account.id} />
                {!account.isSuppressed ? (
                  <Field label="Reason">
                    <input name="reason" placeholder="e.g. existing customer, conflict of interest" className="input py-1.5 text-xs" />
                  </Field>
                ) : null}
                <Button type="submit" variant={account.isSuppressed ? 'secondary' : 'danger'} size="sm">
                  {account.isSuppressed ? 'Remove suppression' : 'Suppress this account'}
                </Button>
              </form>
            </Card>
          ) : null}

          {account.notes.length > 0 ? (
            <Card>
              <CardHeader title="Notes" />
              <ul className="space-y-2.5">
                {account.notes.map((note) => (
                  <li key={note.id} className="rounded-xl bg-surface2 p-3 text-sm">
                    <p className="text-ink">{note.body}</p>
                    <p className="mt-1 text-xs text-muted">{note.author?.name ?? 'Unknown'} · {relativeTime(note.createdAt)}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-xs text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-ink">{value}</dd>
    </div>
  );
}
