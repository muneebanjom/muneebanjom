/* eslint-disable no-console */
import { loadEnv } from '../src/lib/load-env';

// Must run before PrismaClient is constructed.
loadEnv();

// eslint-disable-next-line import/first
import { PrismaClient, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { SEED_ACCOUNTS } from './seed-data';

const prisma = new PrismaClient();

// Seeded demo credentials — development only. Change or remove before any
// deployment; the README calls this out explicitly.
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'AhadDemo!2025';

function hashEmailFor(email: string): string {
  const crypto = require('node:crypto') as typeof import('node:crypto');
  const secret = process.env.APP_ENCRYPTION_KEY ?? process.env.AUTH_SECRET ?? 'dev-only-insecure-secret-change-me-32+chars';
  return crypto.createHmac('sha256', secret).update(email.trim().toLowerCase()).digest('hex');
}

function encryptFor(value: string): string {
  const crypto = require('node:crypto') as typeof import('node:crypto');
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) return `plain.${Buffer.from(value, 'utf8').toString('base64')}`;
  const key = Buffer.from(raw, 'base64');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
}

async function main(): Promise<void> {
  console.log('Seeding Ahad Customer Intelligence workspace…');

  const workspace = await prisma.workspace.upsert({
    where: { slug: 'ahad' },
    update: {},
    create: {
      name: 'Ahad',
      slug: 'ahad',
      brandColor: '#0B5FFF',
      timezone: 'Asia/Dubai',
      dataRetentionDays: 730,
      requireApprovalBeforeSend: true,
    },
  });

  // ---- Team & users -------------------------------------------------------
  const team = await prisma.team.upsert({
    where: { workspaceId_name: { workspaceId: workspace.id, name: 'GCC Enterprise' } },
    update: {},
    create: { workspaceId: workspace.id, name: 'GCC Enterprise', description: 'Enterprise coverage across UAE, KSA and the wider GCC.' },
  });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const people: Array<{ email: string; name: string; title: string; role: Prisma.MembershipCreateInput['role'] }> = [
    { email: 'owner@ahad.example', name: 'Ahad Owner', title: 'Managing Director', role: 'OWNER' },
    { email: 'admin@ahad.example', name: 'Ops Admin', title: 'Revenue Operations Lead', role: 'ADMIN' },
    { email: 'manager@ahad.example', name: 'Sales Manager', title: 'Head of Sales, GCC', role: 'MANAGER' },
    { email: 'rep1@ahad.example', name: 'Zainab Karim', title: 'Enterprise Account Executive', role: 'REP' },
    { email: 'rep2@ahad.example', name: 'Daniel Okafor', title: 'Enterprise Account Executive', role: 'REP' },
    { email: 'analyst@ahad.example', name: 'Market Analyst', title: 'Sales Intelligence Analyst', role: 'ANALYST' },
  ];

  const users: Record<string, string> = {};
  for (const person of people) {
    const user = await prisma.user.upsert({
      where: { email: person.email },
      update: { name: person.name, title: person.title },
      create: { email: person.email, name: person.name, title: person.title, passwordHash },
    });
    users[person.email] = user.id;
    await prisma.membership.upsert({
      where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
      update: { role: person.role },
      create: { userId: user.id, workspaceId: workspace.id, role: person.role, teamId: team.id },
    });
  }
  const repIds = [users['rep1@ahad.example'], users['rep2@ahad.example']];

  // ---- Personas -----------------------------------------------------------
  const personaSeeds = [
    {
      category: 'CISO' as const, label: 'CISO', seniority: 92,
      titleKeywords: ['ciso', 'chief information security', 'head of information security', 'head of security'],
      excludeKeywords: ['intern', 'student', 'assistant'],
      painPoints: [
        'control coverage is not keeping pace with cloud and AI adoption',
        'detection and response depends on a small team with no out-of-hours depth',
        'board reporting turns into a tooling inventory rather than a risk picture',
      ],
      primaryAngles: ['CYBERSECURITY', 'ADVANCED_CYBER_DEFENSE', 'SECURITY_MODERNIZATION'] as const,
      qualificationQuestions: [
        'Where does your current monitoring coverage stop today?',
        'How is out-of-hours response covered?',
        'Which control gap would worry your regulator most?',
      ],
    },
    {
      category: 'HEAD_OF_GRC' as const, label: 'Head of GRC', seniority: 82,
      titleKeywords: ['grc', 'governance risk', 'head of compliance', 'risk and compliance'],
      excludeKeywords: ['intern', 'coordinator'],
      painPoints: [
        'evidence collection across frameworks is still largely manual',
        'overlapping local and international frameworks duplicate effort',
        'audit findings recur because remediation is not tracked to closure',
      ],
      primaryAngles: ['COMPLIANCE_GRC', 'ENTERPRISE_RISK'] as const,
      qualificationQuestions: [
        'Which framework is driving your next audit?',
        'How much of your evidence collection is still manual?',
        'What is the next submission date you are working towards?',
      ],
    },
    {
      category: 'CIO' as const, label: 'CIO', seniority: 90,
      titleKeywords: ['cio', 'chief information officer'],
      excludeKeywords: ['deputy assistant'],
      painPoints: [
        'modernisation programmes stall when security and compliance arrive late',
        'legacy platforms constrain the transformation roadmap',
        'the security and delivery agendas compete for the same budget',
      ],
      primaryAngles: ['DIGITAL_TRANSFORMATION', 'SECURITY_MODERNIZATION', 'OPERATIONAL_EFFICIENCY'] as const,
      qualificationQuestions: [
        'Which platform migration is furthest behind plan?',
        'At what point does security review enter your delivery cycle?',
        'What did the board approve this programme to deliver?',
      ],
    },
    {
      category: 'CTO' as const, label: 'CTO', seniority: 88,
      titleKeywords: ['cto', 'chief technology officer'],
      excludeKeywords: [],
      painPoints: [
        'engineering velocity is traded off against control coverage',
        'cloud footprint has grown faster than the guardrails around it',
      ],
      primaryAngles: ['SECURITY_MODERNIZATION', 'AI_IMPLEMENTATION', 'DIGITAL_TRANSFORMATION'] as const,
      qualificationQuestions: [
        'Where are your guardrails weakest in the delivery pipeline?',
        'How do you assure changes before they reach production?',
      ],
    },
    {
      category: 'DATA_AI_LEADER' as const, label: 'Data / AI Leader', seniority: 80,
      titleKeywords: ['head of data', 'chief data', 'head of ai', 'chief ai', 'analytics'],
      excludeKeywords: ['analyst', 'intern'],
      painPoints: [
        'AI pilots rarely reach production because no governance path exists',
        'model risk has no clear owner or sign-off process',
        'regulators are moving faster on AI than internal policy is',
      ],
      primaryAngles: ['AI_GOVERNANCE', 'AI_IMPLEMENTATION'] as const,
      qualificationQuestions: [
        'How many AI use cases are live versus still in pilot?',
        'Who signs off on model risk today?',
        'What does your regulator expect on AI in the next twelve months?',
      ],
    },
    {
      category: 'RISK_OFFICER' as const, label: 'Risk Officer', seniority: 85,
      titleKeywords: ['chief risk', 'risk officer', 'head of risk', 'enterprise risk'],
      excludeKeywords: [],
      painPoints: [
        'translating technical findings into board-level exposure is a recurring gap',
        'third-party and supply-chain risk is assessed once and never revisited',
      ],
      primaryAngles: ['ENTERPRISE_RISK', 'COMPLIANCE_GRC'] as const,
      qualificationQuestions: [
        'How is cyber risk currently presented to the board?',
        'What is your stated risk appetite for operational disruption?',
      ],
    },
    {
      category: 'DIGITAL_TRANSFORMATION_DIRECTOR' as const, label: 'Digital Transformation Director', seniority: 78,
      titleKeywords: ['digital transformation', 'head of digital', 'chief digital'],
      excludeKeywords: [],
      painPoints: [
        'transformation timelines slip when risk sign-off is unplanned',
        'business cases are written without the security cost included',
      ],
      primaryAngles: ['DIGITAL_TRANSFORMATION', 'AI_IMPLEMENTATION'] as const,
      qualificationQuestions: [
        'Which workstream is most at risk of slipping this year?',
        'How early does security engage in your programme?',
      ],
    },
    {
      category: 'IT_DIRECTOR' as const, label: 'IT Director', seniority: 70,
      titleKeywords: ['it director', 'head of it', 'director of it', 'infrastructure'],
      excludeKeywords: ['support', 'helpdesk'],
      painPoints: [
        'operational load grows faster than the team, especially around monitoring',
        'tooling sprawl makes coverage hard to evidence',
      ],
      primaryAngles: ['CYBERSECURITY', 'OPERATIONAL_EFFICIENCY'] as const,
      qualificationQuestions: [
        'What consumes most of your team\'s week today?',
        'Which system would hurt most if it were unavailable for a day?',
      ],
    },
    {
      category: 'COMPLIANCE_OFFICER' as const, label: 'Compliance Officer', seniority: 72,
      titleKeywords: ['compliance', 'regulatory'],
      excludeKeywords: ['intern'],
      painPoints: [
        'regulatory change lands faster than policy can be updated',
        'control testing is periodic rather than continuous',
      ],
      primaryAngles: ['COMPLIANCE_GRC'] as const,
      qualificationQuestions: [
        'Which regulatory change is taking most of your attention right now?',
        'How do you evidence control effectiveness between audits?',
      ],
    },
    {
      category: 'CEO' as const, label: 'CEO', seniority: 95,
      titleKeywords: ['ceo', 'chief executive', 'managing director'],
      excludeKeywords: [],
      painPoints: [
        'the board asks for a defensible view of cyber and AI risk, not a tooling list',
        'growth plans carry regulatory exposure nobody has quantified',
      ],
      primaryAngles: ['ENTERPRISE_RISK', 'DIGITAL_TRANSFORMATION'] as const,
      qualificationQuestions: [
        'How confident is the board in the current risk picture?',
        'What would a week of downtime cost the business?',
      ],
    },
    {
      category: 'PROCUREMENT' as const, label: 'Procurement & Vendor Management', seniority: 60,
      titleKeywords: ['procurement', 'vendor management', 'sourcing'],
      excludeKeywords: [],
      painPoints: [
        'security vendor sprawl makes renewals hard to benchmark',
        'overlapping capability is paid for twice',
      ],
      primaryAngles: ['OPERATIONAL_EFFICIENCY'] as const,
      qualificationQuestions: [
        'How many security vendors renew in the next two quarters?',
        'Where do you suspect duplicated capability?',
      ],
    },
  ];

  const personaIds: Partial<Record<string, string>> = {};
  for (const p of personaSeeds) {
    const persona = await prisma.persona.upsert({
      where: { workspaceId_label: { workspaceId: workspace.id, label: p.label } },
      update: {},
      create: {
        workspaceId: workspace.id,
        category: p.category,
        label: p.label,
        seniority: p.seniority,
        titleKeywords: p.titleKeywords,
        excludeKeywords: p.excludeKeywords,
        painPoints: p.painPoints,
        primaryAngles: [...p.primaryAngles],
        qualificationQuestions: p.qualificationQuestions,
      },
    });
    personaIds[p.category] = persona.id;
  }

  // ---- ICP profiles -------------------------------------------------------
  const icp = await prisma.icpProfile.upsert({
    where: { workspaceId_name: { workspaceId: workspace.id, name: 'GCC Regulated Enterprise' } },
    update: {},
    create: {
      workspaceId: workspace.id,
      name: 'GCC Regulated Enterprise',
      description: 'Regulated, mid-to-large organisations in UAE, Saudi Arabia and the wider GCC where security, compliance and transformation agendas overlap.',
      isDefault: true,
      regions: ['UAE', 'KSA', 'GCC'],
      countries: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM'],
      verticals: ['FINANCIAL_SERVICES', 'GOVERNMENT', 'ENERGY', 'HEALTHCARE', 'TELECOM'],
      companySizes: ['MID', 'LARGE', 'ENTERPRISE'],
      revenueBandsUsd: ['250M-1B', '1B-5B', '5B+'],
      personaCategories: ['CISO', 'CIO', 'HEAD_OF_GRC', 'RISK_OFFICER', 'DATA_AI_LEADER', 'DIGITAL_TRANSFORMATION_DIRECTOR', 'CTO'],
      triggers: ['COMPLIANCE_PRESSURE', 'SECURITY_INCIDENT', 'CLOUD_MODERNIZATION', 'DIGITAL_TRANSFORMATION', 'AI_ADOPTION', 'GOVERNANCE_REQUIREMENT', 'REGULATORY_CHANGE', 'AUDIT_FINDING'],
      offerAngles: ['CYBERSECURITY', 'COMPLIANCE_GRC', 'ADVANCED_CYBER_DEFENSE', 'DIGITAL_TRANSFORMATION', 'AI_GOVERNANCE', 'SECURITY_MODERNIZATION', 'ENTERPRISE_RISK'],
      minComplianceMaturity: 'ESTABLISHED',
      minSecurityMaturity: 'ESTABLISHED',
      minTransformationMaturity: 'ESTABLISHED',
      minAiReadiness: 'DEVELOPING',
      minEmployees: 200,
      weights: { geography: 20, vertical: 20, persona: 25, companySize: 10, maturityGap: 15, strategicValue: 10 },
      notes: 'Primary ICP. Lead with compliance in KSA, with security modernisation in the UAE.',
    },
  });

  await prisma.icpProfile.upsert({
    where: { workspaceId_name: { workspaceId: workspace.id, name: 'MENA Growth & AI Adopters' } },
    update: {},
    create: {
      workspaceId: workspace.id,
      name: 'MENA Growth & AI Adopters',
      description: 'Faster-moving organisations across the wider MENA region adopting AI without a governance layer.',
      regions: ['MENA', 'LEVANT', 'NORTH_AFRICA', 'GCC'],
      countries: ['EG', 'JO', 'MA', 'TN', 'AE', 'SA'],
      verticals: ['TECHNOLOGY', 'RETAIL', 'LOGISTICS', 'MANUFACTURING', 'PROFESSIONAL_SERVICES'],
      companySizes: ['SMALL', 'MID', 'LARGE'],
      personaCategories: ['CTO', 'DATA_AI_LEADER', 'CIO', 'CEO'],
      triggers: ['AI_ADOPTION', 'DIGITAL_TRANSFORMATION', 'FUNDING_OR_EXPANSION', 'CLOUD_MODERNIZATION'],
      offerAngles: ['AI_GOVERNANCE', 'AI_IMPLEMENTATION', 'DIGITAL_TRANSFORMATION', 'CYBERSECURITY'],
      minSecurityMaturity: 'DEVELOPING',
      minAiReadiness: 'ESTABLISHED',
      minEmployees: 50,
      weights: { geography: 15, vertical: 20, persona: 25, companySize: 10, maturityGap: 20, strategicValue: 10 },
    },
  });

  // ---- Scoring rules ------------------------------------------------------
  const rules = [
    {
      name: 'Regulated KSA or UAE financial services',
      dimension: 'fit', points: 8, rationale: 'Regulated banking in the core markets is where Ahad wins most consistently.',
      predicate: { all: [{ field: 'account.vertical', op: 'eq', value: 'FINANCIAL_SERVICES' }, { field: 'account.region', op: 'in', value: ['UAE', 'KSA'] }, { field: 'account.isRegulated', op: 'eq', value: true }] },
    },
    {
      name: 'Security leadership persona',
      dimension: 'fit', points: 6, rationale: 'Security leaders hold budget for Ahad\'s core services.',
      predicate: { field: 'contact.personaCategory', op: 'in', value: ['CISO', 'HEAD_OF_GRC'] },
    },
    {
      name: 'Live AI adoption signal',
      dimension: 'intent', points: 12, rationale: 'AI adoption without governance is an immediate opening for Ahad.',
      predicate: { field: 'signals.triggers', op: 'in', value: ['AI_ADOPTION'] },
    },
    {
      name: 'Critical national infrastructure',
      dimension: 'dealPotential', points: 10, rationale: 'Infrastructure operators buy multi-year assurance programmes.',
      predicate: { all: [{ field: 'account.vertical', op: 'in', value: ['ENERGY', 'TELECOM', 'GOVERNMENT'] }, { field: 'account.employeeCount', op: 'gte', value: 2000 }] },
    },
    {
      name: 'Cold prospect with no reachable channel',
      dimension: 'fit', points: -20, rationale: 'No LinkedIn reference and no email — enrich before spending attention on it.',
      predicate: { all: [{ field: 'contact.hasEmail', op: 'eq', value: false }, { field: 'contact.hasLinkedIn', op: 'eq', value: false }] },
    },
  ];
  for (const rule of rules) {
    await prisma.scoringRule.upsert({
      where: { workspaceId_name: { workspaceId: workspace.id, name: rule.name } },
      update: {},
      create: {
        workspaceId: workspace.id,
        name: rule.name,
        dimension: rule.dimension,
        predicate: rule.predicate as Prisma.InputJsonValue,
        points: rule.points,
        rationale: rule.rationale,
      },
    });
  }

  // ---- Campaigns ----------------------------------------------------------
  const campaignSeeds = [
    { name: 'UAE Financial Services — Cybersecurity', offerAngle: 'CYBERSECURITY' as const, regions: ['UAE'] as const, verticals: ['FINANCIAL_SERVICES'] as const, personas: ['CISO', 'CIO', 'HEAD_OF_GRC'] as const, priority: 85, goal: 'Twelve qualified conversations with UAE banking security leaders this quarter.' },
    { name: 'Saudi Government — Compliance & GRC', offerAngle: 'COMPLIANCE_GRC' as const, regions: ['KSA'] as const, verticals: ['GOVERNMENT'] as const, personas: ['HEAD_OF_GRC', 'COMPLIANCE_OFFICER', 'DIGITAL_TRANSFORMATION_DIRECTOR'] as const, priority: 80, goal: 'Build NCA ECC readiness pipeline across public-sector entities.' },
    { name: 'GCC — Digital Transformation & AI Governance', offerAngle: 'AI_GOVERNANCE' as const, regions: ['UAE', 'KSA', 'GCC'] as const, verticals: ['GOVERNMENT', 'ENERGY', 'TELECOM', 'FINANCIAL_SERVICES'] as const, personas: ['DATA_AI_LEADER', 'CIO', 'DIGITAL_TRANSFORMATION_DIRECTOR'] as const, priority: 75, goal: 'Position AI governance ahead of regional regulatory guidance.' },
    { name: 'Healthcare — Security Modernization', offerAngle: 'SECURITY_MODERNIZATION' as const, regions: ['UAE', 'KSA', 'GCC'] as const, verticals: ['HEALTHCARE'] as const, personas: ['IT_DIRECTOR', 'CISO', 'COMPLIANCE_OFFICER'] as const, priority: 60, goal: 'Modernise controls around clinical system consolidation.' },
    { name: 'Enterprise Cyber Defense — Critical Infrastructure', offerAngle: 'ADVANCED_CYBER_DEFENSE' as const, regions: ['UAE', 'KSA', 'GCC'] as const, verticals: ['ENERGY', 'TELECOM', 'LOGISTICS'] as const, personas: ['CISO', 'RISK_OFFICER', 'CTO'] as const, priority: 70, goal: 'Win advanced defence engagements with mature security functions.' },
  ];

  const campaignIds: Record<string, string> = {};
  for (const c of campaignSeeds) {
    const campaign = await prisma.campaign.upsert({
      where: { workspaceId_name: { workspaceId: workspace.id, name: c.name } },
      update: {},
      create: {
        workspaceId: workspace.id,
        name: c.name,
        description: c.goal,
        icpProfileId: icp.id,
        teamId: team.id,
        regions: [...c.regions],
        verticals: [...c.verticals],
        personaCategories: [...c.personas],
        offerAngle: c.offerAngle,
        channels: ['LINKEDIN_CONNECTION', 'LINKEDIN_MESSAGE', 'EMAIL'],
        priority: c.priority,
        goal: c.goal,
      },
    });
    campaignIds[c.name] = campaign.id;
  }

  // ---- Message templates (approved variations) ----------------------------
  const templates = [
    {
      name: 'Connection — Compliance deadline (A)', kind: 'LINKEDIN_CONNECTION_REQUEST' as const, channel: 'LINKEDIN_CONNECTION' as const,
      offerAngle: 'COMPLIANCE_GRC' as const, tone: 'CONSULTATIVE' as const, variantKey: 'A',
      personaCategories: ['HEAD_OF_GRC', 'COMPLIANCE_OFFICER', 'RISK_OFFICER'] as const, regions: ['UAE', 'KSA', 'GCC'] as const,
      body: 'Hi {{first_name}} — I work with {{vertical}} teams across {{region}} on {{regulator}} readiness. Given {{trigger}}, thought it was worth connecting. No pitch.',
      cta: 'Happy to connect.',
      positioningNote: 'Opens on the regulator rather than the vendor. Works because GRC leaders are measured on submission dates.',
      timesUsed: 42, replies: 14, meetings: 5,
    },
    {
      name: 'Connection — Peer benchmark (B)', kind: 'LINKEDIN_CONNECTION_REQUEST' as const, channel: 'LINKEDIN_CONNECTION' as const,
      offerAngle: 'COMPLIANCE_GRC' as const, tone: 'EXECUTIVE' as const, variantKey: 'B',
      personaCategories: ['HEAD_OF_GRC', 'COMPLIANCE_OFFICER'] as const, regions: ['UAE', 'KSA', 'GCC'] as const,
      body: 'Hi {{first_name}} — we have just finished a piece of work on how {{vertical}} organisations in {{country}} are handling {{trigger}}. Happy to share it if useful.',
      cta: 'Happy to connect.',
      positioningNote: 'Leads with something to give rather than something to sell.',
      timesUsed: 38, replies: 9, meetings: 2,
    },
    {
      name: 'Connection — Security leader peer note (A)', kind: 'LINKEDIN_CONNECTION_REQUEST' as const, channel: 'LINKEDIN_CONNECTION' as const,
      offerAngle: 'CYBERSECURITY' as const, tone: 'CONCISE' as const, variantKey: 'A',
      personaCategories: ['CISO', 'IT_DIRECTOR', 'CTO'] as const, regions: ['UAE', 'KSA', 'GCC'] as const,
      body: 'Hi {{first_name}} — most {{vertical}} security leaders I speak to in {{country}} say the same thing: {{pain_point}}. Worth connecting.',
      cta: 'Happy to connect.',
      positioningNote: 'Names the pain in the recipient\'s own words. Short enough for the connection-note limit.',
      timesUsed: 61, replies: 22, meetings: 8,
    },
    {
      name: 'Follow-up — Security modernisation (A)', kind: 'FIRST_FOLLOW_UP' as const, channel: 'LINKEDIN_MESSAGE' as const,
      offerAngle: 'SECURITY_MODERNIZATION' as const, tone: 'CONSULTATIVE' as const, variantKey: 'A',
      personaCategories: ['CISO', 'CIO', 'IT_DIRECTOR'] as const, regions: [] as const,
      body: 'Thanks for connecting, {{first_name}}.\n\nWorking with {{vertical}} organisations across {{region}}, the pattern is consistent: {{pain_point}}. At {{company}}, {{trigger}} makes that timely rather than theoretical.\n\nWe help teams close that gap without a rip-and-replace programme.\n\n{{cta}}',
      cta: 'Worth a 20-minute conversation in the next two weeks?',
      positioningNote: 'Bridges from the connection note to a concrete, low-commitment ask.',
      timesUsed: 55, replies: 18, meetings: 7,
    },
    {
      name: 'Follow-up — Executive risk framing (B)', kind: 'FIRST_FOLLOW_UP' as const, channel: 'LINKEDIN_MESSAGE' as const,
      offerAngle: 'ENTERPRISE_RISK' as const, tone: 'EXECUTIVE' as const, variantKey: 'B',
      personaCategories: ['CEO', 'RISK_OFFICER', 'CIO'] as const, regions: [] as const,
      body: 'Thanks for connecting, {{first_name}}.\n\nThe question we keep being asked by boards in {{country}} is simple: what would a week of disruption actually cost, and who owns reducing it? Most {{vertical}} organisations cannot answer that in one page.\n\n{{cta}}',
      cta: 'Worth 20 minutes to compare notes?',
      positioningNote: 'Board framing, no technical detail. Suits CEO and risk personas.',
      timesUsed: 29, replies: 11, meetings: 4,
    },
    {
      name: 'Follow-up — AI governance (A)', kind: 'FIRST_FOLLOW_UP' as const, channel: 'LINKEDIN_MESSAGE' as const,
      offerAngle: 'AI_GOVERNANCE' as const, tone: 'CONSULTATIVE' as const, variantKey: 'A',
      personaCategories: ['DATA_AI_LEADER', 'CIO', 'DIGITAL_TRANSFORMATION_DIRECTOR'] as const, regions: [] as const,
      body: 'Thanks for connecting, {{first_name}}.\n\nMost AI programmes we see in {{region}} stall at the same point: the pilots work, but nobody will sign off on production use. Given {{trigger}} at {{company}}, you may be closer to that point than most.\n\n{{cta}}',
      cta: 'Worth a short call on how others cleared that gate?',
      positioningNote: 'Speaks to the pilot-to-production gap, which is the real blocker for AI leaders.',
      timesUsed: 24, replies: 10, meetings: 4,
    },
    {
      name: 'Email — Advanced cyber defense (A)', kind: 'EMAIL' as const, channel: 'EMAIL' as const,
      offerAngle: 'ADVANCED_CYBER_DEFENSE' as const, tone: 'TECHNICAL' as const, variantKey: 'A',
      personaCategories: ['CISO', 'CTO'] as const, regions: [] as const,
      body: 'Hi {{first_name}},\n\nFor teams that already have the fundamentals in place, the next gain is usually depth rather than more tooling: adversary simulation, threat hunting and response cover that holds outside working hours.\n\nGiven {{trigger}} at {{company}}, that may be where your next increment of value sits.\n\n{{cta}}\n\nBest regards,\n{{sender_name}}\n{{sender_company}}',
      cta: 'Would a short technical conversation be useful?',
      positioningNote: 'For mature security functions — assumes competence rather than implying a gap.',
      timesUsed: 18, replies: 6, meetings: 3,
    },
    {
      name: 'Meeting request — Two slots (A)', kind: 'MEETING_REQUEST' as const, channel: 'EMAIL' as const,
      offerAngle: 'CYBERSECURITY' as const, tone: 'CONCISE' as const, variantKey: 'A',
      personaCategories: [] as const, regions: [] as const,
      body: 'Hi {{first_name}},\n\nRather than keep exchanging messages — would Tuesday or Thursday work for 20 minutes? I will come with two things relevant to {{company}} and nothing else.\n\n{{cta}}',
      cta: 'Which suits better?',
      positioningNote: 'Removes friction by proposing specific slots and bounding the time.',
      timesUsed: 33, replies: 15, meetings: 11,
    },
    {
      name: 'Breakup — Door left open (A)', kind: 'BREAKUP' as const, channel: 'LINKEDIN_MESSAGE' as const,
      offerAngle: 'CYBERSECURITY' as const, tone: 'CONCISE' as const, variantKey: 'A',
      personaCategories: [] as const, regions: [] as const,
      body: 'Hi {{first_name}} — I have not managed to catch you at a useful moment, so I will stop here rather than keep adding to your inbox. If {{angle}} moves up the agenda at {{company}}, a one-line reply is all it takes.',
      cta: 'No reply needed.',
      positioningNote: 'Respectful close. Reliably produces late replies from senior buyers.',
      timesUsed: 21, replies: 7, meetings: 2,
    },
    {
      name: 'Nurture — Regional insight (A)', kind: 'NURTURE' as const, channel: 'LINKEDIN_MESSAGE' as const,
      offerAngle: 'COMPLIANCE_GRC' as const, tone: 'PREMIUM' as const, variantKey: 'A',
      personaCategories: [] as const, regions: ['UAE', 'KSA', 'GCC'] as const,
      body: 'Hi {{first_name}} — one pattern from our {{vertical}} work in {{region}} this quarter: {{pain_point}}. No ask attached; happy to share the detail if it is useful.',
      cta: 'Would a summary be useful?',
      positioningNote: 'Keeps a dormant relationship warm without asking for anything.',
      timesUsed: 27, replies: 8, meetings: 1,
    },
  ];

  for (const t of templates) {
    await prisma.messageTemplate.upsert({
      where: { workspaceId_name: { workspaceId: workspace.id, name: t.name } },
      update: {},
      create: {
        workspaceId: workspace.id,
        name: t.name,
        kind: t.kind,
        channel: t.channel,
        offerAngle: t.offerAngle,
        tone: t.tone,
        variantKey: t.variantKey,
        body: t.body,
        cta: t.cta,
        positioningNote: t.positioningNote,
        personaCategories: [...t.personaCategories],
        regions: [...t.regions],
        isApproved: true,
        isActive: true,
        timesUsed: t.timesUsed,
        replies: t.replies,
        meetings: t.meetings,
      },
    });
  }

  // ---- Accounts, contacts, signals, leads ---------------------------------
  const campaignForVertical: Record<string, string> = {
    FINANCIAL_SERVICES: campaignIds['UAE Financial Services — Cybersecurity'],
    GOVERNMENT: campaignIds['Saudi Government — Compliance & GRC'],
    HEALTHCARE: campaignIds['Healthcare — Security Modernization'],
    ENERGY: campaignIds['Enterprise Cyber Defense — Critical Infrastructure'],
    TELECOM: campaignIds['Enterprise Cyber Defense — Critical Infrastructure'],
    LOGISTICS: campaignIds['Enterprise Cyber Defense — Critical Infrastructure'],
    TECHNOLOGY: campaignIds['GCC — Digital Transformation & AI Governance'],
  };

  let repIndex = 0;
  for (const seed of SEED_ACCOUNTS) {
    const account = await prisma.account.upsert({
      where: { workspaceId_domain: { workspaceId: workspace.id, domain: seed.domain } },
      update: {},
      create: {
        workspaceId: workspace.id,
        name: seed.name,
        domain: seed.domain,
        website: `https://${seed.domain}`,
        description: seed.description,
        country: seed.country,
        city: seed.city,
        region: seed.region,
        vertical: seed.vertical,
        employeeCount: seed.employeeCount,
        companySize: seed.companySize,
        annualRevenueUsd: BigInt(seed.annualRevenueUsd),
        isPublic: seed.isPublic,
        isRegulated: seed.isRegulated,
        regulators: seed.regulators,
        complianceMaturity: seed.complianceMaturity,
        securityMaturity: seed.securityMaturity,
        transformationMaturity: seed.transformationMaturity,
        aiReadiness: seed.aiReadiness,
        techStack: seed.techStack,
        triggers: seed.triggers,
        strategicValue: seed.strategicValue,
        budgetPotentialUsd: BigInt(seed.budgetPotentialUsd),
        isTargetAccount: seed.strategicValue >= 65,
      },
    });

    for (const signal of seed.signals) {
      const observedAt = new Date(Date.now() - signal.daysAgo * 86_400_000);
      const exists = await prisma.signal.findFirst({ where: { workspaceId: workspace.id, accountId: account.id, title: signal.title } });
      if (!exists) {
        await prisma.signal.create({
          data: {
            workspaceId: workspace.id,
            accountId: account.id,
            type: signal.type,
            trigger: signal.trigger,
            title: signal.title,
            detail: signal.detail,
            weight: signal.weight,
            observedAt,
            source: 'MANUAL',
          },
        });
      }
    }

    for (const c of seed.contacts) {
      const emailHash = hashEmailFor(c.email);
      const existing = await prisma.contact.findFirst({ where: { workspaceId: workspace.id, emailHash } });
      const contact = existing ?? (await prisma.contact.create({
        data: {
          workspaceId: workspace.id,
          accountId: account.id,
          firstName: c.firstName,
          lastName: c.lastName,
          fullName: `${c.firstName} ${c.lastName}`,
          title: c.title,
          personaCategory: c.personaCategory,
          personaId: personaIds[c.personaCategory] ?? null,
          country: seed.country,
          city: c.city ?? seed.city,
          region: seed.region,
          emailEnc: encryptFor(c.email),
          emailHash,
          linkedinUrl: c.linkedin,
          linkedinPublicId: c.linkedin.split('/in/')[1] ?? null,
          languages: ['en'],
          consentBasis: 'LEGITIMATE_INTEREST',
          lastEnrichedAt: new Date(),
        },
      }));

      const campaignId = campaignForVertical[seed.vertical] ?? null;
      const existingLead = await prisma.lead.findFirst({ where: { workspaceId: workspace.id, contactId: contact.id, campaignId } });
      if (!existingLead) {
        await prisma.lead.create({
          data: {
            workspaceId: workspace.id,
            contactId: contact.id,
            accountId: account.id,
            campaignId,
            ownerId: repIds[repIndex % repIds.length],
            stage: 'REVIEWED',
            estimatedValueUsd: BigInt(Math.round(seed.budgetPotentialUsd * 0.4)),
          },
        });
        repIndex += 1;
      }
    }

    await prisma.sourceRecord.upsert({
      where: { workspaceId_provider_externalId: { workspaceId: workspace.id, provider: 'MANUAL', externalId: `seed:${seed.domain}` } },
      update: {},
      create: {
        workspaceId: workspace.id,
        provider: 'MANUAL',
        externalId: `seed:${seed.domain}`,
        accountId: account.id,
        payload: { source: 'seed', note: 'Illustrative demo record — not real contact data.' },
        fieldsProvided: ['name', 'domain', 'country', 'vertical'],
        importedBy: 'seed',
        importBatchId: 'seed',
        consentBasis: 'USER_PROVIDED',
      },
    });
  }

  // ---- Integrations (declared, not connected) -----------------------------
  for (const [provider, label] of [
    ['CSV', 'CSV / spreadsheet import'],
    ['LINKEDIN_EXPORT', 'LinkedIn data export (user-provided)'],
    ['LUSHA', 'Lusha'],
    ['APOLLO', 'Apollo'],
  ] as const) {
    await prisma.integration.upsert({
      where: { workspaceId_provider_label: { workspaceId: workspace.id, provider, label } },
      update: {},
      create: { workspaceId: workspace.id, provider, label, status: 'DISCONNECTED' },
    });
  }

  // ---- A little conversation history so analytics is not empty ------------
  const advanced = await prisma.lead.findMany({ where: { workspaceId: workspace.id }, take: 8, orderBy: { createdAt: 'asc' } });
  const stages = ['CONTACTED', 'CONTACTED', 'REPLIED', 'REPLIED', 'QUALIFIED', 'MEETING_BOOKED', 'OPPORTUNITY', 'SHORTLISTED'] as const;
  for (const [i, lead] of advanced.entries()) {
    const stage = stages[i % stages.length];
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        stage,
        touchCount: ['CONTACTED', 'REPLIED', 'QUALIFIED', 'MEETING_BOOKED', 'OPPORTUNITY'].includes(stage) ? 2 : 0,
        lastTouchAt: stage === 'SHORTLISTED' ? null : new Date(Date.now() - (i + 3) * 86_400_000),
        firstTouchAt: stage === 'SHORTLISTED' ? null : new Date(Date.now() - (i + 9) * 86_400_000),
      },
    });

    if (['REPLIED', 'QUALIFIED', 'MEETING_BOOKED', 'OPPORTUNITY'].includes(stage)) {
      const exists = await prisma.reply.findFirst({ where: { leadId: lead.id } });
      if (!exists) {
        await prisma.reply.create({
          data: {
            workspaceId: workspace.id,
            leadId: lead.id,
            channel: 'LINKEDIN_MESSAGE',
            body: 'Thanks for reaching out — this is relevant. Send over a short summary and we can find 20 minutes next week.',
            summary: 'Positive: asked for a summary and offered time next week.',
            sentiment: 'POSITIVE',
            buyingSignals: ['Requested materials', 'Offered a meeting slot'],
            objections: [],
            receivedAt: new Date(Date.now() - (i + 2) * 86_400_000),
            isHandled: stage !== 'REPLIED',
          },
        });
        await prisma.lead.update({ where: { id: lead.id }, data: { lastReplyAt: new Date(Date.now() - (i + 2) * 86_400_000) } });
      }
    }

    if (stage === 'MEETING_BOOKED' || stage === 'OPPORTUNITY') {
      const exists = await prisma.meeting.findFirst({ where: { leadId: lead.id } });
      if (!exists) {
        await prisma.meeting.create({
          data: {
            workspaceId: workspace.id,
            leadId: lead.id,
            hostId: users['manager@ahad.example'],
            status: stage === 'OPPORTUNITY' ? 'HELD' : 'SCHEDULED',
            scheduledAt: new Date(Date.now() + 3 * 86_400_000),
            agenda: 'Discovery: current posture, obligations and priorities for the next two quarters.',
          },
        });
      }
    }
  }

  const counts = {
    accounts: await prisma.account.count({ where: { workspaceId: workspace.id } }),
    contacts: await prisma.contact.count({ where: { workspaceId: workspace.id } }),
    leads: await prisma.lead.count({ where: { workspaceId: workspace.id } }),
    templates: await prisma.messageTemplate.count({ where: { workspaceId: workspace.id } }),
  };

  console.log('Seed complete:', counts);
  console.log(`Sign in with owner@ahad.example / ${DEMO_PASSWORD}`);
  console.log('Run `npm run jobs:daily-feed` to generate the first daily priority feed.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
