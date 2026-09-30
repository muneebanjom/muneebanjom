import type { OfferAngle, PersonaCategory } from '@prisma/client';
import { env } from '../env';
import { HeuristicAiProvider } from './heuristic';
import type {
  AiProvider, DraftRequest, DraftResult, ProspectContext, RelevanceAssessment, ThreadSummary,
} from './types';

/**
 * Anthropic Messages API adapter.
 *
 * Two deliberate design choices:
 *  - Context sent to the model is already redacted upstream (ProspectContext
 *    carries no email, phone or raw provider payload).
 *  - Every call falls back to the deterministic provider on any failure, so an
 *    outage degrades prose quality instead of breaking the product.
 */
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  model?: string;
}

export class AnthropicAiProvider implements AiProvider {
  readonly name = 'anthropic';
  private readonly fallback = new HeuristicAiProvider();

  constructor(
    private readonly apiKey: string,
    private readonly model: string = env().AI_MODEL,
  ) {}

  private async complete(system: string, user: string, maxTokens = 1200): Promise<string | null> {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: user }],
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        console.error('[ai] anthropic request failed', res.status);
        return null;
      }
      const json = (await res.json()) as AnthropicResponse;
      return json.content?.map((c) => c.text ?? '').join('').trim() || null;
    } catch (error) {
      console.error('[ai] anthropic request errored', error);
      return null;
    }
  }

  private async completeJson<T>(system: string, user: string, maxTokens = 1200): Promise<T | null> {
    const text = await this.complete(`${system}\n\nRespond with a single JSON object and nothing else.`, user, maxTokens);
    if (!text) return null;
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }

  private static systemPrompt(extra: string): string {
    return [
      'You support a B2B sales team at Ahad, a Gulf-based provider of cybersecurity, compliance and GRC,',
      'advanced cyber defense, digital transformation, AI governance and AI implementation services.',
      'Buyers are CXOs and senior decision-makers in UAE, Saudi Arabia, the wider GCC and MENA.',
      'Write in clear British English. Be specific, senior and concise. Never invent facts, figures,',
      'customer names or regulatory claims that are not in the supplied context. Never fabricate a',
      'personal detail about the recipient. No hype, no flattery, no fake urgency.',
      extra,
    ].join(' ');
  }

  async summarizeProfile(ctx: ProspectContext): Promise<string> {
    const text = await this.complete(
      AnthropicAiProvider.systemPrompt('Summarise the prospect in at most three sentences for a sales rep.'),
      JSON.stringify(ctx),
      400,
    );
    return text ?? this.fallback.summarizeProfile(ctx);
  }

  async assessRelevance(ctx: ProspectContext): Promise<RelevanceAssessment> {
    const result = await this.completeJson<RelevanceAssessment>(
      AnthropicAiProvider.systemPrompt(
        'Assess relevance for Ahad. Keys: summary, securityRelevance, complianceRelevance, transformationRelevance,' +
        ' likelyPainPoints (array of strings), recommendedAngle, recommendedPersonaNext, confidence (low|medium|high).' +
        ' recommendedAngle must be one of: CYBERSECURITY, COMPLIANCE_GRC, ADVANCED_CYBER_DEFENSE, DIGITAL_TRANSFORMATION,' +
        ' AI_GOVERNANCE, AI_IMPLEMENTATION, ENTERPRISE_RISK, SECURITY_MODERNIZATION, OPERATIONAL_EFFICIENCY.',
      ),
      JSON.stringify(ctx),
    );
    if (!result?.recommendedAngle) return this.fallback.assessRelevance(ctx);
    return result;
  }

  async draftMessage(req: DraftRequest): Promise<DraftResult> {
    const result = await this.completeJson<Omit<DraftResult, 'modelUsed'>>(
      AnthropicAiProvider.systemPrompt(
        `Draft outreach a human will review before sending. Stay under ${req.maxChars} characters in "body".` +
        ' Keys: subject (string or null), body, cta, positioning (one sentence on why this angle),' +
        ' alternates (array of { variantKey, body, positioning }, each a genuinely different approach).' +
        ' Do not include placeholders like {{name}} — write the finished text.',
      ),
      JSON.stringify(req),
      1600,
    );
    if (!result?.body) return this.fallback.draftMessage(req);
    return {
      subject: result.subject ?? null,
      body: result.body.slice(0, req.maxChars),
      cta: result.cta ?? req.cta,
      positioning: result.positioning ?? '',
      alternates: (result.alternates ?? []).slice(0, req.variantCount ?? 2),
      modelUsed: this.model,
    };
  }

  async qualificationQuestions(ctx: ProspectContext, angle: OfferAngle): Promise<string[]> {
    const result = await this.completeJson<{ questions: string[] }>(
      AnthropicAiProvider.systemPrompt('Produce 3-4 open qualification questions a senior buyer would respect. Key: questions (array of strings).'),
      JSON.stringify({ ctx, angle }),
      500,
    );
    return result?.questions?.length ? result.questions.slice(0, 4) : this.fallback.qualificationQuestions(ctx, angle);
  }

  async summarizeThread(ctx: ProspectContext, messages: Array<{ from: 'us' | 'them'; body: string }>): Promise<ThreadSummary> {
    const result = await this.completeJson<ThreadSummary>(
      AnthropicAiProvider.systemPrompt(
        'Summarise the conversation. Keys: summary, sentiment (POSITIVE|NEUTRAL|NEGATIVE|OUT_OF_OFFICE|REFERRAL|UNSUBSCRIBE),' +
        ' buyingSignals (array), objections (array), nextBestAction (string).',
      ),
      JSON.stringify({ ctx, messages }),
      700,
    );
    if (!result?.sentiment) return this.fallback.summarizeThread(ctx, messages);
    return result;
  }

  async nextBestAction(ctx: ProspectContext, stage: string): Promise<string> {
    const text = await this.complete(
      AnthropicAiProvider.systemPrompt('State the single next best action in one imperative sentence.'),
      JSON.stringify({ ctx, stage }),
      200,
    );
    return text ?? this.fallback.nextBestAction(ctx, stage);
  }
}

export type { PersonaCategory };
