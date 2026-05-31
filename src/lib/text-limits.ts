import { z } from "zod";

/**
 * Application-layer caps for user-authored text.
 *
 * DB columns are unbounded Postgres `text` — these caps are policy, not
 * constraints. Tier sizes target known reference points:
 *   - GitHub issue/PR/comment body = 65,536
 *   - Linear issue description ≈ 250,000
 */
export const TEXT_LIMITS = {
  LABEL: 200,
  SHORT: 2_000,
  MEDIUM: 10_000,
  LARGE: 65_536,
  HUGE: 250_000,
} as const;

export type TextLimit = (typeof TEXT_LIMITS)[keyof typeof TEXT_LIMITS];

/**
 * Build a Zod string with a friendly, field-named max-length message.
 *
 * `fieldLabel` is the human-readable name surfaced in the error
 * ("Description is too long: max 65,536 characters."). Pass `min: 1` to
 * require non-empty input with an equally friendly message.
 */
export function boundedText(
  fieldLabel: string,
  max: number,
  opts?: { min?: number },
): z.ZodString {
  const base = z.string().max(
    max,
    `${fieldLabel} is too long: max ${max.toLocaleString()} characters.`,
  );
  return opts?.min !== undefined
    ? base.min(opts.min, `${fieldLabel} is required.`)
    : base;
}
