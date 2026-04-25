/**
 * Pure filter that prepares Mastra agents for embedding-based routing.
 *
 * Splits the agent list into three buckets:
 *   - `valid`     — instructions pass validation (may be truncated)
 *   - `skipped`   — malformed / empty / too-short instructions
 *   - `truncated` — originally too long; content in `valid` is clipped
 *
 * Centralising this here keeps the tRPC router thin and, more
 * importantly, makes the rule unit-testable without mocking OpenAI or
 * the Mastra API. See {@link AGENT_FILTER_DEFAULTS} for the thresholds.
 */

export const AGENT_FILTER_DEFAULTS = {
  /**
   * Minimum plausible length for a usable system prompt. Below this, an
   * agent is almost certainly misconfigured (e.g. instructions assigned
   * a non-string value that coerced to short garbage during serialization).
   */
  minInstructionChars: 50,

  /**
   * Upper bound fed into `text-embedding-3-small`. The model's hard
   * limit is 8192 tokens; 30000 chars ≈ ~7500 tokens at ~4 chars/token,
   * which leaves headroom for prompts that lean token-dense.
   */
  maxInstructionChars: 30_000,
} as const;

export type AgentInput = { id: string; instructions: unknown };

export type AgentFilterValid = { id: string; instructions: string };

export type AgentFilterSkipped = {
  id: string;
  reason: string;
  /** Length of the original field when it was a string; absent for non-strings. */
  length?: number;
  /** `typeof` result, or `'array'` for arrays. */
  type: string;
};

export type AgentFilterTruncated = {
  id: string;
  originalLength: number;
  truncatedLength: number;
};

export type AgentFilterResult = {
  valid: AgentFilterValid[];
  skipped: AgentFilterSkipped[];
  truncated: AgentFilterTruncated[];
};

export function filterAgentInstructions(
  agents: AgentInput[],
  options: { minInstructionChars?: number; maxInstructionChars?: number } = {},
): AgentFilterResult {
  const minChars = options.minInstructionChars ?? AGENT_FILTER_DEFAULTS.minInstructionChars;
  const maxChars = options.maxInstructionChars ?? AGENT_FILTER_DEFAULTS.maxInstructionChars;

  const valid: AgentFilterValid[] = [];
  const skipped: AgentFilterSkipped[] = [];
  const truncated: AgentFilterTruncated[] = [];

  for (const { id, instructions: raw } of agents) {
    const type = Array.isArray(raw) ? 'array' : typeof raw;

    if (typeof raw !== 'string') {
      skipped.push({ id, reason: 'instructions is not a string', type });
      continue;
    }

    if (raw.trim().length < minChars) {
      skipped.push({
        id,
        reason: `instructions shorter than ${minChars} chars`,
        length: raw.length,
        type,
      });
      continue;
    }

    if (raw.length > maxChars) {
      truncated.push({ id, originalLength: raw.length, truncatedLength: maxChars });
      valid.push({ id, instructions: raw.slice(0, maxChars) });
      continue;
    }

    valid.push({ id, instructions: raw });
  }

  return { valid, skipped, truncated };
}
