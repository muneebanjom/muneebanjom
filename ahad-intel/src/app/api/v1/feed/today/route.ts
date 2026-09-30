import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { feedDateKey } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Today's recommendations as JSON, for dashboards and the team's own tooling.
 * Contact PII is deliberately excluded — this endpoint answers "who should we
 * approach and why", not "what is their email address".
 */
export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!can(session.role, 'feed:read')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const feedDate = feedDateKey();
  const recommendations = await prisma.recommendation.findMany({
    where: { workspaceId: session.workspaceId, feedDate },
    orderBy: { rank: 'asc' },
    include: {
      lead: {
        include: {
          contact: { select: { fullName: true, title: true, personaCategory: true } },
          account: { select: { name: true, country: true, region: true, vertical: true } },
        },
      },
      assignee: { select: { name: true } },
    },
  });

  return NextResponse.json({
    feedDate: feedDate.toISOString().slice(0, 10),
    count: recommendations.length,
    recommendations: recommendations.map((r) => ({
      rank: r.rank,
      status: r.status,
      leadId: r.leadId,
      contact: {
        name: r.lead.contact.fullName,
        title: r.lead.contact.title,
        persona: r.lead.contact.personaCategory,
      },
      account: {
        name: r.lead.account.name,
        country: r.lead.account.country,
        region: r.lead.account.region,
        vertical: r.lead.account.vertical,
      },
      scores: {
        fit: r.fitScore,
        intent: r.intentScore,
        urgency: r.urgencyScore,
        priority: r.priorityScore,
      },
      reason: r.reason,
      reasonBullets: r.reasonBullets,
      suggestedAngle: r.suggestedAngle,
      suggestedChannel: r.suggestedChannel,
      nextBestAction: r.nextBestAction,
      assignee: r.assignee?.name ?? null,
    })),
  });
}
