'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { saveIcpProfileAction, type IcpFormState } from './actions';

export interface Option { value: string; label: string }

export interface IcpFormValues {
  id?: string;
  name: string;
  description: string;
  regions: string[];
  countries: string[];
  verticals: string[];
  companySizes: string[];
  personaCategories: string[];
  triggers: string[];
  offerAngles: string[];
  minComplianceMaturity: string;
  minSecurityMaturity: string;
  minTransformationMaturity: string;
  minAiReadiness: string;
  minEmployees: number | null;
  maxEmployees: number | null;
  weights: Record<string, number>;
  notes: string;
}

export interface IcpFormOptions {
  regions: Option[];
  verticals: Option[];
  companySizes: Option[];
  personas: Option[];
  triggers: Option[];
  angles: Option[];
  maturities: Option[];
}

function Save() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="focus-ring rounded-xl border border-transparent bg-brand px-3.5 py-2 text-sm font-medium text-brandInk transition hover:brightness-110 disabled:opacity-60"
    >
      {pending ? 'Saving…' : 'Save ICP profile'}
    </button>
  );
}

function CheckGroup({
  name, options, selected, columns = 2,
}: { name: string; options: Option[]; selected: string[]; columns?: number }) {
  return (
    <div className={`grid gap-1.5 ${columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
      {options.map((option) => (
        <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink transition hover:bg-surface2">
          <input
            type="checkbox"
            name={name}
            value={option.value}
            defaultChecked={selected.includes(option.value)}
            className="h-3.5 w-3.5 rounded border-line accent-[rgb(var(--brand))]"
          />
          <span className="min-w-0 truncate">{option.label}</span>
        </label>
      ))}
    </div>
  );
}

export function IcpForm({ values, options }: { values: IcpFormValues; options: IcpFormOptions }) {
  const [state, formAction] = useFormState<IcpFormState, FormData>(saveIcpProfileAction, {});

  return (
    <form action={formAction} className="space-y-6">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="name" className="block text-xs font-medium text-ink">Profile name</label>
          <input id="name" name="name" defaultValue={values.name} required className="input" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="description" className="block text-xs font-medium text-ink">Description</label>
          <input id="description" name="description" defaultValue={values.description} className="input" />
        </div>
      </div>

      <Section title="Geography" hint="Named countries score higher than a region match; adjacent regions get partial credit.">
        <CheckGroup name="regions" options={options.regions} selected={values.regions} />
        <div className="mt-3 space-y-1.5">
          <label htmlFor="countries" className="block text-xs font-medium text-ink">Target countries (ISO codes, comma-separated)</label>
          <input
            id="countries"
            name="countries"
            defaultValue={values.countries.join(', ')}
            placeholder="AE, SA, QA, KW, BH, OM"
            className="input"
          />
          <p className="text-xs text-muted">Use this for custom regions that the fixed region list does not cover.</p>
        </div>
      </Section>

      <Section title="Industry verticals">
        <CheckGroup name="verticals" options={options.verticals} selected={values.verticals} columns={3} />
      </Section>

      <Section title="Company size" hint="Bands in the ICP score full; one band either side scores 60%.">
        <CheckGroup name="companySizes" options={options.companySizes} selected={values.companySizes} columns={3} />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="minEmployees" className="block text-xs font-medium text-ink">Minimum employees</label>
            <input id="minEmployees" name="minEmployees" type="number" min={0} defaultValue={values.minEmployees ?? ''} className="input" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="maxEmployees" className="block text-xs font-medium text-ink">Maximum employees</label>
            <input id="maxEmployees" name="maxEmployees" type="number" min={0} defaultValue={values.maxEmployees ?? ''} className="input" />
          </div>
        </div>
      </Section>

      <Section title="Personas">
        <CheckGroup name="personaCategories" options={options.personas} selected={values.personaCategories} columns={3} />
      </Section>

      <Section title="Buying triggers" hint="Signals matching a target trigger count fully; others count at 60%.">
        <CheckGroup name="triggers" options={options.triggers} selected={values.triggers} columns={3} />
      </Section>

      <Section title="Offer angles in scope">
        <CheckGroup name="offerAngles" options={options.angles} selected={values.offerAngles} columns={3} />
      </Section>

      <Section
        title="Target maturity posture"
        hint="The gap between an account's current maturity and this target is the opportunity. A gap of about two levels scores highest — no gap means no need, a very large gap usually means no budget yet."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select name="minComplianceMaturity" label="Compliance" value={values.minComplianceMaturity} options={options.maturities} />
          <Select name="minSecurityMaturity" label="Security" value={values.minSecurityMaturity} options={options.maturities} />
          <Select name="minTransformationMaturity" label="Transformation" value={values.minTransformationMaturity} options={options.maturities} />
          <Select name="minAiReadiness" label="AI readiness" value={values.minAiReadiness} options={options.maturities} />
        </div>
      </Section>

      <Section title="Fit weighting" hint="These six weights decide the ICP fit score and must add up to 100.">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ['geography', 'Geography'],
            ['vertical', 'Vertical'],
            ['persona', 'Persona'],
            ['companySize', 'Company size'],
            ['maturityGap', 'Maturity gap'],
            ['strategicValue', 'Strategic value'],
          ].map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <label htmlFor={`w_${key}`} className="block text-xs font-medium text-ink">{label}</label>
              <input
                id={`w_${key}`}
                name={`w_${key}`}
                type="number"
                min={0}
                max={100}
                defaultValue={values.weights[key] ?? 0}
                className="input"
              />
            </div>
          ))}
        </div>
      </Section>

      <div className="space-y-1.5">
        <label htmlFor="notes" className="block text-xs font-medium text-ink">Notes</label>
        <textarea id="notes" name="notes" rows={2} defaultValue={values.notes} className="input resize-y" />
      </div>

      {state.error ? (
        <p role="alert" className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger">{state.error}</p>
      ) : null}
      {state.ok ? (
        <p role="status" className="rounded-xl border border-ok/20 bg-ok/10 px-3 py-2 text-xs text-ok">
          Saved. Rescore the workspace from Leads to apply it to existing leads.
        </p>
      ) : null}

      <Save />
    </form>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-line p-4">
      <legend className="px-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{title}</legend>
      {hint ? <p className="mb-3 text-xs text-muted">{hint}</p> : null}
      {children}
    </fieldset>
  );
}

function Select({ name, label, value, options }: { name: string; label: string; value: string; options: Option[] }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-xs font-medium text-ink">{label}</label>
      <select id={name} name={name} defaultValue={value} className="input">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
