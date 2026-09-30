import type { PersonaCategory, Vertical } from '@prisma/client';
import { COUNTRY_NAMES, regionForCountry, sizeFromEmployees } from '../domain';
import type { NormalizedCompany, NormalizedPerson } from './types';

/** Title → persona classification. Order matters: most specific first. */
const PERSONA_PATTERNS: Array<[PersonaCategory, RegExp]> = [
  ['CISO', /\b(ciso|chief information security|chief security officer|head of (information )?security|vp,? security)\b/i],
  ['HEAD_OF_GRC', /\b(head of grc|governance,? risk|grc (lead|director|manager|head))\b/i],
  ['COMPLIANCE_OFFICER', /\b(compliance|regulatory affairs|mlro)\b/i],
  ['RISK_OFFICER', /\b(chief risk|risk officer|head of risk|operational risk)\b/i],
  ['DATA_AI_LEADER', /\b(chief data|chief ai|head of (data|ai|analytics|machine learning)|cdo|caio)\b/i],
  ['DIGITAL_TRANSFORMATION_DIRECTOR', /\b(digital transformation|head of digital|chief digital|transformation (director|lead|head))\b/i],
  ['CIO', /\b(cio|chief information officer)\b/i],
  ['CTO', /\b(cto|chief technology officer|chief technical)\b/i],
  ['CEO', /\b(ceo|chief executive|managing director|group md|president)\b/i],
  ['IT_DIRECTOR', /\b(it director|director of it|head of it|it manager|infrastructure (director|head))\b/i],
  ['PROCUREMENT', /\b(procurement|vendor management|sourcing|supply chain)\b/i],
];

export function classifyPersona(title: string | null | undefined): PersonaCategory {
  if (!title) return 'OTHER';
  for (const [persona, pattern] of PERSONA_PATTERNS) {
    if (pattern.test(title)) return persona;
  }
  return 'OTHER';
}

const VERTICAL_PATTERNS: Array<[Vertical, RegExp]> = [
  ['FINANCIAL_SERVICES', /\b(bank|financial|insurance|takaful|fintech|capital|invest|exchange|payments?)\b/i],
  ['HEALTHCARE', /\b(health|hospital|medical|clinic|pharma|life sciences)\b/i],
  ['GOVERNMENT', /\b(government|ministry|authority|municipality|public sector|federal|emirate of)\b/i],
  ['ENERGY', /\b(energy|oil|gas|petroleum|utilit|power|water|renewable|solar)\b/i],
  ['TELECOM', /\b(telecom|telco|mobile network|communications)\b/i],
  ['LOGISTICS', /\b(logistics|shipping|freight|ports?|aviation|airline|transport)\b/i],
  ['REAL_ESTATE', /\b(real estate|properties|realty|developer|construction)\b/i],
  ['MANUFACTURING', /\b(manufactur|industrial|factory|cement|steel|chemicals?)\b/i],
  ['RETAIL', /\b(retail|e-?commerce|supermarket|hypermarket|mall|consumer goods)\b/i],
  ['EDUCATION', /\b(universit|school|education|academy|college)\b/i],
  ['HOSPITALITY', /\b(hotel|hospitality|resort|tourism|restaurant)\b/i],
  ['PROFESSIONAL_SERVICES', /\b(consult|advisory|law firm|legal|audit|accounting)\b/i],
  ['TECHNOLOGY', /\b(technolog|software|saas|it services|digital|systems|cloud|data)\b/i],
];

export function classifyVertical(text: string | null | undefined): Vertical {
  if (!text) return 'OTHER';
  for (const [vertical, pattern] of VERTICAL_PATTERNS) {
    if (pattern.test(text)) return vertical;
  }
  return 'OTHER';
}

const COUNTRY_ALIASES: Record<string, string> = {
  'united arab emirates': 'AE', uae: 'AE', dubai: 'AE', 'abu dhabi': 'AE', sharjah: 'AE',
  'saudi arabia': 'SA', ksa: 'SA', riyadh: 'SA', jeddah: 'SA', dammam: 'SA',
  qatar: 'QA', doha: 'QA', kuwait: 'KW', bahrain: 'BH', manama: 'BH', oman: 'OM', muscat: 'OM',
  egypt: 'EG', cairo: 'EG', jordan: 'JO', amman: 'JO', lebanon: 'LB', iraq: 'IQ',
  morocco: 'MA', tunisia: 'TN', algeria: 'DZ',
  'united kingdom': 'GB', uk: 'GB', london: 'GB',
  'united states': 'US', usa: 'US', us: 'US', india: 'IN', pakistan: 'PK', singapore: 'SG',
};

export function normalizeCountry(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (upper.length === 2 && COUNTRY_NAMES[upper]) return upper;
  const alias = COUNTRY_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;
  const byName = Object.entries(COUNTRY_NAMES).find(([, name]) => name.toLowerCase() === trimmed.toLowerCase());
  return byName?.[0] ?? null;
}

export function normalizeDomain(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('?')[0];
  return cleaned.includes('.') ? cleaned : null;
}

export function normalizeLinkedInUrl(value: string | null | undefined): { url: string | null; publicId: string | null } {
  if (!value) return { url: null, publicId: null };
  const trimmed = value.trim();
  const match = trimmed.match(/linkedin\.com\/(?:in|pub)\/([^/?#\s]+)/i);
  if (!match) return { url: trimmed.startsWith('http') ? trimmed : null, publicId: null };
  const publicId = decodeURIComponent(match[1]).toLowerCase();
  return { url: `https://www.linkedin.com/in/${publicId}`, publicId };
}

export function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

export function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/** Fill derived fields consistently, whatever the source. */
export function finalizeCompany(input: NormalizedCompany): NormalizedCompany {
  const country = normalizeCountry(input.country);
  const domain = normalizeDomain(input.domain ?? input.website);
  const vertical = input.vertical ?? classifyVertical(`${input.name} ${input.description ?? ''}`);
  return {
    ...input,
    name: input.name.trim(),
    domain,
    country,
    region: input.region ?? regionForCountry(country),
    vertical,
    companySize: input.companySize ?? sizeFromEmployees(input.employeeCount ?? null),
  };
}

export function finalizePerson(input: NormalizedPerson): NormalizedPerson {
  const { url, publicId } = normalizeLinkedInUrl(input.linkedinUrl);
  const fullName = input.fullName?.trim() || `${input.firstName} ${input.lastName}`.trim();
  const { firstName, lastName } = input.firstName ? { firstName: input.firstName, lastName: input.lastName } : splitName(fullName);
  const country = normalizeCountry(input.country) ?? input.company.country ?? null;
  return {
    ...input,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    fullName,
    email: normalizeEmail(input.email),
    linkedinUrl: url,
    linkedinPublicId: publicId,
    personaCategory: input.personaCategory ?? classifyPersona(input.title),
    country,
    region: input.region ?? regionForCountry(country),
    company: finalizeCompany(input.company),
  };
}

/** Minimal, dependency-free RFC4180-ish CSV parser (quotes, escapes, CRLF). */
export function parseCsv(content: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = false; }
      } else field += char;
      continue;
    }
    if (char === '"') { inQuotes = true; continue; }
    if (char === ',') { row.push(field); field = ''; continue; }
    if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    if (char === '\r') continue;
    field += char;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return body.map((cells) => Object.fromEntries(keys.map((k, i) => [k, (cells[i] ?? '').trim()])));
}

/** Resolve a value from the first matching alias column. */
export function pick(row: Record<string, string>, ...aliases: string[]): string | null {
  for (const alias of aliases) {
    const value = row[alias];
    if (value && value.trim()) return value.trim();
  }
  return null;
}
