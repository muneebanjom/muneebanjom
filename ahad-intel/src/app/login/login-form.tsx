'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { loginAction, type LoginState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="focus-ring w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brandInk transition hover:brightness-110 disabled:opacity-60"
    >
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useFormState<LoginState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-xs font-medium text-ink">Work email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" placeholder="you@company.com" />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-xs font-medium text-ink">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" placeholder="••••••••" />
      </div>

      {state.error ? (
        <p role="alert" className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
