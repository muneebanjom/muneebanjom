'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { importCsvAction, type ImportState } from './actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="focus-ring rounded-xl border border-transparent bg-brand px-3.5 py-2 text-sm font-medium text-brandInk transition hover:brightness-110 disabled:opacity-60"
    >
      {pending ? 'Importing…' : 'Import'}
    </button>
  );
}

export function ImportForm({
  campaigns, attestations,
}: {
  campaigns: Array<{ id: string; name: string }>;
  attestations: Record<string, string>;
}) {
  const [state, formAction] = useFormState<ImportState, FormData>(importCsvAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="i-provider" className="block text-xs font-medium text-ink">Source</label>
        <select id="i-provider" name="provider" defaultValue="CSV" className="input">
          <option value="CSV">CSV / spreadsheet</option>
          <option value="LINKEDIN_EXPORT">LinkedIn data export (your own)</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="i-file" className="block text-xs font-medium text-ink">CSV file</label>
        <input
          id="i-file"
          name="file"
          type="file"
          accept=".csv,text/csv,text/plain"
          className="input file:mr-3 file:rounded-lg file:border-0 file:bg-surface2 file:px-3 file:py-1.5 file:text-xs file:text-ink"
        />
        <p className="text-xs text-muted">
          Recognised columns include: first_name, last_name, full_name, title, email, phone, linkedin,
          company, domain, country, city, employees. Unknown columns are ignored.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="i-content" className="block text-xs font-medium text-ink">…or paste rows</label>
        <textarea
          id="i-content"
          name="content"
          rows={5}
          placeholder="full_name,title,company,domain,country,linkedin"
          className="input resize-y font-mono text-xs"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="i-campaign" className="block text-xs font-medium text-ink">Add to campaign (optional)</label>
        <select id="i-campaign" name="campaignId" className="input">
          <option value="">No campaign</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-surface2 p-3 text-xs text-muted">
        <input type="checkbox" name="attested" required className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-line accent-[rgb(var(--brand))]" />
        <span>{attestations.CSV}</span>
      </label>

      {state.error ? (
        <p role="alert" className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger">{state.error}</p>
      ) : null}
      {state.ok && state.summary ? (
        <p role="status" className="rounded-xl border border-ok/20 bg-ok/10 px-3 py-2 text-xs text-ok">{state.summary}</p>
      ) : null}

      <Submit />
    </form>
  );
}
