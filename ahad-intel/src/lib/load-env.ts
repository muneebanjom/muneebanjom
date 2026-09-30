import fs from 'node:fs';
import path from 'node:path';

/**
 * Minimal `.env` loader for standalone scripts (seed, worker, cron entry points).
 *
 * Next.js loads `.env` itself, but `tsx prisma/seed.ts` and `tsx src/jobs/*.ts`
 * do not, so without this the documented setup steps fail with "Environment
 * variable not found: DATABASE_URL". Values already present in the process
 * environment always win, so a real deployment's configuration is never
 * overridden by a stray file.
 */
export function loadEnv(files = ['.env.local', '.env']): void {
  for (const file of files) {
    const fullPath = path.resolve(process.cwd(), file);
    if (!fs.existsSync(fullPath)) continue;

    for (const rawLine of fs.readFileSync(fullPath, 'utf8').split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const separator = line.indexOf('=');
      if (separator === -1) continue;

      const key = line.slice(0, separator).trim();
      if (!key || key in process.env) continue;

      let value = line.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}
