import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

const MAX_PAGE_SIZE = 100;

/** Paginated, filterable lead list. Contact PII is never included. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!can(session.role, 'lead:read')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(params.get('pageSize') ?? 25) || 25));

  const where: Prisma.LeadWhereInput = {
    workspaceId: session.workspaceId,
    ...(params.get('stage') ? { stage: params.get('stage') as never } : {}),
    ...(params.get('region') || params.get('vertical')
      ? {
          account: {
            ...(params.get('region') ? { region: params.get('region') as never } : {}),
            ...(params.get('vertical') ? { vertical: params.get('vertical') as never } : {}),
          },
        }
      : {}),
    ...(params.get('persona') ? { contact: { personaCategory: params.get('persona') as never } } : {}),
    ...(params.get('minPriority') ? { priorityScore: { gte: Number(params.get('minPriority')) } } : {}),
  };

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { priorityScore: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        contact: { select: { fullName: true, title: true, personaCategory: true, optedOut: true } },
        account: { select: { name: true, country: true, region: true, vertical: true } },
        owner: { select: { name: true } },
        campaign: { select: { name: true } },
      },
    }),
    prisma.lead.count({ where }),
  ]);

  return NextResponse.json({
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    leads: leads.map((lead) => ({
      id: lead.id,
      stage: lead.stage,
      contact: {
        name: lead.contact.fullName,
        title: lead.contact.title,
        persona: lead.contact.personaCategory,
        optedOut: lead.contact.optedOut,
      },
      account: lead.account,
      scores: {
        fit: lead.fitScore,
        intent: lead.intentScore,
        urgency: lead.urgencyScore,
        dealPotential: lead.dealPotential,
        priority: lead.priorityScore,
      },
      offerAngle: lead.offerAngle,
      nextBestAction: lead.nextBestAction,
      owner: lead.owner?.name ?? null,
      campaign: lead.campaign?.name ?? null,
      updatedAt: lead.updatedAt,
    })),
  });
}
