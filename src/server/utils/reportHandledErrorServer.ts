import * as Sentry from "@sentry/nextjs";

import { db } from "~/server/db";
import { ingestSentryBug, type IngestResult } from "~/server/services/sentry/SentryBugService";
import { runAfterResponse } from "~/server/utils/runAfterResponse";
import {
  buildClientErrorBody,
  buildClientErrorBug,
  clientErrorLabels,
  shouldFileClientError,
  type ClientErrorReport,
} from "~/server/services/clientErrors/clientErrorBug";

/**
 * Server-side twin of `~/lib/reportHandledError`.
 *
 * The client helper reports its Bug-ticket half through a relative
 * `fetch("/api/client-errors")` — which on the server rejects outright
 * (undici needs an absolute URL) and would be unauthenticated anyway (no
 * session cookie rides a server-originated fetch). So server call sites use
 * this variant, which captures to Sentry the same way and files the Bug
 * Ticket by calling the same services the route handler wraps.
 *
 * Same contract: best-effort by construction — reporting an error must never
 * raise one, so every failure here is swallowed. Same `CLIENT_ERROR_BUGS`
 * env gate as the route, so per-environment filing stays one decision.
 */

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "number" || typeof error === "boolean") return String(error);
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
    try {
      return JSON.stringify(error).slice(0, 500);
    } catch {
      return "";
    }
  }
  return "";
}

/**
 * File (or dedup onto) the Bug Ticket for a handled failure, and wait for it.
 *
 * The half of {@link reportHandledErrorServer} that writes the ticket, for
 * callers that need the result: a job that records state on the ticket it
 * filed (the tool canary) cannot use a fire-and-forget report. Same
 * `CLIENT_ERROR_BUGS` gate, same fingerprint, same labels, so a failure
 * reported both ways lands on one ticket. Returns null when filing is off.
 * Unlike the reporter this can throw: the caller is a job that should know.
 */
export async function fileHandledErrorBug(
  report: ClientErrorReport,
  options?: { heading?: string; renotifyAfterMs?: number },
): Promise<IngestResult | null> {
  if (!process.env.CLIENT_ERROR_BUGS) return null;
  return ingestSentryBug(db, buildClientErrorBug(report), {
    body: buildClientErrorBody(report),
    labels: clientErrorLabels(report.area),
    heading: options?.heading ?? "New app error",
    ...(options?.renotifyAfterMs !== undefined ? { renotifyAfterMs: options.renotifyAfterMs } : {}),
  });
}

export function reportHandledErrorServer(
  error: unknown,
  options: {
    /** Where this happened — becomes the ticket's culprit and part of its dedup key. */
    area: string;
    /** The classification the caller already made, if any. Governs whether a ticket is filed at all. */
    kind?: string;
    /** Extra context rendered in the ticket body and attached to the Sentry event. */
    context?: Record<string, string>;
    /**
     * Re-announce in the ops room at most once per this many ms while the
     * error keeps recurring, instead of only when its ticket is created. For
     * failures someone has to act on right away (see SentryBugService).
     */
    renotifyAfterMs?: number;
  },
): void {
  const { area, kind, context, renotifyAfterMs } = options;

  try {
    Sentry.captureException(error, {
      tags: { area, ...(kind ? { failureKind: kind } : {}) },
      ...(context ? { extra: context } : {}),
    });
  } catch {
    // A Sentry SDK that isn't initialised, or a transport that refuses.
  }

  if (!process.env.CLIENT_ERROR_BUGS) return;
  if (!shouldFileClientError(kind)) return;

  const message = messageOf(error);
  if (!message.trim()) return;

  const report: ClientErrorReport = {
    area,
    kind,
    message: message.slice(0, 2000),
    context,
  };

  // Filed after the response, with the platform keeping the function alive
  // until it settles: a bare un-awaited promise can be frozen with the Vercel
  // instance and the ticket silently lost. Callers stay synchronous. Dedup on
  // the error fingerprint happens inside ingestSentryBug.
  runAfterResponse(() =>
    fileHandledErrorBug(report, { renotifyAfterMs }).catch((ingestError: unknown) => {
      console.error(`[reportHandledErrorServer] could not file a bug (${area}):`, ingestError);
    }),
  );
}
