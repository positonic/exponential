/**
 * Token cost calculation for AI model requests.
 *
 * Anthropic bills a prompt in three classes:
 *   - Uncached input (`input_tokens`):                     1.0x  base input rate
 *   - Cache WRITE    (`cache_creation_input_tokens`):      1.25x base input rate
 *                    (the default 5-minute TTL, which is what the agents use)
 *   - Cache READ     (`cache_read_input_tokens`):          0.1x  base input rate
 *                    (0.05x on the 5.5 generation)
 *
 * OpenAI cached input (cached_tokens) is billed at 0.5x base input rate for
 * models that support it.
 *
 * All rates are USD per 1M tokens.
 *
 * What the Assistant reports (Mastra `@mastra/core` 1.28 on AI SDK v6, read
 * from its source on 15 Nov 2026). The three classes above arrive already
 * added together:
 *
 *   - one model step: `{ inputTokens, outputTokens, cachedInputTokens, raw }`,
 *     where `inputTokens` is the step's TOTAL prompt (uncached + cache read +
 *     cache write) and `raw` is the provider's own breakdown,
 *     `{ inputTokens: { total, noCache, cacheRead, cacheWrite }, outputTokens: { total } }`.
 *   - a whole turn (the stream's `finish` chunk, a `generate` result's
 *     `usage`): the same fields summed over the steps, except `raw`, which is
 *     the LAST step's only. Cache writes are not summed anywhere.
 *
 * So pricing `inputTokens` at the full rate and then adding cache tokens on
 * top bills cache traffic twice. `turnTokenBreakdown` splits the classes apart
 * first: from the per-step usages when the caller has them (exact), otherwise
 * from the turn total (exact for a one-step turn; on a multi-step turn the
 * earlier steps' cache writes are priced at 1.0x instead of 1.25x).
 */

interface ModelPricing {
  input: number;
  output: number;
  cacheWriteMultiplier?: number;
  cacheReadMultiplier?: number;
}

const ANTHROPIC_CACHE_WRITE_MULT = 1.25;
const ANTHROPIC_CACHE_READ_MULT = 0.1;
/** The 5.5 generation halves the cache-read rate. */
const ANTHROPIC_CACHE_READ_MULT_5_5 = 0.05;
const OPENAI_CACHE_READ_MULT = 0.5;

const anthropic = (input: number, output: number, cacheReadMultiplier = ANTHROPIC_CACHE_READ_MULT): ModelPricing => ({
  input,
  output,
  cacheWriteMultiplier: ANTHROPIC_CACHE_WRITE_MULT,
  cacheReadMultiplier,
});

/**
 * Keyed by a fragment of the model id. A model id can contain several keys
 * (`claude-sonnet-4-5-20250929` contains both `claude-sonnet-4` and
 * `claude-sonnet-4-5`); the longest one wins, see `resolveModelPricing`.
 *
 * Claude Haiku 5.5 is left out on purpose: its rate depends on prompt size
 * (above 100K tokens it costs five times more), which this flat table cannot
 * express. Add it together with that tier when an agent moves to it.
 */
export const MODEL_COSTS: Record<string, ModelPricing> = {
  "claude-opus-5-5": anthropic(4.0, 20.0, ANTHROPIC_CACHE_READ_MULT_5_5),
  "claude-sonnet-5-5": anthropic(2.0, 10.0, ANTHROPIC_CACHE_READ_MULT_5_5),
  "claude-sonnet-5": anthropic(2.0, 10.0),
  "claude-sonnet-4-6": anthropic(3.0, 15.0),
  // What the Assistant runs on today: Zoe, the blank-canvas Assistant and
  // agent runs use Sonnet 4.5; their fast tier uses Haiku 4.5.
  "claude-sonnet-4-5": anthropic(3.0, 15.0),
  "claude-haiku-4-5": anthropic(1.0, 5.0),
  "claude-opus-4": anthropic(15.0, 75.0),
  "claude-sonnet-4": anthropic(3.0, 15.0),
  "claude-haiku-4": anthropic(1.0, 5.0),
  "claude-3-5-sonnet": anthropic(3.0, 15.0),
  "claude-3-5-haiku": anthropic(0.8, 4.0),
  "gpt-4o": { input: 2.5, output: 10.0, cacheReadMultiplier: OPENAI_CACHE_READ_MULT },
  "gpt-4o-mini": { input: 0.15, output: 0.6, cacheReadMultiplier: OPENAI_CACHE_READ_MULT },
  "gpt-4-turbo": { input: 10.0, output: 30.0 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
};

/** The most specific (longest) key the model id contains. */
export function resolveModelPricing(modelId: string | undefined): ModelPricing | undefined {
  if (!modelId) return undefined;
  const lowered = modelId.toLowerCase();
  let best: [string, ModelPricing] | undefined;
  for (const entry of Object.entries(MODEL_COSTS)) {
    if (lowered.includes(entry[0]) && (!best || entry[0].length > best[0].length)) best = entry;
  }
  return best?.[1];
}

/** A prompt split into the classes the provider bills separately. None overlap. */
export interface TokenBreakdown {
  /** Prompt tokens billed at the full input rate. */
  noCacheInputTokens: number;
  cacheReadInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
}

/**
 * Cost in USD of a request whose prompt is already split by class. Returns
 * undefined when pricing for the model is unknown.
 */
export function priceTokenBreakdown(modelId: string | undefined, tokens: TokenBreakdown): number | undefined {
  const rates = resolveModelPricing(modelId);
  if (!rates) return undefined;

  const perMillion = (count: number, rate: number) => (count / 1_000_000) * rate;
  const cacheWriteRate = rates.input * (rates.cacheWriteMultiplier ?? 1);
  const cacheReadRate = rates.input * (rates.cacheReadMultiplier ?? 1);

  const cost =
    perMillion(tokens.noCacheInputTokens, rates.input) +
    perMillion(tokens.outputTokens, rates.output) +
    perMillion(tokens.cacheWriteInputTokens, cacheWriteRate) +
    perMillion(tokens.cacheReadInputTokens, cacheReadRate);

  // Whole micro-dollars: the precision the usage ledger stores.
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/** USD to the ledger's integer unit (USD × 1e6). */
export function toCostMicros(costUsd: number): number {
  return Math.round(costUsd * 1_000_000);
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * The provider's own split, when `usage` carries one:
 *   - the AI SDK provider shape, `{ inputTokens: { total, noCache, cacheRead, cacheWrite }, outputTokens: { total } }`
 *   - the AI SDK result shape, `{ inputTokens, inputTokenDetails: { noCacheTokens, cacheReadTokens, cacheWriteTokens }, outputTokens }`
 */
function readExactBreakdown(usage: unknown): TokenBreakdown | undefined {
  const input = field(usage, "inputTokens");
  const output = field(usage, "outputTokens");

  const providerTotal = count(field(input, "total"));
  if (providerTotal !== undefined) {
    const cacheRead = count(field(input, "cacheRead")) ?? 0;
    const cacheWrite = count(field(input, "cacheWrite")) ?? 0;
    return {
      noCacheInputTokens: count(field(input, "noCache")) ?? Math.max(0, providerTotal - cacheRead - cacheWrite),
      cacheReadInputTokens: cacheRead,
      cacheWriteInputTokens: cacheWrite,
      outputTokens: count(field(output, "total")) ?? 0,
    };
  }

  const details = field(usage, "inputTokenDetails");
  const total = count(input);
  const cacheReadDetail = count(field(details, "cacheReadTokens"));
  const cacheWriteDetail = count(field(details, "cacheWriteTokens"));
  const noCacheDetail = count(field(details, "noCacheTokens"));
  if (total !== undefined && (noCacheDetail ?? cacheReadDetail ?? cacheWriteDetail) !== undefined) {
    const cacheRead = cacheReadDetail ?? 0;
    const cacheWrite = cacheWriteDetail ?? 0;
    return {
      noCacheInputTokens: noCacheDetail ?? Math.max(0, total - cacheRead - cacheWrite),
      cacheReadInputTokens: cacheRead,
      cacheWriteInputTokens: cacheWrite,
      outputTokens: count(output) ?? 0,
    };
  }

  return undefined;
}

/**
 * One model step's usage, split by class. Prefers the provider's breakdown
 * (on the step itself, or in the `raw` Mastra attaches to it).
 */
export function stepTokenBreakdown(stepUsage: unknown): TokenBreakdown | undefined {
  return readExactBreakdown(stepUsage) ?? readExactBreakdown(field(stepUsage, "raw")) ?? readFlatBreakdown(stepUsage);
}

/**
 * A usage with only summed totals: `inputTokens` (everything) and
 * `cachedInputTokens` (cache reads). `raw`, when present, describes the last
 * step alone, so it is trusted for the whole usage only when its total equals
 * the usage's (a one-step turn); otherwise its cache write is still that
 * step's real write, and a lower bound for the turn. Also reads the older
 * `{ promptTokens, completionTokens }` shape some agents still return.
 */
function readFlatBreakdown(usage: unknown): TokenBreakdown | undefined {
  const total = count(field(usage, "inputTokens")) ?? count(field(usage, "promptTokens")) ?? count(field(usage, "prompt_tokens"));
  const outputTokens =
    count(field(usage, "outputTokens")) ?? count(field(usage, "completionTokens")) ?? count(field(usage, "completion_tokens"));
  if (total === undefined && outputTokens === undefined) return undefined;

  const inputTotal = total ?? 0;
  const lastStep = readExactBreakdown(field(usage, "raw"));
  const lastStepTotal = lastStep
    ? lastStep.noCacheInputTokens + lastStep.cacheReadInputTokens + lastStep.cacheWriteInputTokens
    : undefined;
  if (lastStep && lastStepTotal === inputTotal) {
    return { ...lastStep, outputTokens: outputTokens ?? lastStep.outputTokens };
  }

  const cacheRead = Math.min(inputTotal, count(field(usage, "cachedInputTokens")) ?? 0);
  const cacheWrite = Math.min(inputTotal - cacheRead, lastStep?.cacheWriteInputTokens ?? 0);
  return {
    noCacheInputTokens: inputTotal - cacheRead - cacheWrite,
    cacheReadInputTokens: cacheRead,
    cacheWriteInputTokens: cacheWrite,
    outputTokens: outputTokens ?? 0,
  };
}

/**
 * A whole turn's usage, split by class: the sum of its steps when the caller
 * has them, otherwise read from the turn total. Undefined when neither
 * carries any token counts.
 */
export function turnTokenBreakdown(turnUsage: unknown, stepUsages: readonly unknown[] = []): TokenBreakdown | undefined {
  const steps = stepUsages.map(stepTokenBreakdown).filter((step): step is TokenBreakdown => step !== undefined);
  if (steps.length > 0) {
    return steps.reduce((sum, step) => ({
      noCacheInputTokens: sum.noCacheInputTokens + step.noCacheInputTokens,
      cacheReadInputTokens: sum.cacheReadInputTokens + step.cacheReadInputTokens,
      cacheWriteInputTokens: sum.cacheWriteInputTokens + step.cacheWriteInputTokens,
      outputTokens: sum.outputTokens + step.outputTokens,
    }));
  }
  return readExactBreakdown(turnUsage) ?? readFlatBreakdown(turnUsage);
}

/**
 * Threshold above which a single request is considered expensive enough to
 * warrant a console warning so humans notice regressions quickly.
 */
export const PER_REQUEST_COST_ALERT_USD = Number(
  process.env.AI_COST_PER_REQUEST_ALERT_USD ?? "0.5",
);
