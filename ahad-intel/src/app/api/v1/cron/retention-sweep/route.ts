import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { enqueue } from '@/jobs/queue';

export const dynamic = 'force-dynamic';

/** Queues the retention sweep for every workspace. Same auth as the feed cron. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = env().CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Cron is not configured on this deployment.' }, { status: 503 });
  }
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? request.headers.get('x-cron-secret');
  if (provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspaces = await prisma.workspace.findMany({ select: { id: true } });
  for (const workspace of workspaces) {
    await enqueue(workspace.id, 'retention_sweep', {});
  }

  return NextResponse.json({ ok: true, queued: workspaces.length });
}
