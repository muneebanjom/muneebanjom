import '../server-guard';
import type { IntegrationProvider } from '@prisma/client';
import { prisma } from '../db';
import { decrypt, encrypt } from '../crypto';
import type { ConnectorCredentials } from './types';

/**
 * Credentials never leave this module in plaintext: they are decrypted only for
 * the duration of a connector call and are never returned to a client component
 * or written to a log.
 */
export async function storeCredentials(integrationId: string, creds: ConnectorCredentials): Promise<void> {
  await prisma.integration.update({
    where: { id: integrationId },
    data: { credentialsEnc: encrypt(JSON.stringify(creds)) },
  });
}

export async function loadCredentials(workspaceId: string, integrationId: string): Promise<ConnectorCredentials | null> {
  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, workspaceId },
    select: { credentialsEnc: true, complianceAttestedAt: true, status: true },
  });
  if (!integration?.credentialsEnc) return null;
  // Fail closed: an un-attested connector is never callable.
  if (!integration.complianceAttestedAt) return null;
  const raw = decrypt(integration.credentialsEnc);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ConnectorCredentials;
  } catch {
    return null;
  }
}

export async function clearCredentials(workspaceId: string, integrationId: string): Promise<void> {
  await prisma.integration.updateMany({
    where: { id: integrationId, workspaceId },
    data: { credentialsEnc: null, status: 'DISCONNECTED', syncCursor: null },
  });
}

/** Safe summary for the UI — presence only, never the value. */
export interface IntegrationSummary {
  id: string;
  provider: IntegrationProvider;
  label: string;
  status: string;
  hasCredentials: boolean;
  attested: boolean;
  lastSyncAt: Date | null;
  lastError: string | null;
}

export async function listIntegrations(workspaceId: string): Promise<IntegrationSummary[]> {
  const rows = await prisma.integration.findMany({ where: { workspaceId }, orderBy: { createdAt: 'asc' } });
  return rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    label: r.label,
    status: r.status,
    hasCredentials: Boolean(r.credentialsEnc),
    attested: Boolean(r.complianceAttestedAt),
    lastSyncAt: r.lastSyncAt,
    lastError: r.lastError,
  }));
}
