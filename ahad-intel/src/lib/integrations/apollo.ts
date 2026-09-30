import { finalizePerson } from './normalize';
import { requestJson } from './http';
import type {
  Connector, ConnectorCredentials, ConnectorHealth, NormalizedCompany, NormalizedPerson,
  PersonQuery, SearchQuery,
} from './types';

/**
 * Apollo — official REST API with the workspace's own API key.
 * Search is bounded by the operator's own plan entitlements; this client never
 * attempts to widen them.
 */
const BASE = 'https://api.apollo.io/api/v1';

interface ApolloOrganization {
  id?: string;
  name?: string;
  website_url?: string;
  primary_domain?: string;
  linkedin_url?: string;
  short_description?: string;
  industry?: string;
  estimated_num_employees?: number;
  annual_revenue?: number;
  country?: string;
  city?: string;
  publicly_traded_symbol?: string | null;
  technology_names?: string[];
}

interface ApolloPerson {
  id?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  title?: string;
  email?: string;
  linkedin_url?: string;
  country?: string;
  city?: string;
  organization?: ApolloOrganization;
  organization_name?: string;
}

function toCompany(org: ApolloOrganization | undefined, fallbackName?: string): NormalizedCompany | null {
  const name = org?.name ?? fallbackName;
  if (!name) return null;
  return {
    name,
    domain: org?.primary_domain ?? null,
    website: org?.website_url ?? null,
    linkedinUrl: org?.linkedin_url ?? null,
    description: org?.short_description ?? org?.industry ?? null,
    employeeCount: org?.estimated_num_employees ?? null,
    annualRevenueUsd: org?.annual_revenue ? BigInt(Math.round(org.annual_revenue)) : null,
    country: org?.country ?? null,
    city: org?.city ?? null,
    isPublic: Boolean(org?.publicly_traded_symbol),
    techStack: org?.technology_names?.slice(0, 25) ?? [],
    externalId: org?.id ?? null,
  };
}

function toPerson(person: ApolloPerson): NormalizedPerson | null {
  const company = toCompany(person.organization, person.organization_name);
  if (!company) return null;
  return finalizePerson({
    firstName: person.first_name ?? '',
    lastName: person.last_name ?? '',
    fullName: person.name ?? `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim(),
    title: person.title ?? null,
    // Apollo returns placeholder values when a plan does not expose the address.
    email: person.email && !person.email.includes('email_not_unlocked') ? person.email : null,
    linkedinUrl: person.linkedin_url ?? null,
    country: person.country ?? null,
    city: person.city ?? null,
    externalId: person.id ?? null,
    company,
  });
}

export const apolloConnector: Connector = {
  provider: 'APOLLO',
  label: 'Apollo',
  capabilities: ['search', 'enrich_person', 'enrich_company'],
  credentialFields: [
    { key: 'apiKey', label: 'Apollo API key', type: 'password', help: 'From your own Apollo account under Settings → Integrations → API.' },
  ],
  compliance: {
    permitted: [
      'Search and enrich through the official Apollo API within your own plan entitlements.',
      'Store results with provenance so a repeated lookup does not spend another credit.',
    ],
    prohibited: [
      'Exceeding or circumventing your plan\'s entitlements or rate limits.',
      'Exporting Apollo data to third parties or reselling it.',
    ],
    credentialOwnership: 'workspace',
    attestation:
      'I confirm this API key belongs to my organisation\'s own Apollo subscription and that our use complies with Apollo\'s terms of service and applicable data-protection law.',
    defaultConsentBasis: 'LEGITIMATE_INTEREST',
    docsUrl: 'https://docs.apollo.io/',
  },

  async testConnection(creds: ConnectorCredentials): Promise<ConnectorHealth> {
    if (!creds.apiKey) return { ok: false, message: 'No API key supplied.', checkedAt: new Date() };
    try {
      const data = await requestJson<{ team?: { name?: string } }>(`${BASE}/auth/health`, {
        headers: { 'x-api-key': creds.apiKey },
        maxAttempts: 2,
      });
      return { ok: true, message: `Connected to Apollo${data.team?.name ? ` (${data.team.name})` : ''}.`, checkedAt: new Date() };
    } catch (error) {
      return { ok: false, message: (error as Error).message, checkedAt: new Date() };
    }
  },

  async enrichPerson(query: PersonQuery, creds: ConnectorCredentials): Promise<NormalizedPerson[]> {
    if (!creds.apiKey) return [];
    const data = await requestJson<{ person?: ApolloPerson }>(`${BASE}/people/match`, {
      method: 'POST',
      headers: { 'x-api-key': creds.apiKey },
      body: {
        first_name: query.firstName,
        last_name: query.lastName,
        name: query.fullName,
        email: query.email,
        domain: query.companyDomain,
        organization_name: query.companyName,
        linkedin_url: query.linkedinUrl,
      },
    });
    const person = data.person ? toPerson(data.person) : null;
    return person ? [person] : [];
  },

  async enrichCompany(domainOrName: string, creds: ConnectorCredentials): Promise<NormalizedCompany[]> {
    if (!creds.apiKey) return [];
    const data = await requestJson<{ organization?: ApolloOrganization }>(
      `${BASE}/organizations/enrich?domain=${encodeURIComponent(domainOrName)}`,
      { headers: { 'x-api-key': creds.apiKey } },
    );
    const company = toCompany(data.organization, domainOrName);
    return company ? [company] : [];
  },

  async search(query: SearchQuery, creds: ConnectorCredentials): Promise<NormalizedPerson[]> {
    if (!creds.apiKey) return [];
    const data = await requestJson<{ people?: ApolloPerson[] }>(`${BASE}/mixed_people/search`, {
      method: 'POST',
      headers: { 'x-api-key': creds.apiKey },
      body: {
        person_titles: query.titles,
        person_seniorities: query.seniorities,
        person_locations: query.countries,
        organization_industry_tag_ids: undefined,
        q_organization_keyword_tags: query.industries,
        organization_num_employees_ranges: query.employeeRange ? [`${query.employeeRange[0]},${query.employeeRange[1]}`] : undefined,
        page: query.page ?? 1,
        per_page: Math.min(query.perPage ?? 25, 100),
      },
    });
    return (data.people ?? []).map(toPerson).filter((p): p is NormalizedPerson => p !== null);
  },
};
