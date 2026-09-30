import { z } from 'zod';

/**
 * Environment contract. Parsed lazily so that `next build` and unit tests do not
 * require a full production environment, but misconfiguration fails loudly the
 * first time a dependent module is used.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1).default('postgresql://postgres:postgres@localhost:5432/ahad_intel'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  AUTH_SECRET: z.string().min(32).default('dev-only-insecure-secret-change-me-32+chars'),
  APP_ENCRYPTION_KEY: z.string().optional(), // base64, 32 bytes — required in production
  CRON_SECRET: z.string().optional(),
  AI_PROVIDER: z.enum(['anthropic', 'heuristic']).default('heuristic'),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-sonnet-5-5'),
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

let cached: z.infer<typeof schema> | null = null;

export function env() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`);
  }
  cached = parsed.data;
  if (cached.NODE_ENV === 'production') {
    if (cached.AUTH_SECRET.startsWith('dev-only')) throw new Error('AUTH_SECRET must be set in production');
    if (!cached.APP_ENCRYPTION_KEY) throw new Error('APP_ENCRYPTION_KEY must be set in production');
  }
  return cached;
}

export const isProd = () => env().NODE_ENV === 'production';
