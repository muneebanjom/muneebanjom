import { describe, expect, it } from 'vitest';
import { DEFAULT_WEIGHTS, type IcpSpec, type ScoringInput } from './types';
import { bestChannel, bestOfferAngle, computeFit, computeIntent, computeUrgency, scoreLead } from './engine';
import { applyCustomRules, evaluatePredicate } from './rules';

const icp: IcpSpec = {
  name: 'GCC Regulated Enterprise',
  regions: ['UAE', 'KSA', 'GCC'],
  countries: ['AE', 'SA'],
  verticals: ['FINANCIAL_SERVICES', 'GOVERNMENT', 'ENERGY'],
  companySizes: ['MID', 'LARGE', 'ENTERPRISE'],
  personaCategories: ['CISO', 'CIO', 'HEAD_OF_GRC'],
  triggers: ['COMPLIANCE_PRESSURE', 'AI_ADOPTION'],
  offerAngles: ['CYBERSECURITY', 'COMPLIANCE_GRC', 'AI_GOVERNANCE'],
  minComplianceMaturity: 'ESTABLISHED',
  minSecurityMaturity: 'ESTABLISHED',
  minTransformationMaturity: 'ESTABLISHED',
  minAiReadiness: 'DEVELOPING',
  minEmployees: 200,
  maxEmployees: null,
  weights: DEFAULT_WEIGHTS,
};

function input(overrides: Partial<ScoringInput> = {}): ScoringInput {
  return {
    icp,
    now: new Date('2025-06-01T00:00:00Z'),
    account: {
      id: 'acc1', name: 'Gulf Union Bank', country: 'AE', region: 'UAE',
      vertical: 'FINANCIAL_SERVICES', employeeCount: 2400, companySize: 'LARGE',
      annualRevenueUsd: 1_800_000_000n, budgetPotentialUsd: 1_000_000n,
      isRegulated: true, regulators: ['CBUAE'],
      complianceMaturity: 'DEVELOPING', securityMaturity: 'DEVELOPING',
      transformationMaturity: 'ESTABLISHED', aiReadiness: 'DEVELOPING',
      triggers: ['COMPLIANCE_PRESSURE'], strategicValue: 85, isSuppressed: false,
    },
    contact: {
      id: 'c1', fullName: 'Layla Al Mansoori', title: 'Chief Information Security Officer',
      personaCategory: 'CISO', region: 'UAE', country: 'AE',
      optedOut: false, hasEmail: true, hasLinkedIn: true,
    },
    persona: {
      category: 'CISO', label: 'CISO', seniority: 92,
      titleKeywords: ['ciso', 'chief information security'],
      excludeKeywords: ['intern'],
      primaryAngles: ['CYBERSECURITY'],
      painPoints: ['control coverage lags cloud adoption'],
    },
    signals: [],
    engagement: {
      touchCount: 0, lastTouchAt: null, lastReplyAt: null, lastRecommendedAt: null,
      recommendCount: 0, stage: 'REVIEWED',
      positiveReply: false, negativeReply: false, meetingHeld: false,
    },
    ...overrides,
  };
}

describe('ICP fit', () => {
  it('scores an in-profile prospect highly', () => {
    const { score } = computeFit(input());
    expect(score).toBeGreaterThan(75);
  });

  it('penalises a prospect outside the target geography and vertical', () => {
    const out = computeFit(
      input({
        account: { ...input().account, country: 'US', region: 'NORTH_AMERICA', vertical: 'HOSPITALITY' },
      }),
    );
    expect(out.score).toBeLessThan(50);
  });

  it('zeroes persona fit when an exclusion keyword matches the title', () => {
    const result = computeFit(
      input({ contact: { ...input().contact, title: 'Security intern' } }),
    );
    const persona = result.contributions.find((c) => c.label === 'Persona fit');
    expect(persona?.points).toBe(0);
  });

  it('gives partial credit for an adjacent region', () => {
    const adjacent = computeFit(input({ account: { ...input().account, country: 'QA', region: 'GCC' } }));
    const outside = computeFit(input({ account: { ...input().account, country: 'US', region: 'NORTH_AMERICA' } }));
    expect(adjacent.score).toBeGreaterThan(outside.score);
  });

  it('is deterministic — the same input always produces the same score', () => {
    expect(scoreLead(input()).priorityScore).toBe(scoreLead(input()).priorityScore);
  });
});

describe('intent', () => {
  it('decays older signals', () => {
    const fresh = computeIntent(
      input({
        signals: [{ type: 'regulation_deadline', trigger: 'COMPLIANCE_PRESSURE', title: 'Deadline', weight: 50, observedAt: new Date('2025-05-30T00:00:00Z'), expiresAt: null }],
      }),
    );
    const stale = computeIntent(
      input({
        signals: [{ type: 'regulation_deadline', trigger: 'COMPLIANCE_PRESSURE', title: 'Deadline', weight: 50, observedAt: new Date('2024-06-01T00:00:00Z'), expiresAt: null }],
      }),
    );
    expect(fresh.score).toBeGreaterThan(stale.score);
  });

  it('forces intent to zero for an opted-out contact', () => {
    const result = computeIntent(input({ contact: { ...input().contact, optedOut: true } }));
    expect(result.score).toBe(0);
  });

  it('ignores expired signals', () => {
    const result = computeIntent(
      input({
        signals: [{ type: 'rfp', trigger: null, title: 'Closed tender', weight: 60, observedAt: new Date('2025-05-01T00:00:00Z'), expiresAt: new Date('2025-05-20T00:00:00Z') }],
      }),
    );
    expect(result.score).toBe(0);
  });
});

describe('urgency', () => {
  it('credits a recent regulatory deadline', () => {
    const result = computeUrgency(
      input({
        signals: [{ type: 'regulation_deadline', trigger: 'REGULATORY_CHANGE', title: 'CBUAE attestation deadline', weight: 40, observedAt: new Date('2025-05-15T00:00:00Z'), expiresAt: null }],
      }),
    );
    expect(result.score).toBeGreaterThanOrEqual(35);
  });

  it('does not credit an event outside its relevance window', () => {
    const result = computeUrgency(
      input({
        signals: [{ type: 'breach_disclosure', trigger: 'SECURITY_INCIDENT', title: 'Old incident', weight: 40, observedAt: new Date('2024-01-01T00:00:00Z'), expiresAt: null }],
      }),
    );
    expect(result.score).toBeLessThan(35);
  });
});

describe('angle and channel selection', () => {
  it('prefers compliance for a regulated account with a compliance gap', () => {
    expect(bestOfferAngle(input())).toBe('COMPLIANCE_GRC');
  });

  it('opens on a LinkedIn connection request for a cold contact', () => {
    expect(bestChannel(input())).toBe('LINKEDIN_CONNECTION');
  });

  it('switches to email once contact has been made', () => {
    const touched = input({ engagement: { ...input().engagement, touchCount: 2 } });
    expect(bestChannel(touched)).toBe('EMAIL');
  });
});

describe('priority', () => {
  it('suppresses a lead that was recommended yesterday', () => {
    const fresh = scoreLead(input());
    const recent = scoreLead(
      input({ engagement: { ...input().engagement, lastRecommendedAt: new Date('2025-05-31T00:00:00Z') } }),
    );
    expect(recent.priorityScore).toBeLessThan(fresh.priorityScore);
  });

  it('explains itself in plain English', () => {
    const result = scoreLead(input());
    expect(result.explanation).toContain('Gulf Union Bank');
    expect(result.explanation.length).toBeGreaterThan(80);
    expect(result.breakdown.length).toBeGreaterThan(4);
  });
});

describe('custom rules', () => {
  it('evaluates a compound predicate', () => {
    const predicate = {
      all: [
        { field: 'account.vertical', op: 'eq' as const, value: 'FINANCIAL_SERVICES' },
        { field: 'account.region', op: 'in' as const, value: ['UAE', 'KSA'] },
      ],
    };
    expect(evaluatePredicate(predicate, input())).toBe(true);
  });

  it('fails closed on an unknown field', () => {
    expect(evaluatePredicate({ field: 'account.secret', op: 'exists' }, input())).toBe(false);
  });

  it('applies matching rules only', () => {
    const contributions = applyCustomRules(
      [
        { name: 'Regulated FS', dimension: 'fit', points: 8, rationale: 'Core market.', predicate: { field: 'account.isRegulated', op: 'eq', value: true } },
        { name: 'Healthcare', dimension: 'fit', points: 5, rationale: 'n/a', predicate: { field: 'account.vertical', op: 'eq', value: 'HEALTHCARE' } },
      ],
      input(),
    );
    expect(contributions).toHaveLength(1);
    expect(contributions[0].label).toBe('Regulated FS');
  });
});
