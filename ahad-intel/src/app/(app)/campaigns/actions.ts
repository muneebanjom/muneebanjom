'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { assertPermission } from '@/lib/rbac';
import { audit } from '@/lib/audit';
import { assertSameWorkspace } from '@/lib/tenancy';

function list(formData: FormData, key: string): string[] {
  return formData.getAll(key).map(String).filter(Boolean);
}

export interface CampaignState { ok?: boolean; error?: string }

export async function saveCampaignAction(_prev: CampaignState, formData: FormData): Promise<CampaignState> {
  const session = await requireSession();
  assertPermission(session.role, 'campaign:write');

  const parsed = z
    .object({
      id: z.string().optional(),
      name: z.string().min(2).max(120),
      description: z.string().max(500).optional(),
      offerAngle: z.string().min(1),
      priority: z.coerce.number().min(0).max(100),
      dailyQuota: z.coerce.number().min(1).max(100),
      goal: z.string().max(300).optional(),
    })
    .safeParse({
      id: formData.get('id') || undefined,
      name: formData.get('name'),
      description: formData.get('description') || undefined,
      offerAngle: formData.get('offerAngle'),
      priority: formData.get('priority') ?? 50,
      dailyQuota: formData.get('dailyQuota') ?? 10,
      goal: formData.get('goal') || undefined,
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the campaign details.' };

  const data = {
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    offerAngle: parsed.data.offerAngle as never,
    priority: parsed.data.priority,
    dailyQuota: parsed.data.dailyQuota,
    goal: parsed.data.goal ?? null,
    regions: list(formData, 'regions') as never,
    verticals: list(formData, 'verticals') as never,
    personaCategories: list(formData, 'personaCategories') as never,
    channels: (list(formData, 'channels').length ? list(formData, 'channels') : ['LINKEDIN_CONNECTION']) as never,
    isActive: formData.get('isActive') === 'on',
  };

  if (parsed.data.id) {
    const existing = await prisma.campaign.findUnique({ where: { id: parsed.data.id } });
    assertSameWorkspace(existing, session.workspaceId, 'Campaign');
    await prisma.campaign.update({ where: { id: parsed.data.id }, data });
  } else {
    const duplicate = await prisma.campaign.findFirst({ where: { workspaceId: session.workspaceId, name: data.name } });
    if (duplicate) return { error: 'A campaign with that name already exists.' };
    await prisma.campaign.create({ data: { ...data, workspaceId: session.workspaceId } });
  }

  await audit(session, {
    action: parsed.data.id ? 'campaign.update' : 'campaign.create',
    entityType: 'Campaign',
    entityId: parsed.data.id ?? null,
    changes: data,
  });
  revalidatePath('/campaigns');
  return { ok: true };
}

/**
 * Populates a campaign with the leads matching its own segmentation.
 * Only leads that are not already in another campaign are moved, so campaign
 * membership stays unambiguous.
 */
export async function populateCampaignAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'campaign:write');

  const campaignId = String(formData.get('campaignId') ?? '');
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  assertSameWorkspace(campaign, session.workspaceId, 'Campaign');
  if (!campaign) return;

  const result = await prisma.lead.updateMany({
    where: {
      workspaceId: session.workspaceId,
      campaignId: null,
      stage: { notIn: ['WON', 'LOST'] },
      contact: {
        optedOut: false,
        ...(campaign.personaCategories.length ? { personaCategory: { in: campaign.personaCategories } } : {}),
      },
      account: {
        isSuppressed: false,
        ...(campaign.regions.length ? { region: { in: campaign.regions } } : {}),
        ...(campaign.verticals.length ? { vertical: { in: campaign.verticals } } : {}),
      },
    },
    data: { campaignId, offerAngle: campaign.offerAngle },
  });

  await audit(session, {
    action: 'campaign.populate',
    entityType: 'Campaign',
    entityId: campaignId,
    changes: { added: result.count },
    severity: 'notice',
  });
  revalidatePath('/campaigns');
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function toggleCampaignAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'campaign:write');

  const campaignId = String(formData.get('campaignId') ?? '');
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  assertSameWorkspace(campaign, session.workspaceId, 'Campaign');
  if (!campaign) return;

  await prisma.campaign.update({ where: { id: campaignId }, data: { isActive: !campaign.isActive } });
  await audit(session, {
    action: campaign.isActive ? 'campaign.pause' : 'campaign.resume',
    entityType: 'Campaign',
    entityId: campaignId,
  });
  revalidatePath('/campaigns');
}
