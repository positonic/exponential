/**
 * Server-side product analytics (PostHog), captured once at the tRPC layer.
 *
 * Every client surface — the web app, the desktop shells, the native apps, the
 * browser extension, the CLI/SDK/MCP server, the chat gateways and external
 * agents — reaches the app through tRPC, so one middleware
 * (`src/server/api/trpc.ts`) sees every authenticated call. Events are keyed by
 * user id and tagged with the calling surface; procedure *inputs are never
 * captured* (CRM contact fields are encrypted PII, see
 * `src/server/utils/encryption.ts`).
 *
 * Disabled entirely when `POSTHOG_KEY` is unset (local dev, CI, tests).
 * Decision and trade-offs: docs/adr/0076-posthog-server-side-analytics.md.
 */
import { PostHog } from "posthog-node";

import { env } from "~/env";

/**
 * Which client made the call. Derived from how the request authenticated
 * (`tokenType` on the tRPC context) plus a couple of request headers — the
 * browser surfaces all share the NextAuth cookie session, so they are told
 * apart by user agent and the RSC marker header only.
 */
export type AnalyticsSurface =
  | "web"
  | "rsc"
  | "electron"
  | "native-app"
  | "browser-extension"
  | "api"
  | "external-agent"
  | "assistant"
  | "whatsapp"
  | "telegram"
  | "matrix"
  | "voice"
  | "unknown";

/**
 * Surfaces whose queries are just page rendering. Only their *mutations* are
 * captured: React Query polling would otherwise dominate the event volume
 * without saying anything about intent, and page views belong to a browser
 * SDK. Every other surface has no page-view signal, so its queries are its
 * usage and are captured too.
 */
const BROWSER_SURFACES: ReadonlySet<AnalyticsSurface> = new Set([
  "web",
  "rsc",
  "electron",
]);

const TOKEN_TYPE_SURFACES: Record<string, AnalyticsSurface> = {
  "api-token": "api",
  "agent-key": "external-agent",
  "agent-context": "assistant",
  "whatsapp-gateway": "whatsapp",
  "telegram-gateway": "telegram",
  "matrix-gateway": "matrix",
  "voice-session": "voice",
  "extension-token": "browser-extension",
  "device-token": "native-app",
};

export function resolveSurface(input: {
  tokenType: string | undefined;
  headers: Headers;
}): AnalyticsSurface {
  const { tokenType, headers } = input;
  if (tokenType) {
    return TOKEN_TYPE_SURFACES[tokenType] ?? "unknown";
  }
  if (headers.get("x-trpc-source") === "rsc") return "rsc";
  const userAgent = headers.get("user-agent") ?? "";
  if (userAgent.includes("Electron/")) return "electron";
  return "web";
}

export interface ProcedureCallEvent {
  userId: string;
  /** Dotted procedure path, e.g. `action.create`. Doubles as the event name. */
  path: string;
  type: "query" | "mutation" | "subscription";
  surface: AnalyticsSurface;
  ok: boolean;
  /** TRPCError code when the call failed, e.g. `NOT_FOUND`. */
  errorCode?: string;
  durationMs: number;
}

/** The capture rule, exported so it can be tested without a client. */
export function shouldCaptureProcedureCall(
  event: Pick<ProcedureCallEvent, "type" | "surface">,
): boolean {
  if (event.type === "mutation") return true;
  if (event.type === "query") return !BROWSER_SURFACES.has(event.surface);
  return false;
}

let client: PostHog | null | undefined;

function getClient(): PostHog | null {
  if (client !== undefined) return client;
  const key = env.POSTHOG_KEY;
  if (!key) {
    client = null;
    return client;
  }
  client = new PostHog(key, {
    host: env.POSTHOG_HOST ?? "https://eu.i.posthog.com",
    // Events queue in memory and are sent on flush. On Vercel the tRPC route
    // handler flushes via `after()` once the response is out, because the
    // function is frozen as soon as it responds (dev-docs/OBSERVABILITY.md).
    flushAt: 20,
    flushInterval: 10_000,
    // Never resolve the caller's location from the function's IP. The
    // request IP is deliberately not forwarded either (no PII by default,
    // matching Sentry's `sendDefaultPii: false`).
    disableGeoip: true,
  });
  client.on("error", (error: unknown) => {
    console.error("[analytics] PostHog client error:", error);
  });
  return client;
}

export function isAnalyticsEnabled(): boolean {
  return getClient() !== null;
}

/**
 * Record one tRPC procedure call. Never throws and never awaits the network:
 * analytics must not slow down or fail a request.
 */
export function captureProcedureCall(event: ProcedureCallEvent): void {
  if (!shouldCaptureProcedureCall(event)) return;
  const posthog = getClient();
  if (!posthog) return;
  try {
    posthog.capture({
      distinctId: event.userId,
      event: event.path,
      properties: {
        procedure: event.path,
        type: event.type,
        surface: event.surface,
        ok: event.ok,
        error_code: event.errorCode ?? null,
        duration_ms: event.durationMs,
        $set: { last_seen_surface: event.surface },
        $set_once: { first_seen_surface: event.surface },
      },
    });
  } catch (error) {
    console.error("[analytics] capture failed:", error);
  }
}

/**
 * Push queued events to PostHog. Called from the tRPC route handler inside
 * `after()`, so it runs once the response has been sent but before Vercel
 * freezes the function.
 */
export async function flushAnalytics(): Promise<void> {
  const posthog = getClient();
  if (!posthog) return;
  try {
    await posthog.flush();
  } catch (error) {
    console.error("[analytics] flush failed:", error);
  }
}

/** Test seam: drop the cached client so the next call re-reads the env. */
export function resetAnalyticsClientForTests(): void {
  client = undefined;
}
