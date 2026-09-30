import type {
  BuyingTrigger,
  Channel,
  CompanySize,
  DraftStatus,
  LeadStage,
  Maturity,
  MessageKind,
  OfferAngle,
  PersonaCategory,
  RecommendationStatus,
  Region,
  Tone,
  Vertical,
  IntegrationProvider,
  ReplySentiment,
} from '@prisma/client';

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const REGION_LABELS: Record<Region, string> = {
  UAE: 'United Arab Emirates',
  KSA: 'Saudi Arabia',
  GCC: 'GCC (other)',
  MENA: 'MENA (other)',
  LEVANT: 'Levant',
  NORTH_AFRICA: 'North Africa',
  EUROPE: 'Europe',
  NORTH_AMERICA: 'North America',
  APAC: 'APAC',
  OTHER: 'Other',
};

export const VERTICAL_LABELS: Record<Vertical, string> = {
  FINANCIAL_SERVICES: 'Financial services',
  HEALTHCARE: 'Healthcare',
  GOVERNMENT: 'Government & public sector',
  ENERGY: 'Energy & utilities',
  TELECOM: 'Telecom',
  LOGISTICS: 'Logistics & transport',
  REAL_ESTATE: 'Real estate',
  MANUFACTURING: 'Manufacturing',
  RETAIL: 'Retail & e-commerce',
  TECHNOLOGY: 'Technology',
  EDUCATION: 'Education',
  HOSPITALITY: 'Hospitality',
  PROFESSIONAL_SERVICES: 'Professional services',
  OTHER: 'Other',
};

export const PERSONA_LABELS: Record<PersonaCategory, string> = {
  CEO: 'CEO',
  CIO: 'CIO',
  CTO: 'CTO',
  CISO: 'CISO',
  HEAD_OF_GRC: 'Head of GRC',
  COMPLIANCE_OFFICER: 'Compliance Officer',
  RISK_OFFICER: 'Risk Officer',
  IT_DIRECTOR: 'IT Director',
  DIGITAL_TRANSFORMATION_DIRECTOR: 'Digital Transformation Director',
  DATA_AI_LEADER: 'Data / AI Leader',
  PROCUREMENT: 'Procurement & Vendor Management',
  OTHER: 'Other',
};

export const SIZE_LABELS: Record<CompanySize, string> = {
  MICRO: '1–49',
  SMALL: '50–199',
  MID: '200–999',
  LARGE: '1,000–4,999',
  ENTERPRISE: '5,000+',
};

export const MATURITY_LABELS: Record<Maturity, string> = {
  UNKNOWN: 'Unknown',
  NASCENT: 'Nascent',
  DEVELOPING: 'Developing',
  ESTABLISHED: 'Established',
  ADVANCED: 'Advanced',
};

export const TRIGGER_LABELS: Record<BuyingTrigger, string> = {
  COMPLIANCE_PRESSURE: 'Compliance pressure',
  SECURITY_INCIDENT: 'Security incident',
  CLOUD_MODERNIZATION: 'Cloud modernization',
  DIGITAL_TRANSFORMATION: 'Digital transformation',
  AI_ADOPTION: 'AI adoption',
  GOVERNANCE_REQUIREMENT: 'Governance requirement',
  REGULATORY_CHANGE: 'Regulatory change',
  ENTERPRISE_RISK: 'Enterprise risk',
  LEADERSHIP_CHANGE: 'Leadership change',
  FUNDING_OR_EXPANSION: 'Funding or expansion',
  AUDIT_FINDING: 'Audit finding',
  VENDOR_CONSOLIDATION: 'Vendor consolidation',
};

export const ANGLE_LABELS: Record<OfferAngle, string> = {
  CYBERSECURITY: 'Cybersecurity',
  COMPLIANCE_GRC: 'Compliance & GRC',
  ADVANCED_CYBER_DEFENSE: 'Advanced cyber defense',
  DIGITAL_TRANSFORMATION: 'Digital transformation',
  AI_GOVERNANCE: 'AI governance',
  AI_IMPLEMENTATION: 'AI implementation',
  ENTERPRISE_RISK: 'Executive risk',
  SECURITY_MODERNIZATION: 'Security modernization',
  OPERATIONAL_EFFICIENCY: 'Operational efficiency',
};

export const ANGLE_PITCH: Record<OfferAngle, string> = {
  CYBERSECURITY: 'Reduce exposure across the estate with managed detection, hardening and testing.',
  COMPLIANCE_GRC: 'Get and stay audit-ready against local regulation without stalling the business.',
  ADVANCED_CYBER_DEFENSE: 'Threat hunting, red teaming and 24/7 response for a mature security function.',
  DIGITAL_TRANSFORMATION: 'Modernize core platforms without inheriting a new risk surface.',
  AI_GOVERNANCE: 'Put controls, policy and assurance around AI before the regulator or the board asks.',
  AI_IMPLEMENTATION: 'Move AI pilots into governed production with measurable business outcomes.',
  ENTERPRISE_RISK: 'Translate technical risk into board-level exposure and a defensible reduction plan.',
  SECURITY_MODERNIZATION: 'Replace ageing controls with an architecture that fits cloud and hybrid work.',
  OPERATIONAL_EFFICIENCY: 'Consolidate tooling and vendors to cut spend while improving coverage.',
};

export const STAGE_LABELS: Record<LeadStage, string> = {
  IMPORTED: 'Imported',
  ENRICHED: 'Enriched',
  REVIEWED: 'Reviewed',
  SHORTLISTED: 'Shortlisted',
  CONTACTED: 'Contacted',
  REPLIED: 'Replied',
  QUALIFIED: 'Qualified',
  MEETING_BOOKED: 'Meeting booked',
  OPPORTUNITY: 'Opportunity',
  WON: 'Won',
  LOST: 'Lost',
  PARKED: 'Parked',
};

export const STAGE_ORDER: LeadStage[] = [
  'IMPORTED', 'ENRICHED', 'REVIEWED', 'SHORTLISTED', 'CONTACTED',
  'REPLIED', 'QUALIFIED', 'MEETING_BOOKED', 'OPPORTUNITY', 'WON',
];

export const CHANNEL_LABELS: Record<Channel, string> = {
  LINKEDIN_CONNECTION: 'LinkedIn connection request',
  LINKEDIN_MESSAGE: 'LinkedIn message',
  EMAIL: 'Email',
  PHONE: 'Phone',
  EVENT: 'Event',
  REFERRAL: 'Referral',
  OTHER: 'Other',
};

export const MESSAGE_KIND_LABELS: Record<MessageKind, string> = {
  LINKEDIN_CONNECTION_REQUEST: 'LinkedIn connection request',
  FIRST_FOLLOW_UP: 'First follow-up',
  NURTURE: 'Nurture',
  QUALIFICATION_QUESTIONS: 'Qualification questions',
  MEETING_REQUEST: 'Meeting request',
  BREAKUP: 'Breakup',
  EMAIL: 'Email',
};

export const TONE_LABELS: Record<Tone, string> = {
  CONSULTATIVE: 'Consultative',
  EXECUTIVE: 'Executive',
  CONCISE: 'Concise',
  PREMIUM: 'Premium',
  TECHNICAL: 'Technical',
};

export const DRAFT_STATUS_LABELS: Record<DraftStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SENT: 'Sent',
  ARCHIVED: 'Archived',
};

export const REC_STATUS_LABELS: Record<RecommendationStatus, string> = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  SNOOZED: 'Snoozed',
  DISMISSED: 'Dismissed',
  ACTIONED: 'Actioned',
};

export const PROVIDER_LABELS: Record<IntegrationProvider, string> = {
  MANUAL: 'Manual entry',
  CSV: 'CSV / spreadsheet',
  LINKEDIN_EXPORT: 'LinkedIn data export',
  LINKEDIN_API: 'LinkedIn (approved API)',
  LUSHA: 'Lusha',
  APOLLO: 'Apollo',
  HUBSPOT: 'HubSpot',
  SALESFORCE: 'Salesforce',
  DYNAMICS: 'Microsoft Dynamics',
  WEBHOOK: 'Webhook',
};

export const SENTIMENT_LABELS: Record<ReplySentiment, string> = {
  POSITIVE: 'Positive',
  NEUTRAL: 'Neutral',
  NEGATIVE: 'Negative',
  OUT_OF_OFFICE: 'Out of office',
  REFERRAL: 'Referred on',
  UNSUBSCRIBE: 'Opt-out',
};

// ---------------------------------------------------------------------------
// Geography
// ---------------------------------------------------------------------------

export const COUNTRY_TO_REGION: Record<string, Region> = {
  AE: 'UAE', SA: 'KSA',
  QA: 'GCC', KW: 'GCC', BH: 'GCC', OM: 'GCC',
  EG: 'MENA', JO: 'LEVANT', LB: 'LEVANT', IQ: 'LEVANT', PS: 'LEVANT', SY: 'LEVANT',
  MA: 'NORTH_AFRICA', TN: 'NORTH_AFRICA', DZ: 'NORTH_AFRICA', LY: 'NORTH_AFRICA',
  TR: 'MENA', PK: 'APAC', IN: 'APAC', SG: 'APAC',
  GB: 'EUROPE', DE: 'EUROPE', FR: 'EUROPE', NL: 'EUROPE',
  US: 'NORTH_AMERICA', CA: 'NORTH_AMERICA',
};

export const COUNTRY_NAMES: Record<string, string> = {
  AE: 'United Arab Emirates', SA: 'Saudi Arabia', QA: 'Qatar', KW: 'Kuwait',
  BH: 'Bahrain', OM: 'Oman', EG: 'Egypt', JO: 'Jordan', LB: 'Lebanon',
  IQ: 'Iraq', MA: 'Morocco', TN: 'Tunisia', DZ: 'Algeria', LY: 'Libya',
  TR: 'Türkiye', PK: 'Pakistan', IN: 'India', SG: 'Singapore',
  GB: 'United Kingdom', DE: 'Germany', FR: 'France', NL: 'Netherlands',
  US: 'United States', CA: 'Canada',
};

/** Regions treated as "adjacent" — partial geography credit in fit scoring. */
export const REGION_ADJACENCY: Record<Region, Region[]> = {
  UAE: ['GCC', 'KSA', 'MENA'],
  KSA: ['GCC', 'UAE', 'MENA'],
  GCC: ['UAE', 'KSA', 'MENA'],
  MENA: ['GCC', 'UAE', 'KSA', 'LEVANT', 'NORTH_AFRICA'],
  LEVANT: ['MENA', 'GCC'],
  NORTH_AFRICA: ['MENA'],
  EUROPE: ['NORTH_AMERICA'],
  NORTH_AMERICA: ['EUROPE'],
  APAC: [],
  OTHER: [],
};

export function regionForCountry(country: string | null | undefined): Region {
  if (!country) return 'OTHER';
  return COUNTRY_TO_REGION[country.trim().toUpperCase()] ?? 'OTHER';
}

export function countryName(code: string | null | undefined): string {
  if (!code) return '—';
  return COUNTRY_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}

// ---------------------------------------------------------------------------
// Ordinal helpers
// ---------------------------------------------------------------------------

export const MATURITY_RANK: Record<Maturity, number> = {
  UNKNOWN: 0, NASCENT: 1, DEVELOPING: 2, ESTABLISHED: 3, ADVANCED: 4,
};

export const SIZE_RANK: Record<CompanySize, number> = {
  MICRO: 0, SMALL: 1, MID: 2, LARGE: 3, ENTERPRISE: 4,
};

export function sizeFromEmployees(count: number | null | undefined): CompanySize | null {
  if (count == null) return null;
  if (count < 50) return 'MICRO';
  if (count < 200) return 'SMALL';
  if (count < 1000) return 'MID';
  if (count < 5000) return 'LARGE';
  return 'ENTERPRISE';
}

/** Verticals that carry heavy sector regulation in GCC/MENA. */
export const REGULATED_VERTICALS: Vertical[] = [
  'FINANCIAL_SERVICES', 'HEALTHCARE', 'GOVERNMENT', 'ENERGY', 'TELECOM',
];

/** Regional regulators and frameworks referenced in reasoning and messaging. */
export const REGULATORS_BY_COUNTRY: Record<string, string[]> = {
  AE: ['CBUAE', 'DIFC DP Law', 'ADGM', 'UAE IA', 'NESA', 'TDRA', 'DoH', 'SIA'],
  SA: ['SAMA CSF', 'NCA ECC', 'NCA CCC', 'SDAIA PDPL', 'CST', 'CMA'],
  QA: ['QCB', 'NCSA Qatar', 'Qatar PDPPL'],
  KW: ['CBK', 'CITRA'],
  BH: ['CBB', 'Bahrain PDPL'],
  OM: ['CBO', 'OCERT'],
  EG: ['CBE', 'Egypt PDP Law'],
};

export function enumOptions<T extends Record<string, string>>(labels: T) {
  return (Object.keys(labels) as Array<keyof T>).map((value) => ({
    value: value as string,
    label: labels[value],
  }));
}
