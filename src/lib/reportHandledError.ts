import * as Sentry from "@sentry/nextjs";

/**
 * Report a failure the app handled gracefully.
 *
 * The gap this fills: Sentry's automatic capture only sees errors *nobody*
 * caught, so every `catch` that logs a line and renders a calm message was
 * invisible — no Sentry issue, and therefore none of the Bug Tickets the Sentry
 * webhook files (ADR-0027). The graceful handling is right; the silence was
 * not.
 *
 * Two destinations, on purpose:
 *  - **Sentry**, which does the grouping, release tracking and alerting, but
 *    only initialises on Vercel prod/preview — so it is silent for anyone
 *    running the desktop shell against a local server.
 *  - **A Bug Ticket**, via `/api/client-errors`, which works wherever the app
 *    runs and lands the failure in the tracker where it gets triaged.
 *
 * Best-effort by construction: reporting an error must never raise one. Every
 * failure here is swallowed, because a reporter that throws would take out the
 * error path it was meant to illuminate.
 */
/**
 * Readable text for whatever was thrown.
 *
 * Not just `String(error)`: a rejected IPC call or a fetch wrapper can throw a
 * plain object, and stringifying that gives "[object Object]" — a ticket titled
 * with which is worse than no ticket, because it looks like signal.
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
      // Circular, or a getter that throws.
      return "";
    }
  }
  return "";
}

export function reportHandledError(
  error: unknown,
  options: {
    /** Where this happened — `chat-stream`, `local-wiki-status`, … Becomes the ticket's culprit and part of its dedup key. */
    area: string;
    /** The classification the caller already made, if any. Governs whether a ticket is filed at all. */
    kind?: string;
    /** Extra context rendered in the ticket body and attached to the Sentry event. Strings only, so nothing unserializable slips in. */
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

  const message = messageOf(error);
  if (!message.trim()) return;

  // Fire-and-forget. `keepalive` so a report survives the navigation that a
  // fatal-looking error often triggers.
  try {
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ area, kind, message: message.slice(0, 2000), context }),
      keepalive: true,
    }).catch(() => {
      // Offline, blocked, or the endpoint is off. Nothing to do — this path
      // exists to make failures visible, not to add one.
    });
  } catch {
    // `fetch` missing entirely (SSR, an exotic webview).
  }
}
