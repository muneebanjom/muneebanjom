import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { LeadStage } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { decrypt, maskEmail, maskPhone } from '@/lib/crypto';
import {
  ANGLE_LABELS, CHANNEL_LABELS, DRAFT_STATUS_LABELS, MATURITY_LABELS, PERSONA_LABELS,
  REGION_LABELS, SENTIMENT_LABELS, STAGE_LABELS, TRIGGER_LABELS, VERTICAL_LABELS, countryName, enumOptions,
} from '@/lib/domain';
import { formatDate, formatUsd, relativeTime } from '@/lib/utils';
import type { ScoreContribution } from '@/lib/scoring/types';
import { qualificationQuestionsFor } from '@/lib/outreach/service';
import {
  Badge, Button, Card, CardHeader, Field, LinkButton, PageHeader, ScoreRing,
} from '@/components/ui/primitives';
import {
  addNoteAction, assignLeadAction, completeTaskAction, createTaskAction,
  optOutContactAction, rescoreLeadAction, updateLeadStageAction,
} from '../actions';
import { generateDraftForLeadAction } from '../../drafts/actions';

export const metadata: Metadata = { title: 'Lead' };
export const dynamic = 'force-dynamic';

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const session = await requireSession();

  const lead = await prisma.lead.findFirst({
    where: { id: params.id, workspaceId: session.workspaceId },
    include: {
      contact: { include: { persona: true } },
      account: { include: { signals: { orderBy: { observedAt: 'desc' }, take: 10 } } },
      owner: { select: { id: true, name: true } },
      campaign: { select: { id: true, name: true } },
      scores: { orderBy: { computedAt: 'desc' }, take: 1 },
      drafts: { orderBy: { createdAt: 'desc' }, take: 5 },
      replies: { orderBy: { receivedAt: 'desc' }, take: 5 },
      notes: { orderBy: { createdAt: 'desc' }, take: 10, include: { author: { select: { name: true } } } },
      tasks: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }, orderBy: { dueAt: 'asc' } },
      activities: { orderBy: { occurredAt: 'desc' }, take: 15, include: { actor: { select: { name: true } } } },
      meetings: { orderBy: { scheduledAt: 'desc' }, take: 3 },
      recommendations: { orderBy: { feedDate: 'desc' }, take: 5 },
    },
  });
  if (!lead) notFound();

  const [members, questions] = await Promise.all([
    prisma.membership.findMany({ where: { workspaceId: session.workspaceId }, include: { user: { select: { id: true, name: true } } } }),
    qualificationQuestionsFor(session.workspaceId, lead.id),
  ]);

  const score = lead.scores[0];
  const breakdown = (score?.breakdown ?? []) as unknown as ScoreContribution[];
  const showPii = can(session.role, 'pii:read');
  const email = decrypt(lead.contact.emailEnc);
  const phone = decrypt(lead.contact.phoneEnc);

  const byDimension = (dimension: string) =>
    breakdown.filter((c) => c.dimension === dimension).sort((a, b) => b.points - a.points);

  return (
    <>
      <PageHeader
        title={lead.contact.fullName}
        description={`${lead.contact.title ?? PERSONA_LABELS[lead.contact.personaCategory]} at ${lead.account.name} · ${countryName(lead.account.country)}`}
        actions={
          <>
            <LinkButton href={`/accounts/${lead.accountId}`} size="sm">View account</LinkButton>
            {can(session.role, 'lead:write') ? (
              <form action={rescoreLeadAction}>
                <input type="hidden" name="leadId" value={lead.id} />
                <Button type="submit" size="sm">Rescore</Button>
              </form>
            ) : null}
            {can(session.role, 'draft:write') && !lead.contact.optedOut ? (
              <form action={generateDraftForLeadAction}>
                <input type="hidden" name="leadId" value={lead.id} />
                <Button type="submit" variant="primary" size="sm">Generate draft</Button>
              </form>
            ) : null}
          </>
        }
      />

      {lead.contact.optedOut ? (
        <div className="mb-5 rounded-2xl border border-danger/20 bg-danger/10 p-4 text-sm text-danger">
          <strong className="font-semibold">This contact has opted out.</strong>{' '}
          {lead.contact.doNotContactReason ?? 'No further outreach may be sent.'} Drafting and sending are blocked.
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Score explainer */}
          <Card>
            <CardHeader
              title="Why this lead scores as it does"
              subtitle={score ? `Engine ${score.engineVersion} · computed ${relativeTime(score.computedAt)}` : 'Not scored yet'}
            />
            <div className="mb-4 flex flex-wrap gap-6">
              <ScoreRing value={lead.priorityScore} label="Priority" size={64} />
              <ScoreRing value={lead.fitScore} label="ICP fit" size={64} />
              <ScoreRing value={lead.intentScore} label="Intent" size={64} />
              <ScoreRing value={lead.urgencyScore} label="Urgency" size={64} />
              <ScoreRing value={lead.dealPotential} label="Deal size" size={64} />
            </div>

            {score ? <p className="mb-4 rounded-xl bg-surface2 p-3.5 text-sm text-ink">{score.explanation}</p> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              {(['fit', 'intent', 'urgency', 'dealPotential'] as const).map((dimension) => {
                const rows = byDimension(dimension);
                if (rows.length === 0) return null;
                const title = dimension === 'dealPotential' ? 'Deal potential' : dimension;
                return (
                  <div key={dimension}>
                    <p className="label mb-1.5">{title}</p>
                    <ul className="space-y-1.5">
                      {rows.map((row, i) => (
                        <li key={i} className="flex gap-2 text-xs">
                          <span className={`w-10 shrink-0 text-right font-semibold tabular-nums ${row.points < 0 ? 'text-danger' : 'text-ink'}`}>
                            {row.points > 0 ? '+' : ''}{row.points}
                          </span>
                          <span className="min-w-0">
                            <span className="font-medium text-ink">{row.label}</span>
                            <span className="block text-muted">{row.rationale}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            {score?.recommendedNextStep ? (
              <div className="mt-4 rounded-xl border border-line p-3">
                <p className="label">Recommended next step</p>
                <p className="mt-1 text-sm text-ink">{score.recommendedNextStep}</p>
                <p className="mt-1 text-xs text-muted">
                  Angle: {score.recommendedAngle ? ANGLE_LABELS[score.recommendedAngle] : '—'}
                  {score.recommendedChannel ? ` · Channel: ${CHANNEL_LABELS[score.recommendedChannel]}` : ''}
                </p>
              </div>
            ) : null}
          </Card>

          {/* Qualification */}
          <Card>
            <CardHeader title="Qualification questions" subtitle="Tuned to this persona and the angle in play" />
            <ol className="space-y-2">
              {questions.map((q, i) => (
                <li key={i} className="flex gap-2 text-sm text-ink">
                  <span className="text-muted tabular-nums">{i + 1}.</span>
                  <span>{q}</span>
                </li>
              ))}
            </ol>
          </Card>

          {/* Drafts */}
          <Card>
            <CardHeader
              title="Outreach drafts"
              subtitle="Nothing is sent without a human approving it first"
              action={<LinkButton href="/drafts" size="sm">Approval queue</LinkButton>}
            />
            {lead.drafts.length === 0 ? (
              <p className="text-sm text-muted">No drafts yet.</p>
            ) : (
              <ul className="space-y-3">
                {lead.drafts.map((draft) => (
                  <li key={draft.id} className="rounded-xl border border-line p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={draft.status === 'APPROVED' ? 'ok' : draft.status === 'SENT' ? 'info' : draft.status === 'REJECTED' ? 'danger' : 'neutral'}>
                        {DRAFT_STATUS_LABELS[draft.status]}
                      </Badge>
                      <Badge tone="brand">{ANGLE_LABELS[draft.offerAngle]}</Badge>
                      <Badge>{CHANNEL_LABELS[draft.channel]}</Badge>
                      <Badge>variant {draft.variantKey}</Badge>
                      <span className="ml-auto text-xs text-muted">{relativeTime(draft.createdAt)}</span>
                    </div>
                    {draft.subject ? <p className="mt-2 text-sm font-medium text-ink">{draft.subject}</p> : null}
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted">{draft.body}</p>
                    {draft.positioning ? <p className="mt-2 text-xs italic text-muted">Positioning: {draft.positioning}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Conversation */}
          <Card>
            <CardHeader title="Conversation & activity" subtitle="Replies, stage changes and everything logged against this lead" />
            {lead.replies.length > 0 ? (
              <ul className="mb-4 space-y-3">
                {lead.replies.map((reply) => (
                  <li key={reply.id} className="rounded-xl border border-line p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={reply.sentiment === 'POSITIVE' ? 'ok' : reply.sentiment === 'NEGATIVE' || reply.sentiment === 'UNSUBSCRIBE' ? 'danger' : 'neutral'}>
                        {SENTIMENT_LABELS[reply.sentiment]}
                      </Badge>
                      <Badge>{CHANNEL_LABELS[reply.channel]}</Badge>
                      <span className="ml-auto text-xs text-muted">{relativeTime(reply.receivedAt)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{reply.body}</p>
                    {reply.summary ? <p className="mt-1.5 text-xs text-muted">{reply.summary}</p> : null}
                    {reply.buyingSignals.length > 0 ? (
                      <p className="mt-1.5 text-xs text-ok">Signals: {reply.buyingSignals.join(', ')}</p>
                    ) : null}
                    {reply.objections.length > 0 ? (
                      <p className="mt-1 text-xs text-warn">Objections: {reply.objections.join(', ')}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            <ul className="space-y-2 border-t border-line pt-3">
              {lead.activities.map((activity) => (
                <li key={activity.id} className="flex gap-3 text-xs">
                  <span className="w-24 shrink-0 text-muted">{relativeTime(activity.occurredAt)}</span>
                  <span className="text-ink">{activity.summary}</span>
                  <span className="ml-auto text-muted">{activity.actor?.name ?? 'System'}</span>
                </li>
              ))}
              {lead.activities.length === 0 ? <li className="text-xs text-muted">No activity recorded yet.</li> : null}
            </ul>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader title="Notes" subtitle="Analyst context that feeds scoring judgement" />
            {can(session.role, 'lead:write') ? (
              <form action={addNoteAction} className="mb-4 space-y-2">
                <input type="hidden" name="leadId" value={lead.id} />
                <textarea name="body" required rows={3} className="input resize-y" placeholder="What did you learn about this account or person?" />
                <Button type="submit" size="sm">Add note</Button>
              </form>
            ) : null}
            <ul className="space-y-2.5">
              {lead.notes.map((note) => (
                <li key={note.id} className="rounded-xl bg-surface2 p-3">
                  <p className="text-sm text-ink">{note.body}</p>
                  <p className="mt-1 text-xs text-muted">{note.author?.name ?? 'Unknown'} · {relativeTime(note.createdAt)}</p>
                </li>
              ))}
              {lead.notes.length === 0 ? <li className="text-sm text-muted">No notes yet.</li> : null}
            </ul>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Contact" />
            <dl className="space-y-2.5 text-sm">
              <Row label="Persona" value={lead.contact.persona?.label ?? PERSONA_LABELS[lead.contact.personaCategory]} />
              <Row label="Title" value={lead.contact.title ?? '—'} />
              <Row label="Country" value={countryName(lead.contact.country ?? lead.account.country)} />
              <Row label="Region" value={REGION_LABELS[lead.contact.region]} />
              <Row label="Email" value={showPii ? email ?? '—' : maskEmail(email)} />
              <Row label="Phone" value={showPii ? phone ?? '—' : maskPhone(phone)} />
              <Row
                label="LinkedIn"
                value={
                  lead.contact.linkedinUrl ? (
                    <a href={lead.contact.linkedinUrl} target="_blank" rel="noreferrer noopener" className="text-brand hover:underline">
                      Open profile ↗
                    </a>
                  ) : '—'
                }
              />
              <Row label="Lawful basis" value={lead.contact.consentBasis.toLowerCase().replace(/_/g, ' ')} />
              <Row label="Last enriched" value={lead.contact.lastEnrichedAt ? formatDate(lead.contact.lastEnrichedAt) : 'never'} />
            </dl>

            {can(session.role, 'lead:write') && !lead.contact.optedOut ? (
              <form action={optOutContactAction} className="mt-4 space-y-2 border-t border-line pt-3">
                <input type="hidden" name="contactId" value={lead.contactId} />
                <Field label="Record an opt-out" hint="Suppresses this person everywhere and archives their drafts.">
                  <input name="reason" placeholder="Reason (optional)" className="input py-1.5 text-xs" />
                </Field>
                <Button type="submit" variant="danger" size="sm">Mark opted out</Button>
              </form>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Account" />
            <dl className="space-y-2.5 text-sm">
              <Row label="Company" value={<Link href={`/accounts/${lead.accountId}`} className="text-brand hover:underline">{lead.account.name}</Link>} />
              <Row label="Vertical" value={VERTICAL_LABELS[lead.account.vertical]} />
              <Row label="Employees" value={lead.account.employeeCount?.toLocaleString() ?? '—'} />
              <Row label="Revenue" value={formatUsd(lead.account.annualRevenueUsd)} />
              <Row label="Regulated" value={lead.account.isRegulated ? lead.account.regulators.join(', ') || 'Yes' : 'No'} />
              <Row label="Security maturity" value={MATURITY_LABELS[lead.account.securityMaturity]} />
              <Row label="Compliance maturity" value={MATURITY_LABELS[lead.account.complianceMaturity]} />
              <Row label="AI readiness" value={MATURITY_LABELS[lead.account.aiReadiness]} />
            </dl>
            {lead.account.triggers.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {lead.account.triggers.map((t) => <Badge key={t} tone="info">{TRIGGER_LABELS[t]}</Badge>)}
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Workflow" />
            {can(session.role, 'lead:write') ? (
              <form action={updateLeadStageAction} className="space-y-2">
                <input type="hidden" name="leadId" value={lead.id} />
                <Field label="Stage">
                  <select name="stage" defaultValue={lead.stage} className="input py-1.5 text-xs">
                    {enumOptions(STAGE_LABELS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
                <input name="lostReason" placeholder="Reason, if lost" className="input py-1.5 text-xs" />
                <Button type="submit" size="sm">Update stage</Button>
              </form>
            ) : (
              <p className="text-sm text-ink">{STAGE_LABELS[lead.stage as LeadStage]}</p>
            )}

            {can(session.role, 'lead:assign') ? (
              <form action={assignLeadAction} className="mt-4 space-y-2 border-t border-line pt-3">
                <input type="hidden" name="leadId" value={lead.id} />
                <Field label="Owner">
                  <select name="ownerId" defaultValue={lead.ownerId ?? ''} className="input py-1.5 text-xs">
                    <option value="">Unassigned</option>
                    {members.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name}</option>)}
                  </select>
                </Field>
                <Button type="submit" size="sm">Assign</Button>
              </form>
            ) : null}

            <dl className="mt-4 space-y-2.5 border-t border-line pt-3 text-sm">
              <Row label="Campaign" value={lead.campaign?.name ?? 'None'} />
              <Row label="Touches" value={String(lead.touchCount)} />
              <Row label="Last touch" value={relativeTime(lead.lastTouchAt)} />
              <Row label="Times recommended" value={String(lead.recommendCount)} />
              <Row label="Est. value" value={formatUsd(lead.estimatedValueUsd)} />
            </dl>
          </Card>

          <Card>
            <CardHeader title="Tasks" />
            {can(session.role, 'lead:write') ? (
              <form action={createTaskAction} className="mb-3 space-y-2">
                <input type="hidden" name="leadId" value={lead.id} />
                <input name="title" required placeholder="What needs doing?" className="input py-1.5 text-xs" />
                <input name="dueAt" type="date" className="input py-1.5 text-xs" />
                <Button type="submit" size="sm">Add task</Button>
              </form>
            ) : null}
            <ul className="space-y-2">
              {lead.tasks.map((task) => (
                <li key={task.id} className="flex items-center gap-2 text-sm">
                  <form action={completeTaskAction}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <Button type="submit" size="sm" variant="ghost" title="Mark done">✓</Button>
                  </form>
                  <span className="min-w-0 flex-1">
                    <span className="block text-ink">{task.title}</span>
                    <span className="text-xs text-muted">{task.dueAt ? `Due ${formatDate(task.dueAt)}` : 'No due date'}</span>
                  </span>
                </li>
              ))}
              {lead.tasks.length === 0 ? <li className="text-sm text-muted">No open tasks.</li> : null}
            </ul>
          </Card>

          {lead.recommendations.length > 0 ? (
            <Card>
              <CardHeader title="Recommendation history" subtitle="When this lead surfaced and what happened" />
              <ul className="space-y-2 text-xs">
                {lead.recommendations.map((rec) => (
                  <li key={rec.id} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-muted">{formatDate(rec.feedDate)}</span>
                    <Badge>#{rec.rank}</Badge>
                    <Badge tone={rec.status === 'ACCEPTED' || rec.status === 'ACTIONED' ? 'ok' : 'neutral'}>
                      {rec.status.toLowerCase()}
                    </Badge>
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
