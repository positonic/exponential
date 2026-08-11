/**
 * A thin, stateless wrapper over the Matrix Client-Server API.
 *
 * Deliberately NOT `matrix-js-sdk`: that dependency lives in `../mastra`, where it
 * exists to run a sync loop and a crypto store. Nothing here syncs — a workspace-
 * registered bot is poster-only — so the sdk would bring a store abstraction and a
 * background loop for what is a handful of HTTP calls.
 *
 * Every method is a single request with no client-side state, which is what lets the
 * same credentials be used concurrently from any request handler.
 */

const MATRIX_API = "/_matrix/client/v3";

/** A Matrix API error carrying the homeserver's own errcode, so callers can be specific. */
export class MatrixApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errcode?: string,
  ) {
    super(message);
    this.name = "MatrixApiError";
  }

  /** The token was rejected — wrong, revoked, or for a different homeserver. */
  get isUnauthorized(): boolean {
    return this.status === 401 || this.errcode === "M_UNKNOWN_TOKEN";
  }

  /** The bot is not in the room, or is not allowed to act there. */
  get isForbidden(): boolean {
    return this.status === 403 || this.errcode === "M_FORBIDDEN";
  }
}

interface MatrixErrorBody {
  errcode?: string;
  error?: string;
}

export interface MatrixClientOptions {
  homeserverUrl: string;
  accessToken: string;
  /** Injection point for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/** Strip trailing slashes so `https://h/` and `https://h` build the same URL. */
export function normalizeHomeserverUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export class MatrixClient {
  private readonly homeserverUrl: string;
  private readonly accessToken: string;
  private readonly fetchImpl: typeof fetch;

  constructor({ homeserverUrl, accessToken, fetchImpl }: MatrixClientOptions) {
    this.homeserverUrl = normalizeHomeserverUrl(homeserverUrl);
    this.accessToken = accessToken;
    this.fetchImpl = fetchImpl ?? fetch;
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.homeserverUrl}${MATRIX_API}${path}`;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      // Unreachable homeserver: DNS failure, refused connection, TLS error. Distinct
      // from a rejected request, and the user needs to be told which it was.
      throw new MatrixApiError(
        `Could not reach the homeserver at ${this.homeserverUrl}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        0,
      );
    }

    if (!response.ok) {
      const parsed = await this.readErrorBody(response);
      throw new MatrixApiError(
        parsed.error ?? `Matrix request failed (${response.status})`,
        response.status,
        parsed.errcode,
      );
    }

    return (await response.json()) as T;
  }

  /** A homeserver error body is JSON by spec, but an intermediary may return HTML. */
  private async readErrorBody(response: Response): Promise<MatrixErrorBody> {
    try {
      return ((await response.json()) ?? {}) as MatrixErrorBody;
    } catch {
      return {};
    }
  }

  /**
   * Identify the account the access token belongs to. The registration check: a token
   * that survives this is one the homeserver will accept for everything else.
   */
  async whoami(): Promise<{ userId: string }> {
    const body = await this.request<{ user_id: string }>("GET", "/account/whoami");
    return { userId: body.user_id };
  }
}
