/**
 * Server-only guard.
 *
 * These modules read secrets, PII and the database, and must never be bundled
 * into a client component. The `server-only` package is the usual way to enforce
 * that, but it is resolved by Next's bundler alone — importing it from the
 * standalone job worker (`npm run jobs:worker`) or a CLI script fails outright.
 *
 * This guard gives the same protection in both environments: a browser bundle
 * that pulls one of these modules in throws immediately and loudly, while Node
 * processes outside Next import it without ceremony.
 */
if (typeof window !== 'undefined') {
  throw new Error(
    'A server-only module was imported from client code. It reads the database, secrets or PII and must stay on the server.',
  );
}

export {};
