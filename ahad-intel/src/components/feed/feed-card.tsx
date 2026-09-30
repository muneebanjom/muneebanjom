import Link from 'next/link';
import type { Channel, OfferAngle, RecommendationStatus } from '@prisma/client';
import { Badge, Button, ScoreBar, ScoreRing } from '@/components/ui/primitives';
import {
  ANGLE_LABELS, CHANNEL_LABELS, PERSONA_LABELS, REGION_LABELS, STAGE_LABELS, VERTICAL_LABELS, countryName,
} from '@/lib/domain';
import { cn, relativeTime } from '@/lib/utils';
import {
  assignRecommendationAction, generateDraftFromRecommendationAction, setRecommendationStatusAction,
} from '@/app/(app)/feed/actions';

export interface FeedCardData {
  id: string;
  rank: number;
  status: RecommendationStatus;
  isManualOverride: boolean;
  reason: string;
  reasonBullets: string[];
  suggestedAngle: OfferAngle;
  suggestedChannel: Channel;
  messageAngleNote: string | null;
  urgencyNote: string | null;
  nextBestAction: string;
  fitScore: number;
  intentScore: number;
  urgencyScore: number;
  priorityScore: number;
  variantName: string | null;
  assigneeId: string | null;
  lead: {
    id: string;
    stage: keyof typeof STAGE_LABELS;
    touchCount: number;
    lastTouchAt: Date | null;
    contactName: string;
    contactTitle: string | null;
    personaCategory: keyof typeof PERSONA_LABELS;
    linkedinUrl: string | null;
    accountId: string;
    accountName: string;
    country: string | null;
    region: keyof typeof REGION_LABELS;
    vertical: keyof typeof VERTICAL_LABELS;
  };
}

const STATUS_TONE: Record<RecommendationStatus, 'neutral' | 'ok' | 'warn' | 'info'> = {
  PENDING: 'neutral', ACCEPTED: 'ok', ACTIONED: 'info', SNOOZED: 'warn', DISMISSED: 'neutral',
};

export function FeedCard({
  item, assignees, canAct, canAssign, canDraft,
}: {
  item: FeedCardData;
  assignees: Array<{ id: string; name: string }>;
  canAct: boolean;
  canAssign: boolean;
  canDraft: boolean;
}) {
  const { lead } = item;
  const decided = item.status !== 'PENDING';

  return (
    <article
      className={cn(
        'card animate-fade-up p-5 transition',
        decided && 'opacity-75',
        item.status === 'DISMISSED' && 'opacity-55',
      )}
    >
      <div className="flex flex-col gap-5 lg:flex-row">
        {/* Rank + priority */}
        <div className="flex shrink-0 items-start gap-4 lg:flex-col lg:items-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface2 text-sm font-bold tabular-nums text-ink">
            {item.rank}
          </div>
          <ScoreRing value={item.priorityScore} label="Priority" />
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/leads/${lead.id}`} className="focus-ring truncate text-base font-semibold text-ink hover:text-brand">
                  {lead.contactName}
                </Link>
                <Badge tone={STATUS_TONE[item.status]}>{item.status.toLowerCase()}</Badge>
                {item.isManualOverride ? <Badge tone="warn">manual</Badge> : null}
              </div>
              <p className="mt-0.5 truncate text-sm text-muted">
                {lead.contactTitle ?? PERSONA_LABELS[lead.personaCategory]}
                {' · '}
                <Link href={`/accounts/${lead.accountId}`} className="hover:text-ink">{lead.accountName}</Link>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge>{countryName(lead.country)}</Badge>
                <Badge>{REGION_LABELS[lead.region]}</Badge>
                <Badge>{VERTICAL_LABELS[lead.vertical]}</Badge>
                <Badge>{PERSONA_LABELS[lead.personaCategory]}</Badge>
                <Badge tone="neutral">{STAGE_LABELS[lead.stage]}</Badge>
              </div>
            </div>

            <div className="flex shrink-0 gap-3">
              <ScoreBar label="Fit" value={item.fitScore} />
              <ScoreBar label="Intent" value={item.intentScore} />
              <ScoreBar label="Urgency" value={item.urgencyScore} />
            </div>
          </div>

          {/* Why it is here */}
          <div className="mt-4 rounded-xl bg-surface2 p-3.5">
            <p className="text-sm text-ink">{item.reason}</p>
            {item.reasonBullets.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {item.reasonBullets.map((bullet, i) => (
                  <li key={i} className="flex gap-2 text-xs text-muted">
                    <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {item.urgencyNote ? (
              <p className="mt-2 text-xs font-medium text-warn">{item.urgencyNote}</p>
            ) : null}
          </div>

          {/* What to say */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line p-3">
              <p className="label">Suggested angle</p>
              <p className="mt-1 text-sm font-medium text-ink">{ANGLE_LABELS[item.suggestedAngle]}</p>
              {item.messageAngleNote ? <p className="mt-1 text-xs text-muted">{item.messageAngleNote}</p> : null}
              {item.variantName ? (
                <p className="mt-1.5 text-xs text-muted">
                  Variation: <span className="font-medium text-ink">{item.variantName}</span>
                </p>
              ) : null}
            </div>
            <div className="rounded-xl border border-line p-3">
              <p className="label">Next best action</p>
              <p className="mt-1 text-sm text-ink">{item.nextBestAction}</p>
              <p className="mt-1.5 text-xs text-muted">
                Channel: {CHANNEL_LABELS[item.suggestedChannel]}
                {lead.touchCount > 0 ? ` · ${lead.touchCount} prior touch${lead.touchCount === 1 ? '' : 'es'}, last ${relativeTime(lead.lastTouchAt)}` : ' · no prior contact'}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {canDraft ? (
              <form action={generateDraftFromRecommendationAction}>
                <input type="hidden" name="recommendationId" value={item.id} />
                <Button type="submit" variant="primary" size="sm">Generate draft</Button>
              </form>
            ) : null}

            {canAct ? (
              <>
                <StatusButton id={item.id} status="ACCEPTED" label="Accept" disabled={item.status === 'ACCEPTED'} />
                <StatusButton id={item.id} status="SNOOZED" label="Snooze 3d" disabled={item.status === 'SNOOZED'} />
                <StatusButton id={item.id} status="DISMISSED" label="Dismiss" variant="ghost" disabled={item.status === 'DISMISSED'} />
              </>
            ) : null}

            <Link href={`/leads/${lead.id}`} className="focus-ring rounded-xl px-2.5 py-1.5 text-xs text-muted transition hover:bg-surface2 hover:text-ink">
              Open lead
            </Link>
            {lead.linkedinUrl ? (
              <a
                href={lead.linkedinUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="focus-ring rounded-xl px-2.5 py-1.5 text-xs text-muted transition hover:bg-surface2 hover:text-ink"
                title="Opens the public profile in your own browser for manual research"
              >
                View profile ↗
              </a>
            ) : null}

            {canAssign && assignees.length > 0 ? (
              <form action={assignRecommendationAction} className="ml-auto flex items-center gap-1.5">
                <input type="hidden" name="recommendationId" value={item.id} />
                <label htmlFor={`assignee-${item.id}`} className="text-xs text-muted">Owner</label>
                <select
                  id={`assignee-${item.id}`}
                  name="assigneeId"
                  defaultValue={item.assigneeId ?? ''}
                  className="input w-auto py-1.5 text-xs"
                >
                  <option value="">Unassigned</option>
                  {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <Button type="submit" size="sm">Set</Button>
              </form>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function StatusButton({
  id, status, label, variant = 'secondary', disabled,
}: {
  id: string;
  status: RecommendationStatus;
  label: string;
  variant?: 'secondary' | 'ghost';
  disabled?: boolean;
}) {
  return (
    <form action={setRecommendationStatusAction}>
      <input type="hidden" name="recommendationId" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" size="sm" variant={variant} disabled={disabled}>{label}</Button>
    </form>
  );
}
