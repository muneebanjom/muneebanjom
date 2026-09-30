import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getSession()) redirect('/');

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-sm font-bold text-brandInk">A</div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">Sign in to Ahad Intelligence</h1>
            <p className="mt-1.5 text-sm text-muted">
              Customer intelligence and compliant outreach for the GCC and MENA.
            </p>
          </div>

          <LoginForm />

          <p className="mt-6 text-xs leading-relaxed text-muted">
            Access is role-based and every action is recorded in the audit log. Contact data is
            handled under your workspace&apos;s retention and privacy settings.
          </p>
        </div>
      </section>

      <section className="hidden items-center bg-surface px-12 lg:flex">
        <div className="max-w-md">
          <h2 className="text-lg font-semibold text-ink">From raw data to qualified conversations</h2>
          <ul className="mt-6 space-y-5 text-sm text-muted">
            <li>
              <p className="font-medium text-ink">A daily list of ten, not a list of ten thousand</p>
              <p className="mt-0.5">Ranked by ICP fit, intent, urgency and strategic value — each with the reason it is there.</p>
            </li>
            <li>
              <p className="font-medium text-ink">Every score explained in plain English</p>
              <p className="mt-0.5">Deterministic scoring rules you configure, not a black box.</p>
            </li>
            <li>
              <p className="font-medium text-ink">Compliant sources only</p>
              <p className="mt-0.5">Your own Lusha and Apollo subscriptions, user-provided exports and manual research. No scraping, no unattended sending.</p>
            </li>
            <li>
              <p className="font-medium text-ink">A human approves every message</p>
              <p className="mt-0.5">Drafts are generated with several approved angles; a person edits, approves and sends.</p>
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}
