'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { assertPermission } from '@/lib/rbac';
import { audit } from '@/lib/audit';
import { assertSameWorkspace } from '@/lib/tenancy';
import { ai } from '@/lib/ai';
import { prospectContextFrom } from '@/lib/ai/context';
import { leadInclude } from '@/lib/scoring/service';

/**
 * Logs an inbound reply. The AI layer classifies sentiment and extracts signals
 * and objections; a person can correct any of it afterwards. An opt-out reply
 * suppresses the contact immediately, before anything else happens.
 */
export async function logReplyAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'lead:write');

  const parsed = z
    .object({
      leadId: z.string().min(1),
      body: z.string().min(1).max(8000),
      channel: z.string().min(1),
      draftId: z.string().optional(),
    })
    .safeParse({
      leadId: formData.get('leadId'),
      body: formData.get('body'),
      channel: formData.get('channel') ?? 'LINKEDIN_MESSAGE',
      draftId: formData.get('draftId') || undefined,
    });
  if (!parsed.success) return;

  const lead = await prisma.lead.findFirst({
    where: { id: parsed.data.leadId, workspaceId: session.workspaceId },
    include: leadInclude,
  });
  if (!lead) return;

  const analysis = await ai().summarizeThread(prospectContextFrom(lead), [
    { from: 'us', body: 'Outreach sent.' },
    { from: 'them', body: parsed.data.body },
  ]);

  const now = new Date();
  await prisma.$transaction([
    prisma.reply.create({
      data: {
        workspaceId: session.workspaceId,
        leadId: lead.id,
        draftId: parsed.data.draftId ?? null,
        channel: parsed.data.channel as never,
        body: parsed.data.body,
        summary: analysis.summary,
        sentiment: analysis.sentiment,
        buyingSignals: analysis.buyingSignals,
        objections: analysis.objections,
        receivedAt: now,
      },
    }),
    prisma.lead.update({
      where: { id: lead.id },
      data: {
        lastReplyAt: now,
        stage: analysis.sentiment === 'UNSUBSCRIBE' ? 'PARKED'
          : analysis.sentiment === 'NEGATIVE' ? 'PARKED'
          : lead.stage === 'CONTACTED' ? 'REPLIED' : lead.stage,
        nextBestAction: analysis.nextBestAction,
      },
    }),
    prisma.activityLog.create({
      data: {
        workspaceId: session.workspaceId,
        leadId: lead.id,
        actorId: session.userId,
        type: 'reply_received',
        summary: `Reply logged (${analysis.sentiment.toLowerCase().replace(/_/g, ' ')}).`,
      },
    }),
  ]);

  // An opt-out is honoured immediately and everywhere.
  if (analysis.sentiment === 'UNSUBSCRIBE') {
    await prisma.$transaction([
      prisma.contact.update({
        where: { id: lead.contactId },
        data: { optedOut: true, optedOutAt: now, doNotContactReason: 'Opted out in reply.' },
      }),
      prisma.draftMessage.updateMany({
        where: { workspaceId: session.workspaceId, leadId: lead.id, status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'] } },
        data: { status: 'ARCHIVED', rejectedReason: 'Contact opted out.' },
      }),
    ]);
    await audit(session, { action: 'contact.opt_out', entityType: 'Contact', entityId: lead.contactId, severity: 'critical' });
  }

  // Attribute the outcome back to the template that produced the conversation.
  if (parsed.data.draftId) {
    const draft = await prisma.draftMessage.findFirst({
      where: { id: parsed.data.draftId, workspaceId: session.workspaceId },
    });
    if (draft?.templateId) {
      await prisma.messageTemplate.update({
        where: { id: draft.templateId },
        data: { replies: { increment: 1 } },
      });
    }
  }

  await audit(session, { action: 'reply.log', entityType: 'Lead', entityId: lead.id, changes: { sentiment: analysis.sentiment } });
  revalidatePath('/inbox');
  revalidatePath(`/leads/${lead.id}`);
}

export async function markReplyHandledAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'lead:write');

  const replyId = String(formData.get('replyId') ?? '');
  const reply = await prisma.reply.findUnique({ where: { id: replyId } });
  assertSameWorkspace(reply, session.workspaceId, 'Reply');
  if (!reply) return;

  await prisma.reply.update({ where: { id: replyId }, data: { isHandled: true } });
  revalidatePath('/inbox');
}

export async function bookMeetingAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'lead:write');

  const parsed = z
    .object({ leadId: z.string().min(1), scheduledAt: z.string().min(1), agenda: z.string().max(500).optional() })
    .safeParse({
      leadId: formData.get('leadId'),
      scheduledAt: formData.get('scheduledAt'),
      agenda: formData.get('agenda') || undefined,
    });
  if (!parsed.success) return;

  const lead = await prisma.lead.findFirst({ where: { id: parsed.data.leadId, workspaceId: session.workspaceId } });
  if (!lead) return;

  await prisma.$transaction([
    prisma.meeting.create({
      data: {
        workspaceId: session.workspaceId,
        leadId: lead.id,
        hostId: session.userId,
        status: 'SCHEDULED',
        scheduledAt: new Date(parsed.data.scheduledAt),
        agenda: parsed.data.agenda ?? null,
      },
    }),
    prisma.lead.update({ where: { id: lead.id }, data: { stage: 'MEETING_BOOKED' } }),
    prisma.activityLog.create({
      data: {
        workspaceId: session.workspaceId,
        leadId: lead.id,
        actorId: session.userId,
        type: 'meeting_booked',
        summary: `Meeting scheduled for ${new Date(parsed.data.scheduledAt).toDateString()}.`,
      },
    }),
  ]);

  // Credit the template that produced the meeting, for variation performance.
  const draft = await prisma.draftMessage.findFirst({
    where: { workspaceId: session.workspaceId, leadId: lead.id, status: 'SENT', templateId: { not: null } },
    orderBy: { sentAt: 'desc' },
  });
  if (draft?.templateId) {
    await prisma.messageTemplate.update({ where: { id: draft.templateId }, data: { meetings: { increment: 1 } } });
  }

  await audit(session, { action: 'meeting.book', entityType: 'Lead', entityId: lead.id });
  revalidatePath('/inbox');
  revalidatePath(`/leads/${lead.id}`);
}
