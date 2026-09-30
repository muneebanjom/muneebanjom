/**
 * One-shot daily feed generation for every active workspace.
 * Useful as a cron entry point: `npm run jobs:daily-feed`.
 */
import { loadEnv } from '../lib/load-env';

loadEnv();

import { prisma } from '../lib/db';
import { generateDailyFeed } from '../lib/recommendations/engine';

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  const workspaces = await prisma.workspace.findMany({ select: { id: true, name: true } });

  for (const workspace of workspaces) {
    try {
      const result = await generateDailyFeed({ workspaceId: workspace.id, force, generatedBy: 'cron' });
      console.log(`[daily-feed] ${workspace.name}: ${result.created} recommendations from ${result.candidatePoolSize} candidates${result.reused ? ' (existing feed reused)' : ''}`);
    } catch (error) {
      console.error(`[daily-feed] ${workspace.name} failed:`, (error as Error).message);
    }
  }
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
