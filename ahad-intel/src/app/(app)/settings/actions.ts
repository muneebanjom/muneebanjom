'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Role } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession, hashPassword } from '@/lib/auth';
import { assertPermission } from '@/lib/rbac';
import { audit } from '@/lib/audit';
import { assertSameWorkspace } from '@/lib/tenancy';
import { randomToken } from '@/lib/crypto';

export interface SettingsState { ok?: boolean; error?: string; note?: string }

export async function updateWorkspaceAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'workspace:write');

  const parsed = z
    .object({
      name: z.string().min(2).max(120),
      timezone: z.string().min(2).max(60),
      brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      dataRetentionDays: z.coerce.number().min(30).max(3650),
    })
    .safeParse({
      name: formData.get('name'),
      timezone: formData.get('timezone'),
      brandColor: formData.get('brandColor') || undefined,
      dataRetentionDays: formData.get('dataRetentionDays'),
    });
  if (!parsed.success) return;

  await prisma.workspace.update({
    where: { id: session.workspaceId },
    data: {
      ...parsed.data,
      requireApprovalBeforeSend: formData.get('requireApprovalBeforeSend') === 'on',
    },
  });

  await audit(session, {
    action: 'workspace.update',
    entityType: 'Workspace',
    entityId: session.workspaceId,
    changes: parsed.data,
    severity: 'notice',
  });
  revalidatePath('/settings');
}

const ROLES: [Role, ...Role[]] = ['OWNER', 'ADMIN', 'MANAGER', 'REP', 'ANALYST', 'VIEWER'];

export async function inviteMemberAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const session = await requireSession();
  assertPermission(session.role, 'member:manage');

  const parsed = z
    .object({ email: z.string().email(), name: z.string().min(2).max(120), role: z.enum(ROLES) })
    .safeParse({
      email: formData.get('email'),
      name: formData.get('name'),
      role: formData.get('role'),
    });
  if (!parsed.success) return { error: 'Provide a valid name, email and role.' };

  // Only an owner can mint another owner.
  if (parsed.data.role === 'OWNER' && session.role !== 'OWNER') {
    return { error: 'Only an owner can grant the owner role.' };
  }

  const email = parsed.data.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });

  // A temporary password is generated and shown once; there is no email
  // delivery in this deployment, so the admin passes it on out of band.
  const temporaryPassword = randomToken(9);
  const user = existing
    ?? (await prisma.user.create({
      data: { email, name: parsed.data.name, passwordHash: await hashPassword(temporaryPassword) },
    }));

  const alreadyMember = await prisma.membership.findFirst({
    where: { userId: user.id, workspaceId: session.workspaceId },
  });
  if (alreadyMember) return { error: 'That person is already a member of this workspace.' };

  await prisma.membership.create({
    data: { userId: user.id, workspaceId: session.workspaceId, role: parsed.data.role },
  });

  await audit(session, {
    action: 'member.invite',
    entityType: 'User',
    entityId: user.id,
    changes: { email, role: parsed.data.role },
    severity: 'critical',
  });
  revalidatePath('/settings');

  return {
    ok: true,
    note: existing
      ? `${parsed.data.name} was added with their existing sign-in details.`
      : `${parsed.data.name} was added. Temporary password: ${temporaryPassword} — share it securely and ask them to change it.`,
  };
}

export async function changeMemberRoleAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'member:manage');

  const membershipId = String(formData.get('membershipId') ?? '');
  const role = formData.get('role') as Role;
  if (!ROLES.includes(role)) return;

  const membership = await prisma.membership.findUnique({ where: { id: membershipId } });
  assertSameWorkspace(membership, session.workspaceId, 'Membership');
  if (!membership) return;

  if (role === 'OWNER' && session.role !== 'OWNER') return;

  // Never leave a workspace without an owner.
  if (membership.role === 'OWNER' && role !== 'OWNER') {
    const owners = await prisma.membership.count({ where: { workspaceId: session.workspaceId, role: 'OWNER' } });
    if (owners <= 1) return;
  }

  await prisma.membership.update({ where: { id: membershipId }, data: { role } });
  await audit(session, {
    action: 'member.role_change',
    entityType: 'Membership',
    entityId: membershipId,
    changes: { from: membership.role, to: role },
    severity: 'critical',
  });
  revalidatePath('/settings');
}

export async function setMemberActiveAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'member:manage');

  const userId = String(formData.get('userId') ?? '');
  const membership = await prisma.membership.findFirst({ where: { userId, workspaceId: session.workspaceId } });
  if (!membership) return;
  if (userId === session.userId) return; // never lock yourself out

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  await prisma.user.update({ where: { id: userId }, data: { isActive: !user.isActive } });
  await audit(session, {
    action: user.isActive ? 'member.deactivate' : 'member.reactivate',
    entityType: 'User',
    entityId: userId,
    severity: 'critical',
  });
  revalidatePath('/settings');
}

export async function saveTemplateAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'template:write');

  const parsed = z
    .object({
      id: z.string().optional(),
      name: z.string().min(2).max(120),
      kind: z.string().min(1),
      channel: z.string().min(1),
      offerAngle: z.string().min(1),
      tone: z.string().min(1),
      variantKey: z.string().min(1).max(4),
      body: z.string().min(10).max(5000),
      cta: z.string().max(300).optional(),
      positioningNote: z.string().max(500).optional(),
    })
    .safeParse({
      id: formData.get('id') || undefined,
      name: formData.get('name'),
      kind: formData.get('kind'),
      channel: formData.get('channel'),
      offerAngle: formData.get('offerAngle'),
      tone: formData.get('tone'),
      variantKey: formData.get('variantKey') || 'A',
      body: formData.get('body'),
      cta: formData.get('cta') || undefined,
      positioningNote: formData.get('positioningNote') || undefined,
    });
  if (!parsed.success) return;

  const data = {
    name: parsed.data.name,
    kind: parsed.data.kind as never,
    channel: parsed.data.channel as never,
    offerAngle: parsed.data.offerAngle as never,
    tone: parsed.data.tone as never,
    variantKey: parsed.data.variantKey.toUpperCase(),
    body: parsed.data.body,
    cta: parsed.data.cta ?? null,
    positioningNote: parsed.data.positioningNote ?? null,
    personaCategories: formData.getAll('personaCategories').map(String).filter(Boolean) as never,
    regions: formData.getAll('regions').map(String).filter(Boolean) as never,
    isActive: formData.get('isActive') === 'on',
  };

  if (parsed.data.id) {
    const existing = await prisma.messageTemplate.findUnique({ where: { id: parsed.data.id } });
    assertSameWorkspace(existing, session.workspaceId, 'Template');
    // Editing the copy withdraws approval — the variation picker only ever
    // suggests text that a reviewer has actually read.
    await prisma.messageTemplate.update({
      where: { id: parsed.data.id },
      data: { ...data, isApproved: existing && existing.body === data.body ? existing.isApproved : false },
    });
  } else {
    await prisma.messageTemplate.create({ data: { ...data, workspaceId: session.workspaceId, isApproved: false } });
  }

  await audit(session, {
    action: parsed.data.id ? 'template.update' : 'template.create',
    entityType: 'MessageTemplate',
    entityId: parsed.data.id ?? null,
    changes: { name: data.name, variantKey: data.variantKey },
  });
  revalidatePath('/settings');
}

export async function approveTemplateAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'template:write');

  const id = String(formData.get('templateId') ?? '');
  const template = await prisma.messageTemplate.findUnique({ where: { id } });
  assertSameWorkspace(template, session.workspaceId, 'Template');
  if (!template) return;

  await prisma.messageTemplate.update({ where: { id }, data: { isApproved: !template.isApproved } });
  await audit(session, {
    action: template.isApproved ? 'template.unapprove' : 'template.approve',
    entityType: 'MessageTemplate',
    entityId: id,
    severity: 'notice',
  });
  revalidatePath('/settings');
}
