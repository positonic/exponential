import { runAfterResponse } from "~/server/utils/runAfterResponse";

/**
 * Loaded on the failure path only: the reporter imports the Prisma singleton,
 * and the routers and services that emit notifications are imported by unit
 * tests that run without one.
 */
export async function reportEmitFailure(
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
 * Run a notification emit once the response has been sent, with the platform
 * keeping the function alive until it settles (ADR-0045 emits from request
 * paths). A bare `void emit(...)` can be frozen with the serverless instance
 * and the notification silently dropped; awaiting it inline would add the
 * channel delivery to the request's latency.
 *
 * Failures are reported, never dropped: `emitNotification` resolves `null`
 * when it could not resolve recipients, and anything that throws is caught.
 * Never throws to the caller.
 */
export function emitAfterResponse(
  area: string,
  emit: () => Promise<unknown>,
  context?: Record<string, string>,
): void {
  runAfterResponse(async () => {
    try {
      const result = await emit();
      if (result === null) {
        await reportEmitFailure(new Error(`${area}: notification emit failed`), area, context);
      }
    } catch (error) {
      await reportEmitFailure(error, area, context);
    }
  });
}
