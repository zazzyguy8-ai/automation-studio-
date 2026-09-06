import { AnthropicProvider } from './anthropic';
import { HeuristicProvider } from './heuristic';
import type { ReasoningProvider } from './provider';

/** Explicit override wins; otherwise Claude when a key exists, heuristic when not. */
export function getProvider(): ReasoningProvider {
  const forced = process.env.REASONING_PROVIDER;
  if (forced === 'heuristic') return new HeuristicProvider();
  if (forced === 'anthropic') return new AnthropicProvider();
  return process.env.ANTHROPIC_API_KEY ? new AnthropicProvider() : new HeuristicProvider();
}

export type { AuditInput, CopyInput, CopyOutput, ReasoningProvider } from './provider';
export { HeuristicProvider } from './heuristic';
export { AnthropicProvider } from './anthropic';
