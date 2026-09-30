import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { relativeTime } from '@/lib/utils';
import { availableConnectors, connectorFor } from '@/lib/integrations/registry';
import { AccessDenied, Badge, Button, Card, CardHeader, Field, PageHeader } from '@/components/ui/primitives';
import { ImportForm } from './import-form';
import {
  attestComplianceAction, connectIntegrationAction, disconnectIntegrationAction,
  enrichSelectionAction, testIntegrationAction,
} from './actions';

export const metadata: Metadata = { title: 'Integrations' };
export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  const session = await requireSession();
  if (!can(session.role, 'integration:read')) {
    return <AccessDenied area="integrations" requiredRole="managers, admins and owners" />;
  }

  const [integrations, campaigns, recentJobs] = await Promise.all([
    prisma.integration.findMany({ where: { workspaceId: session.workspaceId }, orderBy: { createdAt: 'asc' } }),
    prisma.campaign.findMany({ where: { workspaceId: session.workspaceId, isActive: true }, select: { id: true, name: true } }),
    prisma.jobRun.findMany({
      where: { workspaceId: session.workspaceId, kind: { in: ['enrich', 'import'] } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  // Make sure every registered connector has a row the admin can act on.
  const byProvider = new Map(integrations.map((i) => [i.provider, i]));
  const connectors = availableConnectors();
  const canWrite = can(session.role, 'integration:write');

  const csvConnector = connectorFor('CSV');

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Compliant data sources only. Every connector runs on your own credentials and subscription, through the provider's official API or supported export."
      />

      <div className="mb-6 rounded-2xl border border-line bg-surface2 p-4 text-sm">
        <p className="font-medium text-ink">What this platform will not do</p>
        <ul className="mt-2 grid gap-1.5 text-xs text-muted sm:grid-cols-2">
          <li>· Scrape LinkedIn or any other site, in any form.</li>
          <li>· Replay cookies or sessions, or drive a logged-in browser.</li>
          <li>· Automate connection requests, messages or InMail.</li>
          <li>· Bypass rate limits, login walls, CAPTCHAs or robots directives.</li>
          <li>· Send anything without a named person approving the content.</li>
          <li>· Contact anyone recorded as opted out.</li>
        </ul>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {connectors.map((connector) => {
            const row = byProvider.get(connector.provider);
            const attested = Boolean(row?.complianceAttestedAt);
            const connected = row?.status === 'CONNECTED';

            return (
              <Card key={connector.provider}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-ink">{connector.label}</h2>
                      <Badge tone={connected ? 'ok' : row?.status === 'ERROR' ? 'danger' : 'neutral'}>
                        {(row?.status ?? 'NOT SET UP').toLowerCase().replace(/_/g, ' ')}
                      </Badge>
                      <Badge tone={attested ? 'ok' : 'warn'}>{attested ? 'compliance attested' : 'attestation required'}</Badge>
                      {connector.capabilities.map((c) => <Badge key={c}>{c.replace(/_/g, ' ')}</Badge>)}
                    </div>
                    <p className="mt-1.5 text-xs text-muted">
                      Credentials: {connector.compliance.credentialOwnership === 'none' ? 'none needed' : `supplied by the ${connector.compliance.credentialOwnership}`}
                      {row?.lastSyncAt ? ` · last activity ${relativeTime(row.lastSyncAt)}` : ''}
                    </p>
                  </div>
                  {connector.compliance.docsUrl ? (
                    <a
                      href={connector.compliance.docsUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="focus-ring shrink-0 text-xs text-brand hover:underline"
                    >
                      Provider docs ↗
                    </a>
                  ) : null}
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-line p-3">
                    <p className="label mb-1.5">Permitted</p>
                    <ul className="space-y-1 text-xs text-muted">
                      {connector.compliance.permitted.map((p) => <li key={p}>· {p}</li>)}
                    </ul>
                  </div>
                  <div className="rounded-xl border border-danger/20 bg-danger/5 p-3">
                    <p className="label mb-1.5 text-danger">Never</p>
                    <ul className="space-y-1 text-xs text-danger/90">
                      {connector.compliance.prohibited.map((p) => <li key={p}>· {p}</li>)}
                    </ul>
                  </div>
                </div>

                {row?.lastError ? (
                  <p className="mt-3 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger">
                    {row.lastError}
                  </p>
                ) : null}

                {canWrite && row ? (
                  <div className="mt-4 space-y-3 border-t border-line pt-3">
                    <form action={attestComplianceAction} className="space-y-2">
                      <input type="hidden" name="integrationId" value={row.id} />
                      <label className="flex cursor-pointer items-start gap-2.5 text-xs text-muted">
                        <input
                          type="checkbox"
                          name="accepted"
                          defaultChecked={attested}
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-line accent-[rgb(var(--brand))]"
                        />
                        <span>{connector.compliance.attestation}</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <Button type="submit" size="sm">{attested ? 'Update attestation' : 'Attest and enable'}</Button>
                        {attested && row.complianceAttestedBy ? (
                          <span className="text-xs text-muted">
                            Attested by {row.complianceAttestedBy} on {relativeTime(row.complianceAttestedAt)}
                          </span>
                        ) : null}
                      </div>
                    </form>

                    {connector.credentialFields.length > 0 ? (
                      <form action={connectIntegrationAction} className="space-y-2">
                        <input type="hidden" name="integrationId" value={row.id} />
                        <div className="grid gap-2 sm:grid-cols-2">
                          {connector.credentialFields.map((field) => (
                            <Field key={field.key} label={field.label} hint={field.help} htmlFor={`${row.id}-${field.key}`}>
                              <input
                                id={`${row.id}-${field.key}`}
                                name={field.key}
                                type={field.type}
                                autoComplete="off"
                                placeholder={row.credentialsEnc ? '•••••••• (stored)' : ''}
                                className="input py-1.5 text-xs"
                                disabled={!attested}
                              />
                            </Field>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button type="submit" variant="primary" size="sm" disabled={!attested}>
                            {row.credentialsEnc ? 'Replace credentials' : 'Connect'}
                          </Button>
                        </div>
                        {!attested ? (
                          <p className="text-xs text-warn">Accept the compliance statement before credentials can be stored.</p>
                        ) : null}
                      </form>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      {row.credentialsEnc ? (
                        <>
                          <form action={testIntegrationAction}>
                            <input type="hidden" name="integrationId" value={row.id} />
                            <Button type="submit" size="sm">Test connection</Button>
                          </form>
                          <form action={disconnectIntegrationAction}>
                            <input type="hidden" name="integrationId" value={row.id} />
                            <Button type="submit" size="sm" variant="danger">Disconnect</Button>
                          </form>
                        </>
                      ) : null}
                      {connected && connector.capabilities.includes('enrich_person') && can(session.role, 'enrich:run') ? (
                        <form action={enrichSelectionAction} className="flex items-end gap-2">
                          <input type="hidden" name="integrationId" value={row.id} />
                          <input name="limit" type="number" min={1} max={200} defaultValue={25} className="input w-20 py-1.5 text-xs" />
                          <Button type="submit" size="sm">Enrich incomplete contacts</Button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>

        <div className="space-y-5">
          {can(session.role, 'import:write') && csvConnector ? (
            <Card>
              <CardHeader title="Import data" subtitle="Manual entry, CSV, spreadsheet or a LinkedIn export you downloaded yourself." />
              <ImportForm
                campaigns={campaigns}
                attestations={{ CSV: csvConnector.compliance.attestation }}
              />
            </Card>
          ) : null}

          <Card>
            <CardHeader title="How records are merged" />
            <ol className="space-y-2 text-xs text-muted">
              <li><strong className="text-ink">1. Normalise</strong> — names, ISO country, region, vertical and persona are derived consistently, whatever the source.</li>
              <li><strong className="text-ink">2. Deduplicate</strong> — companies by domain then name and country; people by hashed email, then LinkedIn id, then name within the account.</li>
              <li><strong className="text-ink">3. Merge</strong> — provider data fills gaps only. A value a person entered is never overwritten by an API.</li>
              <li><strong className="text-ink">4. Record provenance</strong> — every inbound field set is stored with the source, external id, lawful basis and timestamp.</li>
            </ol>
          </Card>

          {recentJobs.length > 0 ? (
            <Card>
              <CardHeader title="Recent jobs" />
              <ul className="space-y-2 text-xs">
                {recentJobs.map((job) => (
                  <li key={job.id} className="flex items-center gap-2">
                    <Badge tone={job.status === 'succeeded' ? 'ok' : job.status === 'failed' ? 'danger' : 'neutral'}>
                      {job.status}
                    </Badge>
                    <span className="text-ink">{job.kind}</span>
                    <span className="ml-auto text-muted">{relativeTime(job.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Adding another provider" />
            <p className="text-xs text-muted">
              Connectors implement one shared interface. A new provider is a single module plus a registry
              entry — normalisation, deduplication, provenance, scoring and this page are all shared.
              See <code className="rounded bg-surface2 px-1 py-0.5">src/lib/integrations/</code> and{' '}
              <code className="rounded bg-surface2 px-1 py-0.5">docs/INTEGRATIONS.md</code>.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

