'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { assertPermission } from '@/lib/rbac';
import { audit } from '@/lib/audit';
import { assertSameWorkspace } from '@/lib/tenancy';

function list(formData: FormData, key: string): string[] {
  return formData.getAll(key).map(String).filter(Boolean);
}

const weightsSchema = z.object({
  geography: z.coerce.number().min(0).max(100),
  vertical: z.coerce.number().min(0).max(100),
  persona: z.coerce.number().min(0).max(100),
  companySize: z.coerce.number().min(0).max(100),
  maturityGap: z.coerce.number().min(0).max(100),
  strategicValue: z.coerce.number().min(0).max(100),
});

export interface IcpFormState { ok?: boolean; error?: string }

export async function saveIcpProfileAction(_prev: IcpFormState, formData: FormData): Promise<IcpFormState> {
  const session = await requireSession();
  assertPermission(session.role, 'icp:write');

  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'Give the profile a name.' };

  const weights = weightsSchema.safeParse({
    geography: formData.get('w_geography'),
    vertical: formData.get('w_vertical'),
    persona: formData.get('w_persona'),
    companySize: formData.get('w_companySize'),
    maturityGap: formData.get('w_maturityGap'),
    strategicValue: formData.get('w_strategicValue'),
  });
  if (!weights.success) return { error: 'Weights must be numbers between 0 and 100.' };

  const total = Object.values(weights.data).reduce((a, b) => a + b, 0);
  if (total !== 100) return { error: `Weights must add up to 100 — they currently add up to ${total}.` };

  const data = {
    name,
    description: String(formData.get('description') ?? '') || null,
    regions: list(formData, 'regions') as never,
    countries: list(formData, 'countries').map((c) => c.toUpperCase()),
    verticals: list(formData, 'verticals') as never,
    companySizes: list(formData, 'companySizes') as never,
    personaCategories: list(formData, 'personaCategories') as never,
    triggers: list(formData, 'triggers') as never,
    offerAngles: list(formData, 'offerAngles') as never,
    minComplianceMaturity: (formData.get('minComplianceMaturity') as never) ?? 'UNKNOWN',
    minSecurityMaturity: (formData.get('minSecurityMaturity') as never) ?? 'UNKNOWN',
    minTransformationMaturity: (formData.get('minTransformationMaturity') as never) ?? 'UNKNOWN',
    minAiReadiness: (formData.get('minAiReadiness') as never) ?? 'UNKNOWN',
    minEmployees: formData.get('minEmployees') ? Number(formData.get('minEmployees')) : null,
    maxEmployees: formData.get('maxEmployees') ? Number(formData.get('maxEmployees')) : null,
    weights: weights.data as unknown as Prisma.InputJsonValue,
    notes: String(formData.get('notes') ?? '') || null,
  };

  if (id) {
    const existing = await prisma.icpProfile.findUnique({ where: { id } });
    assertSameWorkspace(existing, session.workspaceId, 'ICP profile');
    await prisma.icpProfile.update({ where: { id }, data });
  } else {
    await prisma.icpProfile.create({ data: { ...data, workspaceId: session.workspaceId } });
  }

  await audit(session, { action: id ? 'icp.update' : 'icp.create', entityType: 'IcpProfile', entityId: id || null, changes: data });
  revalidatePath('/icp');
  return { ok: true };
}

export async function setDefaultIcpAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'icp:write');

  const id = String(formData.get('id') ?? '');
  const profile = await prisma.icpProfile.findUnique({ where: { id } });
  assertSameWorkspace(profile, session.workspaceId, 'ICP profile');
  if (!profile) return;

  await prisma.$transaction([
    prisma.icpProfile.updateMany({ where: { workspaceId: session.workspaceId }, data: { isDefault: false } }),
    prisma.icpProfile.update({ where: { id }, data: { isDefault: true, isActive: true } }),
  ]);

  await audit(session, { action: 'icp.set_default', entityType: 'IcpProfile', entityId: id, severity: 'notice' });
  revalidatePath('/icp');
  revalidatePath('/feed');
}
