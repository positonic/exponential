/**
 * brainDispatcher — the browser-side RPC client for the voice brain endpoint
 * (`voice.dispatch`). Symmetric to the iOS `BrainClient.swift` dispatch contract
 * (Voice — Web Client, PRD §27): a plain async function (NOT a React hook) so it
 * can fire from the Realtime SDK's tool-call callback, which runs outside React.
 *
 * Audio never flows through here — only the coarse-tool call + its result. Auth
 * is the voice-session JWT carried in the request body (minted by
 * `voice.createSession`), exactly as iOS does it.
 *
 * Wire format (standard tRPC `fetchRequestHandler` + superjson, single call):
 *   POST /api/trpc/voice.dispatch
 *   body:     {"json": <input>}
 *   success:  {"result": {"data": {"json": <DispatchResult>}}}
 *   error:    {"error":  {"json": {"message": "...", "data": {"code": "..."}}}}
 */
import type { DispatchResult } from "~/server/api/routers/voice";

const DISPATCH_PATH = "/api/trpc/voice.dispatch";

export interface BrainDispatchInput {
  toolName: string;
  voiceSessionToken: string;
  args?: Record<string, unknown>;
  confirm?: boolean;
  /** Pins a confirm to the action the gate proposed (complete_action handshake). */
  pendingActionId?: string;
  mode?: "capture" | "daily-brief";
}

/**
 * The distinguishable failure modes a dispatch can surface:
 *   - `auth`       : the voice-session token was rejected (UNAUTHORIZED/FORBIDDEN).
 *   - `validation` : the brain rejected the input shape (BAD_REQUEST/PARSE_ERROR).
 *   - `trpc`       : any other server-side tRPC error (e.g. INTERNAL_SERVER_ERROR).
 *   - `transport`  : the request never produced a usable HTTP response.
 *   - `decoding`   : a 2xx/response body we couldn't parse as a tRPC envelope.
 */
export type BrainErrorKind =
  | "auth"
  | "validation"
  | "trpc"
  | "transport"
  | "decoding";

export class BrainDispatchError extends Error {
  constructor(
    public readonly kind: BrainErrorKind,
    message: string,
    /** The tRPC error code when one was present (e.g. "UNAUTHORIZED"). */
    public readonly code?: string,
    /** The HTTP status when a response was received. */
    public readonly status?: number,
  ) {
    super(message);
    this.name = "BrainDispatchError";
  }
}

export interface BrainDispatcherOptions {
  /** Base URL for cross-origin callers; defaults to same-origin (relative). */
  baseUrl?: string;
  /** Injectable fetch (tests / non-browser environments); defaults to global. */
  fetchImpl?: typeof fetch;
}

/**
 * Forward one coarse-tool call to the brain and return its `DispatchResult`.
 * Throws a {@link BrainDispatchError} (typed by {@link BrainErrorKind}) on any
 * failure so callers can branch on transport vs auth vs validation.
 */
export async function dispatch(
  input: BrainDispatchInput,
  options: BrainDispatcherOptions = {},
): Promise<DispatchResult> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const url = `${options.baseUrl ?? ""}${DISPATCH_PATH}`;

  const body = JSON.stringify({
    json: {
      token: input.voiceSessionToken,
      toolName: input.toolName,
      ...(input.args ? { args: input.args } : {}),
      ...(input.confirm !== undefined ? { confirm: input.confirm } : {}),
      ...(input.pendingActionId ? { pendingActionId: input.pendingActionId } : {}),
      ...(input.mode ? { mode: input.mode } : {}),
    },
  });

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } catch (err) {
    throw new BrainDispatchError(
      "transport",
      err instanceof Error ? err.message : "Network request failed",
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new BrainDispatchError(
      "decoding",
      `Malformed response (HTTP ${response.status})`,
      undefined,
      response.status,
    );
  }

  // tRPC returns a structured error envelope even on non-2xx; prefer it.
  const trpcError = extractTrpcError(payload);
  if (trpcError) {
    throw new BrainDispatchError(
      mapErrorKind(trpcError.code),
      trpcError.message ?? "Request failed",
      trpcError.code,
      response.status,
    );
  }

  if (!response.ok) {
    throw new BrainDispatchError(
      "transport",
      `Request failed (HTTP ${response.status})`,
      undefined,
      response.status,
    );
  }

  const result = extractTrpcSuccess(payload);
  if (!result) {
    throw new BrainDispatchError(
      "decoding",
      "Response did not contain a result payload",
      undefined,
      response.status,
    );
  }
  return result;
}

function mapErrorKind(code: string | undefined): BrainErrorKind {
  switch (code) {
    case "UNAUTHORIZED":
    case "FORBIDDEN":
      return "auth";
    case "BAD_REQUEST":
    case "PARSE_ERROR":
      return "validation";
    default:
      return "trpc";
  }
}

/** Pull `{message, code}` out of a tRPC failure envelope, if present. */
function extractTrpcError(
  payload: unknown,
): { message?: string; code?: string } | null {
  if (!isRecord(payload)) return null;
  const error = payload.error;
  if (!isRecord(error)) return null;
  const json = error.json;
  if (!isRecord(json)) return null;
  const message = typeof json.message === "string" ? json.message : undefined;
  const data = isRecord(json.data) ? json.data : undefined;
  const code = data && typeof data.code === "string" ? data.code : undefined;
  return { message, code };
}

/** Pull the `DispatchResult` out of a tRPC success envelope, if present. */
function extractTrpcSuccess(payload: unknown): DispatchResult | null {
  if (!isRecord(payload)) return null;
  const result = payload.result;
  if (!isRecord(result)) return null;
  const data = isRecord(result.data) ? result.data : undefined;
  if (!data) return null;
  const json = data.json;
  if (!isRecord(json)) return null;
  if (typeof json.speakable !== "string") return null;
  return json as unknown as DispatchResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
