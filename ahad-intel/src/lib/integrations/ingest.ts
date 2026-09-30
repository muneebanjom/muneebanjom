import '../server-guard';
import type { ConsentBasis, IntegrationProvider, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { encrypt, hashEmail, randomToken } from '../crypto';
import { regionForCountry } from '../domain';
import { REGULATORS_BY_COUNTRY } from '../domain';
import type { NormalizedPerson } from './types';

export interface IngestOptions {
  workspaceId: string;
  provider: IntegrationProvider;
  integrationId?: string | null;
  importedBy: string;
  consentBasis?: ConsentBasis;
  campaignId?: string | null;
  ownerId?: string | null;
  createLeads?: boolean;
  batchId?: string;
}

export interface IngestResult {
  batchId: string;
  accountsCreated: number;
  accountsUpdated: number;
  contactsCreated: number;
  contactsUpdated: number;
  leadsCreated: number;
  skipped: number;
}

/**
 * Upserts normalized people into accounts, contacts and (optionally) leads.
 *
 * Merge precedence: never overwrite a non-empty stored value with provider data.
 * Human-entered fields therefore survive re-enrichment, which is what analysts
 * expect and what keeps curated records trustworthy.
 */
export async function ingestPeople(people: NormalizedPerson[], options: IngestOptions): Promise<IngestResult> {
  const batchId = options.batchId ?? randomToken(8);
  const result: IngestResult = {
    batchId, accountsCreated: 0, accountsUpdated: 0,
    contactsCreated: 0, contactsUpdated: 0, leadsCreated: 0, skipped: 0,
  };

  for (const person of people) {
    if (!person.company.name || !person.fullName) { result.skipped += 1; continue; }

    const account = await upsertAccount(person, options, result);
    const contact = await upsertContact(person, account.id, options, result);

    await prisma.sourceRecord.upsert({
      where: {
        workspaceId_provider_externalId: {
          workspaceId: options.workspaceId,
          provider: options.provider,
          externalId: person.externalId ?? `${contact.id}:${options.provider}`,
        },
      },
      create: {
        workspaceId: options.workspaceId,
        integrationId: options.integrationId ?? null,
        provider: options.provider,
        externalId: person.externalId ?? `${contact.id}:${options.provider}`,
        accountId: account.id,
        contactId: contact.id,
        payload: redactPayload(person) as unknown as Prisma.InputJsonValue,
        fieldsProvided: providedFields(person),
        importedBy: options.importedBy,
        importBatchId: batchId,
        consentBasis: options.consentBasis ?? 'LEGITIMATE_INTEREST',
      },
      update: {
        payload: redactPayload(person) as unknown as Prisma.InputJsonValue,
        fieldsProvided: providedFields(person),
        retrievedAt: new Date(),
      },
    });

    if (options.createLeads !== false) {
      const existingLead = await prisma.lead.findFirst({
        where: { workspaceId: options.workspaceId, contactId: contact.id, campaignId: options.campaignId ?? null },
      });
      if (!existingLead) {
        await prisma.lead.create({
          data: {
            workspaceId: options.workspaceId,
            contactId: contact.id,
            accountId: account.id,
            campaignId: options.campaignId ?? null,
            ownerId: options.ownerId ?? null,
            stage: 'IMPORTED',
          },
        });
        result.leadsCreated += 1;
      }
    }
  }

  return result;
}

async function upsertAccount(person: NormalizedPerson, options: IngestOptions, result: IngestResult) {
  const c = person.company;
  const country = c.country ?? null;
  const regulators = country ? REGULATORS_BY_COUNTRY[country] ?? [] : [];

  // Dedupe on domain first (strong key), then on name + country.
  const existing = c.domain
    ? await prisma.account.findFirst({ where: { workspaceId: options.workspaceId, domain: c.domain } })
    : await prisma.account.findFirst({
        where: { workspaceId: options.workspaceId, name: { equals: c.name, mode: 'insensitive' }, country },
      });

  if (existing) {
    const updated = await prisma.account.update({
      where: { id: existing.id },
      data: {
        // Only fill gaps — curated values win over provider values.
        domain: existing.domain ?? c.domain ?? null,
        website: existing.website ?? c.website ?? null,
        linkedinUrl: existing.linkedinUrl ?? c.linkedinUrl ?? null,
        description: existing.description ?? c.description ?? null,
        country: existing.country ?? country,
        city: existing.city ?? c.city ?? null,
        region: existing.region === 'OTHER' ? c.region ?? regionForCountry(country) : existing.region,
        vertical: existing.vertical === 'OTHER' ? c.vertical ?? 'OTHER' : existing.vertical,
        employeeCount: existing.employeeCount ?? c.employeeCount ?? null,
        companySize: existing.companySize ?? c.companySize ?? null,
        annualRevenueUsd: existing.annualRevenueUsd ?? c.annualRevenueUsd ?? null,
        techStack: existing.techStack.length ? existing.techStack : c.techStack ?? [],
        regulators: existing.regulators.length ? existing.regulators : regulators,
        isRegulated: existing.isRegulated || regulators.length > 0,
      },
    });
    result.accountsUpdated += 1;
    return updated;
  }

  const created = await prisma.account.create({
    data: {
      workspaceId: options.workspaceId,
      name: c.name,
      legalName: c.legalName ?? null,
      domain: c.domain ?? null,
      website: c.website ?? null,
      linkedinUrl: c.linkedinUrl ?? null,
      description: c.description ?? null,
      country,
      city: c.city ?? null,
      region: c.region ?? regionForCountry(country),
      vertical: c.vertical ?? 'OTHER',
      employeeCount: c.employeeCount ?? null,
      companySize: c.companySize ?? null,
      annualRevenueUsd: c.annualRevenueUsd ?? null,
      isPublic: c.isPublic ?? false,
      isRegulated: (c.isRegulated ?? false) || regulators.length > 0,
      regulators,
      techStack: c.techStack ?? [],
      triggers: c.triggers ?? [],
    },
  });
  result.accountsCreated += 1;
  return created;
}

async function upsertContact(person: NormalizedPerson, accountId: string, options: IngestOptions, result: IngestResult) {
  const emailHash = hashEmail(person.email);

  // Dedupe: email hash → LinkedIn public id → name within the same account.
  const existing =
    (emailHash ? await prisma.contact.findFirst({ where: { workspaceId: options.workspaceId, emailHash } }) : null)
    ?? (person.linkedinPublicId
      ? await prisma.contact.findFirst({ where: { workspaceId: options.workspaceId, linkedinPublicId: person.linkedinPublicId } })
      : null)
    ?? (await prisma.contact.findFirst({
      where: { workspaceId: options.workspaceId, accountId, fullName: { equals: person.fullName, mode: 'insensitive' } },
    }));

  const persona = await prisma.persona.findFirst({
    where: { workspaceId: options.workspaceId, category: person.personaCategory ?? 'OTHER', isActive: true },
  });

  if (existing) {
    const updated = await prisma.contact.update({
      where: { id: existing.id },
      data: {
        title: existing.title ?? person.title ?? null,
        emailEnc: existing.emailEnc ?? encrypt(person.email),
        emailHash: existing.emailHash ?? emailHash,
        phoneEnc: existing.phoneEnc ?? encrypt(person.phone),
        linkedinUrl: existing.linkedinUrl ?? person.linkedinUrl ?? null,
        linkedinPublicId: existing.linkedinPublicId ?? person.linkedinPublicId ?? null,
        country: existing.country ?? person.country ?? null,
        city: existing.city ?? person.city ?? null,
        region: existing.region === 'OTHER' ? person.region ?? regionForCountry(person.country) : existing.region,
        personaCategory: existing.personaCategory === 'OTHER' ? person.personaCategory ?? 'OTHER' : existing.personaCategory,
        personaId: existing.personaId ?? persona?.id ?? null,
        summary: existing.summary ?? person.summary ?? null,
        lastEnrichedAt: new Date(),
      },
    });
    result.contactsUpdated += 1;
    return updated;
  }

  const created = await prisma.contact.create({
    data: {
      workspaceId: options.workspaceId,
      accountId,
      firstName: person.firstName,
      lastName: person.lastName,
      fullName: person.fullName,
      title: person.title ?? null,
      personaCategory: person.personaCategory ?? 'OTHER',
      personaId: persona?.id ?? null,
      country: person.country ?? null,
      city: person.city ?? null,
      region: person.region ?? regionForCountry(person.country),
      emailEnc: encrypt(person.email),
      emailHash,
      phoneEnc: encrypt(person.phone),
      linkedinUrl: person.linkedinUrl ?? null,
      linkedinPublicId: person.linkedinPublicId ?? null,
      languages: person.languages ?? [],
      summary: person.summary ?? null,
      consentBasis: options.consentBasis ?? 'LEGITIMATE_INTEREST',
      lastEnrichedAt: new Date(),
    },
  });
  result.contactsCreated += 1;
  return created;
}

/** Raw payloads keep provenance, but never store contact PII in the clear. */
function redactPayload(person: NormalizedPerson): Record<string, unknown> {
  const { email, phone, ...rest } = person;
  return {
    ...rest,
    email: email ? '[stored encrypted on contact]' : null,
    phone: phone ? '[stored encrypted on contact]' : null,
    company: { ...person.company, annualRevenueUsd: person.company.annualRevenueUsd?.toString() ?? null },
  };
}

function providedFields(person: NormalizedPerson): string[] {
  const fields: string[] = [];
  if (person.title) fields.push('title');
  if (person.email) fields.push('email');
  if (person.phone) fields.push('phone');
  if (person.linkedinUrl) fields.push('linkedinUrl');
  if (person.country) fields.push('country');
  if (person.company.domain) fields.push('company.domain');
  if (person.company.employeeCount) fields.push('company.employeeCount');
  if (person.company.annualRevenueUsd) fields.push('company.revenue');
  return fields;
}
