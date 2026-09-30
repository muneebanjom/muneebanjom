import type { Channel, MessageKind, OfferAngle, PersonaCategory, Region, Tone, Vertical } from '@prisma/client';

/**
 * Provider-agnostic AI contract. Tasks are typed, not free-form prompts, so the
 * rest of the app never depends on a particular model or vendor, and so every
 * context payload can be redacted consistently (no raw email or phone ever
 * leaves the process).
 */
export interface ProspectContext {
  fullName: string;
  title: string | null;
  personaCategory: PersonaCategory;
  personaLabel: string;
  accountName: string;
  accountDescription: string | null;
  countryLabel: string;
  region: Region;
  vertical: Vertical;
  employeeCount: number | null;
  isRegulated: boolean;
  regulators: string[];
  triggers: string[];
  painPoints: string[];
  maturity: { compliance: string; security: string; transformation: string; ai: string };
  recentSignals: Array<{ title: string; observedAt: string }>;
  priorTouches: number;
  lastInteractionSummary: string | null;
}

export interface DraftRequest {
  prospect: ProspectContext;
  angle: OfferAngle;
  kind: MessageKind;
  channel: Channel;
  tone: Tone;
  cta: string;
  locale: string;
  maxChars: number;
  senderName: string;
  senderCompany: string;
  baseTemplate?: { name: string; body: string; positioningNote: string | null } | null;
  variantCount?: number;
}

export interface DraftResult {
  subject: string | null;
  body: string;
  cta: string;
  positioning: string;
  alternates: Array<{ variantKey: string; body: string; positioning: string }>;
  modelUsed: string;
}

export interface RelevanceAssessment {
  summary: string;
  securityRelevance: string;
  complianceRelevance: string;
  transformationRelevance: string;
  likelyPainPoints: string[];
  recommendedAngle: OfferAngle;
  recommendedPersonaNext: PersonaCategory;
  confidence: 'low' | 'medium' | 'high';
}

export interface ThreadSummary {
  summary: string;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'OUT_OF_OFFICE' | 'REFERRAL' | 'UNSUBSCRIBE';
  buyingSignals: string[];
  objections: string[];
  nextBestAction: string;
}

export interface AiProvider {
  readonly name: string;
  summarizeProfile(ctx: ProspectContext): Promise<string>;
  assessRelevance(ctx: ProspectContext): Promise<RelevanceAssessment>;
  draftMessage(req: DraftRequest): Promise<DraftResult>;
  qualificationQuestions(ctx: ProspectContext, angle: OfferAngle): Promise<string[]>;
  summarizeThread(ctx: ProspectContext, messages: Array<{ from: 'us' | 'them'; body: string }>): Promise<ThreadSummary>;
  nextBestAction(ctx: ProspectContext, stage: string): Promise<string>;
}
