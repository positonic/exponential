/**
 * Whether this install meters and limits Assistant use. The one switch every
 * billing surface reads.
 *
 * `BILLING_MODE`:
 *   - `off` (the default): no usage ledger, no Billing tab, no limits. Every
 *     self-hosted install runs here, and behaves exactly as it did before
 *     billing existed.
 *   - `meter`: record what each Assistant turn costs and show the usage bar.
 *     Nothing is ever blocked or downgraded.
 *   - `enforce`: the allowance is applied (the launch-day setting).
 *
 * The value must be one of those three words exactly. Where env validation
 * runs (`src/env.js`: the Vercel build, `next dev`), anything else stops the
 * app from starting, so a typo fails the deploy instead of quietly leaving
 * metering off. Where it is skipped (`SKIP_ENV_VALIDATION`, as in tests and
 * some builds), an unset, empty or unrecognised value resolves to `off` here.
 * Either way a typo can never switch limits on.
 *
 * Pure, and imports nothing, so client components can import its types. Same
 * shape as `src/server/services/ai/capabilities.ts`.
 */

export const BILLING_MODES = ["off", "meter", "enforce"] as const;

export type BillingMode = (typeof BILLING_MODES)[number];

/** `process.env`, or any subset of it. */
export type BillingEnv = Partial<Record<string, string | undefined>>;

export function resolveBillingMode(env: BillingEnv): BillingMode {
  return BILLING_MODES.find((mode) => mode === env.BILLING_MODE) ?? "off";
}

/** True when usage is recorded (`meter` and `enforce`). */
export function isMeteringOn(mode: BillingMode): boolean {
  return mode !== "off";
}

/** USD × 1e6: the unit every usage amount is stored in. */
export const MICROS_PER_USD = 1_000_000;

/**
 * The Free plan's monthly assistant allowance per workspace, in micro-USD of
 * model cost.
 *
 * PROVISIONAL. The real figure is set from the first 4-6 weeks of metering, so
 * that 80-90% of active Free workspaces stay under it (an open decision in the
 * billing PRD). Until then this only sets the scale of the usage bar: in
 * `meter` mode nothing reads it to limit anything. USD 3 is the most a paid
 * seat could carry at the 30%-of-revenue ceiling (30% of USD 10), which Free
 * cannot sensibly exceed.
 */
export const FREE_ALLOWANCE_MICROS = 3 * MICROS_PER_USD;
