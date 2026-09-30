import type {
  BuyingTrigger, CompanySize, Maturity, OfferAngle, PersonaCategory, Region, Vertical,
} from '@prisma/client';

/**
 * Illustrative seed data for demos and local development.
 *
 * Company and person records here are fictional composites built to exercise the
 * scoring, diversification and messaging logic across the GCC/MENA market. They
 * are not real contact records and contain no real personal data.
 */
export interface SeedAccount {
  name: string;
  domain: string;
  country: string;
  city: string;
  region: Region;
  vertical: Vertical;
  employeeCount: number;
  companySize: CompanySize;
  annualRevenueUsd: number;
  isPublic: boolean;
  isRegulated: boolean;
  regulators: string[];
  description: string;
  complianceMaturity: Maturity;
  securityMaturity: Maturity;
  transformationMaturity: Maturity;
  aiReadiness: Maturity;
  techStack: string[];
  triggers: BuyingTrigger[];
  strategicValue: number;
  budgetPotentialUsd: number;
  contacts: SeedContact[];
  signals: SeedSignal[];
}

export interface SeedContact {
  firstName: string;
  lastName: string;
  title: string;
  personaCategory: PersonaCategory;
  email: string;
  linkedin: string;
  city?: string;
}

export interface SeedSignal {
  type: string;
  trigger: BuyingTrigger | null;
  title: string;
  detail: string;
  weight: number;
  daysAgo: number;
}

export const SEED_ACCOUNTS: SeedAccount[] = [
  {
    name: 'Gulf Union Bank',
    domain: 'gulfunionbank.example',
    country: 'AE', city: 'Dubai', region: 'UAE', vertical: 'FINANCIAL_SERVICES',
    employeeCount: 2400, companySize: 'LARGE', annualRevenueUsd: 1_800_000_000,
    isPublic: true, isRegulated: true, regulators: ['CBUAE', 'DIFC DP Law'],
    description: 'Retail and corporate bank operating across the UAE with a growing digital channel.',
    complianceMaturity: 'DEVELOPING', securityMaturity: 'DEVELOPING', transformationMaturity: 'ESTABLISHED', aiReadiness: 'DEVELOPING',
    techStack: ['Microsoft 365', 'Azure', 'Temenos', 'Splunk'],
    triggers: ['COMPLIANCE_PRESSURE', 'CLOUD_MODERNIZATION', 'AI_ADOPTION'],
    strategicValue: 88, budgetPotentialUsd: 1_500_000,
    contacts: [
      { firstName: 'Layla', lastName: 'Al Mansoori', title: 'Chief Information Security Officer', personaCategory: 'CISO', email: 'layla.almansoori@gulfunionbank.example', linkedin: 'https://www.linkedin.com/in/layla-almansoori-demo' },
      { firstName: 'Omar', lastName: 'Haddad', title: 'Head of Governance, Risk & Compliance', personaCategory: 'HEAD_OF_GRC', email: 'omar.haddad@gulfunionbank.example', linkedin: 'https://www.linkedin.com/in/omar-haddad-demo' },
      { firstName: 'Priya', lastName: 'Raghavan', title: 'Chief Information Officer', personaCategory: 'CIO', email: 'priya.raghavan@gulfunionbank.example', linkedin: 'https://www.linkedin.com/in/priya-raghavan-demo' },
    ],
    signals: [
      { type: 'regulation_deadline', trigger: 'REGULATORY_CHANGE', title: 'CBUAE control attestation due this quarter', detail: 'Annual attestation window closes in under 90 days.', weight: 45, daysAgo: 12 },
      { type: 'job_posting_soc', trigger: 'CLOUD_MODERNIZATION', title: 'Hiring for SOC modernisation programme', detail: 'Three detection-engineering roles posted.', weight: 30, daysAgo: 22 },
    ],
  },
  {
    name: 'Najd Petrochemical Industries',
    domain: 'najdpetrochem.example',
    country: 'SA', city: 'Jubail', region: 'KSA', vertical: 'ENERGY',
    employeeCount: 6800, companySize: 'ENTERPRISE', annualRevenueUsd: 5_200_000_000,
    isPublic: true, isRegulated: true, regulators: ['NCA ECC', 'SDAIA PDPL'],
    description: 'Integrated petrochemical producer with large OT estate and expanding digital operations.',
    complianceMaturity: 'DEVELOPING', securityMaturity: 'NASCENT', transformationMaturity: 'DEVELOPING', aiReadiness: 'NASCENT',
    techStack: ['SAP', 'Honeywell DCS', 'AWS'],
    triggers: ['SECURITY_INCIDENT', 'GOVERNANCE_REQUIREMENT', 'DIGITAL_TRANSFORMATION'],
    strategicValue: 95, budgetPotentialUsd: 3_000_000,
    contacts: [
      { firstName: 'Faisal', lastName: 'Al Qahtani', title: 'Chief Information Officer', personaCategory: 'CIO', email: 'faisal.alqahtani@najdpetrochem.example', linkedin: 'https://www.linkedin.com/in/faisal-alqahtani-demo' },
      { firstName: 'Hana', lastName: 'Al Otaibi', title: 'Director, Enterprise Risk', personaCategory: 'RISK_OFFICER', email: 'hana.alotaibi@najdpetrochem.example', linkedin: 'https://www.linkedin.com/in/hana-alotaibi-demo' },
    ],
    signals: [
      { type: 'breach_disclosure', trigger: 'SECURITY_INCIDENT', title: 'Sector peer disclosed an OT incident', detail: 'Regional peer confirmed disruption to plant systems.', weight: 40, daysAgo: 30 },
      { type: 'regulation_deadline', trigger: 'GOVERNANCE_REQUIREMENT', title: 'NCA ECC compliance review scheduled', detail: 'Internal readiness review announced.', weight: 38, daysAgo: 8 },
    ],
  },
  {
    name: 'Emirates Health Network',
    domain: 'ehn-health.example',
    country: 'AE', city: 'Abu Dhabi', region: 'UAE', vertical: 'HEALTHCARE',
    employeeCount: 3200, companySize: 'LARGE', annualRevenueUsd: 740_000_000,
    isPublic: false, isRegulated: true, regulators: ['DoH', 'UAE IA'],
    description: 'Private hospital group running a multi-site EMR consolidation programme.',
    complianceMaturity: 'NASCENT', securityMaturity: 'DEVELOPING', transformationMaturity: 'DEVELOPING', aiReadiness: 'NASCENT',
    techStack: ['Epic', 'VMware', 'Fortinet'],
    triggers: ['COMPLIANCE_PRESSURE', 'DIGITAL_TRANSFORMATION'],
    strategicValue: 72, budgetPotentialUsd: 800_000,
    contacts: [
      { firstName: 'Samir', lastName: 'Kassem', title: 'IT Director', personaCategory: 'IT_DIRECTOR', email: 'samir.kassem@ehn-health.example', linkedin: 'https://www.linkedin.com/in/samir-kassem-demo' },
      { firstName: 'Noura', lastName: 'Al Blooshi', title: 'Chief Compliance Officer', personaCategory: 'COMPLIANCE_OFFICER', email: 'noura.alblooshi@ehn-health.example', linkedin: 'https://www.linkedin.com/in/noura-alblooshi-demo' },
    ],
    signals: [
      { type: 'audit_finding', trigger: 'AUDIT_FINDING', title: 'Internal audit flagged access-control gaps', detail: 'Findings raised on privileged access to clinical systems.', weight: 35, daysAgo: 18 },
    ],
  },
  {
    name: 'Riyadh Digital Authority',
    domain: 'riyadhdigital.example',
    country: 'SA', city: 'Riyadh', region: 'KSA', vertical: 'GOVERNMENT',
    employeeCount: 1500, companySize: 'LARGE', annualRevenueUsd: 0,
    isPublic: false, isRegulated: true, regulators: ['NCA ECC', 'SDAIA PDPL', 'CST'],
    description: 'Public-sector digital services entity delivering citizen platforms under Vision 2030.',
    complianceMaturity: 'ESTABLISHED', securityMaturity: 'DEVELOPING', transformationMaturity: 'ESTABLISHED', aiReadiness: 'ESTABLISHED',
    techStack: ['Oracle Cloud', 'Kubernetes', 'Elastic'],
    triggers: ['AI_ADOPTION', 'GOVERNANCE_REQUIREMENT', 'DIGITAL_TRANSFORMATION'],
    strategicValue: 92, budgetPotentialUsd: 2_200_000,
    contacts: [
      { firstName: 'Abdulrahman', lastName: 'Al Dossari', title: 'Director of Digital Transformation', personaCategory: 'DIGITAL_TRANSFORMATION_DIRECTOR', email: 'a.aldossari@riyadhdigital.example', linkedin: 'https://www.linkedin.com/in/abdulrahman-aldossari-demo' },
      { firstName: 'Mariam', lastName: 'Al Shehri', title: 'Head of Data & AI', personaCategory: 'DATA_AI_LEADER', email: 'mariam.alshehri@riyadhdigital.example', linkedin: 'https://www.linkedin.com/in/mariam-alshehri-demo' },
    ],
    signals: [
      { type: 'ai_programme', trigger: 'AI_ADOPTION', title: 'National AI programme expansion announced', detail: 'New citizen-facing AI services entering production.', weight: 42, daysAgo: 6 },
      { type: 'regulation_deadline', trigger: 'REGULATORY_CHANGE', title: 'SDAIA AI governance guidance published', detail: 'Guidance sets expectations for model oversight.', weight: 36, daysAgo: 25 },
    ],
  },
  {
    name: 'Doha Telecom Group',
    domain: 'dohatelecom.example',
    country: 'QA', city: 'Doha', region: 'GCC', vertical: 'TELECOM',
    employeeCount: 4100, companySize: 'LARGE', annualRevenueUsd: 2_600_000_000,
    isPublic: true, isRegulated: true, regulators: ['NCSA Qatar', 'Qatar PDPPL'],
    description: 'Converged telecom operator with enterprise services and a large subscriber base.',
    complianceMaturity: 'ESTABLISHED', securityMaturity: 'ESTABLISHED', transformationMaturity: 'ESTABLISHED', aiReadiness: 'DEVELOPING',
    techStack: ['Nokia', 'Red Hat', 'Palo Alto'],
    triggers: ['VENDOR_CONSOLIDATION', 'ENTERPRISE_RISK'],
    strategicValue: 78, budgetPotentialUsd: 1_100_000,
    contacts: [
      { firstName: 'Khalid', lastName: 'Al Kuwari', title: 'Chief Information Security Officer', personaCategory: 'CISO', email: 'khalid.alkuwari@dohatelecom.example', linkedin: 'https://www.linkedin.com/in/khalid-alkuwari-demo' },
      { firstName: 'Yasmin', lastName: 'Farouk', title: 'Head of Vendor Management', personaCategory: 'PROCUREMENT', email: 'yasmin.farouk@dohatelecom.example', linkedin: 'https://www.linkedin.com/in/yasmin-farouk-demo' },
    ],
    signals: [
      { type: 'vendor_review', trigger: 'VENDOR_CONSOLIDATION', title: 'Security vendor consolidation review underway', detail: 'Programme to reduce overlapping security tooling.', weight: 28, daysAgo: 15 },
    ],
  },
  {
    name: 'Arabian Logistics Holding',
    domain: 'arabianlogistics.example',
    country: 'AE', city: 'Jebel Ali', region: 'UAE', vertical: 'LOGISTICS',
    employeeCount: 8900, companySize: 'ENTERPRISE', annualRevenueUsd: 3_400_000_000,
    isPublic: false, isRegulated: false, regulators: [],
    description: 'Ports, freight forwarding and contract logistics operator across the GCC.',
    complianceMaturity: 'NASCENT', securityMaturity: 'NASCENT', transformationMaturity: 'DEVELOPING', aiReadiness: 'NASCENT',
    techStack: ['SAP', 'Azure', 'Cisco'],
    triggers: ['SECURITY_INCIDENT', 'CLOUD_MODERNIZATION'],
    strategicValue: 70, budgetPotentialUsd: 900_000,
    contacts: [
      { firstName: 'Rashid', lastName: 'Al Suwaidi', title: 'Group Chief Technology Officer', personaCategory: 'CTO', email: 'rashid.alsuwaidi@arabianlogistics.example', linkedin: 'https://www.linkedin.com/in/rashid-alsuwaidi-demo' },
      { firstName: 'Elena', lastName: 'Petrova', title: 'Group IT Director', personaCategory: 'IT_DIRECTOR', email: 'elena.petrova@arabianlogistics.example', linkedin: 'https://www.linkedin.com/in/elena-petrova-demo' },
    ],
    signals: [
      { type: 'breach_disclosure', trigger: 'SECURITY_INCIDENT', title: 'Ransomware disruption reported at a regional peer', detail: 'Peer operator reported multi-day disruption.', weight: 34, daysAgo: 40 },
    ],
  },
  {
    name: 'Jeddah Retail Collective',
    domain: 'jeddahretail.example',
    country: 'SA', city: 'Jeddah', region: 'KSA', vertical: 'RETAIL',
    employeeCount: 950, companySize: 'MID', annualRevenueUsd: 420_000_000,
    isPublic: false, isRegulated: false, regulators: ['SDAIA PDPL'],
    description: 'Omnichannel retail group scaling e-commerce and customer data platforms.',
    complianceMaturity: 'NASCENT', securityMaturity: 'DEVELOPING', transformationMaturity: 'DEVELOPING', aiReadiness: 'DEVELOPING',
    techStack: ['Shopify Plus', 'GCP', 'Segment'],
    triggers: ['COMPLIANCE_PRESSURE', 'AI_ADOPTION'],
    strategicValue: 55, budgetPotentialUsd: 320_000,
    contacts: [
      { firstName: 'Tariq', lastName: 'Bin Salem', title: 'Chief Technology Officer', personaCategory: 'CTO', email: 'tariq.binsalem@jeddahretail.example', linkedin: 'https://www.linkedin.com/in/tariq-binsalem-demo' },
      { firstName: 'Dana', lastName: 'Al Harbi', title: 'Head of Data', personaCategory: 'DATA_AI_LEADER', email: 'dana.alharbi@jeddahretail.example', linkedin: 'https://www.linkedin.com/in/dana-alharbi-demo' },
    ],
    signals: [
      { type: 'regulation_deadline', trigger: 'REGULATORY_CHANGE', title: 'PDPL enforcement expectations tightened', detail: 'Consumer data handling under closer scrutiny.', weight: 30, daysAgo: 20 },
    ],
  },
  {
    name: 'Muscat Infrastructure Partners',
    domain: 'muscatinfra.example',
    country: 'OM', city: 'Muscat', region: 'GCC', vertical: 'REAL_ESTATE',
    employeeCount: 620, companySize: 'MID', annualRevenueUsd: 280_000_000,
    isPublic: false, isRegulated: false, regulators: [],
    description: 'Mixed-use development and facilities management group.',
    complianceMaturity: 'NASCENT', securityMaturity: 'NASCENT', transformationMaturity: 'NASCENT', aiReadiness: 'UNKNOWN',
    techStack: ['Microsoft 365', 'Autodesk'],
    triggers: ['DIGITAL_TRANSFORMATION'],
    strategicValue: 42, budgetPotentialUsd: 180_000,
    contacts: [
      { firstName: 'Salim', lastName: 'Al Balushi', title: 'Chief Executive Officer', personaCategory: 'CEO', email: 'salim.albalushi@muscatinfra.example', linkedin: 'https://www.linkedin.com/in/salim-albalushi-demo' },
    ],
    signals: [],
  },
  {
    name: 'Cairo Manufacturing United',
    domain: 'cairomanufacturing.example',
    country: 'EG', city: 'Cairo', region: 'MENA', vertical: 'MANUFACTURING',
    employeeCount: 5400, companySize: 'ENTERPRISE', annualRevenueUsd: 900_000_000,
    isPublic: true, isRegulated: false, regulators: ['Egypt PDP Law'],
    description: 'Diversified industrial manufacturer expanding export operations.',
    complianceMaturity: 'NASCENT', securityMaturity: 'NASCENT', transformationMaturity: 'NASCENT', aiReadiness: 'UNKNOWN',
    techStack: ['SAP', 'On-prem VMware'],
    triggers: ['DIGITAL_TRANSFORMATION', 'ENTERPRISE_RISK'],
    strategicValue: 58, budgetPotentialUsd: 400_000,
    contacts: [
      { firstName: 'Mostafa', lastName: 'Ibrahim', title: 'Chief Information Officer', personaCategory: 'CIO', email: 'mostafa.ibrahim@cairomanufacturing.example', linkedin: 'https://www.linkedin.com/in/mostafa-ibrahim-demo' },
      { firstName: 'Heba', lastName: 'Fathy', title: 'Compliance Manager', personaCategory: 'COMPLIANCE_OFFICER', email: 'heba.fathy@cairomanufacturing.example', linkedin: 'https://www.linkedin.com/in/heba-fathy-demo' },
    ],
    signals: [
      { type: 'expansion', trigger: 'FUNDING_OR_EXPANSION', title: 'Announced expansion into two new export markets', detail: 'Expansion increases regulatory surface.', weight: 22, daysAgo: 35 },
    ],
  },
  {
    name: 'Kuwait Investment House',
    domain: 'kuwaitinvestmenthouse.example',
    country: 'KW', city: 'Kuwait City', region: 'GCC', vertical: 'FINANCIAL_SERVICES',
    employeeCount: 780, companySize: 'MID', annualRevenueUsd: 610_000_000,
    isPublic: true, isRegulated: true, regulators: ['CBK'],
    description: 'Investment and asset management house serving regional institutional clients.',
    complianceMaturity: 'ESTABLISHED', securityMaturity: 'DEVELOPING', transformationMaturity: 'DEVELOPING', aiReadiness: 'NASCENT',
    techStack: ['Bloomberg', 'Azure', 'CrowdStrike'],
    triggers: ['COMPLIANCE_PRESSURE', 'ENTERPRISE_RISK'],
    strategicValue: 68, budgetPotentialUsd: 520_000,
    contacts: [
      { firstName: 'Bader', lastName: 'Al Sabah', title: 'Chief Risk Officer', personaCategory: 'RISK_OFFICER', email: 'bader.alsabah@kuwaitinvestmenthouse.example', linkedin: 'https://www.linkedin.com/in/bader-alsabah-demo' },
      { firstName: 'Reem', lastName: 'Al Ajmi', title: 'Head of Information Security', personaCategory: 'CISO', email: 'reem.alajmi@kuwaitinvestmenthouse.example', linkedin: 'https://www.linkedin.com/in/reem-alajmi-demo' },
    ],
    signals: [
      { type: 'audit_finding', trigger: 'AUDIT_FINDING', title: 'Regulator review raised third-party risk findings', detail: 'Supplier assurance identified as a gap.', weight: 32, daysAgo: 10 },
    ],
  },
  {
    name: 'Manama FinTech Labs',
    domain: 'manamafintech.example',
    country: 'BH', city: 'Manama', region: 'GCC', vertical: 'TECHNOLOGY',
    employeeCount: 180, companySize: 'SMALL', annualRevenueUsd: 45_000_000,
    isPublic: false, isRegulated: true, regulators: ['CBB', 'Bahrain PDPL'],
    description: 'Regulated fintech platform providing payment infrastructure to regional banks.',
    complianceMaturity: 'DEVELOPING', securityMaturity: 'DEVELOPING', transformationMaturity: 'ESTABLISHED', aiReadiness: 'DEVELOPING',
    techStack: ['AWS', 'Kubernetes', 'Datadog'],
    triggers: ['COMPLIANCE_PRESSURE', 'AI_ADOPTION'],
    strategicValue: 50, budgetPotentialUsd: 240_000,
    contacts: [
      { firstName: 'Ali', lastName: 'Al Khalifa', title: 'Chief Technology Officer', personaCategory: 'CTO', email: 'ali.alkhalifa@manamafintech.example', linkedin: 'https://www.linkedin.com/in/ali-alkhalifa-demo' },
    ],
    signals: [
      { type: 'regulation_deadline', trigger: 'COMPLIANCE_PRESSURE', title: 'CBB reporting deadline approaching', detail: 'Quarterly control reporting due.', weight: 26, daysAgo: 5 },
    ],
  },
  {
    name: 'Abu Dhabi Energy Grid',
    domain: 'adenergygrid.example',
    country: 'AE', city: 'Abu Dhabi', region: 'UAE', vertical: 'ENERGY',
    employeeCount: 12_000, companySize: 'ENTERPRISE', annualRevenueUsd: 8_900_000_000,
    isPublic: false, isRegulated: true, regulators: ['UAE IA', 'NESA'],
    description: 'National-scale electricity transmission and distribution operator.',
    complianceMaturity: 'ESTABLISHED', securityMaturity: 'ESTABLISHED', transformationMaturity: 'DEVELOPING', aiReadiness: 'DEVELOPING',
    techStack: ['Siemens', 'SAP', 'Azure', 'Claroty'],
    triggers: ['ENTERPRISE_RISK', 'GOVERNANCE_REQUIREMENT', 'AI_ADOPTION'],
    strategicValue: 97, budgetPotentialUsd: 4_000_000,
    contacts: [
      { firstName: 'Hessa', lastName: 'Al Nuaimi', title: 'Chief Information Security Officer', personaCategory: 'CISO', email: 'hessa.alnuaimi@adenergygrid.example', linkedin: 'https://www.linkedin.com/in/hessa-alnuaimi-demo' },
      { firstName: 'John', lastName: 'Whitaker', title: 'Director of Enterprise Risk', personaCategory: 'RISK_OFFICER', email: 'john.whitaker@adenergygrid.example', linkedin: 'https://www.linkedin.com/in/john-whitaker-demo' },
      { firstName: 'Aisha', lastName: 'Al Zaabi', title: 'Head of AI & Advanced Analytics', personaCategory: 'DATA_AI_LEADER', email: 'aisha.alzaabi@adenergygrid.example', linkedin: 'https://www.linkedin.com/in/aisha-alzaabi-demo' },
    ],
    signals: [
      { type: 'ai_programme', trigger: 'AI_ADOPTION', title: 'Grid-optimisation AI programme entering production', detail: 'Models moving from pilot to operational use.', weight: 40, daysAgo: 9 },
      { type: 'regulation_deadline', trigger: 'GOVERNANCE_REQUIREMENT', title: 'NESA control review scheduled next quarter', detail: 'Critical infrastructure control assessment.', weight: 38, daysAgo: 14 },
    ],
  },
];
