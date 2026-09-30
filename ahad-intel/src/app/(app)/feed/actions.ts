'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { RecommendationStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { assertPermission } from '@/lib/rbac';
import { audit } from '@/lib/audit';
import { assertSameWorkspace } from '@/lib/tenancy';
import { generateDailyFeed } from '@/lib/recommendations/engine';
import { generateDraft } from '@/lib/outreach/service';
import { feedDateKey } from '@/lib/utils';

export async function generateTodaysFeedAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'feed:generate');
  const force = formData.get('force') === '1';

  const result = await generateDailyFeed({
    workspaceId: session.workspaceId,
    force,
    generatedBy: session.email,
  });

  await audit(session, {
    action: force ? 'feed.regenerate' : 'feed.generate',
    entityType: 'DailyFeed',
    entityId: result.feedId,
    changes: { created: result.created, poolSize: result.candidatePoolSize, relaxations: result.relaxations },
  });
  revalidatePath('/feed');
  revalidatePath('/');
}

const statusSchema = z.object({
  recommendationId: z.string().min(1),
  status: z.enum(['PENDING', 'ACCEPTED', 'SNOOZED', 'DISMISSED', 'ACTIONED']),
  feedback: z.string().max(500).optional(),
});

export async function setRecommendationStatusAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'feed:act');

  const parsed = statusSchema.safeParse({
    recommendationId: formData.get('recommendationId'),
    status: formData.get('status'),
    feedback: formData.get('feedback') || undefined,
  });
  if (!parsed.success) return;

  const recommendation = await prisma.recommendation.findUnique({ where: { id: parsed.data.recommendationId } });
  assertSameWorkspace(recommendation, session.workspaceId, 'Recommendation');
  if (!recommendation) return;

  const status = parsed.data.status as RecommendationStatus;
  await prisma.$transaction([
    prisma.recommendation.update({
      where: { id: recommendation.id },
      data: {
        status,
        actedAt: new Date(),
        snoozedUntil: status === 'SNOOZED' ? new Date(Date.now() + 3 * 86_400_000) : null,
      },
    }),
    prisma.recommendationHistory.create({
      data: {
        workspaceId: session.workspaceId,
        recommendationId: recommendation.id,
        leadId: recommendation.leadId,
        fromStatus: recommendation.status,
        toStatus: status,
        actorId: session.userId,
        feedback: parsed.data.feedback,
      },
    }),
    prisma.activityLog.create({
      data: {
        workspaceId: session.workspaceId,
        leadId: recommendation.leadId,
        actorId: session.userId,
        type: 'recommendation_status',
        summary: `Recommendation marked ${status.toLowerCase()}.`,
      },
    }),
  ]);

  // Accepting a recommendation moves the lead forward so the pipeline stays honest.
  if (status === 'ACCEPTED') {
    await prisma.lead.updateMany({
      where: { id: recommendation.leadId, workspaceId: session.workspaceId, stage: { in: ['IMPORTED', 'ENRICHED', 'REVIEWED'] } },
      data: { stage: 'SHORTLISTED' },
    });
  }
  if (status === 'SNOOZED') {
    await prisma.lead.updateMany({
      where: { id: recommendation.leadId, workspaceId: session.workspaceId },
      data: { parkedUntil: new Date(Date.now() + 3 * 86_400_000) },
    });
  }

  await audit(session, {
    action: `recommendation.${status.toLowerCase()}`,
    entityType: 'Recommendation',
    entityId: recommendation.id,
    changes: { from: recommendation.status, to: status, feedback: parsed.data.feedback },
  });
  revalidatePath('/feed');
}

export async function assignRecommendationAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'feed:assign');

  const recommendationId = String(formData.get('recommendationId') ?? '');
  const assigneeId = String(formData.get('assigneeId') ?? '') || null;
  if (!recommendationId) return;

  const recommendation = await prisma.recommendation.findUnique({ where: { id: recommendationId } });
  assertSameWorkspace(recommendation, session.workspaceId, 'Recommendation');
  if (!recommendation) return;

  if (assigneeId) {
    // Never assign to a user outside this workspace, whatever the form said.
    const membership = await prisma.membership.findFirst({ where: { userId: assigneeId, workspaceId: session.workspaceId } });
    if (!membership) return;
  }

  await prisma.$transaction([
    prisma.recommendation.update({ where: { id: recommendationId }, data: { assigneeId } }),
    prisma.lead.update({ where: { id: recommendation.leadId }, data: { ownerId: assigneeId } }),
  ]);

  await audit(session, {
    action: 'recommendation.assign',
    entityType: 'Recommendation',
    entityId: recommendationId,
    changes: { assigneeId },
  });
  revalidatePath('/feed');
}

export async function generateDraftFromRecommendationAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'draft:write');

  const recommendationId = String(formData.get('recommendationId') ?? '');
  const recommendation = await prisma.recommendation.findUnique({ where: { id: recommendationId } });
  assertSameWorkspace(recommendation, session.workspaceId, 'Recommendation');
  if (!recommendation) return;

  const draft = await generateDraft({
    workspaceId: session.workspaceId,
    leadId: recommendation.leadId,
    authorId: session.userId,
    senderName: session.name,
    senderCompany: session.workspaceName,
    angle: recommendation.suggestedAngle,
    channel: recommendation.suggestedChannel,
    templateId: recommendation.suggestedVariantId ?? undefined,
    recommendationId: recommendation.id,
  });

  await prisma.recommendation.update({
    where: { id: recommendation.id },
    data: { status: 'ACTIONED', actedAt: new Date() },
  });
  await prisma.recommendationHistory.create({
    data: {
      workspaceId: session.workspaceId,
      recommendationId: recommendation.id,
      leadId: recommendation.leadId,
      fromStatus: recommendation.status,
      toStatus: 'ACTIONED',
      actorId: session.userId,
      outcome: 'draft_created',
    },
  });

  await audit(session, {
    action: 'draft.generate',
    entityType: 'DraftMessage',
    entityId: draft.id,
    changes: { leadId: recommendation.leadId, angle: recommendation.suggestedAngle },
  });
  revalidatePath('/feed');
  revalidatePath('/drafts');
}

export async function overrideFeedSlotAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'feed:generate');

  const leadId = String(formData.get('leadId') ?? '');
  if (!leadId) return;
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, workspaceId: session.workspaceId },
    include: { contact: true, account: true },
  });
  if (!lead || lead.contact.optedOut) return;

  const feedDate = feedDateKey();
  const feed = await prisma.dailyFeed.findUnique({
    where: { workspaceId_feedDate: { workspaceId: session.workspaceId, feedDate } },
  });
  const maxRank = await prisma.recommendation.aggregate({
    where: { workspaceId: session.workspaceId, feedDate },
    _max: { rank: true },
  });

  await prisma.recommendation.upsert({
    where: { workspaceId_feedDate_leadId: { workspaceId: session.workspaceId, feedDate, leadId } },
    create: {
      workspaceId: session.workspaceId,
      feedId: feed?.id ?? null,
      leadId,
      rank: (maxRank._max.rank ?? 0) + 1,
      feedDate,
      fitScore: lead.fitScore,
      intentScore: lead.intentScore,
      urgencyScore: lead.urgencyScore,
      priorityScore: lead.priorityScore,
      reason: 'Added manually by a team member.',
      reasonBullets: ['Manual override — not selected by the ranking engine.'],
      suggestedAngle: lead.offerAngle ?? 'CYBERSECURITY',
      suggestedChannel: lead.channel,
      nextBestAction: lead.nextBestAction ?? 'Review and decide the approach.',
      isManualOverride: true,
      assigneeId: lead.ownerId,
    },
    update: { isManualOverride: true },
  });

  await audit(session, { action: 'feed.override', entityType: 'Lead', entityId: leadId, severity: 'notice' });
  revalidatePath('/feed');
}
