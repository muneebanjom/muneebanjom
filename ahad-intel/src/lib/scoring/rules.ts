import { z } from 'zod';
import type { ScoreContribution, ScoringInput, Dimension } from './types';

/**
 * Declarative, workspace-configurable scoring rules (`ScoringRule.predicate`).
 * Kept deliberately small and side-effect free: an admin can add points for
 * "CISO at a regulated KSA bank" without a code change, and the rule's own
 * `rationale` flows straight into the explanation shown to the user.
 */
export const predicateSchema: z.ZodType<Predicate> = z.lazy(() =>
  z.union([
    z.object({ field: z.string().min(1), op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'contains', 'exists']), value: z.any().optional() }),
    z.object({ all: z.array(predicateSchema).min(1) }),
    z.object({ any: z.array(predicateSchema).min(1) }),
    z.object({ not: predicateSchema }),
  ]),
);

export type Predicate =
  | { field: string; op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains' | 'exists'; value?: unknown }
  | { all: Predicate[] }
  | { any: Predicate[] }
  | { not: Predicate };

export interface CustomRule {
  name: string;
  dimension: Dimension;
  predicate: Predicate;
  points: number;
  rationale: string;
}

/** Whitelisted field paths — a rule cannot reach arbitrary object internals. */
const FIELD_RESOLVERS: Record<string, (i: ScoringInput) => unknown> = {
  'account.region': (i) => i.account.region,
  'account.country': (i) => i.account.country,
  'account.vertical': (i) => i.account.vertical,
  'account.companySize': (i) => i.account.companySize,
  'account.employeeCount': (i) => i.account.employeeCount,
  'account.annualRevenueUsd': (i) => (i.account.annualRevenueUsd == null ? null : Number(i.account.annualRevenueUsd)),
  'account.isRegulated': (i) => i.account.isRegulated,
  'account.regulators': (i) => i.account.regulators,
  'account.triggers': (i) => i.account.triggers,
  'account.strategicValue': (i) => i.account.strategicValue,
  'account.complianceMaturity': (i) => i.account.complianceMaturity,
  'account.securityMaturity': (i) => i.account.securityMaturity,
  'account.transformationMaturity': (i) => i.account.transformationMaturity,
  'account.aiReadiness': (i) => i.account.aiReadiness,
  'contact.personaCategory': (i) => i.contact.personaCategory,
  'contact.title': (i) => i.contact.title,
  'contact.region': (i) => i.contact.region,
  'contact.country': (i) => i.contact.country,
  'contact.hasEmail': (i) => i.contact.hasEmail,
  'contact.hasLinkedIn': (i) => i.contact.hasLinkedIn,
  'engagement.stage': (i) => i.engagement.stage,
  'engagement.touchCount': (i) => i.engagement.touchCount,
  'engagement.recommendCount': (i) => i.engagement.recommendCount,
  'signals.types': (i) => i.signals.map((s) => s.type),
  'signals.triggers': (i) => i.signals.map((s) => s.trigger).filter(Boolean),
  'signals.count': (i) => i.signals.length,
};

export const AVAILABLE_FIELDS = Object.keys(FIELD_RESOLVERS);

function compare(actual: unknown, op: string, expected: unknown): boolean {
  switch (op) {
    case 'exists': return actual != null && actual !== '';
    case 'eq': return actual === expected;
    case 'neq': return actual !== expected;
    case 'gt': return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'gte': return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'lt': return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'lte': return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    case 'in': {
      const list = Array.isArray(expected) ? expected : [expected];
      return Array.isArray(actual) ? actual.some((a) => list.includes(a)) : list.includes(actual);
    }
    case 'nin': {
      const list = Array.isArray(expected) ? expected : [expected];
      return Array.isArray(actual) ? !actual.some((a) => list.includes(a)) : !list.includes(actual);
    }
    case 'contains':
      return typeof actual === 'string' && typeof expected === 'string'
        && actual.toLowerCase().includes(expected.toLowerCase());
    default: return false;
  }
}

export function evaluatePredicate(predicate: Predicate, input: ScoringInput): boolean {
  if ('all' in predicate) return predicate.all.every((p) => evaluatePredicate(p, input));
  if ('any' in predicate) return predicate.any.some((p) => evaluatePredicate(p, input));
  if ('not' in predicate) return !evaluatePredicate(predicate.not, input);
  const resolver = FIELD_RESOLVERS[predicate.field];
  if (!resolver) return false; // unknown field fails closed
  return compare(resolver(input), predicate.op, predicate.value);
}

export function applyCustomRules(rules: CustomRule[], input: ScoringInput): ScoreContribution[] {
  const out: ScoreContribution[] = [];
  for (const rule of rules) {
    try {
      if (evaluatePredicate(rule.predicate, input)) {
        out.push({ dimension: rule.dimension, label: rule.name, points: rule.points, rationale: rule.rationale });
      }
    } catch {
      // A malformed rule must never break scoring for the whole workspace.
      continue;
    }
  }
  return out;
}

export function parseRule(raw: { name: string; dimension: string; predicate: unknown; points: number; rationale: string }): CustomRule | null {
  const predicate = predicateSchema.safeParse(raw.predicate);
  const dimension = z.enum(['fit', 'intent', 'urgency', 'dealPotential']).safeParse(raw.dimension);
  if (!predicate.success || !dimension.success) return null;
  return { name: raw.name, dimension: dimension.data, predicate: predicate.data, points: raw.points, rationale: raw.rationale };
}
