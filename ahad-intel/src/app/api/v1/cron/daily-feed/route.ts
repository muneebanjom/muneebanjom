import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { generateDailyFeed } from '@/lib/recommendations/engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Cron entry point: generates today's feed for every workspace.
 * Authenticated by a shared secret; if CRON_SECRET is unset the endpoint is
 * disabled rather than left open.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = env().CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Cron is not configured on this deployment.' }, { status: 503 });
  }
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? request.headers.get('x-cron-secret');
  if (provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const force = new URL(request.url).searchParams.get('force') === '1';
  const workspaces = await prisma.workspace.findMany({ select: { id: true, name: true } });
  const results: Array<Record<string, unknown>> = [];

  for (const workspace of workspaces) {
    try {
      const result = await generateDailyFeed({ workspaceId: workspace.id, force, generatedBy: 'cron' });
      results.push({ workspace: workspace.name, ...result });
    } catch (error) {
      results.push({ workspace: workspace.name, error: (error as Error).message });
    }
  }

  return NextResponse.json({ ok: true, workspaces: results.length, results });
}
