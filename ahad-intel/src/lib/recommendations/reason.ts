import type { OfferAngle } from '@prisma/client';
import type { ScoreContribution } from '../scoring/types';
import { ANGLE_LABELS, ANGLE_PITCH } from '../domain';

/**
 * Turns a score breakdown into the "why is this here?" copy on a feed card.
 * Deliberately rule-based, not model-generated, so the reason always matches
 * the score the ranking actually used.
 */
export function reasonBullets(breakdown: ScoreContribution[], max = 4): string[] {
  const positives = breakdown
    .filter((c) => c.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, max)
    .map((c) => `${c.label}: ${c.rationale}`);

  const blockers = breakdown
    .filter((c) => c.points < 0)
    .sort((a, b) => a.points - b.points)
    .slice(0, 1)
    .map((c) => `Watch-out — ${c.label.toLowerCase()}: ${c.rationale}`);

  return [...positives, ...blockers];
}

export function headlineReason(params: {
  personaLabel: string;
  accountName: string;
  countryLabel: string;
  verticalLabel: string;
  fitScore: number;
  intentScore: number;
  urgencyScore: number;
  topSignal?: string | null;
}): string {
  const { personaLabel, accountName, countryLabel, verticalLabel, fitScore, intentScore, urgencyScore, topSignal } = params;
  const base = `${personaLabel} at ${accountName} — ${verticalLabel} in ${countryLabel}.`;
  // Signal titles are quoted as written: lowercasing them mangles the acronyms
  // (NCA ECC, SAMA, CBUAE) that carry the meaning for a GCC buyer.
  if (urgencyScore >= 40 && topSignal) return `${base} Time-sensitive: ${topSignal}.`;
  if (intentScore >= 50 && topSignal) return `${base} Active signal: ${topSignal}.`;
  if (fitScore >= 75) return `${base} Very strong ICP match — worth a personal, senior approach.`;
  if (intentScore >= 25) return `${base} Early signs of activity worth testing now.`;
  return `${base} Solid ICP fit; cold approach led by relevance rather than timing.`;
}

export function urgencyNote(urgencyScore: number, topUrgency?: ScoreContribution): string | null {
  if (urgencyScore >= 55) return `High urgency — ${topUrgency?.rationale ?? 'a dated event is forcing a decision.'}`;
  if (urgencyScore >= 30) return `Moderate urgency — ${topUrgency?.label.toLowerCase() ?? 'some time pressure'}.`;
  return null;
}

export function angleNote(angle: OfferAngle, personaLabel: string): string {
  return `${ANGLE_LABELS[angle]} for a ${personaLabel}: ${ANGLE_PITCH[angle]}`;
}
