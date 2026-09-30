'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Last-resort boundary for the authenticated shell. Permission checks render a
 * dedicated access-denied view instead of throwing, so anything reaching here is
 * a genuine fault. The message is never shown to the user — it can carry
 * internal detail — only the digest, which is safe to quote in a support request.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[app] unhandled error', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-surface2 text-lg">⚠️</div>
      <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">
        This page could not be loaded. Nothing was sent and no data was changed.
        Try again, and if it persists quote the reference below.
      </p>
      {error.digest ? (
        <p className="mt-3 font-mono text-xs text-muted">Reference: {error.digest}</p>
      ) : null}
      <div className="mt-5 flex justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="focus-ring rounded-xl border border-transparent bg-brand px-3.5 py-2 text-sm font-medium text-brandInk transition hover:brightness-110"
        >
          Try again
        </button>
        <Link href="/" className="focus-ring rounded-xl border border-line px-3.5 py-2 text-sm text-ink transition hover:bg-surface2">
          Back to overview
        </Link>
      </div>
    </div>
  );
}
