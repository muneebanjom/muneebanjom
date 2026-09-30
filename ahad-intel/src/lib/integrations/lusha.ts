import { finalizePerson } from './normalize';
import { requestJson } from './http';
import type {
  Connector, ConnectorCredentials, ConnectorHealth, NormalizedCompany, NormalizedPerson, PersonQuery,
} from './types';

/**
 * Lusha — official API, workspace's own API key and subscription.
 * Credit-aware: callers cache results as SourceRecords so a repeated enrichment
 * is a cache hit rather than a second credit.
 */
const BASE = 'https://api.lusha.com';

interface LushaContact {
  contactId?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  jobTitle?: string;
  emailAddresses?: Array<{ email?: string; emailType?: string }>;
  phoneNumbers?: Array<{ number?: string }>;
  location?: { country?: string; city?: string };
  socialLinks?: { linkedin?: string };
  company?: {
    name?: string;
    domain?: string;
    website?: string;
    description?: string;
    employees?: number;
    industry?: string;
    location?: { country?: string; city?: string };
  };
}

function toPerson(contact: LushaContact, fallbackCompany?: string): NormalizedPerson | null {
  const company: NormalizedCompany = {
    name: contact.company?.name ?? fallbackCompany ?? '',
    domain: contact.company?.domain ?? null,
    website: contact.company?.website ?? null,
    description: contact.company?.industry ?? contact.company?.description ?? null,
    employeeCount: contact.company?.employees ?? null,
    country: contact.company?.location?.country ?? null,
    city: contact.company?.location?.city ?? null,
  };
  if (!company.name) return null;

  return finalizePerson({
    firstName: contact.firstName ?? '',
    lastName: contact.lastName ?? '',
    fullName: contact.fullName ?? `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim(),
    title: contact.jobTitle ?? null,
    email: contact.emailAddresses?.find((e) => e.emailType === 'work')?.email ?? contact.emailAddresses?.[0]?.email ?? null,
    phone: contact.phoneNumbers?.[0]?.number ?? null,
    linkedinUrl: contact.socialLinks?.linkedin ?? null,
    country: contact.location?.country ?? null,
    city: contact.location?.city ?? null,
    externalId: contact.contactId ?? null,
    company,
  });
}

export const lushaConnector: Connector = {
  provider: 'LUSHA',
  label: 'Lusha',
  capabilities: ['enrich_person', 'enrich_company'],
  credentialFields: [
    { key: 'apiKey', label: 'Lusha API key', type: 'password', help: 'From your own Lusha account under API settings.' },
  ],
  compliance: {
    permitted: [
      'Enrich named contacts and companies through the official Lusha API.',
      'Use only your organisation\'s own Lusha subscription and credits.',
    ],
    prohibited: [
      'Sharing enriched data outside this workspace or reselling it.',
      'Enriching contacts who have opted out (the platform suppresses these automatically).',
    ],
    credentialOwnership: 'workspace',
    attestation:
      'I confirm this API key belongs to my organisation\'s own Lusha subscription and that our use of enriched data complies with Lusha\'s terms and applicable data-protection law.',
    defaultConsentBasis: 'LEGITIMATE_INTEREST',
    docsUrl: 'https://docs.lusha.com/',
  },

  async testConnection(creds: ConnectorCredentials): Promise<ConnectorHealth> {
    if (!creds.apiKey) return { ok: false, message: 'No API key supplied.', checkedAt: new Date() };
    try {
      const data = await requestJson<{ usage?: { credits?: number } }>(`${BASE}/account`, {
        headers: { api_key: creds.apiKey },
        maxAttempts: 2,
      });
      return {
        ok: true,
        message: 'Connected to Lusha.',
        quotaRemaining: data.usage?.credits,
        checkedAt: new Date(),
      };
    } catch (error) {
      return { ok: false, message: (error as Error).message, checkedAt: new Date() };
    }
  },

  async enrichPerson(query: PersonQuery, creds: ConnectorCredentials): Promise<NormalizedPerson[]> {
    if (!creds.apiKey) return [];
    const params = new URLSearchParams();
    if (query.firstName) params.set('firstName', query.firstName);
    if (query.lastName) params.set('lastName', query.lastName);
    if (query.email) params.set('email', query.email);
    if (query.companyDomain) params.set('companyDomain', query.companyDomain);
    else if (query.companyName) params.set('company', query.companyName);
    if (query.linkedinUrl) params.set('linkedinUrl', query.linkedinUrl);
    if ([...params.keys()].length === 0) return [];

    const data = await requestJson<{ data?: LushaContact | LushaContact[] }>(
      `${BASE}/v2/person?${params.toString()}`,
      { headers: { api_key: creds.apiKey } },
    );
    const contacts = Array.isArray(data.data) ? data.data : data.data ? [data.data] : [];
    return contacts.map((c) => toPerson(c, query.companyName)).filter((p): p is NormalizedPerson => p !== null);
  },

  async enrichCompany(domainOrName: string, creds: ConnectorCredentials): Promise<NormalizedCompany[]> {
    if (!creds.apiKey) return [];
    const isDomain = domainOrName.includes('.');
    const params = new URLSearchParams(isDomain ? { domain: domainOrName } : { company: domainOrName });
    const data = await requestJson<{ data?: LushaContact['company'] }>(
      `${BASE}/v2/company?${params.toString()}`,
      { headers: { api_key: creds.apiKey } },
    );
    if (!data.data?.name) return [];
    return [{
      name: data.data.name,
      domain: data.data.domain ?? null,
      website: data.data.website ?? null,
      description: data.data.industry ?? data.data.description ?? null,
      employeeCount: data.data.employees ?? null,
      country: data.data.location?.country ?? null,
      city: data.data.location?.city ?? null,
    }];
  },
};
