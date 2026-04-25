/**
 * Token cost calculation for AI model requests.
 *
 * Anthropic prompt-caching pricing:
 *   - Cache WRITE (cache_creation_input_tokens): 1.25x base input rate
 *   - Cache READ  (cache_read_input_tokens):     0.1x  base input rate
 *   - Uncached input (input_tokens):             1.0x  base input rate
 *
 * OpenAI cached input (cached_tokens) is billed at 0.5x base input rate for
 * models that support it.
 *
 * All rates are USD per 1M tokens.
 */

interface ModelPricing {
  input: number;
  output: number;
  cacheWriteMultiplier?: number;
  cacheReadMultiplier?: number;
}

const ANTHROPIC_CACHE_WRITE_MULT = 1.25;
const ANTHROPIC_CACHE_READ_MULT = 0.1;
const OPENAI_CACHE_READ_MULT = 0.5;

export const MODEL_COSTS: Record<string, ModelPricing> = {
  "claude-opus-4": {
    input: 15.0,
    output: 75.0,
    cacheWriteMultiplier: ANTHROPIC_CACHE_WRITE_MULT,
    cacheReadMultiplier: ANTHROPIC_CACHE_READ_MULT,
  },
  "claude-sonnet-4": {
    input: 3.0,
    output: 15.0,
    cacheWriteMultiplier: ANTHROPIC_CACHE_WRITE_MULT,
    cacheReadMultiplier: ANTHROPIC_CACHE_READ_MULT,
  },
  "claude-haiku-4": {
    input: 1.0,
    output: 5.0,
    cacheWriteMultiplier: ANTHROPIC_CACHE_WRITE_MULT,
    cacheReadMultiplier: ANTHROPIC_CACHE_READ_MULT,
  },
  "claude-3-5-sonnet": {
    input: 3.0,
    output: 15.0,
    cacheWriteMultiplier: ANTHROPIC_CACHE_WRITE_MULT,
    cacheReadMultiplier: ANTHROPIC_CACHE_READ_MULT,
  },
  "claude-3-5-haiku": {
    input: 0.8,
    output: 4.0,
    cacheWriteMultiplier: ANTHROPIC_CACHE_WRITE_MULT,
    cacheReadMultiplier: ANTHROPIC_CACHE_READ_MULT,
  },
  "gpt-4o": { input: 2.5, output: 10.0, cacheReadMultiplier: OPENAI_CACHE_READ_MULT },
  "gpt-4o-mini": { input: 0.15, output: 0.6, cacheReadMultiplier: OPENAI_CACHE_READ_MULT },
  "gpt-4-turbo": { input: 10.0, output: 30.0 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
};

export interface RequestTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

export function resolveModelPricing(modelId: string | undefined): ModelPricing | undefined {
  if (!modelId) return undefined;
  const lowered = modelId.toLowerCase();
  return Object.entries(MODEL_COSTS).find(([key]) => lowered.includes(key))?.[1];
}

/**
 * Compute cost in USD for a request. Returns undefined when pricing for the
 * model is unknown. Cache reads and writes are priced separately per the
 * Anthropic/OpenAI pricing tables above.
 */
export function computeRequestCost(
  modelId: string | undefined,
  usage: RequestTokenUsage,
): number | undefined {
  const rates = resolveModelPricing(modelId);
  if (!rates) return undefined;

  const perMillion = (tokens: number, rate: number) => (tokens / 1_000_000) * rate;
  const cacheWriteRate = rates.input * (rates.cacheWriteMultiplier ?? 1);
  const cacheReadRate = rates.input * (rates.cacheReadMultiplier ?? 1);

  const cost =
    perMillion(usage.inputTokens, rates.input) +
    perMillion(usage.outputTokens, rates.output) +
    perMillion(usage.cacheCreationInputTokens ?? 0, cacheWriteRate) +
    perMillion(usage.cacheReadInputTokens ?? 0, cacheReadRate);

  return Math.round(cost * 100_000) / 100_000;
}

/**
 * Threshold above which a single request is considered expensive enough to
 * warrant a console warning so humans notice regressions quickly.
 */
export const PER_REQUEST_COST_ALERT_USD = Number(
  process.env.AI_COST_PER_REQUEST_ALERT_USD ?? "0.5",
);
