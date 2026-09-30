import { env } from '../env';
import { AnthropicAiProvider } from './anthropic';
import { HeuristicAiProvider } from './heuristic';
import type { AiProvider } from './types';

let instance: AiProvider | null = null;

/**
 * Single entry point for AI. Swapping vendors is a change here and nowhere else.
 * Defaults to the deterministic provider when no key is configured.
 */
export function ai(): AiProvider {
  if (instance) return instance;
  const config = env();
  if (config.AI_PROVIDER === 'anthropic' && config.ANTHROPIC_API_KEY) {
    instance = new AnthropicAiProvider(config.ANTHROPIC_API_KEY, config.AI_MODEL);
  } else {
    instance = new HeuristicAiProvider();
  }
  return instance;
}

export function aiProviderName(): string {
  return ai().name;
}

export * from './types';
export { HeuristicAiProvider } from './heuristic';
export { AnthropicAiProvider } from './anthropic';
