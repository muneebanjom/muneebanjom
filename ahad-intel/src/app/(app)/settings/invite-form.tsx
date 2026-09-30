'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { inviteMemberAction, type SettingsState } from './actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="focus-ring rounded-xl border border-transparent bg-brand px-3.5 py-2 text-sm font-medium text-brandInk transition hover:brightness-110 disabled:opacity-60"
    >
      {pending ? 'Adding…' : 'Add member'}
    </button>
  );
}

export function InviteForm({ roles }: { roles: Array<{ value: string; label: string; description: string }> }) {
  const [state, formAction] = useFormState<SettingsState, FormData>(inviteMemberAction, {});

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="inv-name" className="block text-xs font-medium text-ink">Full name</label>
          <input id="inv-name" name="name" required className="input" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="inv-email" className="block text-xs font-medium text-ink">Work email</label>
          <input id="inv-email" name="email" type="email" required className="input" />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="inv-role" className="block text-xs font-medium text-ink">Role</label>
        <select id="inv-role" name="role" defaultValue="REP" className="input">
          {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <ul className="space-y-0.5 text-xs text-muted">
          {roles.map((r) => <li key={r.value}><strong className="text-ink">{r.label}</strong> — {r.description}</li>)}
        </ul>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger">{state.error}</p>
      ) : null}
      {state.ok && state.note ? (
        <p role="status" className="rounded-xl border border-ok/20 bg-ok/10 px-3 py-2 text-xs text-ok">{state.note}</p>
      ) : null}

      <Submit />
    </form>
  );
}
