import '../lib/server-guard';
import type { JobRun } from '@prisma/client';
import { prisma } from '../lib/db';
import { auditSystem } from '../lib/audit';
import { generateDailyFeed } from '../lib/recommendations/engine';
import { rescoreWorkspace } from '../lib/scoring/service';
import { connectorFor } from '../lib/integrations/registry';
import { loadCredentials } from '../lib/integrations/credentials';
import { ingestPeople } from '../lib/integrations/ingest';
import { decrypt } from '../lib/crypto';

export async function runJob(job: JobRun): Promise<Record<string, unknown>> {
  switch (job.kind) {
    case 'daily_feed': {
      const payload = (job.payload ?? {}) as { size?: number; force?: boolean };
      const result = await generateDailyFeed({
        workspaceId: job.workspaceId,
        size: payload.size ?? 10,
        force: payload.force ?? false,
        generatedBy: 'job',
      });
      return { ...result };
    }
    case 'rescore': {
      const count = await rescoreWorkspace(job.workspaceId);
      return { rescored: count };
    }
    case 'enrich':
      return enrichJob(job);
    case 'retention_sweep':
      return retentionSweep(job.workspaceId);
    case 'import':
      return { note: 'Imports are processed synchronously by the import action.' };
    default:
      throw new Error(`Unknown job kind: ${job.kind}`);
  }
}

/** Enrichment runs against the workspace's own connector subscription. */
async function enrichJob(job: JobRun): Promise<Record<string, unknown>> {
  const payload = (job.payload ?? {}) as { integrationId?: string; contactIds?: string[] };
  if (!payload.integrationId || !payload.contactIds?.length) return { enriched: 0 };

  const integration = await prisma.integration.findFirst({
    where: { id: payload.integrationId, workspaceId: job.workspaceId },
  });
  if (!integration) throw new Error('Integration not found.');

  const connector = connectorFor(integration.provider);
  if (!connector?.enrichPerson) throw new Error(`${integration.provider} does not support person enrichment.`);

  const creds = await loadCredentials(job.workspaceId, integration.id);
  if (!creds) throw new Error('Integration is not connected or not attested for compliance.');

  const contacts = await prisma.contact.findMany({
    where: { id: { in: payload.contactIds }, workspaceId: job.workspaceId, optedOut: false },
    include: { account: true },
  });

  let enriched = 0;
  for (const contact of contacts) {
    try {
      const people = await connector.enrichPerson(
        {
          firstName: contact.firstName,
          lastName: contact.lastName,
          fullName: contact.fullName,
          email: decrypt(contact.emailEnc) ?? undefined,
          companyDomain: contact.account.domain ?? undefined,
          companyName: contact.account.name,
          linkedinUrl: contact.linkedinUrl ?? undefined,
        },
        creds,
      );
      if (people.length === 0) continue;
      await ingestPeople(people, {
        workspaceId: job.workspaceId,
        provider: integration.provider,
        integrationId: integration.id,
        importedBy: 'job',
        consentBasis: connector.compliance.defaultConsentBasis,
        createLeads: false,
      });
      enriched += 1;
    } catch (error) {
      await prisma.integration.update({
        where: { id: integration.id },
        data: { lastError: (error as Error).message.slice(0, 500), status: 'ERROR' },
      });
      throw error;
    }
  }

  await prisma.integration.update({
    where: { id: integration.id },
    data: { lastSyncAt: new Date(), lastError: null, status: 'CONNECTED' },
  });
  return { enriched, requested: payload.contactIds.length };
}

/** Deletes raw provider payloads past the workspace's retention window. */
async function retentionSweep(workspaceId: string): Promise<Record<string, unknown>> {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) return { purged: 0 };
  const cutoff = new Date(Date.now() - workspace.dataRetentionDays * 86_400_000);

  const [sources, audits] = await Promise.all([
    prisma.sourceRecord.deleteMany({ where: { workspaceId, retrievedAt: { lt: cutoff } } }),
    prisma.auditEvent.deleteMany({ where: { workspaceId, createdAt: { lt: new Date(Date.now() - 365 * 2 * 86_400_000) } } }),
  ]);

  await auditSystem(workspaceId, {
    action: 'retention.sweep',
    entityType: 'Workspace',
    entityId: workspaceId,
    changes: { sourceRecordsPurged: sources.count, auditEventsPurged: audits.count, retentionDays: workspace.dataRetentionDays },
    severity: 'notice',
  });
  return { sourceRecordsPurged: sources.count, auditEventsPurged: audits.count };
}
