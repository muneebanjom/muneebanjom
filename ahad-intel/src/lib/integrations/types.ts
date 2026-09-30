import type {
  BuyingTrigger, CompanySize, ConsentBasis, IntegrationProvider, PersonaCategory, Region, Vertical,
} from '@prisma/client';

export type ConnectorCapability = 'search' | 'enrich_person' | 'enrich_company' | 'import' | 'sync';

/**
 * Compliance envelope every connector must declare. It is rendered verbatim in
 * the Integrations UI and must be attested by an admin before the connector can
 * be enabled — the product refuses to hide what a data source actually does.
 */
export interface ComplianceProfile {
  /** What this connector is allowed to do. */
  permitted: string[];
  /** What this connector must never do — enforced by not implementing it. */
  prohibited: string[];
  /** Whose credentials and subscription are used. */
  credentialOwnership: 'workspace' | 'user' | 'none';
  /** Text the admin must accept before connecting. */
  attestation: string;
  /** Lawful basis recorded on every record this connector produces. */
  defaultConsentBasis: ConsentBasis;
  docsUrl?: string;
}

export interface NormalizedCompany {
  name: string;
  legalName?: string | null;
  domain?: string | null;
  website?: string | null;
  linkedinUrl?: string | null;
  description?: string | null;
  country?: string | null;
  city?: string | null;
  region?: Region;
  vertical?: Vertical;
  employeeCount?: number | null;
  companySize?: CompanySize | null;
  annualRevenueUsd?: bigint | null;
  isPublic?: boolean;
  isRegulated?: boolean;
  regulators?: string[];
  techStack?: string[];
  triggers?: BuyingTrigger[];
  externalId?: string | null;
}

export interface NormalizedPerson {
  firstName: string;
  lastName: string;
  fullName: string;
  title?: string | null;
  personaCategory?: PersonaCategory;
  email?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  linkedinPublicId?: string | null;
  country?: string | null;
  city?: string | null;
  region?: Region;
  languages?: string[];
  summary?: string | null;
  externalId?: string | null;
  company: NormalizedCompany;
}

export interface NormalizedImport {
  people: NormalizedPerson[];
  errors: Array<{ row: number; message: string }>;
  detectedColumns: string[];
  skipped: number;
}

export interface ConnectorCredentials {
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  accountRef?: string;
  [key: string]: string | undefined;
}

export interface ConnectorHealth {
  ok: boolean;
  message: string;
  accountRef?: string;
  quotaRemaining?: number;
  checkedAt: Date;
}

export interface PersonQuery {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  companyDomain?: string;
  companyName?: string;
  linkedinUrl?: string;
}

export interface SearchQuery {
  titles?: string[];
  seniorities?: string[];
  countries?: string[];
  industries?: string[];
  employeeRange?: [number, number];
  page?: number;
  perPage?: number;
}

export interface Connector {
  provider: IntegrationProvider;
  label: string;
  capabilities: ConnectorCapability[];
  compliance: ComplianceProfile;
  /** Fields the operator must supply to connect (rendered as a form). */
  credentialFields: Array<{ key: string; label: string; type: 'password' | 'text'; help?: string }>;
  testConnection(creds: ConnectorCredentials): Promise<ConnectorHealth>;
  enrichPerson?(query: PersonQuery, creds: ConnectorCredentials): Promise<NormalizedPerson[]>;
  enrichCompany?(domainOrName: string, creds: ConnectorCredentials): Promise<NormalizedCompany[]>;
  search?(query: SearchQuery, creds: ConnectorCredentials): Promise<NormalizedPerson[]>;
  parseImport?(content: string): Promise<NormalizedImport>;
}

export class ConnectorError extends Error {
  constructor(message: string, readonly status?: number, readonly retryable = false) {
    super(message);
    this.name = 'ConnectorError';
  }
}
