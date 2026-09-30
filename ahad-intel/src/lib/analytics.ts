import './server-guard';
import { prisma } from './db';
import { pct } from './utils';
import {
  ANGLE_LABELS, PERSONA_LABELS, REGION_LABELS, STAGE_LABELS, STAGE_ORDER, VERTICAL_LABELS, countryName,
} from './domain';

export interface Slice { key: string; label: string; value: number; secondary?: number }

export interface FunnelStep { stage: string; label: string; count: number; conversion: number }

export interface AnalyticsSnapshot {
  totals: {
    leads: number; accounts: number; contacts: number;
    contacted: number; replied: number; qualified: number; meetings: number;
    opportunities: number; won: number;
    replyRate: number; qualificationRate: number; meetingRate: number; winRate: number;
    pipelineValueUsd: number;
  };
  leadsByRegion: Slice[];
  leadsByCountry: Slice[];
  leadsByVertical: Slice[];
  leadsByPersona: Slice[];
  leadsByCampaign: Slice[];
  fitDistribution: Slice[];
  intentDistribution: Slice[];
  funnel: FunnelStep[];
  conversionByRegion: Slice[];
  conversionByVertical: Slice[];
  sourcePerformance: Slice[];
  templatePerformance: Slice[];
  anglePerformance: Slice[];
  recommendationAcceptance: { total: number; accepted: number; dismissed: number; actioned: number; rate: number };
  feedTrend: Slice[];
  revenueBySegment: Slice[];
}

const BANDS = [
  { key: '0-19', min: 0, max: 19 },
  { key: '20-39', min: 20, max: 39 },
  { key: '40-59', min: 40, max: 59 },
  { key: '60-79', min: 60, max: 79 },
  { key: '80-100', min: 80, max: 100 },
];

function band(scores: number[]): Slice[] {
  return BANDS.map((b) => ({
    key: b.key,
    label: b.key,
    value: scores.filter((s) => s >= b.min && s <= b.max).length,
  }));
}

function countBy<T>(rows: T[], key: (row: T) => string | null, label: (k: string) => string): Slice[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const k = key(row);
    if (!k) continue;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([k, value]) => ({ key: k, label: label(k), value }))
    .sort((a, b) => b.value - a.value);
}

export async function analyticsSnapshot(workspaceId: string, days = 90): Promise<AnalyticsSnapshot> {
  const since = new Date(Date.now() - days * 86_400_000);

  const [leads, accountCount, contactCount, templates, recommendations, feeds, meetings, sources] =
    await Promise.all([
      prisma.lead.findMany({
        where: { workspaceId },
        select: {
          id: true, stage: true, fitScore: true, intentScore: true, priorityScore: true,
          estimatedValueUsd: true, offerAngle: true, campaignId: true,
          account: { select: { region: true, vertical: true, country: true } },
          contact: { select: { personaCategory: true } },
          campaign: { select: { name: true } },
        },
      }),
      prisma.account.count({ where: { workspaceId } }),
      prisma.contact.count({ where: { workspaceId } }),
      prisma.messageTemplate.findMany({
        where: { workspaceId },
        select: { id: true, name: true, offerAngle: true, variantKey: true, timesUsed: true, replies: true, meetings: true },
      }),
      prisma.recommendation.findMany({
        where: { workspaceId, feedDate: { gte: since } },
        select: { status: true, feedDate: true, suggestedAngle: true },
      }),
      prisma.dailyFeed.findMany({
        where: { workspaceId, feedDate: { gte: since } },
        select: { feedDate: true, candidatePoolSize: true, recommendations: { select: { id: true } } },
        orderBy: { feedDate: 'asc' },
      }),
      prisma.meeting.count({ where: { workspaceId, status: { in: ['SCHEDULED', 'HELD'] } } }),
      prisma.sourceRecord.groupBy({ by: ['provider'], where: { workspaceId }, _count: { _all: true } }),
    ]);

  const stageCount = (stages: string[]) => leads.filter((l) => stages.includes(l.stage)).length;
  const reachedContacted = stageCount(['CONTACTED', 'REPLIED', 'QUALIFIED', 'MEETING_BOOKED', 'OPPORTUNITY', 'WON', 'LOST']);
  const reachedReplied = stageCount(['REPLIED', 'QUALIFIED', 'MEETING_BOOKED', 'OPPORTUNITY', 'WON']);
  const reachedQualified = stageCount(['QUALIFIED', 'MEETING_BOOKED', 'OPPORTUNITY', 'WON']);
  const reachedMeeting = stageCount(['MEETING_BOOKED', 'OPPORTUNITY', 'WON']);
  const opportunities = stageCount(['OPPORTUNITY', 'WON']);
  const won = stageCount(['WON']);

  const funnelCounts: Record<string, number> = {
    IMPORTED: leads.length,
    ENRICHED: stageCount(['ENRICHED', 'REVIEWED', 'SHORTLISTED', 'CONTACTED', 'REPLIED', 'QUALIFIED', 'MEETING_BOOKED', 'OPPORTUNITY', 'WON', 'LOST']),
    REVIEWED: stageCount(['REVIEWED', 'SHORTLISTED', 'CONTACTED', 'REPLIED', 'QUALIFIED', 'MEETING_BOOKED', 'OPPORTUNITY', 'WON', 'LOST']),
    SHORTLISTED: stageCount(['SHORTLISTED', 'CONTACTED', 'REPLIED', 'QUALIFIED', 'MEETING_BOOKED', 'OPPORTUNITY', 'WON', 'LOST']),
    CONTACTED: reachedContacted,
    REPLIED: reachedReplied,
    QUALIFIED: reachedQualified,
    MEETING_BOOKED: reachedMeeting,
    OPPORTUNITY: opportunities,
    WON: won,
  };

  const funnel: FunnelStep[] = STAGE_ORDER.map((stage, i) => {
    const count = funnelCounts[stage] ?? 0;
    const prev = i === 0 ? count : funnelCounts[STAGE_ORDER[i - 1]] ?? 0;
    return { stage, label: STAGE_LABELS[stage], count, conversion: pct(count, prev) };
  });

  const conversionBy = (key: (l: (typeof leads)[number]) => string | null, label: (k: string) => string): Slice[] => {
    const totals = new Map<string, { total: number; won: number }>();
    for (const lead of leads) {
      const k = key(lead);
      if (!k) continue;
      const entry = totals.get(k) ?? { total: 0, won: 0 };
      entry.total += 1;
      if (['REPLIED', 'QUALIFIED', 'MEETING_BOOKED', 'OPPORTUNITY', 'WON'].includes(lead.stage)) entry.won += 1;
      totals.set(k, entry);
    }
    return [...totals.entries()]
      .filter(([, v]) => v.total >= 1)
      .map(([k, v]) => ({ key: k, label: label(k), value: pct(v.won, v.total), secondary: v.total }))
      .sort((a, b) => b.value - a.value);
  };

  const accepted = recommendations.filter((r) => r.status === 'ACCEPTED').length;
  const actioned = recommendations.filter((r) => r.status === 'ACTIONED').length;
  const dismissed = recommendations.filter((r) => r.status === 'DISMISSED').length;

  const pipelineValueUsd = leads
    .filter((l) => !['WON', 'LOST'].includes(l.stage))
    .reduce((sum, l) => sum + Number(l.estimatedValueUsd ?? 0), 0);

  return {
    totals: {
      leads: leads.length,
      accounts: accountCount,
      contacts: contactCount,
      contacted: reachedContacted,
      replied: reachedReplied,
      qualified: reachedQualified,
      meetings,
      opportunities,
      won,
      replyRate: pct(reachedReplied, reachedContacted),
      qualificationRate: pct(reachedQualified, reachedReplied),
      meetingRate: pct(reachedMeeting, reachedContacted),
      winRate: pct(won, opportunities),
      pipelineValueUsd,
    },
    leadsByRegion: countBy(leads, (l) => l.account.region, (k) => REGION_LABELS[k as keyof typeof REGION_LABELS] ?? k),
    leadsByCountry: countBy(leads, (l) => l.account.country, (k) => countryName(k)),
    leadsByVertical: countBy(leads, (l) => l.account.vertical, (k) => VERTICAL_LABELS[k as keyof typeof VERTICAL_LABELS] ?? k),
    leadsByPersona: countBy(leads, (l) => l.contact.personaCategory, (k) => PERSONA_LABELS[k as keyof typeof PERSONA_LABELS] ?? k),
    leadsByCampaign: countBy(leads, (l) => l.campaign?.name ?? null, (k) => k),
    fitDistribution: band(leads.map((l) => l.fitScore)),
    intentDistribution: band(leads.map((l) => l.intentScore)),
    funnel,
    conversionByRegion: conversionBy((l) => l.account.region, (k) => REGION_LABELS[k as keyof typeof REGION_LABELS] ?? k),
    conversionByVertical: conversionBy((l) => l.account.vertical, (k) => VERTICAL_LABELS[k as keyof typeof VERTICAL_LABELS] ?? k),
    sourcePerformance: sources.map((s) => ({ key: s.provider, label: s.provider, value: s._count._all })).sort((a, b) => b.value - a.value),
    templatePerformance: templates
      .filter((t) => t.timesUsed > 0)
      .map((t) => ({ key: t.id, label: `${t.name} (${t.variantKey})`, value: pct(t.replies, t.timesUsed), secondary: t.timesUsed }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10),
    anglePerformance: (() => {
      const map = new Map<string, { total: number; engaged: number }>();
      for (const lead of leads) {
        if (!lead.offerAngle) continue;
        const entry = map.get(lead.offerAngle) ?? { total: 0, engaged: 0 };
        entry.total += 1;
        if (['REPLIED', 'QUALIFIED', 'MEETING_BOOKED', 'OPPORTUNITY', 'WON'].includes(lead.stage)) entry.engaged += 1;
        map.set(lead.offerAngle, entry);
      }
      return [...map.entries()]
        .map(([k, v]) => ({ key: k, label: ANGLE_LABELS[k as keyof typeof ANGLE_LABELS] ?? k, value: pct(v.engaged, v.total), secondary: v.total }))
        .sort((a, b) => b.value - a.value);
    })(),
    recommendationAcceptance: {
      total: recommendations.length,
      accepted,
      dismissed,
      actioned,
      rate: pct(accepted + actioned, recommendations.length),
    },
    feedTrend: feeds.map((f) => ({
      key: f.feedDate.toISOString().slice(0, 10),
      label: f.feedDate.toISOString().slice(5, 10),
      value: f.recommendations.length,
      secondary: f.candidatePoolSize,
    })),
    revenueBySegment: (() => {
      const map = new Map<string, number>();
      for (const lead of leads) {
        if (['WON', 'LOST'].includes(lead.stage)) continue;
        const key = `${lead.account.region}|${lead.account.vertical}`;
        map.set(key, (map.get(key) ?? 0) + Number(lead.estimatedValueUsd ?? 0));
      }
      return [...map.entries()]
        .map(([k, value]) => {
          const [region, vertical] = k.split('|');
          return {
            key: k,
            label: `${REGION_LABELS[region as keyof typeof REGION_LABELS] ?? region} · ${VERTICAL_LABELS[vertical as keyof typeof VERTICAL_LABELS] ?? vertical}`,
            value,
          };
        })
        .filter((s) => s.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);
    })(),
  };
}

export async function replyCount(workspaceId: string): Promise<number> {
  return prisma.reply.count({ where: { workspaceId } });
}
