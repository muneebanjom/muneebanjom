import '../server-guard';
import type { Prisma, Recommendation } from '@prisma/client';
import { prisma } from '../db';
import { feedDateKey } from '../utils';
import { PERSONA_LABELS, VERTICAL_LABELS, countryName } from '../domain';
import { auditSystem } from '../audit';
import {
  buildScoringInput, leadInclude, loadScoringContext, persistScore, scoreWithRules,
  type ScorableLead,
} from '../scoring/service';
import type { ScoreResult } from '../scoring/types';
import { pickVariation, type TemplateCandidate } from '../outreach/variations';
import { DEFAULT_CAPS, assignRoundRobin, diversify, type Candidate, type DiversityCaps } from './diversify';
import { angleNote, headlineReason, reasonBullets, urgencyNote } from './reason';

export interface GenerateFeedOptions {
  workspaceId: string;
  size?: number;
  feedDate?: Date;
  caps?: Partial<DiversityCaps>;
  force?: boolean;
  generatedBy?: string;
  /** Restrict the candidate pool — used by campaign-specific feeds. */
  campaignId?: string;
  autoAssign?: boolean;
}

export interface GenerateFeedResult {
  feedId: string;
  created: number;
  candidatePoolSize: number;
  relaxations: string[];
  reused: boolean;
}

/** Stages that are never surfaced in the daily feed. */
const EXCLUDED_STAGES: Prisma.EnumLeadStageFilter = { notIn: ['WON', 'LOST'] };

export async function generateDailyFeed(options: GenerateFeedOptions): Promise<GenerateFeedResult> {
  const {
    workspaceId, size = 10, force = false, generatedBy = 'system', campaignId, autoAssign = true,
  } = options;
  const feedDate = feedDateKey(options.feedDate ?? new Date());
  const caps: DiversityCaps = { ...DEFAULT_CAPS, ...options.caps };

  const existing = await prisma.dailyFeed.findUnique({
    where: { workspaceId_feedDate: { workspaceId, feedDate } },
    include: { recommendations: { select: { id: true } } },
  });

  if (existing && !force) {
    return {
      feedId: existing.id,
      created: existing.recommendations.length,
      candidatePoolSize: existing.candidatePoolSize,
      relaxations: [],
      reused: true,
    };
  }

  const ctx = await loadScoringContext(workspaceId);
  if (!ctx) throw new Error('No active ICP profile — define an ICP before generating a feed.');

  const now = new Date();
  const leads = await prisma.lead.findMany({
    where: {
      workspaceId,
      stage: EXCLUDED_STAGES,
      ...(campaignId ? { campaignId } : {}),
      contact: { optedOut: false },
      account: { isSuppressed: false },
      OR: [{ parkedUntil: null }, { parkedUntil: { lte: now } }],
    },
    include: leadInclude,
    take: 5000,
  });

  // Score every candidate with the current ICP and rules, so ranking always
  // reflects today's configuration rather than a stale snapshot.
  const scored: Array<{ lead: ScorableLead; result: ScoreResult }> = [];
  for (const lead of leads) {
    if (lead.stage === 'PARKED' && lead.parkedUntil && lead.parkedUntil > now) continue;
    const result = scoreWithRules(buildScoringInput(lead, ctx.icp, now), ctx.rules);
    if (result.priorityScore <= 0) continue;
    scored.push({ lead, result });
  }

  const candidates: Array<Candidate & { lead: ScorableLead; result: ScoreResult }> = scored.map(({ lead, result }) => ({
    id: lead.id,
    priorityScore: result.priorityScore,
    accountId: lead.accountId,
    vertical: lead.account.vertical,
    region: lead.account.region,
    persona: lead.contact.personaCategory,
    ownerId: lead.ownerId,
    lead,
    result,
  }));

  const { selected, relaxations } = diversify(candidates, size, caps);

  const templates = await loadTemplateCandidates(workspaceId);
  const assignees = autoAssign ? await activeAssignees(workspaceId) : [];
  const assignments = assignRoundRobin(selected, assignees, caps.maxPerOwner);

  const feed = await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.recommendation.deleteMany({ where: { workspaceId, feedDate, isManualOverride: false } });
      await tx.dailyFeed.update({
        where: { id: existing.id },
        data: { size, generatedBy, candidatePoolSize: candidates.length, diversityPolicy: caps as unknown as Prisma.InputJsonValue },
      });
      return existing;
    }
    return tx.dailyFeed.create({
      data: {
        workspaceId, feedDate, size, generatedBy,
        candidatePoolSize: candidates.length,
        diversityPolicy: caps as unknown as Prisma.InputJsonValue,
      },
    });
  });

  let created = 0;
  for (const [index, candidate] of selected.entries()) {
    const { lead, result } = candidate;
    await persistScore(workspaceId, lead.id, ctx.icpProfileId, result);

    const personaLabel = lead.contact.persona?.label ?? PERSONA_LABELS[lead.contact.personaCategory];
    const topSignal = lead.account.signals[0]?.title ?? null;
    const topUrgency = result.breakdown.filter((c) => c.dimension === 'urgency' && c.points > 0).sort((a, b) => b.points - a.points)[0];

    const variation = pickVariation(templates, {
      angle: result.recommendedAngle,
      kind: lead.touchCount === 0 ? 'LINKEDIN_CONNECTION_REQUEST' : 'FIRST_FOLLOW_UP',
      channel: result.recommendedChannel,
      persona: lead.contact.personaCategory,
      region: lead.account.region,
      seed: `${feedDate.toISOString().slice(0, 10)}:${lead.id}`,
    });

    await prisma.recommendation.upsert({
      where: { workspaceId_feedDate_leadId: { workspaceId, feedDate, leadId: lead.id } },
      create: {
        workspaceId,
        feedId: feed.id,
        leadId: lead.id,
        assigneeId: assignments[index] ?? lead.ownerId ?? null,
        rank: index + 1,
        feedDate,
        fitScore: result.fitScore,
        intentScore: result.intentScore,
        urgencyScore: result.urgencyScore,
        priorityScore: result.priorityScore,
        reason: headlineReason({
          personaLabel,
          accountName: lead.account.name,
          countryLabel: countryName(lead.account.country),
          verticalLabel: VERTICAL_LABELS[lead.account.vertical],
          fitScore: result.fitScore,
          intentScore: result.intentScore,
          urgencyScore: result.urgencyScore,
          topSignal,
        }),
        reasonBullets: reasonBullets(result.breakdown),
        suggestedAngle: result.recommendedAngle,
        suggestedChannel: result.recommendedChannel,
        suggestedVariantId: variation?.id ?? null,
        messageAngleNote: angleNote(result.recommendedAngle, personaLabel),
        nextBestAction: result.recommendedNextStep,
        urgencyNote: urgencyNote(result.urgencyScore, topUrgency),
        diversityBucket: candidate.diversityBucket,
      },
      update: { rank: index + 1, feedId: feed.id },
    });

    await prisma.lead.update({
      where: { id: lead.id },
      data: { lastRecommendedAt: now, recommendCount: { increment: 1 } },
    });
    created += 1;
  }

  await auditSystem(workspaceId, {
    action: 'feed.generate',
    entityType: 'DailyFeed',
    entityId: feed.id,
    changes: { size, created, candidatePoolSize: candidates.length, relaxations, generatedBy },
  });

  return { feedId: feed.id, created, candidatePoolSize: candidates.length, relaxations, reused: false };
}

async function loadTemplateCandidates(workspaceId: string): Promise<TemplateCandidate[]> {
  const rows = await prisma.messageTemplate.findMany({
    where: { workspaceId, isActive: true, isApproved: true },
  });
  return rows.map((t) => ({
    id: t.id, name: t.name, variantKey: t.variantKey, kind: t.kind, channel: t.channel,
    offerAngle: t.offerAngle, regions: t.regions, personaCategories: t.personaCategories,
    isActive: t.isActive, isApproved: t.isApproved,
    timesUsed: t.timesUsed, replies: t.replies, meetings: t.meetings,
  }));
}

async function activeAssignees(workspaceId: string): Promise<string[]> {
  const members = await prisma.membership.findMany({
    where: { workspaceId, role: { in: ['REP', 'MANAGER'] }, user: { isActive: true } },
    select: { userId: true },
    orderBy: { createdAt: 'asc' },
  });
  return members.map((m) => m.userId);
}

export async function todaysRecommendations(workspaceId: string, feedDate = feedDateKey()): Promise<Recommendation[]> {
  return prisma.recommendation.findMany({
    where: { workspaceId, feedDate },
    orderBy: { rank: 'asc' },
  });
}
