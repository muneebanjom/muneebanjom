import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('card p-5', className)}>{children}</section>;
}

export function CardHeader({
  title, subtitle, action, className,
}: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <header className={cn('mb-4 flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function PageHeader({
  title, description, actions,
}: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' | 'info';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-surface2 text-muted border-line',
  brand: 'bg-brand/10 text-brand border-brand/20',
  ok: 'bg-ok/10 text-ok border-ok/20',
  warn: 'bg-warn/10 text-warn border-warn/20',
  danger: 'bg-danger/10 text-danger border-danger/20',
  info: 'bg-info/10 text-info border-info/20',
};

export function Badge({
  children, tone = 'neutral', className, title,
}: { children: ReactNode; tone?: Tone; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const BUTTON_VARIANTS = {
  primary: 'bg-brand text-brandInk hover:brightness-110 border-transparent',
  secondary: 'bg-surface text-ink hover:bg-surface2 border-line',
  ghost: 'bg-transparent text-muted hover:bg-surface2 hover:text-ink border-transparent',
  danger: 'bg-danger/10 text-danger hover:bg-danger/15 border-danger/20',
} as const;

const BUTTON_SIZES = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3.5 py-2 text-sm' } as const;

export function Button({
  children, variant = 'secondary', size = 'md', className, type = 'button', disabled, name, value, title,
}: {
  children: ReactNode;
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
  className?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
  name?: string;
  value?: string;
  title?: string;
}) {
  return (
    <button
      type={type}
      name={name}
      value={value}
      title={title}
      disabled={disabled}
      className={cn(
        'focus-ring inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border font-medium transition',
        'disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className,
      )}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href, children, variant = 'secondary', size = 'md', className,
}: {
  href: string; children: ReactNode;
  variant?: keyof typeof BUTTON_VARIANTS; size?: keyof typeof BUTTON_SIZES; className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'focus-ring inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border font-medium transition',
        BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className,
      )}
    >
      {children}
    </Link>
  );
}

export function EmptyState({
  title, description, action,
}: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function StatTile({
  label, value, hint, tone = 'neutral',
}: { label: string; value: ReactNode; hint?: string; tone?: Tone }) {
  const accent = tone === 'neutral' ? 'text-ink' : `text-${tone}`;
  return (
    <div className="card p-4">
      <p className="label">{label}</p>
      <p className={cn('mt-1.5 text-2xl font-semibold tabular-nums tracking-tight', accent)}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** Score dial with the number always shown — never colour alone. */
export function ScoreRing({
  value, label, size = 56,
}: { value: number; label?: string; size?: number }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, value)) / 100);
  const stroke = value >= 75 ? 'rgb(var(--ok))' : value >= 50 ? 'rgb(var(--brand))' : value >= 25 ? 'rgb(var(--warn))' : 'rgb(var(--muted))';

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label ?? 'Score'}: ${value} out of 100`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgb(var(--line))" strokeWidth={4} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={stroke} strokeWidth={4}
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
          className="fill-ink text-[13px] font-semibold tabular-nums">
          {value}
        </text>
      </svg>
      {label ? <span className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</span> : null}
    </div>
  );
}

/** Compact inline score with a labelled bar — readable without colour. */
export function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[92px]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</span>
        <span className="text-xs font-semibold tabular-nums text-ink">{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface2">
        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn('border-t border-line', className)} />;
}

export function Field({
  label, hint, children, htmlFor,
}: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-ink">{label}</label>
      {children}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/**
 * Rendered when a role lacks the permission a page requires. Denial is still
 * decided server-side before any data is fetched — this only replaces an
 * unhandled error with an explanation the user can act on.
 */
export function AccessDenied({ area, requiredRole }: { area: string; requiredRole?: string }) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-surface2 text-lg">🔒</div>
      <h1 className="text-lg font-semibold text-ink">You don&apos;t have access to {area}</h1>
      <p className="mt-2 text-sm text-muted">
        Your role does not include this permission
        {requiredRole ? `, which is limited to ${requiredRole}` : ''}. Ask a workspace
        administrator if you need it — the request will be recorded in the audit log.
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <LinkButton href="/" variant="primary">Back to overview</LinkButton>
        <LinkButton href="/feed">Today&apos;s feed</LinkButton>
      </div>
    </div>
  );
}
