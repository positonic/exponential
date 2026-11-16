import { TRPCError } from "@trpc/server";

/**
 * Third-party integration failures that are *expected user states*, not bugs.
 *
 * A revoked GitHub token, a Notion integration whose secret was rotated, a
 * Google Calendar that was never connected, a provider that is briefly
 * unreachable — none of these is something the app did wrong, and none is
 * fixed by a retry from our side. Left alone they surface as plain `Error`s,
 * which tRPC turns into INTERNAL_SERVER_ERROR, which `handleTRPCRequest`
 * reports to Sentry, which files a Bug ticket nobody can act on.
 *
 * This module classifies those failures at the integration boundary and maps
 * them to a typed tRPC error the client can render as a "reconnect" or "try
 * again later" state:
 *
 * - `auth`        → PRECONDITION_FAILED (the user must reconnect / re-share)
 * - `rate-limited`→ TOO_MANY_REQUESTS
 * - `unavailable` → BAD_GATEWAY (network failure, timeout, provider 5xx)
 *
 * PRECONDITION_FAILED rather than UNAUTHORIZED on purpose: UNAUTHORIZED means
 * *our* session is missing, and clients treat it that way.
 */

export type IntegrationFailureKind = "auth" | "rate-limited" | "unavailable";

export interface IntegrationFailure {
  kind: IntegrationFailureKind;
  provider: string;
  message: string;
}

/**
 * Thrown by our own integration code when stored credentials are missing,
 * expired beyond refresh, or rejected. The message is shown to the user, so
 * it should say what to do ("Please reconnect your Google Calendar.").
 */
export class IntegrationAuthError extends Error {
  readonly provider: string;

  constructor(provider: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "IntegrationAuthError";
    this.provider = provider;
  }
}

/**
 * Thrown by our own integration code when the provider answered but could
 * not serve the request right now (a 5xx or 429 from a token endpoint). The
 * stored grant may be perfectly fine, so the user is told to try again rather
 * than to reconnect.
 */
export class IntegrationUnavailableError extends Error {
  readonly provider: string;

  constructor(provider: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "IntegrationUnavailableError";
    this.provider = provider;
  }
}

/**
 * Decide what an OAuth token-refresh failure means from the token endpoint's
 * HTTP status. 400/401 (`invalid_grant`, `invalid_client`) mean the grant is
 * gone and the user must reconnect; 429/5xx mean the provider is struggling
 * and a later attempt will likely work. Returns null when there is no status
 * (a network failure, or something that is not the provider at all, such as
 * our own database write) so the caller rethrows the original error and the
 * classifier — or Sentry — sees it as it is.
 */
export function oauthRefreshFailure(
  provider: string,
  status: number | undefined,
  cause: unknown,
): IntegrationAuthError | IntegrationUnavailableError | null {
  if (status === 400 || status === 401) {
    return new IntegrationAuthError(
      provider,
      `Failed to refresh access token. Please reconnect your ${provider}.`,
      { cause },
    );
  }
  if (status !== undefined && (status === 429 || status >= 500)) {
    return new IntegrationUnavailableError(
      provider,
      `${provider} could not refresh the access token right now. Try again shortly.`,
      { cause },
    );
  }
  return null;
}

const NETWORK_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
]);

const NOTION_UNAVAILABLE_CODES = new Set([
  "internal_server_error",
  "service_unavailable",
  "gateway_timeout",
  "database_connection_unavailable",
]);

type ErrorLike = {
  name?: unknown;
  message?: unknown;
  status?: unknown;
  code?: unknown;
  cause?: unknown;
};

function asErrorLike(value: unknown): ErrorLike | null {
  return typeof value === "object" && value !== null ? (value as ErrorLike) : null;
}

/** Classify one error object, without looking at its cause. */
function classifyOne(error: ErrorLike, providerHint: string | undefined): IntegrationFailure | null {
  const name = typeof error.name === "string" ? error.name : "";
  const status = typeof error.status === "number" ? error.status : undefined;
  const code = typeof error.code === "string" ? error.code : undefined;
  const message = typeof error.message === "string" ? error.message : "";

  if (error instanceof IntegrationAuthError) {
    return { kind: "auth", provider: error.provider, message: error.message };
  }
  if (error instanceof IntegrationUnavailableError) {
    return { kind: "unavailable", provider: error.provider, message: error.message };
  }

  // Octokit's RequestError (`@octokit/request-error`).
  if (name === "HttpError" && status !== undefined) {
    const provider = providerHint ?? "GitHub";
    if (status === 401) {
      return {
        kind: "auth",
        provider,
        message: `${provider} rejected the stored credentials. Please reconnect ${provider}.`,
      };
    }
    if (status === 429 || (status === 403 && /rate limit/i.test(message))) {
      return { kind: "rate-limited", provider, message: `${provider} is rate limiting requests. Try again shortly.` };
    }
    if (status >= 500) {
      return { kind: "unavailable", provider, message: `${provider} is unavailable right now. Try again shortly.` };
    }
    return null;
  }

  // `@notionhq/client` errors.
  if (name === "APIResponseError" || name === "RequestTimeoutError") {
    const provider = providerHint ?? "Notion";
    if (name === "RequestTimeoutError") {
      return { kind: "unavailable", provider, message: `${provider} did not respond in time. Try again shortly.` };
    }
    if (code === "unauthorized" || status === 401) {
      return {
        kind: "auth",
        provider,
        message: `${provider} rejected the stored token. Please reconnect ${provider}.`,
      };
    }
    if (code === "restricted_resource" || code === "object_not_found") {
      return {
        kind: "auth",
        provider,
        message: `${provider} can't access that page or database. Make sure it is shared with the integration.`,
      };
    }
    if (code === "rate_limited") {
      return { kind: "rate-limited", provider, message: `${provider} is rate limiting requests. Try again shortly.` };
    }
    if ((code && NOTION_UNAVAILABLE_CODES.has(code)) || (status !== undefined && status >= 500)) {
      return { kind: "unavailable", provider, message: `${provider} is unavailable right now. Try again shortly.` };
    }
    return null;
  }

  // Our `withTimeout` TimeoutError, and the DOMException that
  // `AbortSignal.timeout()` rejects fetch with.
  if (name === "TimeoutError") {
    const provider = providerHint ?? "The provider";
    return { kind: "unavailable", provider, message: `${provider} did not respond in time. Try again shortly.` };
  }

  // undici: `TypeError: fetch failed` (the socket error sits on `cause`), or
  // the socket error itself.
  if ((name === "TypeError" && message === "fetch failed") || (code && NETWORK_ERROR_CODES.has(code))) {
    const provider = providerHint ?? "The provider";
    return { kind: "unavailable", provider, message: `${provider} could not be reached. Try again shortly.` };
  }

  return null;
}

/**
 * Classify an integration failure, walking the `cause` chain (our services
 * wrap provider errors as `new Error("Failed to …", { cause })`). Returns
 * null for anything that is not a recognised expected state — those should
 * keep surfacing as real errors.
 *
 * `providerHint` names the provider in user-facing messages when the error
 * itself does not identify one (timeouts, network failures).
 */
export function classifyIntegrationError(
  error: unknown,
  providerHint?: string,
): IntegrationFailure | null {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current; depth++) {
    const errorLike = asErrorLike(current);
    if (!errorLike) return null;
    // An already-typed tRPC error is somebody's deliberate answer; respect it.
    if (current instanceof TRPCError && depth === 0 && current.code !== "INTERNAL_SERVER_ERROR") {
      return null;
    }
    const classified = classifyOne(errorLike, providerHint);
    if (classified) return classified;
    current = errorLike.cause;
  }
  return null;
}

const TRPC_CODE_FOR: Record<IntegrationFailureKind, TRPCError["code"]> = {
  auth: "PRECONDITION_FAILED",
  "rate-limited": "TOO_MANY_REQUESTS",
  unavailable: "BAD_GATEWAY",
};

export function integrationFailureToTRPCError(failure: IntegrationFailure, cause?: unknown): TRPCError {
  return new TRPCError({ code: TRPC_CODE_FOR[failure.kind], message: failure.message, cause });
}

/**
 * Map an error to a typed tRPC error when it is an expected integration
 * state, or return null so the caller can rethrow it as-is.
 *
 * `kinds` limits which failures are mapped — the app-wide middleware maps
 * only `auth`, because a network failure there could be one of our own
 * services; integration boundaries that know they are calling a third party
 * map all three.
 */
export function toIntegrationTRPCError(
  error: unknown,
  options: { provider?: string; kinds?: readonly IntegrationFailureKind[] } = {},
): TRPCError | null {
  const failure = classifyIntegrationError(error, options.provider);
  if (!failure) return null;
  if (options.kinds && !options.kinds.includes(failure.kind)) return null;
  return integrationFailureToTRPCError(failure, error);
}

/** True when the error is an expected integration state (any kind). */
export function isExpectedIntegrationFailure(error: unknown): boolean {
  return classifyIntegrationError(error) !== null;
}
