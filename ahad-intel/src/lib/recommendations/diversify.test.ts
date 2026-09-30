import { describe, expect, it } from 'vitest';
import { DEFAULT_CAPS, assignRoundRobin, diversify, type Candidate } from './diversify';

function candidate(id: string, priority: number, overrides: Partial<Candidate> = {}): Candidate {
  return {
    id,
    priorityScore: priority,
    accountId: `acc-${id}`,
    vertical: 'FINANCIAL_SERVICES',
    region: 'UAE',
    persona: 'CISO',
    ownerId: null,
    ...overrides,
  };
}

describe('diversify', () => {
  it('returns the highest-priority candidates first', () => {
    const pool = [candidate('a', 50), candidate('b', 90), candidate('c', 70)].map((c, i) => ({
      ...c,
      vertical: ['FINANCIAL_SERVICES', 'ENERGY', 'GOVERNMENT'][i],
      region: ['UAE', 'KSA', 'GCC'][i],
      persona: ['CISO', 'CIO', 'HEAD_OF_GRC'][i],
    }));
    const { selected } = diversify(pool, 3);
    expect(selected[0].id).toBe('b');
  });

  it('never puts two people from the same account in one feed', () => {
    const pool = Array.from({ length: 6 }, (_, i) =>
      candidate(`p${i}`, 90 - i, { accountId: 'same-account', persona: `P${i}`, vertical: `V${i}`, region: `R${i}` }),
    );
    const { selected } = diversify(pool, 10);
    expect(selected).toHaveLength(1);
  });

  it('caps how many of one vertical can appear while alternatives exist', () => {
    // Six energy leads score highest, but four other verticals are available,
    // so the strict pass must reach past energy rather than fill the feed with it.
    const energy = Array.from({ length: 6 }, (_, i) =>
      candidate(`e${i}`, 95 - i, { accountId: `acc-e${i}`, vertical: 'ENERGY', region: `R${i % 3}`, persona: `P${i % 3}` }),
    );
    const others = Array.from({ length: 8 }, (_, i) =>
      candidate(`o${i}`, 60 - i, { accountId: `acc-o${i}`, vertical: `V${i % 4}`, region: `R${i % 3}`, persona: `P${i % 3}` }),
    );

    const { selected, relaxations } = diversify([...energy, ...others], 10, { ...DEFAULT_CAPS, maxPerVertical: 3 });
    expect(selected.filter((c) => c.vertical === 'ENERGY')).toHaveLength(3);
    expect(selected).toHaveLength(10);
    expect(relaxations).not.toContain('maxPerAccount');
  });

  it('under-fills rather than putting a second person from one account in the feed', () => {
    // Only three accounts exist, so ten slots cannot be filled without breaking
    // the one-per-account invariant. Under-filling is the correct outcome.
    const pool = Array.from({ length: 9 }, (_, i) =>
      candidate(`p${i}`, 90 - i, { accountId: `acc-${i % 3}`, vertical: `V${i % 3}`, region: `R${i % 3}`, persona: `P${i % 3}` }),
    );
    const { selected } = diversify(pool, 10);
    expect(selected).toHaveLength(3);
  });

  it('relaxes caps rather than under-filling when the pool allows it', () => {
    const pool = Array.from({ length: 12 }, (_, i) =>
      candidate(`p${i}`, 90 - i, {
        accountId: `acc-${i}`,
        vertical: i % 2 === 0 ? 'ENERGY' : 'TELECOM',
        region: 'UAE',
        persona: 'CISO',
      }),
    );
    const { selected, relaxations } = diversify(pool, 10);
    expect(selected).toHaveLength(10);
    expect(relaxations.length).toBeGreaterThan(0);
  });

  it('is stable — the same pool yields the same feed', () => {
    const pool = Array.from({ length: 20 }, (_, i) =>
      candidate(`p${i}`, 80, { accountId: `acc-${i}`, vertical: `V${i % 5}`, region: `R${i % 3}`, persona: `P${i % 4}` }),
    );
    const first = diversify(pool, 10).selected.map((c) => c.id);
    const second = diversify([...pool].reverse(), 10).selected.map((c) => c.id);
    expect(first).toEqual(second);
  });

  it('labels each selection with the bucket it balanced', () => {
    const { selected } = diversify([candidate('a', 50)], 1);
    expect(selected[0].diversityBucket).toBe('UAE:FINANCIAL_SERVICES:CISO');
  });
});

describe('assignRoundRobin', () => {
  it('spreads work evenly across assignees', () => {
    const assignments = assignRoundRobin([1, 2, 3, 4], ['u1', 'u2'], 4);
    expect(assignments.filter((a) => a === 'u1')).toHaveLength(2);
    expect(assignments.filter((a) => a === 'u2')).toHaveLength(2);
  });

  it('stops assigning once the per-owner ceiling is reached', () => {
    const assignments = assignRoundRobin([1, 2, 3, 4], ['u1'], 2);
    expect(assignments.filter((a) => a === 'u1')).toHaveLength(2);
    expect(assignments.filter((a) => a === null)).toHaveLength(2);
  });

  it('returns unassigned when there is nobody to assign to', () => {
    expect(assignRoundRobin([1, 2], [], 5)).toEqual([null, null]);
  });
});
