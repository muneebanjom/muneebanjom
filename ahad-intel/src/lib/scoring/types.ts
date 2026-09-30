import type {
  BuyingTrigger, Channel, CompanySize, LeadStage, Maturity, OfferAngle,
  PersonaCategory, Region, Vertical,
} from '@prisma/client';

export type Dimension = 'fit' | 'intent' | 'urgency' | 'dealPotential';

export interface ScoreContribution {
  dimension: Dimension;
  label: string;
  points: number;
  rationale: string;
}

export interface ScoreWeights {
  geography: number;
  vertical: number;
  persona: number;
  companySize: number;
  maturityGap: number;
  strategicValue: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  geography: 20, vertical: 20, persona: 25, companySize: 10, maturityGap: 15, strategicValue: 10,
};

export interface IcpSpec {
  id?: string;
  name: string;
  regions: Region[];
  countries: string[];
  verticals: Vertical[];
  companySizes: CompanySize[];
  personaCategories: PersonaCategory[];
  triggers: BuyingTrigger[];
  offerAngles: OfferAngle[];
  minComplianceMaturity: Maturity;
  minSecurityMaturity: Maturity;
  minTransformationMaturity: Maturity;
  minAiReadiness: Maturity;
  minEmployees: number | null;
  maxEmployees: number | null;
  weights: ScoreWeights;
}

export interface AccountFacts {
  id: string;
  name: string;
  country: string | null;
  region: Region;
  vertical: Vertical;
  employeeCount: number | null;
  companySize: CompanySize | null;
  annualRevenueUsd: bigint | null;
  budgetPotentialUsd: bigint | null;
  isRegulated: boolean;
  regulators: string[];
  complianceMaturity: Maturity;
  securityMaturity: Maturity;
  transformationMaturity: Maturity;
  aiReadiness: Maturity;
  triggers: BuyingTrigger[];
  strategicValue: number;
  isSuppressed: boolean;
}

export interface ContactFacts {
  id: string;
  fullName: string;
  title: string | null;
  personaCategory: PersonaCategory;
  region: Region;
  country: string | null;
  optedOut: boolean;
  hasEmail: boolean;
  hasLinkedIn: boolean;
}

export interface PersonaFacts {
  category: PersonaCategory;
  label: string;
  seniority: number;
  titleKeywords: string[];
  excludeKeywords: string[];
  primaryAngles: OfferAngle[];
  painPoints: string[];
}

export interface SignalFacts {
  type: string;
  trigger: BuyingTrigger | null;
  title: string;
  weight: number;
  observedAt: Date;
  expiresAt: Date | null;
}

export interface EngagementFacts {
  touchCount: number;
  lastTouchAt: Date | null;
  lastReplyAt: Date | null;
  lastRecommendedAt: Date | null;
  recommendCount: number;
  stage: LeadStage;
  positiveReply: boolean;
  negativeReply: boolean;
  meetingHeld: boolean;
}

export interface ScoringInput {
  icp: IcpSpec;
  account: AccountFacts;
  contact: ContactFacts;
  persona: PersonaFacts | null;
  signals: SignalFacts[];
  engagement: EngagementFacts;
  campaignPriority?: number; // 0-100
  now?: Date;
}

export interface ScoreResult {
  fitScore: number;
  intentScore: number;
  urgencyScore: number;
  dealPotential: number;
  priorityScore: number;
  breakdown: ScoreContribution[];
  explanation: string;
  recommendedAngle: OfferAngle;
  recommendedChannel: Channel;
  recommendedNextStep: string;
  engineVersion: string;
}

export const ENGINE_VERSION = '1.0.0';
