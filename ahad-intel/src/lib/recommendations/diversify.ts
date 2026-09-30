/**
 * Diversity-aware selection for the daily feed.
 *
 * Pure and dependency-free so it can be reasoned about and unit-tested: given a
 * ranked candidate list and per-bucket caps, return the highest-value subset
 * that avoids sending the team at ten near-identical prospects.
 *
 * If the caps cannot fill `size`, they are relaxed one dimension at a time in a
 * fixed order, so the feed is always exactly `size` when the pool allows it.
 */
export interface DiversityCaps {
  maxPerAccount: number;
  maxPerVertical: number;
  maxPerRegion: number;
  maxPerPersona: number;
  maxPerOwner: number;
}

export const DEFAULT_CAPS: DiversityCaps = {
  maxPerAccount: 1,
  maxPerVertical: 3,
  maxPerRegion: 5,
  maxPerPersona: 4,
  maxPerOwner: 4,
};

export interface DiversityKeys {
  accountId: string;
  vertical: string;
  region: string;
  persona: string;
  ownerId: string | null;
}

export interface Candidate extends DiversityKeys {
  id: string;
  priorityScore: number;
}

/**
 * Order in which caps are relaxed when the strict pass under-fills the feed.
 *
 * `maxPerAccount` is deliberately absent: one person per account per day is an
 * invariant, not a preference. Messaging three people at the same company on the
 * same morning is the failure mode this whole component exists to prevent, so an
 * under-filled feed is the better outcome.
 */
const RELAX_ORDER: Array<keyof DiversityCaps> = [
  'maxPerPersona', 'maxPerVertical', 'maxPerRegion', 'maxPerOwner',
];

export interface DiversifyResult<T extends Candidate> {
  selected: Array<T & { diversityBucket: string }>;
  relaxations: string[];
}

export function bucketOf(c: DiversityKeys): string {
  return `${c.region}:${c.vertical}:${c.persona}`;
}

export function diversify<T extends Candidate>(
  candidates: T[],
  size: number,
  caps: DiversityCaps = DEFAULT_CAPS,
): DiversifyResult<T> {
  const ranked = [...candidates].sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id));
  const relaxations: string[] = [];
  let working: DiversityCaps = { ...caps };
  let selected = greedy(ranked, size, working);

  // Relax one dimension at a time, in order, until the feed fills or the caps
  // can no longer be the limiting factor (bounded so this always terminates).
  const maxRelaxations = size * RELAX_ORDER.length;
  let guard = 0;
  while (selected.length < size && selected.length < ranked.length && guard < maxRelaxations) {
    const key = RELAX_ORDER[guard % RELAX_ORDER.length];
    working = { ...working, [key]: working[key] + 1 };
    relaxations.push(key);
    selected = greedy(ranked, size, working);
    guard += 1;
  }

  return {
    selected: selected.map((c) => ({ ...c, diversityBucket: bucketOf(c) })),
    relaxations: [...new Set(relaxations)],
  };
}

function greedy<T extends Candidate>(ranked: T[], size: number, caps: DiversityCaps): T[] {
  const counts = {
    account: new Map<string, number>(),
    vertical: new Map<string, number>(),
    region: new Map<string, number>(),
    persona: new Map<string, number>(),
    owner: new Map<string, number>(),
  };
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  const under = (m: Map<string, number>, k: string, cap: number) => (m.get(k) ?? 0) < cap;

  const out: T[] = [];
  for (const c of ranked) {
    if (out.length >= size) break;
    const ownerKey = c.ownerId ?? '__unassigned__';
    if (!under(counts.account, c.accountId, caps.maxPerAccount)) continue;
    if (!under(counts.vertical, c.vertical, caps.maxPerVertical)) continue;
    if (!under(counts.region, c.region, caps.maxPerRegion)) continue;
    if (!under(counts.persona, c.persona, caps.maxPerPersona)) continue;
    if (c.ownerId && !under(counts.owner, ownerKey, caps.maxPerOwner)) continue;

    out.push(c);
    bump(counts.account, c.accountId);
    bump(counts.vertical, c.vertical);
    bump(counts.region, c.region);
    bump(counts.persona, c.persona);
    bump(counts.owner, ownerKey);
  }
  return out;
}

/** Round-robin assignment across active reps, respecting a per-owner ceiling. */
export function assignRoundRobin<T>(items: T[], assignees: string[], maxPerAssignee: number): Array<string | null> {
  if (assignees.length === 0) return items.map(() => null);
  const load = new Map<string, number>(assignees.map((a) => [a, 0]));
  return items.map(() => {
    const next = [...load.entries()].sort((a, b) => a[1] - b[1])[0];
    if (!next || next[1] >= maxPerAssignee) return null;
    load.set(next[0], next[1] + 1);
    return next[0];
  });
}
