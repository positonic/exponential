import * as Sentry from "@sentry/nextjs";

import { db } from "~/server/db";
import { ingestSentryBug } from "~/server/services/sentry/SentryBugService";
import {
  buildClientErrorBody,
  buildClientErrorBug,
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

/** Same "bug" labels the /api/client-errors route files under. */
const CLIENT_ERROR_LABELS = [
  { name: "client-error", slug: "client-error", color: "avatar-orange" },
  { name: "bug", slug: "bug", color: "avatar-red" },
] as const;

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

export function reportHandledErrorServer(
  error: unknown,
  options: {
    /** Where this happened — becomes the ticket's culprit and part of its dedup key. */
    area: string;
    /** The classification the caller already made, if any. Governs whether a ticket is filed at all. */
    kind?: string;
    /** Extra context rendered in the ticket body and attached to the Sentry event. */
    context?: Record<string, string>;
  },
): void {
  const { area, kind, context } = options;

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

  // Fire-and-forget, like the client helper's fetch. Dedup on the error
  // fingerprint happens inside ingestSentryBug.
  void ingestSentryBug(db, buildClientErrorBug(report), {
    body: buildClientErrorBody(report),
    labels: CLIENT_ERROR_LABELS,
  }).catch((ingestError: unknown) => {
    console.error(`[reportHandledErrorServer] could not file a bug (${area}):`, ingestError);
  });
}
