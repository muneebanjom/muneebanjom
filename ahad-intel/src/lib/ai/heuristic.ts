import type { OfferAngle, PersonaCategory } from '@prisma/client';
import { ANGLE_LABELS, ANGLE_PITCH, PERSONA_LABELS, VERTICAL_LABELS } from '../domain';
import { renderTemplate } from '../outreach/render';
import type {
  AiProvider, DraftRequest, DraftResult, ProspectContext, RelevanceAssessment, ThreadSummary,
} from './types';

/**
 * Deterministic, offline provider. It is the default so the platform is fully
 * usable with no AI key, in CI and in tests: scoring, ranking and the daily feed
 * never depend on a model, and drafting degrades to strong templated copy
 * rather than failing.
 */
const PERSONA_OPENERS: Record<PersonaCategory, string> = {
  CEO: 'boards are asking for a defensible view of cyber and AI risk, not a tooling list',
  CIO: 'modernisation programmes tend to stall when security and compliance arrive late',
  CTO: 'engineering velocity and control coverage usually get traded off against each other',
  CISO: 'control coverage has to keep pace with cloud and AI adoption without growing headcount',
  HEAD_OF_GRC: 'evidence collection is still largely manual in most GCC organisations',
  COMPLIANCE_OFFICER: 'overlapping local frameworks make a single control set hard to maintain',
  RISK_OFFICER: 'translating technical findings into board-level exposure is the recurring gap',
  IT_DIRECTOR: 'operational load grows faster than the team, especially around monitoring',
  DIGITAL_TRANSFORMATION_DIRECTOR: 'transformation timelines slip when risk sign-off is unplanned',
  DATA_AI_LEADER: 'AI pilots rarely reach production without a governance path',
  PROCUREMENT: 'vendor sprawl in security is the easiest place to find consolidated savings',
  OTHER: 'security and compliance obligations keep expanding faster than teams do',
};

const QUESTIONS: Record<OfferAngle, string[]> = {
  CYBERSECURITY: ['Where does your current monitoring coverage stop?', 'How are you measuring mean time to detect today?', 'Which assets would hurt most if they were unavailable for a day?'],
  COMPLIANCE_GRC: ['Which framework is driving your next audit?', 'How much of your evidence collection is still manual?', 'When is your next regulatory submission due?'],
  ADVANCED_CYBER_DEFENSE: ['When did you last run an adversary-simulation exercise?', 'How is out-of-hours response covered?', 'What did the last incident review recommend that is still open?'],
  DIGITAL_TRANSFORMATION: ['Which platform migration is furthest behind plan?', 'At what point does security review enter your delivery cycle?', 'What is the business case the board approved?'],
  AI_GOVERNANCE: ['How many AI use cases are live versus in pilot?', 'Who signs off on model risk today?', 'What does your regulator expect on AI by next year?'],
  AI_IMPLEMENTATION: ['Which process would benefit most from automation this year?', 'Where is the data for that process held?', 'What has blocked pilots from reaching production?'],
  ENTERPRISE_RISK: ['How is cyber risk currently presented to the board?', 'What is your stated risk appetite for operational disruption?', 'Which top risk has no owner yet?'],
  SECURITY_MODERNIZATION: ['Which controls predate your cloud migration?', 'How many security tools are in the estate?', 'What is the oldest platform you still depend on?'],
  OPERATIONAL_EFFICIENCY: ['How many security vendors renew in the next two quarters?', 'Where is there overlapping capability?', 'What is the fully loaded cost of your current stack?'],
};

const DEFAULT_BODIES: Partial<Record<string, string>> = {
  LINKEDIN_CONNECTION_REQUEST:
    'Hi {{first_name}} — I work with {{vertical}} leaders across {{region}} on {{angle}}. Given {{trigger}}, I thought a connection would be worth it. No pitch.',
  FIRST_FOLLOW_UP:
    'Thanks for connecting, {{first_name}}.\n\nWorking with {{vertical}} organisations in {{country}}, the pattern we keep seeing is that {{pain_point}}. For {{company}} specifically, {{trigger}} makes that timely.\n\n{{cta}}',
  NURTURE:
    'Hi {{first_name}} — one thing that came up repeatedly with {{vertical}} teams in {{country}} this quarter: {{pain_point}}. Happy to share what worked, no strings.\n\n{{cta}}',
  QUALIFICATION_QUESTIONS:
    'Hi {{first_name}} — before suggesting anything concrete for {{company}}, three quick questions:\n\n{{pain_point}}\n\n{{cta}}',
  MEETING_REQUEST:
    'Hi {{first_name}} — worth 20 minutes on {{angle}} for {{company}}? I can share how comparable {{vertical}} organisations in {{region}} approached it.\n\n{{cta}}',
  BREAKUP:
    'Hi {{first_name}} — I have not managed to land this at a useful time, so I will stop here. If {{angle}} moves up the agenda at {{company}}, my door is open.',
  EMAIL:
    'Hi {{first_name}},\n\n{{pain_point}} — and with {{trigger}}, that is landing on your desk rather than someone else\'s.\n\nWe help {{vertical}} organisations in {{country}} with {{angle}}. \n\n{{cta}}\n\nBest,\n{{sender_name}}\n{{sender_company}}',
};

export class HeuristicAiProvider implements AiProvider {
  readonly name = 'heuristic';

  async summarizeProfile(ctx: ProspectContext): Promise<string> {
    const size = ctx.employeeCount ? `${ctx.employeeCount.toLocaleString()} employees` : 'size unknown';
    const reg = ctx.isRegulated && ctx.regulators.length ? ` Regulated under ${ctx.regulators.slice(0, 3).join(', ')}.` : '';
    const signals = ctx.recentSignals.length ? ` Recent activity: ${ctx.recentSignals.slice(0, 2).map((s) => s.title).join('; ')}.` : '';
    return `${ctx.fullName} — ${ctx.title ?? ctx.personaLabel} at ${ctx.accountName}, a ${VERTICAL_LABELS[ctx.vertical].toLowerCase()} organisation in ${ctx.countryLabel} (${size}).${reg}${signals}`;
  }

  async assessRelevance(ctx: ProspectContext): Promise<RelevanceAssessment> {
    const low = (m: string) => m === 'Nascent' || m === 'Developing' || m === 'Unknown';
    const angle: OfferAngle =
      low(ctx.maturity.compliance) && ctx.isRegulated ? 'COMPLIANCE_GRC'
      : low(ctx.maturity.security) ? 'CYBERSECURITY'
      : ctx.maturity.ai !== 'Unknown' && !low(ctx.maturity.ai) ? 'AI_GOVERNANCE'
      : low(ctx.maturity.transformation) ? 'DIGITAL_TRANSFORMATION'
      : 'ADVANCED_CYBER_DEFENSE';

    const nextPersona: PersonaCategory =
      angle === 'COMPLIANCE_GRC' ? 'HEAD_OF_GRC'
      : angle === 'AI_GOVERNANCE' ? 'DATA_AI_LEADER'
      : angle === 'DIGITAL_TRANSFORMATION' ? 'DIGITAL_TRANSFORMATION_DIRECTOR'
      : 'CISO';

    return {
      summary: await this.summarizeProfile(ctx),
      securityRelevance: `Security posture reads as ${ctx.maturity.security.toLowerCase()}; ${low(ctx.maturity.security) ? 'foundational coverage is the opening' : 'the opening is depth — hunting, simulation and response'}.`,
      complianceRelevance: ctx.isRegulated
        ? `Obligations under ${ctx.regulators.slice(0, 2).join(', ') || 'sector regulation'} create a recurring assurance need.`
        : 'No sector regulator on file; compliance is likely customer- or contract-driven.',
      transformationRelevance: `Transformation maturity is ${ctx.maturity.transformation.toLowerCase()} — ${low(ctx.maturity.transformation) ? 'programmes are likely early and security can be designed in' : 'programmes are underway and security is probably catching up'}.`,
      likelyPainPoints: ctx.painPoints.length ? ctx.painPoints.slice(0, 4) : [PERSONA_OPENERS[ctx.personaCategory]],
      recommendedAngle: angle,
      recommendedPersonaNext: nextPersona,
      confidence: ctx.recentSignals.length >= 2 ? 'high' : ctx.recentSignals.length === 1 ? 'medium' : 'low',
    };
  }

  async draftMessage(req: DraftRequest): Promise<DraftResult> {
    const { prospect: p } = req;
    const vars = {
      first_name: p.fullName.split(' ')[0],
      full_name: p.fullName,
      title: p.title ?? p.personaLabel,
      company: p.accountName,
      country: p.countryLabel,
      region: p.region.replace(/_/g, ' '),
      vertical: VERTICAL_LABELS[p.vertical].toLowerCase(),
      persona: PERSONA_LABELS[p.personaCategory],
      trigger: p.triggers[0] ?? p.recentSignals[0]?.title ?? 'what is on your agenda this quarter',
      angle: ANGLE_LABELS[req.angle].toLowerCase(),
      regulator: p.regulators[0] ?? 'your regulator',
      pain_point: p.painPoints[0] ?? PERSONA_OPENERS[p.personaCategory],
      sender_name: req.senderName,
      sender_company: req.senderCompany,
      cta: req.cta,
    };

    const base = req.baseTemplate?.body ?? DEFAULT_BODIES[req.kind] ?? DEFAULT_BODIES.FIRST_FOLLOW_UP!;
    let body = renderTemplate(base, vars);
    if (body.length > req.maxChars) body = `${body.slice(0, req.maxChars - 1).trimEnd()}…`;

    const alternateAngles: OfferAngle[] = (['ENTERPRISE_RISK', 'COMPLIANCE_GRC', 'OPERATIONAL_EFFICIENCY'] as OfferAngle[])
      .filter((a) => a !== req.angle)
      .slice(0, req.variantCount ?? 2);

    const alternates = alternateAngles.map((angle, i) => {
      const altVars = { ...vars, angle: ANGLE_LABELS[angle].toLowerCase() };
      let altBody = renderTemplate(base, altVars);
      if (altBody.length > req.maxChars) altBody = `${altBody.slice(0, req.maxChars - 1).trimEnd()}…`;
      return {
        variantKey: String.fromCharCode(66 + i), // B, C
        body: altBody,
        positioning: `Reframed around ${ANGLE_LABELS[angle].toLowerCase()}: ${ANGLE_PITCH[angle]}`,
      };
    });

    return {
      subject: req.channel === 'EMAIL' ? `${ANGLE_LABELS[req.angle]} at ${p.accountName}` : null,
      body,
      cta: req.cta,
      positioning: req.baseTemplate?.positioningNote
        ?? `Leads with ${ANGLE_LABELS[req.angle].toLowerCase()} because ${PERSONA_OPENERS[p.personaCategory]}. Tone: ${req.tone.toLowerCase()}.`,
      alternates,
      modelUsed: 'heuristic-1.0',
    };
  }

  async qualificationQuestions(ctx: ProspectContext, angle: OfferAngle): Promise<string[]> {
    const base = QUESTIONS[angle] ?? QUESTIONS.CYBERSECURITY;
    const contextual = ctx.isRegulated && ctx.regulators[0]
      ? [`How is ${ctx.regulators[0]} shaping your roadmap this year?`]
      : [];
    return [...base, ...contextual].slice(0, 4);
  }

  async summarizeThread(ctx: ProspectContext, messages: Array<{ from: 'us' | 'them'; body: string }>): Promise<ThreadSummary> {
    const theirs = messages.filter((m) => m.from === 'them').map((m) => m.body.toLowerCase()).join(' ');
    const has = (...words: string[]) => words.some((w) => theirs.includes(w));

    const sentiment: ThreadSummary['sentiment'] =
      has('unsubscribe', 'remove me', 'do not contact') ? 'UNSUBSCRIBE'
      : has('out of office', 'annual leave', 'on leave') ? 'OUT_OF_OFFICE'
      : has('speak to', 'colleague', 'better person', 'forwarded') ? 'REFERRAL'
      : has('not interested', 'no thanks', 'no budget', 'already have') ? 'NEGATIVE'
      : has('interested', 'happy to', 'let us', "let's", 'call', 'meet', 'send') ? 'POSITIVE'
      : 'NEUTRAL';

    const buyingSignals = [
      has('budget', 'approved', 'funding') ? 'Budget referenced' : null,
      has('audit', 'deadline', 'regulator', 'submission') ? 'Compliance deadline referenced' : null,
      has('rfp', 'tender', 'procurement') ? 'Formal procurement mentioned' : null,
      has('team', 'hiring', 'headcount') ? 'Capacity constraint mentioned' : null,
    ].filter((s): s is string => s !== null);

    const objections = [
      has('already have', 'incumbent', 'existing vendor') ? 'Incumbent vendor in place' : null,
      has('no budget', 'next year', 'not this quarter') ? 'Timing or budget objection' : null,
      has('internal', 'in-house') ? 'Prefers in-house delivery' : null,
    ].filter((s): s is string => s !== null);

    const nextBestAction =
      sentiment === 'POSITIVE' ? 'Propose two concrete meeting slots in the next five working days.'
      : sentiment === 'REFERRAL' ? 'Ask for a warm introduction to the named colleague, then research them.'
      : sentiment === 'OUT_OF_OFFICE' ? 'Snooze until their stated return date.'
      : sentiment === 'NEGATIVE' ? 'Park the lead and revisit in one quarter with a different angle.'
      : sentiment === 'UNSUBSCRIBE' ? 'Mark opted out immediately and suppress from all future outreach.'
      : 'Send one short value-add follow-up, then move to nurture.';

    return {
      summary: `${messages.length} message(s) exchanged with ${ctx.fullName}. Latest position reads as ${sentiment.toLowerCase().replace(/_/g, ' ')}.`,
      sentiment, buyingSignals, objections, nextBestAction,
    };
  }

  async nextBestAction(ctx: ProspectContext, stage: string): Promise<string> {
    const first = ctx.fullName.split(' ')[0];
    const map: Record<string, string> = {
      IMPORTED: `Review and enrich ${ctx.accountName} before approaching ${first}.`,
      ENRICHED: `Confirm ${first} is the right entry point, then shortlist.`,
      REVIEWED: `Shortlist ${first} into the matching campaign.`,
      SHORTLISTED: `Draft a personalised opener for ${first} and send it for approval.`,
      CONTACTED: ctx.priorTouches >= 3 ? `Send a breakup message to ${first}.` : `Follow up with a new proof point for ${first}.`,
      REPLIED: `Reply to ${first} within the day and propose two meeting slots.`,
      QUALIFIED: `Send a scoping outline and confirm the decision process at ${ctx.accountName}.`,
      MEETING_BOOKED: 'Prepare a tailored discovery agenda and confirm attendees.',
      OPPORTUNITY: 'Build the proposal and identify the economic buyer.',
    };
    return map[stage] ?? `Review ${first} and decide whether to pursue.`;
  }
}
