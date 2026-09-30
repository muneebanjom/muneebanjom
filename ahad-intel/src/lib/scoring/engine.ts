import type { Channel, OfferAngle } from '@prisma/client';
import { clamp, round } from '../utils';
import {
  ANGLE_LABELS, MATURITY_RANK, PERSONA_LABELS, REGION_ADJACENCY, REGION_LABELS,
  REGULATED_VERTICALS, SIZE_RANK, VERTICAL_LABELS, countryName,
} from '../domain';
import {
  DEFAULT_WEIGHTS, ENGINE_VERSION,
  type ScoreContribution, type ScoreResult, type ScoringInput,
} from './types';

const INTENT_HALF_LIFE_DAYS = 45;

function ageDays(from: Date, now: Date): number {
  return Math.max(0, (now.getTime() - from.getTime()) / 86_400_000);
}

function decay(days: number, halfLife = INTENT_HALF_LIFE_DAYS): number {
  return 0.5 ** (days / halfLife);
}

// ---------------------------------------------------------------------------
// ICP fit
// ---------------------------------------------------------------------------

function scoreGeography(input: ScoringInput): { score: number; rationale: string } {
  const { icp, account } = input;
  const country = account.country?.toUpperCase() ?? null;
  const wantsCountry = country != null && icp.countries.map((c) => c.toUpperCase()).includes(country);
  if (wantsCountry) return { score: 100, rationale: `${countryName(country)} is a named target country.` };
  if (icp.regions.includes(account.region)) {
    return { score: 80, rationale: `${REGION_LABELS[account.region]} is a target region.` };
  }
  const adjacent = icp.regions.some((r) => REGION_ADJACENCY[r]?.includes(account.region));
  if (adjacent) return { score: 40, rationale: `${REGION_LABELS[account.region]} is adjacent to your target regions.` };
  return { score: 0, rationale: `${REGION_LABELS[account.region]} is outside your target geography.` };
}

function scoreVertical(input: ScoringInput): { score: number; rationale: string } {
  const { icp, account } = input;
  if (icp.verticals.includes(account.vertical)) {
    return { score: 100, rationale: `${VERTICAL_LABELS[account.vertical]} is a target vertical.` };
  }
  const icpHasRegulated = icp.verticals.some((v) => REGULATED_VERTICALS.includes(v));
  if (icpHasRegulated && REGULATED_VERTICALS.includes(account.vertical)) {
    return { score: 60, rationale: `${VERTICAL_LABELS[account.vertical]} is a regulated sector adjacent to your ICP.` };
  }
  return { score: 15, rationale: `${VERTICAL_LABELS[account.vertical]} is outside your target verticals.` };
}

function scorePersona(input: ScoringInput): { score: number; rationale: string } {
  const { icp, contact, persona } = input;
  const title = (contact.title ?? '').toLowerCase();

  if (persona?.excludeKeywords.some((k) => k && title.includes(k.toLowerCase()))) {
    return { score: 0, rationale: `Title "${contact.title}" matches an exclusion keyword for this persona.` };
  }

  const inIcp = icp.personaCategories.includes(contact.personaCategory);
  const seniority = persona?.seniority ?? (contact.personaCategory === 'OTHER' ? 35 : 70);
  let score = inIcp ? 60 + seniority * 0.4 : Math.min(45, seniority * 0.45);

  const keywordHit = persona?.titleKeywords.some((k) => k && title.includes(k.toLowerCase())) ?? false;
  if (keywordHit) score += 10;
  if (!contact.title) score -= 10;

  const label = PERSONA_LABELS[contact.personaCategory];
  const rationale = inIcp
    ? `${label} is a target persona${keywordHit ? ' and the title confirms the function' : ''}.`
    : `${label} is not a primary target persona for this ICP.`;
  return { score: clamp(score), rationale };
}

function scoreCompanySize(input: ScoringInput): { score: number; rationale: string } {
  const { icp, account } = input;
  const size = account.companySize;
  const employees = account.employeeCount;

  if (icp.minEmployees != null && employees != null && employees < icp.minEmployees) {
    return { score: 10, rationale: `${employees} employees is below your floor of ${icp.minEmployees}.` };
  }
  if (icp.maxEmployees != null && employees != null && employees > icp.maxEmployees) {
    return { score: 35, rationale: `${employees} employees is above your ceiling of ${icp.maxEmployees}.` };
  }
  if (!size) return { score: 45, rationale: 'Company size is unknown — enrich this account to sharpen the score.' };
  if (icp.companySizes.includes(size)) return { score: 100, rationale: `Company size band matches your ICP.` };

  const nearest = Math.min(...icp.companySizes.map((s) => Math.abs(SIZE_RANK[s] - SIZE_RANK[size])));
  if (nearest === 1) return { score: 60, rationale: 'Company size is one band away from your ICP.' };
  return { score: 20, rationale: 'Company size is well outside your ICP band.' };
}

/**
 * Maturity gap: opportunity peaks when the account is ~2 levels below the ICP
 * target. No gap means no need; a gap of 4 usually means no budget or no
 * awareness yet.
 */
function scoreMaturityGap(input: ScoringInput): { score: number; rationale: string } {
  const { icp, account } = input;
  const axes: Array<[string, number, number]> = [
    ['compliance', MATURITY_RANK[account.complianceMaturity], MATURITY_RANK[icp.minComplianceMaturity]],
    ['security', MATURITY_RANK[account.securityMaturity], MATURITY_RANK[icp.minSecurityMaturity]],
    ['transformation', MATURITY_RANK[account.transformationMaturity], MATURITY_RANK[icp.minTransformationMaturity]],
    ['AI readiness', MATURITY_RANK[account.aiReadiness], MATURITY_RANK[icp.minAiReadiness]],
  ];

  const known = axes.filter(([, current]) => current > 0);
  if (known.length === 0) {
    return { score: 50, rationale: 'Maturity is unassessed — treat as an opportunity to qualify, not a scored strength.' };
  }

  let best = 0;
  let bestAxis = '';
  for (const [axis, current, target] of known) {
    const gap = Math.max(0, (target || 3) - current);
    const value = gap === 0 ? 30 : gap === 1 ? 70 : gap === 2 ? 100 : gap === 3 ? 65 : 35;
    if (value > best) { best = value; bestAxis = axis; }
  }
  return {
    score: best,
    rationale: best >= 90
      ? `Clear ${bestAxis} gap against your target posture — the strongest opening.`
      : best >= 65
        ? `Moderate ${bestAxis} gap against your target posture.`
        : `Maturity is close to or far beyond your target on ${bestAxis || 'all axes'}.`,
  };
}

export function computeFit(input: ScoringInput): { score: number; contributions: ScoreContribution[] } {
  const w = { ...DEFAULT_WEIGHTS, ...input.icp.weights };
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 100;

  const parts = [
    { key: 'Geography fit', weight: w.geography, ...scoreGeography(input) },
    { key: 'Vertical fit', weight: w.vertical, ...scoreVertical(input) },
    { key: 'Persona fit', weight: w.persona, ...scorePersona(input) },
    { key: 'Company size fit', weight: w.companySize, ...scoreCompanySize(input) },
    { key: 'Maturity gap', weight: w.maturityGap, ...scoreMaturityGap(input) },
    {
      key: 'Strategic value',
      weight: w.strategicValue,
      score: clamp(input.account.strategicValue),
      rationale: input.account.strategicValue >= 70
        ? 'Analyst-flagged as a strategically valuable logo.'
        : 'Standard strategic value.',
    },
  ];

  const contributions: ScoreContribution[] = parts.map((p) => ({
    dimension: 'fit' as const,
    label: p.key,
    points: round((p.score * p.weight) / total, 1),
    rationale: p.rationale,
  }));

  const weighted = contributions.reduce((sum, c) => sum + c.points, 0);

  /**
   * Geography gate. Geography is a qualification, not just another weighted
   * component: a perfect-persona CISO in a market Ahad does not sell into is
   * not a 60-point prospect. Being fully outside the target geography halves
   * the fit score; partial credit scales in between.
   */
  const geography = parts[0].score;
  const gate = 0.5 + 0.5 * (geography / 100);
  const score = clamp(round(weighted * gate));

  if (gate < 1) {
    contributions.push({
      dimension: 'fit',
      label: 'Outside target geography',
      points: round(score - weighted, 1),
      rationale:
        geography === 0
          ? 'Fit is halved because this market is outside the ICP entirely — strong personas do not compensate for the wrong country.'
          : 'Fit is reduced because the geography is only a partial match.',
    });
  }

  return { score, contributions };
}

// ---------------------------------------------------------------------------
// Intent
// ---------------------------------------------------------------------------

export function computeIntent(input: ScoringInput): { score: number; contributions: ScoreContribution[] } {
  const now = input.now ?? new Date();
  const contributions: ScoreContribution[] = [];
  let score = 0;

  for (const signal of input.signals) {
    if (signal.expiresAt && signal.expiresAt < now) continue;
    const age = ageDays(signal.observedAt, now);
    const alignment = signal.trigger && input.icp.triggers.includes(signal.trigger) ? 1 : 0.6;
    const points = round(signal.weight * decay(age) * alignment, 1);
    if (points < 0.5) continue;
    score += points;
    contributions.push({
      dimension: 'intent',
      label: signal.title,
      points,
      rationale: `${Math.round(age)} day-old signal${alignment === 1 ? ' matching a target buying trigger' : ''}.`,
    });
  }

  const e = input.engagement;
  if (e.meetingHeld) {
    score += 30;
    contributions.push({ dimension: 'intent', label: 'Meeting already held', points: 30, rationale: 'An active conversation is the strongest intent signal.' });
  }
  if (e.positiveReply) {
    score += 25;
    contributions.push({ dimension: 'intent', label: 'Positive reply on file', points: 25, rationale: 'They engaged positively with earlier outreach.' });
  }
  if (e.touchCount > 0 && !e.positiveReply && !e.negativeReply) {
    contributions.push({ dimension: 'intent', label: 'Contacted, no reply yet', points: 0, rationale: `${e.touchCount} prior touch(es) without a response.` });
  }
  if (e.negativeReply) {
    score -= 40;
    contributions.push({ dimension: 'intent', label: 'Negative reply on file', points: -40, rationale: 'They declined previously — approach only with a materially new angle.' });
  }
  if (input.contact.optedOut) {
    contributions.push({ dimension: 'intent', label: 'Opted out', points: -100, rationale: 'Contact has opted out and must not be approached.' });
    return { score: 0, contributions };
  }

  if (contributions.length === 0) {
    contributions.push({ dimension: 'intent', label: 'No intent signals recorded', points: 0, rationale: 'Nothing observed yet — this is a cold, fit-led approach.' });
  }
  return { score: clamp(round(score)), contributions };
}

// ---------------------------------------------------------------------------
// Urgency
// ---------------------------------------------------------------------------

const URGENCY_RULES: Array<{ match: (t: string) => boolean; points: number; label: string; rationale: string; windowDays: number }> = [
  { match: (t) => t.includes('regulation') || t.includes('deadline'), points: 35, label: 'Regulatory deadline approaching', rationale: 'A dated compliance obligation forces a decision.', windowDays: 90 },
  { match: (t) => t.includes('breach') || t.includes('incident'), points: 30, label: 'Recent security incident', rationale: 'Post-incident windows have budget and executive attention.', windowDays: 90 },
  { match: (t) => t.includes('rfp') || t.includes('tender'), points: 30, label: 'Active tender or RFP', rationale: 'A live procurement process with a closing date.', windowDays: 60 },
  { match: (t) => t.includes('audit'), points: 25, label: 'Audit finding', rationale: 'Findings carry remediation deadlines.', windowDays: 120 },
  { match: (t) => t.includes('appoint') || t.includes('hire') || t.includes('leadership'), points: 15, label: 'Leadership change', rationale: 'New leaders reassess vendors in their first two quarters.', windowDays: 120 },
];

export function computeUrgency(input: ScoringInput): { score: number; contributions: ScoreContribution[] } {
  const now = input.now ?? new Date();
  const contributions: ScoreContribution[] = [];
  let score = 0;

  for (const signal of input.signals) {
    const haystack = `${signal.type} ${signal.title}`.toLowerCase();
    const rule = URGENCY_RULES.find((r) => r.match(haystack));
    if (!rule) continue;
    if (ageDays(signal.observedAt, now) > rule.windowDays) continue;
    score += rule.points;
    contributions.push({ dimension: 'urgency', label: rule.label, points: rule.points, rationale: rule.rationale });
  }

  if (input.account.isRegulated && input.account.regulators.length > 0 && score < 20) {
    score += 10;
    contributions.push({
      dimension: 'urgency',
      label: 'Regulated entity',
      points: 10,
      rationale: `Ongoing obligations under ${input.account.regulators.slice(0, 2).join(', ')}.`,
    });
  }

  if (contributions.length === 0) {
    contributions.push({ dimension: 'urgency', label: 'No time pressure identified', points: 0, rationale: 'No dated event is forcing a decision right now.' });
  }
  return { score: clamp(round(score)), contributions };
}

// ---------------------------------------------------------------------------
// Deal potential
// ---------------------------------------------------------------------------

export function computeDealPotential(input: ScoringInput): { score: number; contributions: ScoreContribution[] } {
  const { account, icp } = input;
  const contributions: ScoreContribution[] = [];
  let score = 0;

  const sizePoints = account.companySize ? [8, 16, 26, 34, 40][SIZE_RANK[account.companySize]] : 15;
  score += sizePoints;
  contributions.push({
    dimension: 'dealPotential', label: 'Company scale', points: sizePoints,
    rationale: account.companySize ? `Scale band contributes ${sizePoints} points of deal size.` : 'Size unknown — assumed mid-market.',
  });

  const revenue = account.annualRevenueUsd ? Number(account.annualRevenueUsd) : null;
  if (revenue != null) {
    const revPoints = revenue >= 5e9 ? 25 : revenue >= 1e9 ? 20 : revenue >= 250e6 ? 14 : revenue >= 50e6 ? 8 : 4;
    score += revPoints;
    contributions.push({ dimension: 'dealPotential', label: 'Revenue band', points: revPoints, rationale: 'Larger revenue supports a larger programme of work.' });
  }

  if (account.budgetPotentialUsd) {
    const budget = Number(account.budgetPotentialUsd);
    const budgetPoints = budget >= 1e6 ? 20 : budget >= 250e3 ? 14 : budget >= 100e3 ? 8 : 4;
    score += budgetPoints;
    contributions.push({ dimension: 'dealPotential', label: 'Estimated budget', points: budgetPoints, rationale: 'Analyst estimate of addressable budget.' });
  }

  const angleOverlap = relevantAngles(input).filter((a) => icp.offerAngles.includes(a)).length;
  const multiPoints = Math.min(15, angleOverlap * 5);
  if (multiPoints > 0) {
    score += multiPoints;
    contributions.push({
      dimension: 'dealPotential', label: 'Multi-service relevance', points: multiPoints,
      rationale: `${angleOverlap} of Ahad's service lines are relevant here.`,
    });
  }

  if (account.isRegulated) {
    const bonus = round(score * 0.15);
    score += bonus;
    contributions.push({ dimension: 'dealPotential', label: 'Regulated multiplier', points: bonus, rationale: 'Regulated entities buy assurance work repeatedly.' });
  }

  return { score: clamp(round(score)), contributions };
}

// ---------------------------------------------------------------------------
// Angle, channel, next step
// ---------------------------------------------------------------------------

/** Angles this account plausibly needs, most relevant first. */
export function relevantAngles(input: ScoringInput): OfferAngle[] {
  const { account, contact, persona } = input;
  const scored = new Map<OfferAngle, number>();
  const add = (angle: OfferAngle, points: number) => scored.set(angle, (scored.get(angle) ?? 0) + points);

  const rank = MATURITY_RANK;
  if (rank[account.complianceMaturity] <= 2) add('COMPLIANCE_GRC', 30 - rank[account.complianceMaturity] * 5);
  if (rank[account.securityMaturity] <= 2) add('CYBERSECURITY', 28 - rank[account.securityMaturity] * 5);
  if (rank[account.securityMaturity] >= 3) add('ADVANCED_CYBER_DEFENSE', 26);
  if (rank[account.securityMaturity] === 2) add('SECURITY_MODERNIZATION', 24);
  if (rank[account.transformationMaturity] <= 2) add('DIGITAL_TRANSFORMATION', 22);
  if (rank[account.aiReadiness] >= 2) add('AI_GOVERNANCE', 24);
  if (rank[account.aiReadiness] === 1) add('AI_IMPLEMENTATION', 18);
  if (account.isRegulated) { add('COMPLIANCE_GRC', 12); add('ENTERPRISE_RISK', 8); }

  for (const trigger of account.triggers) {
    const map: Partial<Record<typeof trigger, OfferAngle>> = {
      COMPLIANCE_PRESSURE: 'COMPLIANCE_GRC',
      SECURITY_INCIDENT: 'ADVANCED_CYBER_DEFENSE',
      CLOUD_MODERNIZATION: 'SECURITY_MODERNIZATION',
      DIGITAL_TRANSFORMATION: 'DIGITAL_TRANSFORMATION',
      AI_ADOPTION: 'AI_GOVERNANCE',
      GOVERNANCE_REQUIREMENT: 'COMPLIANCE_GRC',
      REGULATORY_CHANGE: 'COMPLIANCE_GRC',
      ENTERPRISE_RISK: 'ENTERPRISE_RISK',
      AUDIT_FINDING: 'COMPLIANCE_GRC',
      VENDOR_CONSOLIDATION: 'OPERATIONAL_EFFICIENCY',
      LEADERSHIP_CHANGE: 'ENTERPRISE_RISK',
      FUNDING_OR_EXPANSION: 'DIGITAL_TRANSFORMATION',
    };
    const angle = map[trigger];
    if (angle) add(angle, 20);
  }

  for (const angle of persona?.primaryAngles ?? []) add(angle, 15);

  // Boardroom personas respond to risk framing, not tooling detail.
  if (contact.personaCategory === 'CEO') add('ENTERPRISE_RISK', 12);
  if (contact.personaCategory === 'PROCUREMENT') add('OPERATIONAL_EFFICIENCY', 12);

  return [...scored.entries()].sort((a, b) => b[1] - a[1]).map(([angle]) => angle);
}

export function bestOfferAngle(input: ScoringInput): OfferAngle {
  const ranked = relevantAngles(input);
  const preferred = ranked.find((a) => input.icp.offerAngles.includes(a));
  return preferred ?? ranked[0] ?? 'CYBERSECURITY';
}

export function bestChannel(input: ScoringInput): Channel {
  const { contact, engagement } = input;
  if (engagement.touchCount > 0 && contact.hasEmail) return 'EMAIL';
  if (contact.hasLinkedIn) return engagement.touchCount === 0 ? 'LINKEDIN_CONNECTION' : 'LINKEDIN_MESSAGE';
  if (contact.hasEmail) return 'EMAIL';
  return 'OTHER';
}

function nextStep(input: ScoringInput, angle: OfferAngle): string {
  const e = input.engagement;
  const name = input.contact.fullName.split(' ')[0];
  switch (e.stage) {
    case 'REPLIED':
      return `Answer ${name}'s reply and propose two concrete meeting slots this week.`;
    case 'QUALIFIED':
      return `Send the ${ANGLE_LABELS[angle].toLowerCase()} scoping outline and confirm the decision process.`;
    case 'MEETING_BOOKED':
      return 'Prepare a tailored discovery agenda and confirm attendees.';
    case 'CONTACTED':
      return e.touchCount >= 3
        ? `Send a breakup message — three touches without a response.`
        : `Follow up with a new ${ANGLE_LABELS[angle].toLowerCase()} proof point.`;
    default:
      return input.contact.hasLinkedIn
        ? `Send a personalised LinkedIn connection request using the ${ANGLE_LABELS[angle].toLowerCase()} angle.`
        : `Open with an email using the ${ANGLE_LABELS[angle].toLowerCase()} angle.`;
  }
}

// ---------------------------------------------------------------------------
// Composite
// ---------------------------------------------------------------------------

export function computePriority(
  parts: { fit: number; intent: number; urgency: number; dealPotential: number },
  input: ScoringInput,
): { score: number; contributions: ScoreContribution[] } {
  const now = input.now ?? new Date();
  const contributions: ScoreContribution[] = [];

  let score =
    0.4 * parts.fit + 0.25 * parts.intent + 0.2 * parts.urgency + 0.15 * parts.dealPotential;

  const boost = round(((input.campaignPriority ?? 50) / 100) * 8, 1);
  if (boost) {
    score += boost;
    contributions.push({ dimension: 'fit', label: 'Campaign priority', points: boost, rationale: 'Campaign weighting applied.' });
  }

  const last = input.engagement.lastRecommendedAt;
  if (last) {
    const days = ageDays(last, now);
    const penalty = round(25 * 0.6 ** days, 1);
    if (penalty >= 0.5) {
      score -= penalty;
      contributions.push({
        dimension: 'fit', label: 'Recently recommended', points: -penalty,
        rationale: `Surfaced ${Math.round(days)} day(s) ago — suppressed to keep the feed fresh.`,
      });
    }
  }

  if (input.engagement.lastTouchAt) {
    const days = ageDays(input.engagement.lastTouchAt, now);
    if (days < 3) {
      score -= 15;
      contributions.push({ dimension: 'fit', label: 'Touched very recently', points: -15, rationale: 'Give the prospect room before the next touch.' });
    }
  }

  return { score: clamp(round(score)), contributions };
}

export function renderExplanation(input: ScoringInput, result: Omit<ScoreResult, 'explanation'>): string {
  const { contact, account } = input;
  const top = result.breakdown
    .filter((c) => c.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3);
  const negatives = result.breakdown.filter((c) => c.points < 0);

  const who = `${contact.title ?? PERSONA_LABELS[contact.personaCategory]} at ${account.name}`;
  const where = `${countryName(account.country)} · ${VERTICAL_LABELS[account.vertical]}`;
  const head = `${who} (${where}) scores ${result.priorityScore}/100 priority — fit ${result.fitScore}, intent ${result.intentScore}, urgency ${result.urgencyScore}, deal potential ${result.dealPotential}.`;
  const why = top.length ? ` Strongest drivers: ${top.map((c) => `${c.label.toLowerCase()} (${c.rationale})`).join(' ')}` : '';
  const caveat = negatives.length ? ` Held back by: ${negatives.map((c) => c.label.toLowerCase()).join(', ')}.` : '';
  const angle = ` Lead with the ${ANGLE_LABELS[result.recommendedAngle].toLowerCase()} angle.`;
  return `${head}${why}${caveat}${angle}`;
}

/** Full deterministic scoring pass for one lead. */
export function scoreLead(input: ScoringInput): ScoreResult {
  const fit = computeFit(input);
  const intent = computeIntent(input);
  const urgency = computeUrgency(input);
  const deal = computeDealPotential(input);

  const priority = computePriority(
    { fit: fit.score, intent: intent.score, urgency: urgency.score, dealPotential: deal.score },
    input,
  );

  const recommendedAngle = bestOfferAngle(input);
  const recommendedChannel = bestChannel(input);
  const breakdown = [...fit.contributions, ...intent.contributions, ...urgency.contributions, ...deal.contributions, ...priority.contributions];

  const partial: Omit<ScoreResult, 'explanation'> = {
    fitScore: fit.score,
    intentScore: intent.score,
    urgencyScore: urgency.score,
    dealPotential: deal.score,
    priorityScore: priority.score,
    breakdown,
    recommendedAngle,
    recommendedChannel,
    recommendedNextStep: nextStep(input, recommendedAngle),
    engineVersion: ENGINE_VERSION,
  };

  return { ...partial, explanation: renderExplanation(input, partial) };
}
