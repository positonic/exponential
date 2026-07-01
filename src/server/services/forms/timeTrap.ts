/**
 * Time-trap (ADR-0034): a human takes a few seconds to fill a form; a bot
 * submits near-instantly. The public form reports how long it was on screen
 * (`elapsedMs`); the intake rejects implausibly fast fills like a honeypot hit.
 *
 * Pure so the decision is unit-testable independently of the route.
 */

/** Minimum plausible fill time. Conservative and tunable. */
export const MIN_FILL_MS = 3000;

/** Coerces an untrusted `elapsedMs` from the request body to a safe number. */
export function fillDurationMs(elapsedMs: unknown): number {
  return typeof elapsedMs === 'number' &&
    Number.isFinite(elapsedMs) &&
    elapsedMs >= 0
    ? elapsedMs
    : 0;
}

/**
 * True when a submission arrived too fast to be a genuine human fill. A missing
 * or malformed duration coerces to 0 and is therefore treated as too fast — the
 * only legitimate caller (the public form) always sends a real value.
 */
export function isTooFastSubmission(
  elapsedMs: unknown,
  minMs: number = MIN_FILL_MS,
): boolean {
  return fillDurationMs(elapsedMs) < minMs;
}
