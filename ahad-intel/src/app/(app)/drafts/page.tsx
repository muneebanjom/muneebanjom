import type { Metadata } from 'next';
import Link from 'next/link';
import type { DraftStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { ANGLE_LABELS, CHANNEL_LABELS, DRAFT_STATUS_LABELS, MESSAGE_KIND_LABELS, TONE_LABELS } from '@/lib/domain';
import { limitFor } from '@/lib/outreach/render';
import { relativeTime } from '@/lib/utils';
import { Badge, Button, Card, EmptyState, PageHeader, StatTile } from '@/components/ui/primitives';
import {
  approveDraftAction, markSentAction, rejectDraftAction, submitForApprovalAction,
  updateDraftAction, useAlternateAction,
} from './actions';

export const metadata: Metadata = { title: 'Outreach drafts' };
export const dynamic = 'force-dynamic';

const TABS: Array<{ key: string; label: string; statuses: DraftStatus[] }> = [
  { key: 'queue', label: 'Needs work', statuses: ['DRAFT', 'PENDING_APPROVAL'] },
  { key: 'approved', label: 'Approved', statuses: ['APPROVED'] },
  { key: 'sent', label: 'Sent', statuses: ['SENT'] },
  { key: 'rejected', label: 'Rejected', statuses: ['REJECTED', 'ARCHIVED'] },
];

export default async function DraftsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const session = await requireSession();
  const tab = TABS.find((t) => t.key === searchParams.tab) ?? TABS[0];

  const [drafts, counts, workspace] = await Promise.all([
    prisma.draftMessage.findMany({
      where: { workspaceId: session.workspaceId, status: { in: tab.statuses } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: {
        lead: {
          include: {
            contact: { select: { fullName: true, title: true, optedOut: true } },
            account: { select: { name: true } },
          },
        },
        author: { select: { name: true } },
        approver: { select: { name: true } },
        template: { select: { name: true } },
      },
    }),
    prisma.draftMessage.groupBy({ by: ['status'], where: { workspaceId: session.workspaceId }, _count: { _all: true } }),
    prisma.workspace.findUnique({ where: { id: session.workspaceId } }),
  ]);

  const countOf = (status: DraftStatus) => counts.find((c) => c.status === status)?._count._all ?? 0;
  const canApprove = can(session.role, 'draft:approve');
  const canSend = can(session.role, 'draft:send');
  const canEdit = can(session.role, 'draft:write');

  return (
    <>
      <PageHeader
        title="Outreach drafts"
        description="Every message is reviewed and approved by a person before it goes out. The platform never sends on LinkedIn or any platform that prohibits automation."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="In draft" value={countOf('DRAFT')} />
        <StatTile label="Awaiting approval" value={countOf('PENDING_APPROVAL')} tone={countOf('PENDING_APPROVAL') > 0 ? 'warn' : 'neutral'} />
        <StatTile label="Approved, ready to send" value={countOf('APPROVED')} tone="ok" />
        <StatTile label="Sent" value={countOf('SENT')} hint="Recorded after a human sent it" />
      </div>

      <nav className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={`/drafts?tab=${t.key}`} className="focus-ring rounded-full">
            <Badge tone={t.key === tab.key ? 'brand' : 'neutral'}>{t.label}</Badge>
          </Link>
        ))}
      </nav>

      {workspace?.requireApprovalBeforeSend ? (
        <p className="mb-4 rounded-xl border border-line bg-surface2 px-3.5 py-2.5 text-xs text-muted">
          Approval is required before sending, and authors cannot approve their own drafts. Editing an
          approved draft returns it to review, because approval applies to the content that was read.
        </p>
      ) : null}

      {drafts.length === 0 ? (
        <EmptyState
          title="Nothing here"
          description="Generate drafts from the daily feed or from a lead's detail page."
        />
      ) : (
        <div className="space-y-4">
          {drafts.map((draft) => {
            const alternates = (draft.alternates ?? []) as Array<{ variantKey: string; body: string; positioning: string }>;
            const limit = limitFor(draft.channel, draft.kind);
            const isSelfAuthored = draft.authorId === session.userId;
            const blockedSelfApproval = Boolean(workspace?.requireApprovalBeforeSend && isSelfAuthored);

            return (
              <Card key={draft.id}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Link href={`/leads/${draft.leadId}`} className="focus-ring text-sm font-semibold text-ink hover:text-brand">
                    {draft.lead.contact.fullName}
                  </Link>
                  <span className="text-sm text-muted">· {draft.lead.account.name}</span>
                  <Badge tone={draft.status === 'APPROVED' ? 'ok' : draft.status === 'SENT' ? 'info' : draft.status === 'REJECTED' ? 'danger' : 'neutral'}>
                    {DRAFT_STATUS_LABELS[draft.status]}
                  </Badge>
                  <Badge tone="brand">{ANGLE_LABELS[draft.offerAngle]}</Badge>
                  <Badge>{MESSAGE_KIND_LABELS[draft.kind]}</Badge>
                  <Badge>{CHANNEL_LABELS[draft.channel]}</Badge>
                  <Badge>{TONE_LABELS[draft.tone]}</Badge>
                  <Badge>variant {draft.variantKey}</Badge>
                  <span className="ml-auto text-xs text-muted">
                    {draft.author?.name ?? 'System'} · {relativeTime(draft.updatedAt)}
                  </span>
                </div>

                {draft.lead.contact.optedOut ? (
                  <p className="mb-3 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger">
                    This contact has opted out — this draft cannot be approved or sent.
                  </p>
                ) : null}

                {canEdit && draft.status !== 'SENT' ? (
                  <form action={updateDraftAction} className="space-y-2">
                    <input type="hidden" name="draftId" value={draft.id} />
                    {draft.channel === 'EMAIL' ? (
                      <input name="subject" defaultValue={draft.subject ?? ''} placeholder="Subject" className="input text-sm" />
                    ) : null}
                    <textarea
                      name="body"
                      defaultValue={draft.body}
                      rows={draft.channel === 'LINKEDIN_CONNECTION' ? 3 : 7}
                      maxLength={limit}
                      className="input resize-y font-normal"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <input name="cta" defaultValue={draft.cta ?? ''} placeholder="Call to action" className="input max-w-xs py-1.5 text-xs" />
                      <span className="text-xs text-muted">{draft.body.length}/{limit} characters</span>
                      <Button type="submit" size="sm">Save edit</Button>
                    </div>
                  </form>
                ) : (
                  <>
                    {draft.subject ? <p className="text-sm font-medium text-ink">{draft.subject}</p> : null}
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{draft.body}</p>
                  </>
                )}

                {draft.positioning ? (
                  <p className="mt-2.5 text-xs italic text-muted">
                    Why this angle: {draft.positioning}
                    {draft.template ? ` · Based on template “${draft.template.name}”` : ''}
                  </p>
                ) : null}

                {alternates.length > 0 && canEdit && draft.status !== 'SENT' ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-muted hover:text-ink">
                      {alternates.length} alternative approach{alternates.length === 1 ? '' : 'es'}
                    </summary>
                    <ul className="mt-2 space-y-2">
                      {alternates.map((alt, i) => (
                        <li key={i} className="rounded-xl border border-line p-3">
                          <div className="mb-1.5 flex items-center gap-2">
                            <Badge>variant {alt.variantKey}</Badge>
                            <form action={useAlternateAction} className="ml-auto">
                              <input type="hidden" name="draftId" value={draft.id} />
                              <input type="hidden" name="index" value={String(i)} />
                              <Button type="submit" size="sm" variant="ghost">Use this one</Button>
                            </form>
                          </div>
                          <p className="whitespace-pre-wrap text-sm text-muted">{alt.body}</p>
                          {alt.positioning ? <p className="mt-1.5 text-xs italic text-muted">{alt.positioning}</p> : null}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  {draft.status === 'DRAFT' && canEdit ? (
                    <form action={submitForApprovalAction}>
                      <input type="hidden" name="draftId" value={draft.id} />
                      <Button type="submit" variant="primary" size="sm">Submit for approval</Button>
                    </form>
                  ) : null}

                  {draft.status === 'PENDING_APPROVAL' && canApprove ? (
                    <>
                      <form action={approveDraftAction}>
                        <input type="hidden" name="draftId" value={draft.id} />
                        <Button
                          type="submit"
                          variant="primary"
                          size="sm"
                          disabled={blockedSelfApproval || draft.lead.contact.optedOut}
                          title={blockedSelfApproval ? 'Authors cannot approve their own drafts' : undefined}
                        >
                          Approve
                        </Button>
                      </form>
                      <form action={rejectDraftAction} className="flex items-center gap-2">
                        <input type="hidden" name="draftId" value={draft.id} />
                        <input name="reason" placeholder="Reason" className="input w-44 py-1.5 text-xs" />
                        <Button type="submit" variant="danger" size="sm">Reject</Button>
                      </form>
                      {blockedSelfApproval ? (
                        <span className="text-xs text-warn">You wrote this draft — another reviewer must approve it.</span>
                      ) : null}
                    </>
                  ) : null}

                  {draft.status === 'APPROVED' && canSend ? (
                    <form action={markSentAction}>
                      <input type="hidden" name="draftId" value={draft.id} />
                      <Button type="submit" variant="primary" size="sm" disabled={draft.lead.contact.optedOut}>
                        I have sent this
                      </Button>
                    </form>
                  ) : null}

                  {draft.status === 'APPROVED' ? (
                    <span className="text-xs text-muted">
                      Approved by {draft.approver?.name ?? 'a reviewer'} · copy the text and send it yourself, then record it here.
                    </span>
                  ) : null}
                  {draft.status === 'SENT' ? (
                    <span className="text-xs text-muted">Sent {relativeTime(draft.sentAt)} · recorded manually</span>
                  ) : null}
                  {draft.status === 'REJECTED' && draft.rejectedReason ? (
                    <span className="text-xs text-danger">Rejected: {draft.rejectedReason}</span>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
