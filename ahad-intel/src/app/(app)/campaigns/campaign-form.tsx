'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { saveCampaignAction, type CampaignState } from './actions';

interface Option { value: string; label: string }

function Save() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="focus-ring rounded-xl border border-transparent bg-brand px-3.5 py-2 text-sm font-medium text-brandInk transition hover:brightness-110 disabled:opacity-60"
    >
      {pending ? 'Saving…' : 'Create campaign'}
    </button>
  );
}

export function CampaignForm({
  regions, verticals, personas, angles, channels,
}: {
  regions: Option[];
  verticals: Option[];
  personas: Option[];
  angles: Option[];
  channels: Option[];
}) {
  const [state, formAction] = useFormState<CampaignState, FormData>(saveCampaignAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="c-name" className="block text-xs font-medium text-ink">Campaign name</label>
          <input id="c-name" name="name" required placeholder="UAE Financial Services — Cybersecurity" className="input" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="c-angle" className="block text-xs font-medium text-ink">Offer angle</label>
          <select id="c-angle" name="offerAngle" className="input">
            {angles.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="c-goal" className="block text-xs font-medium text-ink">Goal</label>
        <input id="c-goal" name="goal" placeholder="Twelve qualified conversations this quarter" className="input" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Multi name="regions" label="Regions" options={regions} />
        <Multi name="verticals" label="Verticals" options={verticals} />
        <Multi name="personaCategories" label="Personas" options={personas} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Multi name="channels" label="Channels" options={channels} />
        <div className="space-y-1.5">
          <label htmlFor="c-priority" className="block text-xs font-medium text-ink">Priority (0–100)</label>
          <input id="c-priority" name="priority" type="number" min={0} max={100} defaultValue={50} className="input" />
          <p className="text-xs text-muted">Boosts ranking in the daily feed.</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="c-quota" className="block text-xs font-medium text-ink">Daily quota</label>
          <input id="c-quota" name="dailyQuota" type="number" min={1} max={100} defaultValue={10} className="input" />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="isActive" defaultChecked className="h-3.5 w-3.5 rounded border-line accent-[rgb(var(--brand))]" />
        Active
      </label>

      {state.error ? (
        <p role="alert" className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger">{state.error}</p>
      ) : null}
      {state.ok ? (
        <p role="status" className="rounded-xl border border-ok/20 bg-ok/10 px-3 py-2 text-xs text-ok">Campaign saved.</p>
      ) : null}

      <Save />
    </form>
  );
}

function Multi({ name, label, options }: { name: string; label: string; options: Option[] }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={`m-${name}`} className="block text-xs font-medium text-ink">{label}</label>
      <select id={`m-${name}`} name={name} multiple size={5} className="input h-auto py-1.5 text-xs">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <p className="text-xs text-muted">Leave empty for all.</p>
    </div>
  );
}
