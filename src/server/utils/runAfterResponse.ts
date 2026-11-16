import { after } from "next/server";

/**
 * Run `task` once the response has been sent, with the platform keeping the
 * function alive until it settles (`after()` is Vercel `waitUntil` under the
 * hood). A bare un-awaited promise can be frozen with the instance and
 * silently dropped.
 *
 * Outside a request scope (a script, a test, a job with no request) `after()`
 * throws, so the task runs detached there instead. `task` must handle its own
 * errors: nothing awaits it. {@link runAfterResponseReported} does that for you.
 */
export function runAfterResponse(task: () => Promise<unknown>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}

/**
 * Report a failure from background work to Sentry (and the Bug-ticket flow)
 * via `reportHandledErrorServer`. Loaded lazily: the reporter imports the
 * Prisma singleton, and this module is imported by code whose unit tests run
 * without one. Never throws.
 */
export async function reportBackgroundFailure(
  error: unknown,
  area: string,
  context?: Record<string, string>,
): Promise<void> {
  try {
    const { reportHandledErrorServer } = await import("~/server/utils/reportHandledErrorServer");
    reportHandledErrorServer(error, { area, context });
  } catch {
    // Reporting an error must never raise one.
  }
}

/**
 * {@link runAfterResponse} for work whose failure someone should hear about:
 * a rejection is logged and reported under `area` instead of being dropped.
 * Use it in place of `void task().catch(console.error)` on request paths.
 */
export function runAfterResponseReported(
  area: string,
  task: () => Promise<unknown>,
  context?: Record<string, string>,
): void {
  runAfterResponse(async () => {
    try {
      await task();
    } catch (error) {
      console.error(`[${area}] background task failed:`, error);
      await reportBackgroundFailure(error, area, context);
    }
  });
}
