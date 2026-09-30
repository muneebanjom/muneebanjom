import '../server-guard';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { clamp } from '../utils';
import { DEFAULT_WEIGHTS, type IcpSpec, type ScoreResult, type ScoringInput, type ScoreWeights } from './types';
import { scoreLead } from './engine';
import { applyCustomRules, parseRule, type CustomRule } from './rules';

/** Prisma selection that carries everything the engine needs, in one round trip. */
const leadInclude = {
  account: { include: { signals: { orderBy: { observedAt: 'desc' }, take: 40 } } },
  contact: { include: { persona: true } },
  campaign: true,
  replies: { orderBy: { receivedAt: 'desc' }, take: 20 },
  meetings: true,
} satisfies Prisma.LeadInclude;

export type ScorableLead = Prisma.LeadGetPayload<{ include: typeof leadInclude }>;

export function icpSpecFrom(profile: {
  id: string; name: string; regions: IcpSpec['regions']; countries: string[];
  verticals: IcpSpec['verticals']; companySizes: IcpSpec['companySizes'];
  personaCategories: IcpSpec['personaCategories']; triggers: IcpSpec['triggers'];
  offerAngles: IcpSpec['offerAngles']; minComplianceMaturity: IcpSpec['minComplianceMaturity'];
  minSecurityMaturity: IcpSpec['minSecurityMaturity']; minTransformationMaturity: IcpSpec['minTransformationMaturity'];
  minAiReadiness: IcpSpec['minAiReadiness']; minEmployees: number | null; maxEmployees: number | null;
  weights: Prisma.JsonValue;
}): IcpSpec {
  const raw = (profile.weights ?? {}) as Partial<ScoreWeights>;
  return {
    id: profile.id,
    name: profile.name,
    regions: profile.regions,
    countries: profile.countries,
    verticals: profile.verticals,
    companySizes: profile.companySizes,
    personaCategories: profile.personaCategories,
    triggers: profile.triggers,
    offerAngles: profile.offerAngles,
    minComplianceMaturity: profile.minComplianceMaturity,
    minSecurityMaturity: profile.minSecurityMaturity,
    minTransformationMaturity: profile.minTransformationMaturity,
    minAiReadiness: profile.minAiReadiness,
    minEmployees: profile.minEmployees,
    maxEmployees: profile.maxEmployees,
    weights: { ...DEFAULT_WEIGHTS, ...raw },
  };
}

export function buildScoringInput(lead: ScorableLead, icp: IcpSpec, now = new Date()): ScoringInput {
  const positiveReply = lead.replies.some((r) => r.sentiment === 'POSITIVE' || r.sentiment === 'REFERRAL');
  const negativeReply = lead.replies.some((r) => r.sentiment === 'NEGATIVE' || r.sentiment === 'UNSUBSCRIBE');

  return {
    icp,
    now,
    campaignPriority: lead.campaign?.priority ?? 50,
    account: {
      id: lead.account.id,
      name: lead.account.name,
      country: lead.account.country,
      region: lead.account.region,
      vertical: lead.account.vertical,
      employeeCount: lead.account.employeeCount,
      companySize: lead.account.companySize,
      annualRevenueUsd: lead.account.annualRevenueUsd,
      budgetPotentialUsd: lead.account.budgetPotentialUsd,
      isRegulated: lead.account.isRegulated,
      regulators: lead.account.regulators,
      complianceMaturity: lead.account.complianceMaturity,
      securityMaturity: lead.account.securityMaturity,
      transformationMaturity: lead.account.transformationMaturity,
      aiReadiness: lead.account.aiReadiness,
      triggers: lead.account.triggers,
      strategicValue: lead.account.strategicValue,
      isSuppressed: lead.account.isSuppressed,
    },
    contact: {
      id: lead.contact.id,
      fullName: lead.contact.fullName,
      title: lead.contact.title,
      personaCategory: lead.contact.personaCategory,
      region: lead.contact.region,
      country: lead.contact.country,
      optedOut: lead.contact.optedOut,
      hasEmail: Boolean(lead.contact.emailEnc),
      hasLinkedIn: Boolean(lead.contact.linkedinUrl),
    },
    persona: lead.contact.persona
      ? {
          category: lead.contact.persona.category,
          label: lead.contact.persona.label,
          seniority: lead.contact.persona.seniority,
          titleKeywords: lead.contact.persona.titleKeywords,
          excludeKeywords: lead.contact.persona.excludeKeywords,
          primaryAngles: lead.contact.persona.primaryAngles,
          painPoints: lead.contact.persona.painPoints,
        }
      : null,
    signals: lead.account.signals.map((s) => ({
      type: s.type,
      trigger: s.trigger,
      title: s.title,
      weight: s.weight,
      observedAt: s.observedAt,
      expiresAt: s.expiresAt,
    })),
    engagement: {
      touchCount: lead.touchCount,
      lastTouchAt: lead.lastTouchAt,
      lastReplyAt: lead.lastReplyAt,
      lastRecommendedAt: lead.lastRecommendedAt,
      recommendCount: lead.recommendCount,
      stage: lead.stage,
      positiveReply,
      negativeReply,
      meetingHeld: lead.meetings.some((m) => m.status === 'HELD'),
    },
  };
}

/** Scores with the base engine, then folds in workspace-configured rules. */
export function scoreWithRules(input: ScoringInput, rules: CustomRule[]): ScoreResult {
  const base = scoreLead(input);
  const extra = applyCustomRules(rules, input);
  if (extra.length === 0) return base;

  const delta = (dim: string) => extra.filter((c) => c.dimension === dim).reduce((s, c) => s + c.points, 0);
  const fitScore = clamp(base.fitScore + delta('fit'));
  const intentScore = clamp(base.intentScore + delta('intent'));
  const urgencyScore = clamp(base.urgencyScore + delta('urgency'));
  const dealPotential = clamp(base.dealPotential + delta('dealPotential'));
  const priorityScore = clamp(
    Math.round(0.4 * fitScore + 0.25 * intentScore + 0.2 * urgencyScore + 0.15 * dealPotential
      + base.priorityScore - (0.4 * base.fitScore + 0.25 * base.intentScore + 0.2 * base.urgencyScore + 0.15 * base.dealPotential)),
  );

  return {
    ...base,
    fitScore, intentScore, urgencyScore, dealPotential, priorityScore,
    breakdown: [...base.breakdown, ...extra],
  };
}

export async function loadScoringContext(workspaceId: string) {
  const [icpProfile, ruleRows] = await Promise.all([
    prisma.icpProfile.findFirst({
      where: { workspaceId, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    }),
    prisma.scoringRule.findMany({ where: { workspaceId, isActive: true }, orderBy: { priority: 'asc' } }),
  ]);
  if (!icpProfile) return null;
  const rules = ruleRows
    .map((r) => parseRule({ name: r.name, dimension: r.dimension, predicate: r.predicate, points: r.points, rationale: r.rationale }))
    .filter((r): r is CustomRule => r !== null);
  return { icp: icpSpecFrom(icpProfile), icpProfileId: icpProfile.id, rules };
}

/** Rescore one lead, persist the immutable score row and refresh the lead. */
export async function rescoreLead(workspaceId: string, leadId: string): Promise<ScoreResult | null> {
  const ctx = await loadScoringContext(workspaceId);
  if (!ctx) return null;
  const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId }, include: leadInclude });
  if (!lead) return null;

  const result = scoreWithRules(buildScoringInput(lead, ctx.icp), ctx.rules);
  await persistScore(workspaceId, lead.id, ctx.icpProfileId, result);
  return result;
}

export async function persistScore(
  workspaceId: string,
  leadId: string,
  icpProfileId: string | null,
  result: ScoreResult,
): Promise<void> {
  await prisma.$transaction([
    prisma.qualificationScore.create({
      data: {
        workspaceId,
        leadId,
        icpProfileId,
        fitScore: result.fitScore,
        intentScore: result.intentScore,
        urgencyScore: result.urgencyScore,
        dealPotential: result.dealPotential,
        priorityScore: result.priorityScore,
        breakdown: result.breakdown as unknown as Prisma.InputJsonValue,
        explanation: result.explanation,
        recommendedAngle: result.recommendedAngle,
        recommendedChannel: result.recommendedChannel,
        recommendedNextStep: result.recommendedNextStep,
        engineVersion: result.engineVersion,
      },
    }),
    prisma.lead.update({
      where: { id: leadId },
      data: {
        fitScore: result.fitScore,
        intentScore: result.intentScore,
        urgencyScore: result.urgencyScore,
        dealPotential: result.dealPotential,
        priorityScore: result.priorityScore,
        fitRationale: result.explanation,
        nextBestAction: result.recommendedNextStep,
        offerAngle: result.recommendedAngle,
      },
    }),
  ]);
}

/** Bulk rescore — used by the nightly job and after an ICP change. */
export async function rescoreWorkspace(workspaceId: string, limit = 2000): Promise<number> {
  const ctx = await loadScoringContext(workspaceId);
  if (!ctx) return 0;

  const leads = await prisma.lead.findMany({
    where: { workspaceId, stage: { notIn: ['WON', 'LOST'] } },
    include: leadInclude,
    take: limit,
    orderBy: { updatedAt: 'desc' },
  });

  let count = 0;
  for (const lead of leads) {
    const result = scoreWithRules(buildScoringInput(lead, ctx.icp), ctx.rules);
    await persistScore(workspaceId, lead.id, ctx.icpProfileId, result);
    count += 1;
  }
  return count;
}

export { leadInclude };
