'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { LeadStage, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { assertPermission } from '@/lib/rbac';
import { audit } from '@/lib/audit';
import { assertSameWorkspace } from '@/lib/tenancy';
import { rescoreLead, rescoreWorkspace } from '@/lib/scoring/service';
import { STAGE_LABELS } from '@/lib/domain';

const STAGES = Object.keys(STAGE_LABELS) as [LeadStage, ...LeadStage[]];

export async function updateLeadStageAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'lead:write');

  const parsed = z
    .object({ leadId: z.string().min(1), stage: z.enum(STAGES), lostReason: z.string().max(300).optional() })
    .safeParse({
      leadId: formData.get('leadId'),
      stage: formData.get('stage'),
      lostReason: formData.get('lostReason') || undefined,
    });
  if (!parsed.success) return;

  const lead = await prisma.lead.findUnique({ where: { id: parsed.data.leadId } });
  assertSameWorkspace(lead, session.workspaceId, 'Lead');
  if (!lead) return;

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: lead.id },
      data: {
        stage: parsed.data.stage,
        lostReason: parsed.data.stage === 'LOST' ? parsed.data.lostReason ?? null : null,
        // Reaching "contacted" is the point at which a touch actually happened.
        firstTouchAt: parsed.data.stage === 'CONTACTED' && !lead.firstTouchAt ? new Date() : lead.firstTouchAt,
      },
    }),
    prisma.activityLog.create({
      data: {
        workspaceId: session.workspaceId,
        leadId: lead.id,
        actorId: session.userId,
        type: 'stage_change',
        summary: `Stage changed from ${STAGE_LABELS[lead.stage]} to ${STAGE_LABELS[parsed.data.stage]}.`,
        metadata: { from: lead.stage, to: parsed.data.stage } as Prisma.InputJsonValue,
      },
    }),
  ]);

  await audit(session, {
    action: 'lead.stage_change',
    entityType: 'Lead',
    entityId: lead.id,
    changes: { from: lead.stage, to: parsed.data.stage },
  });
  revalidatePath('/leads');
  revalidatePath(`/leads/${lead.id}`);
}

export async function assignLeadAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'lead:assign');

  const leadId = String(formData.get('leadId') ?? '');
  const ownerId = String(formData.get('ownerId') ?? '') || null;
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  assertSameWorkspace(lead, session.workspaceId, 'Lead');
  if (!lead) return;

  if (ownerId) {
    const membership = await prisma.membership.findFirst({ where: { userId: ownerId, workspaceId: session.workspaceId } });
    if (!membership) return;
  }

  await prisma.lead.update({ where: { id: leadId }, data: { ownerId } });
  await audit(session, { action: 'lead.assign', entityType: 'Lead', entityId: leadId, changes: { ownerId } });
  revalidatePath('/leads');
  revalidatePath(`/leads/${leadId}`);
}

export async function addNoteAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'lead:write');

  const parsed = z.object({ leadId: z.string().min(1), body: z.string().min(1).max(4000) }).safeParse({
    leadId: formData.get('leadId'),
    body: formData.get('body'),
  });
  if (!parsed.success) return;

  const lead = await prisma.lead.findUnique({ where: { id: parsed.data.leadId } });
  assertSameWorkspace(lead, session.workspaceId, 'Lead');
  if (!lead) return;

  await prisma.note.create({
    data: {
      workspaceId: session.workspaceId,
      leadId: lead.id,
      accountId: lead.accountId,
      contactId: lead.contactId,
      authorId: session.userId,
      body: parsed.data.body,
    },
  });
  await audit(session, { action: 'note.create', entityType: 'Lead', entityId: lead.id });
  revalidatePath(`/leads/${lead.id}`);
}

export async function createTaskAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'lead:write');

  const parsed = z
    .object({
      leadId: z.string().min(1),
      title: z.string().min(1).max(200),
      dueAt: z.string().optional(),
    })
    .safeParse({
      leadId: formData.get('leadId'),
      title: formData.get('title'),
      dueAt: formData.get('dueAt') || undefined,
    });
  if (!parsed.success) return;

  const lead = await prisma.lead.findUnique({ where: { id: parsed.data.leadId } });
  assertSameWorkspace(lead, session.workspaceId, 'Lead');
  if (!lead) return;

  await prisma.task.create({
    data: {
      workspaceId: session.workspaceId,
      leadId: lead.id,
      assigneeId: lead.ownerId ?? session.userId,
      title: parsed.data.title,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
    },
  });
  revalidatePath(`/leads/${lead.id}`);
}

export async function completeTaskAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'lead:write');
  const taskId = String(formData.get('taskId') ?? '');
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  assertSameWorkspace(task, session.workspaceId, 'Task');
  if (!task) return;

  await prisma.task.update({ where: { id: taskId }, data: { status: 'DONE' } });
  revalidatePath(`/leads/${task.leadId ?? ''}`);
}

export async function rescoreLeadAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'lead:write');
  const leadId = String(formData.get('leadId') ?? '');
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  assertSameWorkspace(lead, session.workspaceId, 'Lead');
  if (!lead) return;

  await rescoreLead(session.workspaceId, leadId);
  await audit(session, { action: 'lead.rescore', entityType: 'Lead', entityId: leadId });
  revalidatePath(`/leads/${leadId}`);
}

export async function rescoreWorkspaceAction(): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'icp:write');
  const count = await rescoreWorkspace(session.workspaceId);
  await audit(session, {
    action: 'workspace.rescore',
    entityType: 'Workspace',
    entityId: session.workspaceId,
    changes: { rescored: count },
    severity: 'notice',
  });
  revalidatePath('/leads');
  revalidatePath('/icp');
}

export async function suppressAccountAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'lead:write');

  const accountId = String(formData.get('accountId') ?? '');
  const reason = String(formData.get('reason') ?? '').slice(0, 300);
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  assertSameWorkspace(account, session.workspaceId, 'Account');
  if (!account) return;

  await prisma.account.update({
    where: { id: accountId },
    data: { isSuppressed: !account.isSuppressed, suppressionReason: account.isSuppressed ? null : reason || 'Suppressed by a team member.' },
  });
  await audit(session, {
    action: account.isSuppressed ? 'account.unsuppress' : 'account.suppress',
    entityType: 'Account',
    entityId: accountId,
    changes: { reason },
    severity: 'notice',
  });
  revalidatePath(`/accounts/${accountId}`);
  revalidatePath('/leads');
}

/** Right to erasure: removes the person's data while keeping aggregate history. */
export async function optOutContactAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'lead:write');

  const contactId = String(formData.get('contactId') ?? '');
  const reason = String(formData.get('reason') ?? '').slice(0, 300);
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  assertSameWorkspace(contact, session.workspaceId, 'Contact');
  if (!contact) return;

  await prisma.$transaction([
    prisma.contact.update({
      where: { id: contactId },
      data: { optedOut: true, optedOutAt: new Date(), doNotContactReason: reason || 'Opted out.' },
    }),
    prisma.lead.updateMany({
      where: { contactId, workspaceId: session.workspaceId, stage: { notIn: ['WON', 'LOST'] } },
      data: { stage: 'PARKED' },
    }),
    prisma.draftMessage.updateMany({
      where: { workspaceId: session.workspaceId, lead: { contactId }, status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'] } },
      data: { status: 'ARCHIVED', rejectedReason: 'Contact opted out.' },
    }),
  ]);

  await audit(session, {
    action: 'contact.opt_out',
    entityType: 'Contact',
    entityId: contactId,
    changes: { reason },
    severity: 'critical',
  });
  revalidatePath('/leads');
}

export async function saveSegmentAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'lead:write');

  const name = String(formData.get('name') ?? '').trim().slice(0, 100);
  if (!name) return;
  const definition = {
    region: String(formData.get('region') ?? '') || null,
    vertical: String(formData.get('vertical') ?? '') || null,
    persona: String(formData.get('persona') ?? '') || null,
    stage: String(formData.get('stage') ?? '') || null,
    owner: String(formData.get('owner') ?? '') || null,
    q: String(formData.get('q') ?? '') || null,
  };

  await prisma.segment.upsert({
    where: { workspaceId_name: { workspaceId: session.workspaceId, name } },
    create: { workspaceId: session.workspaceId, name, definition: definition as Prisma.InputJsonValue, isPinned: true },
    update: { definition: definition as Prisma.InputJsonValue },
  });
  await audit(session, { action: 'segment.save', entityType: 'Segment', changes: { name, definition } });
  revalidatePath('/leads');
}
