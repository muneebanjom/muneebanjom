import type { Channel, MessageKind, OfferAngle, PersonaCategory, Region } from '@prisma/client';
import { seededRandom } from '../crypto';

/**
 * Chooses which approved message variation to suggest.
 *
 * Only approved, active templates are eligible (acceptance criterion: the system
 * randomizes among *approved* variations). Selection is weighted by observed
 * reply rate with Laplace smoothing, with an exploration floor so new variants
 * still get airtime, and seeded so a given day's feed is reproducible.
 */
export interface TemplateCandidate {
  id: string;
  name: string;
  variantKey: string;
  kind: MessageKind;
  channel: Channel;
  offerAngle: OfferAngle;
  regions: Region[];
  personaCategories: PersonaCategory[];
  isActive: boolean;
  isApproved: boolean;
  timesUsed: number;
  replies: number;
  meetings: number;
}

export interface VariationRequest {
  angle: OfferAngle;
  kind: MessageKind;
  channel: Channel;
  persona: PersonaCategory;
  region: Region;
  seed: string;
  explorationRate?: number; // ε — share of picks reserved for exploration
}

/** Smoothed reply rate: new templates start neutral rather than at zero. */
export function templateScore(t: TemplateCandidate): number {
  const replyRate = (t.replies + 1) / (t.timesUsed + 2);
  const meetingRate = (t.meetings + 0.5) / (t.timesUsed + 2);
  return replyRate + meetingRate * 0.5;
}

export function eligibleTemplates(all: TemplateCandidate[], req: VariationRequest): TemplateCandidate[] {
  const approved = all.filter((t) => t.isActive && t.isApproved);
  const byAngleKind = approved.filter((t) => t.offerAngle === req.angle && t.kind === req.kind);
  const pool = byAngleKind.length ? byAngleKind : approved.filter((t) => t.kind === req.kind);

  const scoped = pool.filter(
    (t) =>
      (t.personaCategories.length === 0 || t.personaCategories.includes(req.persona)) &&
      (t.regions.length === 0 || t.regions.includes(req.region)),
  );
  return scoped.length ? scoped : pool;
}

export function pickVariation(all: TemplateCandidate[], req: VariationRequest): TemplateCandidate | null {
  const pool = eligibleTemplates(all, req);
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];

  const rand = seededRandom(`${req.seed}:${req.angle}:${req.kind}`);
  const epsilon = req.explorationRate ?? 0.2;

  // Exploration: uniformly sample the least-used variants so new copy gets tested.
  if (rand() < epsilon) {
    const minUsed = Math.min(...pool.map((t) => t.timesUsed));
    const fresh = pool.filter((t) => t.timesUsed === minUsed);
    return fresh[Math.floor(rand() * fresh.length)] ?? pool[0];
  }

  // Exploitation: weighted draw by smoothed performance.
  const weights = pool.map(templateScore);
  const total = weights.reduce((a, b) => a + b, 0);
  let ticket = rand() * total;
  for (let i = 0; i < pool.length; i += 1) {
    ticket -= weights[i];
    if (ticket <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** Up to `count` distinct alternates, for the "show me other approaches" control. */
export function alternateVariations(all: TemplateCandidate[], req: VariationRequest, chosenId: string, count = 2): TemplateCandidate[] {
  return eligibleTemplates(all, req)
    .filter((t) => t.id !== chosenId)
    .sort((a, b) => templateScore(b) - templateScore(a))
    .slice(0, count);
}
