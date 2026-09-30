import '../server-guard';
import { MATURITY_LABELS, PERSONA_LABELS, TRIGGER_LABELS, countryName } from '../domain';
import type { ScorableLead } from '../scoring/service';
import type { ProspectContext } from './types';

/**
 * Builds the redacted context passed to the AI layer.
 * Email, phone, raw provider payloads and credentials are never included.
 */
export function prospectContextFrom(lead: ScorableLead, lastInteractionSummary: string | null = null): ProspectContext {
  return {
    fullName: lead.contact.fullName,
    title: lead.contact.title,
    personaCategory: lead.contact.personaCategory,
    personaLabel: lead.contact.persona?.label ?? PERSONA_LABELS[lead.contact.personaCategory],
    accountName: lead.account.name,
    accountDescription: lead.account.description,
    countryLabel: countryName(lead.account.country),
    region: lead.account.region,
    vertical: lead.account.vertical,
    employeeCount: lead.account.employeeCount,
    isRegulated: lead.account.isRegulated,
    regulators: lead.account.regulators,
    triggers: lead.account.triggers.map((t) => TRIGGER_LABELS[t]),
    painPoints: lead.contact.persona?.painPoints ?? [],
    maturity: {
      compliance: MATURITY_LABELS[lead.account.complianceMaturity],
      security: MATURITY_LABELS[lead.account.securityMaturity],
      transformation: MATURITY_LABELS[lead.account.transformationMaturity],
      ai: MATURITY_LABELS[lead.account.aiReadiness],
    },
    recentSignals: lead.account.signals.slice(0, 5).map((s) => ({
      title: s.title,
      observedAt: s.observedAt.toISOString().slice(0, 10),
    })),
    priorTouches: lead.touchCount,
    lastInteractionSummary,
  };
}
