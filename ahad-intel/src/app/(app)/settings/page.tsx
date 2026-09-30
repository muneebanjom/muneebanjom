import type { Metadata } from 'next';
import type { Role } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, can } from '@/lib/rbac';
import {
  ANGLE_LABELS, CHANNEL_LABELS, MESSAGE_KIND_LABELS, PERSONA_LABELS, REGION_LABELS, TONE_LABELS, enumOptions,
} from '@/lib/domain';
import { pct, relativeTime } from '@/lib/utils';
import { aiProviderName } from '@/lib/ai';
import { env } from '@/lib/env';
import { AccessDenied, Badge, Button, Card, CardHeader, Field, PageHeader } from '@/components/ui/primitives';
import { InviteForm } from './invite-form';
import {
  approveTemplateAction, changeMemberRoleAction, saveTemplateAction,
  setMemberActiveAction, updateWorkspaceAction,
} from './actions';

export const metadata: Metadata = { title: 'Settings & admin' };
export const dynamic = 'force-dynamic';

const ROLES: Role[] = ['OWNER', 'ADMIN', 'MANAGER', 'REP', 'ANALYST', 'VIEWER'];

export default async function SettingsPage() {
  const session = await requireSession();
  if (!can(session.role, 'settings:write')) {
    return <AccessDenied area="settings and admin" requiredRole="owners and admins" />;
  }

  const [workspace, members, templates, personas, rules] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: session.workspaceId } }),
    prisma.membership.findMany({
      where: { workspaceId: session.workspaceId },
      include: { user: { select: { id: true, name: true, email: true, isActive: true, lastLoginAt: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.messageTemplate.findMany({ where: { workspaceId: session.workspaceId }, orderBy: [{ offerAngle: 'asc' }, { name: 'asc' }] }),
    prisma.persona.findMany({ where: { workspaceId: session.workspaceId }, orderBy: { label: 'asc' } }),
    prisma.scoringRule.findMany({ where: { workspaceId: session.workspaceId }, orderBy: { priority: 'asc' } }),
  ]);
  if (!workspace) return null;

  return (
    <>
      <PageHeader
        title="Settings & admin"
        description="Workspace configuration, people, message templates, personas and scoring rules."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Workspace" subtitle="Branding, timezone and governance defaults" />
          <form action={updateWorkspaceAction} className="space-y-3">
            <Field label="Workspace name" htmlFor="ws-name">
              <input id="ws-name" name="name" defaultValue={workspace.name} required className="input" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Timezone" htmlFor="ws-tz">
                <input id="ws-tz" name="timezone" defaultValue={workspace.timezone} className="input" />
              </Field>
              <Field label="Brand colour" htmlFor="ws-color">
                <input id="ws-color" name="brandColor" type="color" defaultValue={workspace.brandColor ?? '#0B5FFF'} className="input h-10 py-1" />
              </Field>
            </div>
            <Field
              label="Data retention (days)"
              hint="Raw provider payloads are purged after this window by the retention sweep."
              htmlFor="ws-retention"
            >
              <input id="ws-retention" name="dataRetentionDays" type="number" min={30} max={3650} defaultValue={workspace.dataRetentionDays} className="input" />
            </Field>
            <label className="flex items-start gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                name="requireApprovalBeforeSend"
                defaultChecked={workspace.requireApprovalBeforeSend}
                className="mt-1 h-3.5 w-3.5 shrink-0 rounded border-line accent-[rgb(var(--brand))]"
              />
              <span>
                Require approval before sending
                <span className="block text-xs text-muted">
                  Keeps the human gate in place and stops authors approving their own drafts. Strongly recommended.
                </span>
              </span>
            </label>
            <Button type="submit" variant="primary">Save workspace</Button>
          </form>

          <dl className="mt-5 space-y-2 border-t border-line pt-4 text-xs">
            <Row label="AI provider" value={aiProviderName()} />
            <Row label="AI model" value={env().AI_MODEL} />
            <Row label="PII encryption" value={env().APP_ENCRYPTION_KEY ? 'Enabled (AES-256-GCM)' : 'Not configured — set APP_ENCRYPTION_KEY'} />
            <Row label="Environment" value={env().NODE_ENV} />
          </dl>
        </Card>

        <Card>
          <CardHeader title="Team" subtitle="Role-based access control. Least privilege by default." />
          <ul className="divide-y divide-line">
            {members.map((member) => (
              <li key={member.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {member.user.name}
                    {member.userId === session.userId ? <span className="ml-1.5 text-xs text-muted">(you)</span> : null}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {member.user.email} · last signed in {relativeTime(member.user.lastLoginAt)}
                  </p>
                </div>
                {!member.user.isActive ? <Badge tone="danger">deactivated</Badge> : null}
                <form action={changeMemberRoleAction} className="flex items-center gap-1.5">
                  <input type="hidden" name="membershipId" value={member.id} />
                  <select name="role" defaultValue={member.role} className="input w-auto py-1.5 text-xs">
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                  <Button type="submit" size="sm">Set</Button>
                </form>
                <form action={setMemberActiveAction}>
                  <input type="hidden" name="userId" value={member.userId} />
                  <Button type="submit" size="sm" variant="ghost" disabled={member.userId === session.userId}>
                    {member.user.isActive ? 'Deactivate' : 'Reactivate'}
                  </Button>
                </form>
              </li>
            ))}
          </ul>

          <div className="mt-5 border-t border-line pt-4">
            <p className="label mb-2">Add a member</p>
            <InviteForm roles={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r], description: ROLE_DESCRIPTIONS[r] }))} />
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Message templates"
            subtitle="Only approved, active templates are offered as message variations. Editing the copy withdraws approval."
          />
          <div className="scroll-thin mb-5 overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 font-medium">Template</th>
                  <th className="py-2 font-medium">Angle</th>
                  <th className="py-2 font-medium">Kind</th>
                  <th className="py-2 font-medium">Variant</th>
                  <th className="py-2 text-right font-medium">Used</th>
                  <th className="py-2 text-right font-medium">Reply rate</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.id} className="border-b border-line/60 last:border-0">
                    <td className="py-2 pr-3">
                      <p className="font-medium text-ink">{template.name}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted">{template.body}</p>
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted">{ANGLE_LABELS[template.offerAngle]}</td>
                    <td className="py-2 pr-3 text-xs text-muted">{MESSAGE_KIND_LABELS[template.kind]}</td>
                    <td className="py-2 pr-3"><Badge>{template.variantKey}</Badge></td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink">{template.timesUsed}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink">{pct(template.replies, template.timesUsed)}%</td>
                    <td className="py-2 pr-3">
                      <Badge tone={template.isApproved ? 'ok' : 'warn'}>{template.isApproved ? 'approved' : 'unapproved'}</Badge>
                    </td>
                    <td className="py-2">
                      <form action={approveTemplateAction}>
                        <input type="hidden" name="templateId" value={template.id} />
                        <Button type="submit" size="sm">{template.isApproved ? 'Withdraw' : 'Approve'}</Button>
                      </form>
                    </td>
                  </tr>
                ))}
                {templates.length === 0 ? (
                  <tr><td colSpan={8} className="py-3 text-sm text-muted">No templates yet.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <details className="rounded-xl border border-line p-4">
            <summary className="cursor-pointer text-sm font-medium text-ink">Add a template</summary>
            <form action={saveTemplateAction} className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" htmlFor="t-name">
                  <input id="t-name" name="name" required placeholder="Connection — AI governance (A)" className="input" />
                </Field>
                <Field label="Variant key" hint="Groups A/B variants of the same angle and kind." htmlFor="t-variant">
                  <input id="t-variant" name="variantKey" defaultValue="A" maxLength={4} className="input" />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <Select name="kind" label="Kind" options={enumOptions(MESSAGE_KIND_LABELS)} />
                <Select name="channel" label="Channel" options={enumOptions(CHANNEL_LABELS)} />
                <Select name="offerAngle" label="Angle" options={enumOptions(ANGLE_LABELS)} />
                <Select name="tone" label="Tone" options={enumOptions(TONE_LABELS)} />
              </div>
              <Field
                label="Body"
                hint="Placeholders: {{first_name}} {{company}} {{country}} {{vertical}} {{trigger}} {{angle}} {{pain_point}} {{regulator}} {{cta}} {{sender_name}} {{sender_company}}"
                htmlFor="t-body"
              >
                <textarea id="t-body" name="body" required rows={5} className="input resize-y" />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Call to action" htmlFor="t-cta">
                  <input id="t-cta" name="cta" className="input" />
                </Field>
                <Field label="Positioning note" hint="Why this angle works — shown to the rep." htmlFor="t-note">
                  <input id="t-note" name="positioningNote" className="input" />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Multi name="personaCategories" label="Personas (optional)" options={enumOptions(PERSONA_LABELS)} />
                <Multi name="regions" label="Regions (optional)" options={enumOptions(REGION_LABELS)} />
              </div>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="isActive" defaultChecked className="h-3.5 w-3.5 rounded border-line accent-[rgb(var(--brand))]" />
                Active
              </label>
              <p className="text-xs text-muted">New templates start unapproved and are not offered as variations until approved.</p>
              <Button type="submit" variant="primary">Save template</Button>
            </form>
          </details>
        </Card>

        <Card>
          <CardHeader title="Personas" subtitle="Title matching, pain points and default angles used in scoring and drafting" />
          <ul className="space-y-3">
            {personas.map((persona) => (
              <li key={persona.id} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">{persona.label}</span>
                  <Badge>seniority {persona.seniority}</Badge>
                  {persona.primaryAngles.map((a) => <Badge key={a} tone="brand">{ANGLE_LABELS[a]}</Badge>)}
                </div>
                <p className="mt-1.5 text-xs text-muted">Matches: {persona.titleKeywords.join(', ') || '—'}</p>
                {persona.excludeKeywords.length > 0 ? (
                  <p className="text-xs text-muted">Excludes: {persona.excludeKeywords.join(', ')}</p>
                ) : null}
                {persona.painPoints.length > 0 ? (
                  <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
                    {persona.painPoints.slice(0, 2).map((p) => <li key={p}>· {p}</li>)}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Scoring rules" subtitle="Declarative adjustments layered on top of the base engine" />
          <ul className="space-y-2.5">
            {rules.map((rule) => (
              <li key={rule.id} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">{rule.name}</span>
                  <Badge tone={rule.points >= 0 ? 'ok' : 'danger'}>{rule.points > 0 ? '+' : ''}{rule.points}</Badge>
                  <Badge>{rule.dimension}</Badge>
                  <Badge tone={rule.isActive ? 'ok' : 'neutral'}>{rule.isActive ? 'active' : 'inactive'}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted">{rule.rationale}</p>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-surface2 p-2 text-[10px] text-muted">
                  {JSON.stringify(rule.predicate, null, 2)}
                </pre>
              </li>
            ))}
            {rules.length === 0 ? <li className="text-sm text-muted">No custom rules — the base engine applies.</li> : null}
          </ul>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

function Select({ name, label, options }: { name: string; label: string; options: Array<{ value: string; label: string }> }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={`t-${name}`} className="block text-xs font-medium text-ink">{label}</label>
      <select id={`t-${name}`} name={name} className="input py-1.5 text-xs">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Multi({ name, label, options }: { name: string; label: string; options: Array<{ value: string; label: string }> }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={`tm-${name}`} className="block text-xs font-medium text-ink">{label}</label>
      <select id={`tm-${name}`} name={name} multiple size={4} className="input h-auto py-1.5 text-xs">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
