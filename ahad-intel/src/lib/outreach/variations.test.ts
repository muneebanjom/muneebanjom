import { describe, expect, it } from 'vitest';
import { eligibleTemplates, pickVariation, templateScore, type TemplateCandidate, type VariationRequest } from './variations';
import { extractPlaceholders, renderTemplate, withinLimit } from './render';

function template(id: string, overrides: Partial<TemplateCandidate> = {}): TemplateCandidate {
  return {
    id,
    name: `Template ${id}`,
    variantKey: 'A',
    kind: 'FIRST_FOLLOW_UP',
    channel: 'LINKEDIN_MESSAGE',
    offerAngle: 'CYBERSECURITY',
    regions: [],
    personaCategories: [],
    isActive: true,
    isApproved: true,
    timesUsed: 10,
    replies: 2,
    meetings: 1,
    ...overrides,
  };
}

const request: VariationRequest = {
  angle: 'CYBERSECURITY',
  kind: 'FIRST_FOLLOW_UP',
  channel: 'LINKEDIN_MESSAGE',
  persona: 'CISO',
  region: 'UAE',
  seed: '2025-06-01:lead-1',
};

describe('variation selection', () => {
  it('never offers an unapproved template', () => {
    const pool = [template('a', { isApproved: false }), template('b')];
    expect(eligibleTemplates(pool, request).map((t) => t.id)).toEqual(['b']);
  });

  it('never offers an inactive template', () => {
    const pool = [template('a', { isActive: false }), template('b')];
    expect(eligibleTemplates(pool, request).map((t) => t.id)).toEqual(['b']);
  });

  it('respects persona and region targeting when a scoped template exists', () => {
    const pool = [
      template('scoped', { personaCategories: ['CISO'], regions: ['UAE'] }),
      template('wrong-persona', { personaCategories: ['CEO'] }),
    ];
    expect(eligibleTemplates(pool, request).map((t) => t.id)).toEqual(['scoped']);
  });

  it('falls back to the kind when no template matches the angle', () => {
    const pool = [template('other-angle', { offerAngle: 'AI_GOVERNANCE' })];
    expect(eligibleTemplates(pool, request)).toHaveLength(1);
  });

  it('returns null when nothing is eligible', () => {
    expect(pickVariation([], request)).toBeNull();
  });

  it('is deterministic for a given seed', () => {
    const pool = [template('a'), template('b', { replies: 9 }), template('c', { replies: 0 })];
    const first = pickVariation(pool, request)?.id;
    const second = pickVariation(pool, request)?.id;
    expect(first).toBe(second);
  });

  it('varies across leads so the team is not sending one message to everyone', () => {
    const pool = [
      template('a', { timesUsed: 50, replies: 20 }),
      template('b', { timesUsed: 50, replies: 18 }),
      template('c', { timesUsed: 50, replies: 16 }),
    ];
    const picks = new Set(
      Array.from({ length: 40 }, (_, i) => pickVariation(pool, { ...request, seed: `2025-06-01:lead-${i}` })?.id),
    );
    expect(picks.size).toBeGreaterThan(1);
  });

  it('scores a better-performing template higher, with smoothing for new copy', () => {
    const strong = templateScore(template('s', { timesUsed: 100, replies: 40, meetings: 10 }));
    const weak = templateScore(template('w', { timesUsed: 100, replies: 2, meetings: 0 }));
    const untested = templateScore(template('n', { timesUsed: 0, replies: 0, meetings: 0 }));
    expect(strong).toBeGreaterThan(weak);
    expect(untested).toBeGreaterThan(weak); // new copy still gets a chance
  });
});

describe('template rendering', () => {
  it('substitutes known placeholders', () => {
    const out = renderTemplate('Hi {{first_name}} at {{company}}.', { first_name: 'Layla', company: 'Gulf Union Bank' });
    expect(out).toBe('Hi Layla at Gulf Union Bank.');
  });

  it('never leaks an unresolved placeholder into a message', () => {
    const out = renderTemplate('Hi {{first_name}}, about {{trigger}}.', { first_name: 'Omar' });
    expect(out).not.toContain('{{');
    expect(out).toContain('your current priorities');
  });

  it('lists the placeholders a template uses', () => {
    expect(extractPlaceholders('{{first_name}} {{company}} {{first_name}}')).toEqual(['first_name', 'company']);
  });

  it('enforces the LinkedIn connection-note limit', () => {
    const long = 'x'.repeat(400);
    expect(withinLimit(long, 'LINKEDIN_CONNECTION', 'LINKEDIN_CONNECTION_REQUEST')).toBe(false);
    expect(withinLimit('x'.repeat(280), 'LINKEDIN_CONNECTION', 'LINKEDIN_CONNECTION_REQUEST')).toBe(true);
  });
});
