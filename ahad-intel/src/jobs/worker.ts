/**
 * Long-running job worker: `npm run jobs:worker`.
 * Runs alongside the app in docker-compose. In serverless deployments the same
 * handlers are driven by the cron route handlers instead.
 */
import { loadEnv } from '../lib/load-env';

loadEnv();

import { claimNext, fail, succeed } from './queue';
import { runJob } from './handlers';

const POLL_INTERVAL_MS = Number(process.env.JOB_POLL_INTERVAL_MS ?? 5000);
let shuttingDown = false;

async function tick(): Promise<boolean> {
  const job = await claimNext();
  if (!job) return false;
  console.log(`[worker] running ${job.kind} (${job.id}) attempt ${job.attempts}`);
  try {
    const result = await runJob(job);
    await succeed(job.id, result as never);
    console.log(`[worker] ${job.kind} succeeded`, result);
  } catch (error) {
    console.error(`[worker] ${job.kind} failed`, error);
    await fail(job.id, (error as Error).message);
  }
  return true;
}

async function main(): Promise<void> {
  console.log('[worker] started');
  while (!shuttingDown) {
    try {
      const didWork = await tick();
      if (!didWork) await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    } catch (error) {
      console.error('[worker] loop error', error);
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
  console.log('[worker] stopped');
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`[worker] ${signal} received, finishing current job`);
    shuttingDown = true;
  });
}

main().catch((error) => {
  console.error('[worker] fatal', error);
  process.exit(1);
});
