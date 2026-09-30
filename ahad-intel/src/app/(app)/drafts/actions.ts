'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { assertPermission } from '@/lib/rbac';
import { audit } from '@/lib/audit';
import { assertSameWorkspace } from '@/lib/tenancy';
import { generateDraft } from '@/lib/outreach/service';
import { limitFor } from '@/lib/outreach/render';

export async function generateDraftForLeadAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'draft:write');

  const leadId = String(formData.get('leadId') ?? '');
  const kind = (formData.get('kind') as never) || undefined;
  const angle = (formData.get('angle') as never) || undefined;
  const tone = (formData.get('tone') as never) || undefined;

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, workspaceId: session.workspaceId },
    include: { contact: { select: { optedOut: true } } },
  });
  if (!lead || lead.contact.optedOut) return;

  const draft = await generateDraft({
    workspaceId: session.workspaceId,
    leadId,
    authorId: session.userId,
    senderName: session.name,
    senderCompany: session.workspaceName,
    kind, angle, tone,
  });

  await audit(session, { action: 'draft.generate', entityType: 'DraftMessage', entityId: draft.id, changes: { leadId } });
  revalidatePath('/drafts');
  revalidatePath(`/leads/${leadId}`);
}

const updateSchema = z.object({
  draftId: z.string().min(1),
  subject: z.string().max(300).optional(),
  body: z.string().min(1).max(8000),
  cta: z.string().max(300).optional(),
});

export async function updateDraftAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'draft:write');

  const parsed = updateSchema.safeParse({
    draftId: formData.get('draftId'),
    subject: formData.get('subject') || undefined,
    body: formData.get('body'),
    cta: formData.get('cta') || undefined,
  });
  if (!parsed.success) return;

  const draft = await prisma.draftMessage.findUnique({ where: { id: parsed.data.draftId } });
  assertSameWorkspace(draft, session.workspaceId, 'Draft');
  if (!draft || draft.status === 'SENT') return;

  // Editing an approved draft sends it back for approval — approval is on content.
  const limit = limitFor(draft.channel, draft.kind);
  await prisma.draftMessage.update({
    where: { id: draft.id },
    data: {
      subject: parsed.data.subject ?? null,
      body: parsed.data.body.slice(0, limit),
      cta: parsed.data.cta ?? null,
      generator: 'human',
      status: draft.status === 'APPROVED' ? 'DRAFT' : draft.status,
      approverId: draft.status === 'APPROVED' ? null : draft.approverId,
      approvedAt: draft.status === 'APPROVED' ? null : draft.approvedAt,
    },
  });

  await audit(session, { action: 'draft.update', entityType: 'DraftMessage', entityId: draft.id });
  revalidatePath('/drafts');
}

export async function submitForApprovalAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'draft:write');

  const draftId = String(formData.get('draftId') ?? '');
  const draft = await prisma.draftMessage.findUnique({ where: { id: draftId } });
  assertSameWorkspace(draft, session.workspaceId, 'Draft');
  if (!draft || draft.status !== 'DRAFT') return;

  await prisma.draftMessage.update({ where: { id: draftId }, data: { status: 'PENDING_APPROVAL' } });
  await audit(session, { action: 'draft.submit', entityType: 'DraftMessage', entityId: draftId });
  revalidatePath('/drafts');
}

export async function approveDraftAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'draft:approve');

  const draftId = String(formData.get('draftId') ?? '');
  const draft = await prisma.draftMessage.findUnique({
    where: { id: draftId },
    include: { lead: { include: { contact: { select: { optedOut: true } } } } },
  });
  assertSameWorkspace(draft, session.workspaceId, 'Draft');
  if (!draft || draft.status !== 'PENDING_APPROVAL') return;
  if (draft.lead.contact.optedOut) return;

  // Separation of duties: an author cannot approve their own message when the
  // workspace requires review before sending.
  const workspace = await prisma.workspace.findUnique({ where: { id: session.workspaceId } });
  if (workspace?.requireApprovalBeforeSend && draft.authorId === session.userId) {
    await audit(session, {
      action: 'draft.approve_denied',
      entityType: 'DraftMessage',
      entityId: draftId,
      changes: { reason: 'self-approval blocked' },
      severity: 'warning',
    });
    return;
  }

  await prisma.draftMessage.update({
    where: { id: draftId },
    data: { status: 'APPROVED', approverId: session.userId, approvedAt: new Date(), rejectedReason: null },
  });
  await audit(session, { action: 'draft.approve', entityType: 'DraftMessage', entityId: draftId, severity: 'notice' });
  revalidatePath('/drafts');
}

export async function rejectDraftAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'draft:approve');

  const draftId = String(formData.get('draftId') ?? '');
  const reason = String(formData.get('reason') ?? '').slice(0, 300);
  const draft = await prisma.draftMessage.findUnique({ where: { id: draftId } });
  assertSameWorkspace(draft, session.workspaceId, 'Draft');
  if (!draft) return;

  await prisma.draftMessage.update({
    where: { id: draftId },
    data: { status: 'REJECTED', rejectedReason: reason || 'Rejected on review.', approverId: session.userId },
  });
  await audit(session, { action: 'draft.reject', entityType: 'DraftMessage', entityId: draftId, changes: { reason } });
  revalidatePath('/drafts');
}

/**
 * Records that a human sent an approved message themselves. The platform never
 * sends on LinkedIn or any platform that prohibits automation — this only marks
 * the outcome so tracking and template performance stay accurate.
 */
export async function markSentAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'draft:send');

  const draftId = String(formData.get('draftId') ?? '');
  const draft = await prisma.draftMessage.findUnique({
    where: { id: draftId },
    include: { lead: { include: { contact: { select: { optedOut: true } } } } },
  });
  assertSameWorkspace(draft, session.workspaceId, 'Draft');
  if (!draft || draft.status !== 'APPROVED' || draft.lead.contact.optedOut) return;

  const now = new Date();
  await prisma.$transaction([
    prisma.draftMessage.update({ where: { id: draftId }, data: { status: 'SENT', sentAt: now, sentVia: 'manual' } }),
    prisma.lead.update({
      where: { id: draft.leadId },
      data: {
        stage: draft.lead.stage === 'SHORTLISTED' || draft.lead.stage === 'REVIEWED' || draft.lead.stage === 'IMPORTED' || draft.lead.stage === 'ENRICHED'
          ? 'CONTACTED'
          : draft.lead.stage,
        touchCount: { increment: 1 },
        lastTouchAt: now,
        firstTouchAt: draft.lead.firstTouchAt ?? now,
      },
    }),
    prisma.activityLog.create({
      data: {
        workspaceId: session.workspaceId,
        leadId: draft.leadId,
        actorId: session.userId,
        type: 'draft_sent',
        summary: `Approved ${draft.kind.toLowerCase().replace(/_/g, ' ')} sent manually via ${draft.channel.toLowerCase().replace(/_/g, ' ')}.`,
      },
    }),
  ]);

  await audit(session, { action: 'draft.mark_sent', entityType: 'DraftMessage', entityId: draftId, severity: 'notice' });
  revalidatePath('/drafts');
  revalidatePath(`/leads/${draft.leadId}`);
}

export async function useAlternateAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'draft:write');

  const draftId = String(formData.get('draftId') ?? '');
  const index = Number(formData.get('index') ?? -1);
  const draft = await prisma.draftMessage.findUnique({ where: { id: draftId } });
  assertSameWorkspace(draft, session.workspaceId, 'Draft');
  if (!draft || draft.status === 'SENT') return;

  const alternates = (draft.alternates ?? []) as Array<{ variantKey: string; body: string; positioning: string }>;
  const chosen = alternates[index];
  if (!chosen) return;

  // Swap the chosen alternate into the main slot and keep the previous body as an option.
  const remaining = alternates.filter((_, i) => i !== index);
  await prisma.draftMessage.update({
    where: { id: draftId },
    data: {
      body: chosen.body,
      positioning: chosen.positioning,
      variantKey: chosen.variantKey,
      status: 'DRAFT',
      approverId: null,
      approvedAt: null,
      alternates: [...remaining, { variantKey: draft.variantKey, body: draft.body, positioning: draft.positioning ?? '' }] as never,
    },
  });

  await audit(session, { action: 'draft.use_alternate', entityType: 'DraftMessage', entityId: draftId, changes: { variantKey: chosen.variantKey } });
  revalidatePath('/drafts');
}
