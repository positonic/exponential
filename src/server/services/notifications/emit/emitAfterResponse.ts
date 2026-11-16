import {
  reportBackgroundFailure,
  runAfterResponseReported,
} from "~/server/utils/runAfterResponse";

/**
 * Report a notification failure via `reportHandledErrorServer` (lazily
 * loaded). Never throws. The mention adapters use it for their own failures.
 */
export const reportEmitFailure = reportBackgroundFailure;

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
  runAfterResponseReported(
    area,
    async () => {
      if ((await emit()) === null) throw new Error(`${area}: notification emit failed`);
    },
    context,
  );
}
