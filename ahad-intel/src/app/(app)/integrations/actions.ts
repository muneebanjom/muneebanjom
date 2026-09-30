'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { IntegrationProvider } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { assertPermission } from '@/lib/rbac';
import { audit } from '@/lib/audit';
import { assertSameWorkspace } from '@/lib/tenancy';
import { connectorFor } from '@/lib/integrations/registry';
import { clearCredentials, loadCredentials, storeCredentials } from '@/lib/integrations/credentials';
import { ingestPeople } from '@/lib/integrations/ingest';
import { enqueue } from '@/jobs/queue';

export interface ImportState { ok?: boolean; error?: string; summary?: string }

/**
 * Compliance attestation gate. A connector cannot hold or use credentials until
 * an admin has explicitly accepted its stated permitted/prohibited uses.
 */
export async function attestComplianceAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'integration:write');

  const integrationId = String(formData.get('integrationId') ?? '');
  const accepted = formData.get('accepted') === 'on';
  const integration = await prisma.integration.findUnique({ where: { id: integrationId } });
  assertSameWorkspace(integration, session.workspaceId, 'Integration');
  if (!integration) return;

  await prisma.integration.update({
    where: { id: integrationId },
    data: accepted
      ? { complianceAttestedBy: session.email, complianceAttestedAt: new Date() }
      : { complianceAttestedBy: null, complianceAttestedAt: null, status: 'DISCONNECTED', credentialsEnc: null },
  });

  await audit(session, {
    action: accepted ? 'integration.attest' : 'integration.revoke_attestation',
    entityType: 'Integration',
    entityId: integrationId,
    changes: { provider: integration.provider },
    severity: 'critical',
  });
  revalidatePath('/integrations');
}

export async function connectIntegrationAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'integration:write');

  const integrationId = String(formData.get('integrationId') ?? '');
  const integration = await prisma.integration.findUnique({ where: { id: integrationId } });
  assertSameWorkspace(integration, session.workspaceId, 'Integration');
  if (!integration) return;

  // Fail closed: no attestation, no credentials.
  if (!integration.complianceAttestedAt) {
    await audit(session, {
      action: 'integration.connect_denied',
      entityType: 'Integration',
      entityId: integrationId,
      changes: { reason: 'compliance not attested' },
      severity: 'warning',
    });
    return;
  }

  const connector = connectorFor(integration.provider);
  if (!connector) return;

  const creds: Record<string, string> = {};
  for (const field of connector.credentialFields) {
    const value = String(formData.get(field.key) ?? '').trim();
    if (value) creds[field.key] = value;
  }
  if (Object.keys(creds).length === 0) return;

  await storeCredentials(integrationId, creds);
  const health = await connector.testConnection(creds);

  await prisma.integration.update({
    where: { id: integrationId },
    data: {
      status: health.ok ? 'CONNECTED' : 'ERROR',
      lastError: health.ok ? null : health.message.slice(0, 500),
      accountRef: health.accountRef ?? integration.accountRef,
      lastSyncAt: health.ok ? new Date() : integration.lastSyncAt,
    },
  });

  // Credential values are never included in the audit payload.
  await audit(session, {
    action: 'integration.connect',
    entityType: 'Integration',
    entityId: integrationId,
    changes: { provider: integration.provider, ok: health.ok, message: health.message },
    severity: 'critical',
  });
  revalidatePath('/integrations');
}

export async function testIntegrationAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'integration:write');

  const integrationId = String(formData.get('integrationId') ?? '');
  const integration = await prisma.integration.findUnique({ where: { id: integrationId } });
  assertSameWorkspace(integration, session.workspaceId, 'Integration');
  if (!integration) return;

  const connector = connectorFor(integration.provider);
  const creds = await loadCredentials(session.workspaceId, integrationId);
  if (!connector || !creds) {
    await prisma.integration.update({
      where: { id: integrationId },
      data: { status: 'DISCONNECTED', lastError: 'No usable credentials, or compliance is not attested.' },
    });
    revalidatePath('/integrations');
    return;
  }

  const health = await connector.testConnection(creds);
  await prisma.integration.update({
    where: { id: integrationId },
    data: { status: health.ok ? 'CONNECTED' : 'ERROR', lastError: health.ok ? null : health.message.slice(0, 500) },
  });
  await audit(session, { action: 'integration.test', entityType: 'Integration', entityId: integrationId, changes: { ok: health.ok } });
  revalidatePath('/integrations');
}

export async function disconnectIntegrationAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'integration:write');

  const integrationId = String(formData.get('integrationId') ?? '');
  const integration = await prisma.integration.findUnique({ where: { id: integrationId } });
  assertSameWorkspace(integration, session.workspaceId, 'Integration');
  if (!integration) return;

  await clearCredentials(session.workspaceId, integrationId);
  await audit(session, {
    action: 'integration.disconnect',
    entityType: 'Integration',
    entityId: integrationId,
    severity: 'critical',
  });
  revalidatePath('/integrations');
}

const importSchema = z.object({
  provider: z.enum(['CSV', 'LINKEDIN_EXPORT']),
  content: z.string().min(10).max(5_000_000),
  campaignId: z.string().optional(),
  attested: z.literal('on'),
});

/** Paste-or-upload import. Attestation is required on every import, not once. */
export async function importCsvAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const session = await requireSession();
  assertPermission(session.role, 'import:write');

  const file = formData.get('file');
  let content = String(formData.get('content') ?? '');
  if (file instanceof File && file.size > 0) content = await file.text();

  const parsed = importSchema.safeParse({
    provider: formData.get('provider'),
    content,
    campaignId: formData.get('campaignId') || undefined,
    attested: formData.get('attested'),
  });
  if (!parsed.success) {
    return { error: 'Provide a CSV file or pasted rows, and confirm the compliance statement.' };
  }

  const connector = connectorFor(parsed.data.provider as IntegrationProvider);
  if (!connector?.parseImport) return { error: 'That source does not support import.' };

  const result = await connector.parseImport(parsed.data.content);
  if (result.people.length === 0) {
    return { error: `Nothing importable found. ${result.errors[0]?.message ?? 'Check the column headers.'}` };
  }

  const integration = await prisma.integration.findFirst({
    where: { workspaceId: session.workspaceId, provider: parsed.data.provider as IntegrationProvider },
  });

  const ingested = await ingestPeople(result.people, {
    workspaceId: session.workspaceId,
    provider: parsed.data.provider as IntegrationProvider,
    integrationId: integration?.id ?? null,
    importedBy: session.email,
    consentBasis: connector.compliance.defaultConsentBasis,
    campaignId: parsed.data.campaignId ?? null,
  });

  await audit(session, {
    action: 'import.csv',
    entityType: 'SourceRecord',
    changes: {
      provider: parsed.data.provider,
      rows: result.people.length,
      skippedRows: result.skipped,
      ...ingested,
    },
    severity: 'notice',
  });

  // Newly imported leads need scoring before they can be recommended.
  await enqueue(session.workspaceId, 'rescore', {});

  revalidatePath('/integrations');
  revalidatePath('/leads');
  return {
    ok: true,
    summary:
      `Imported ${result.people.length} row(s): ${ingested.accountsCreated} new accounts, ` +
      `${ingested.contactsCreated} new contacts, ${ingested.leadsCreated} new leads. ` +
      `${ingested.accountsUpdated + ingested.contactsUpdated} existing records enriched, ` +
      `${result.skipped} row(s) skipped. Rescoring has been queued.`,
  };
}

export async function enrichSelectionAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.role, 'enrich:run');

  const integrationId = String(formData.get('integrationId') ?? '');
  const limit = Math.min(200, Number(formData.get('limit') ?? 25) || 25);

  const integration = await prisma.integration.findUnique({ where: { id: integrationId } });
  assertSameWorkspace(integration, session.workspaceId, 'Integration');
  if (!integration || integration.status !== 'CONNECTED' || !integration.complianceAttestedAt) return;

  // Never send opted-out contacts to a third-party provider.
  const contacts = await prisma.contact.findMany({
    where: { workspaceId: session.workspaceId, optedOut: false, OR: [{ emailEnc: null }, { title: null }] },
    select: { id: true },
    take: limit,
  });
  if (contacts.length === 0) return;

  await enqueue(session.workspaceId, 'enrich', {
    integrationId,
    contactIds: contacts.map((c) => c.id),
  });

  await audit(session, {
    action: 'enrich.queue',
    entityType: 'Integration',
    entityId: integrationId,
    changes: { contacts: contacts.length },
    severity: 'notice',
  });
  revalidatePath('/integrations');
}
