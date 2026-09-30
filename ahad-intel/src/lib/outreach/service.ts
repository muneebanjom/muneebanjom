import '../server-guard';
import type { Channel, DraftMessage, MessageKind, OfferAngle, Prisma, Tone } from '@prisma/client';
import { prisma } from '../db';
import { ai } from '../ai';
import { prospectContextFrom } from '../ai/context';
import { leadInclude } from '../scoring/service';
import { PERSONA_LABELS } from '../domain';
import { limitFor } from './render';
import { pickVariation, type TemplateCandidate } from './variations';

export interface GenerateDraftOptions {
  workspaceId: string;
  leadId: string;
  authorId: string;
  senderName: string;
  senderCompany: string;
  angle?: OfferAngle;
  kind?: MessageKind;
  channel?: Channel;
  tone?: Tone;
  cta?: string;
  locale?: string;
  templateId?: string;
  recommendationId?: string;
  variantCount?: number;
}

const DEFAULT_CTAS: Partial<Record<MessageKind, string>> = {
  LINKEDIN_CONNECTION_REQUEST: 'Happy to connect.',
  FIRST_FOLLOW_UP: 'Worth a 20-minute conversation in the next two weeks?',
  NURTURE: 'Would a short summary be useful?',
  QUALIFICATION_QUESTIONS: 'Even one-line answers would help me be useful rather than generic.',
  MEETING_REQUEST: 'Would Tuesday or Thursday suit for 20 minutes?',
  BREAKUP: 'If timing changes, a one-line reply is all it takes.',
  EMAIL: 'Worth a short call to see whether this is relevant?',
};

/**
 * Produces a draft for human review. Nothing here sends anything: the output is
 * always a DRAFT row that a person must edit, submit and have approved.
 */
export async function generateDraft(options: GenerateDraftOptions): Promise<DraftMessage> {
  const lead = await prisma.lead.findFirst({
    where: { id: options.leadId, workspaceId: options.workspaceId },
    include: leadInclude,
  });
  if (!lead) throw new Error('Lead not found in this workspace.');
  if (lead.contact.optedOut) throw new Error('This contact has opted out and cannot be drafted to.');

  const kind: MessageKind = options.kind ?? (lead.touchCount === 0 ? 'LINKEDIN_CONNECTION_REQUEST' : 'FIRST_FOLLOW_UP');
  const angle: OfferAngle = options.angle ?? lead.offerAngle ?? 'CYBERSECURITY';
  const channel: Channel = options.channel
    ?? (kind === 'EMAIL' ? 'EMAIL' : kind === 'LINKEDIN_CONNECTION_REQUEST' ? 'LINKEDIN_CONNECTION' : lead.channel);
  const tone: Tone = options.tone ?? (lead.contact.personaCategory === 'CEO' ? 'EXECUTIVE' : 'CONSULTATIVE');
  const cta = options.cta ?? DEFAULT_CTAS[kind] ?? 'Worth a short conversation?';

  const templates = await prisma.messageTemplate.findMany({
    where: { workspaceId: options.workspaceId, isActive: true, isApproved: true },
  });
  const candidates: TemplateCandidate[] = templates.map((t) => ({
    id: t.id, name: t.name, variantKey: t.variantKey, kind: t.kind, channel: t.channel,
    offerAngle: t.offerAngle, regions: t.regions, personaCategories: t.personaCategories,
    isActive: t.isActive, isApproved: t.isApproved, timesUsed: t.timesUsed, replies: t.replies, meetings: t.meetings,
  }));

  const chosen = options.templateId
    ? candidates.find((t) => t.id === options.templateId) ?? null
    : pickVariation(candidates, {
        angle, kind, channel,
        persona: lead.contact.personaCategory,
        region: lead.account.region,
        seed: `${new Date().toISOString().slice(0, 10)}:${lead.id}`,
      });

  const baseTemplate = chosen ? templates.find((t) => t.id === chosen.id) ?? null : null;

  const result = await ai().draftMessage({
    prospect: prospectContextFrom(lead, lead.replies[0]?.summary ?? null),
    angle, kind, channel, tone, cta,
    locale: options.locale ?? 'en',
    maxChars: limitFor(channel, kind),
    senderName: options.senderName,
    senderCompany: options.senderCompany,
    baseTemplate: baseTemplate
      ? { name: baseTemplate.name, body: baseTemplate.body, positioningNote: baseTemplate.positioningNote }
      : null,
    variantCount: options.variantCount ?? 2,
  });

  const draft = await prisma.draftMessage.create({
    data: {
      workspaceId: options.workspaceId,
      leadId: lead.id,
      campaignId: lead.campaignId,
      templateId: baseTemplate?.id ?? null,
      recommendationId: options.recommendationId ?? null,
      kind, channel, tone, offerAngle: angle,
      locale: options.locale ?? 'en',
      subject: result.subject,
      body: result.body,
      cta: result.cta,
      positioning: result.positioning,
      alternates: result.alternates as unknown as Prisma.InputJsonValue,
      variantKey: chosen?.variantKey ?? 'A',
      status: 'DRAFT',
      authorId: options.authorId,
      generator: 'ai',
      modelUsed: result.modelUsed,
    },
  });

  if (baseTemplate) {
    await prisma.messageTemplate.update({
      where: { id: baseTemplate.id },
      data: { timesUsed: { increment: 1 } },
    });
  }

  return draft;
}

/** Persona-aware qualification questions for the lead detail view. */
export async function qualificationQuestionsFor(workspaceId: string, leadId: string): Promise<string[]> {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId }, include: leadInclude });
  if (!lead) return [];
  const persona = lead.contact.persona;
  if (persona?.qualificationQuestions.length) return persona.qualificationQuestions.slice(0, 4);
  return ai().qualificationQuestions(prospectContextFrom(lead), lead.offerAngle ?? 'CYBERSECURITY');
}

export function personaLabelFor(category: keyof typeof PERSONA_LABELS): string {
  return PERSONA_LABELS[category];
}
