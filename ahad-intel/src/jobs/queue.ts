import '../lib/server-guard';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/db';

/**
 * Durable job queue backed by the `JobRun` table.
 *
 * Deliberately simple: claiming a job is a conditional update, so two workers
 * cannot take the same row, and a crashed worker's job becomes claimable again
 * once it exceeds the stale threshold. Swapping in BullMQ or pg-boss means
 * reimplementing this file and nothing else.
 */
export type JobKind = 'daily_feed' | 'rescore' | 'enrich' | 'import' | 'retention_sweep';

const STALE_AFTER_MS = 10 * 60 * 1000;

export async function enqueue(
  workspaceId: string,
  kind: JobKind,
  payload: Prisma.InputJsonValue = {},
  scheduledFor = new Date(),
): Promise<string> {
  const job = await prisma.jobRun.create({
    data: { workspaceId, kind, payload, scheduledFor, status: 'queued' },
  });
  return job.id;
}

export async function claimNext(kinds?: JobKind[]) {
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS);
  const candidate = await prisma.jobRun.findFirst({
    where: {
      ...(kinds ? { kind: { in: kinds } } : {}),
      scheduledFor: { lte: new Date() },
      OR: [
        { status: 'queued' },
        { status: 'running', startedAt: { lt: staleBefore } },
      ],
    },
    orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
  });
  if (!candidate) return null;

  // Conditional claim — if another worker won the race, updatedCount is 0.
  const claimed = await prisma.jobRun.updateMany({
    where: { id: candidate.id, status: candidate.status, attempts: candidate.attempts },
    data: { status: 'running', startedAt: new Date(), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return null;
  return prisma.jobRun.findUnique({ where: { id: candidate.id } });
}

export async function succeed(jobId: string, result: Prisma.InputJsonValue): Promise<void> {
  await prisma.jobRun.update({
    where: { id: jobId },
    data: { status: 'succeeded', result, finishedAt: new Date(), error: null },
  });
}

export async function fail(jobId: string, error: string): Promise<void> {
  const job = await prisma.jobRun.findUnique({ where: { id: jobId } });
  if (!job) return;
  const exhausted = job.attempts >= job.maxAttempts;
  await prisma.jobRun.update({
    where: { id: jobId },
    data: {
      status: exhausted ? 'failed' : 'queued',
      error: error.slice(0, 1000),
      finishedAt: exhausted ? new Date() : null,
      // Exponential backoff between attempts.
      scheduledFor: exhausted ? job.scheduledFor : new Date(Date.now() + 60_000 * 2 ** job.attempts),
    },
  });
}
