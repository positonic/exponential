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

/**
 * Refusal to post into an encrypted room. Its own type because it is not a homeserver
 * failure at all — nothing was sent, and no retry or reconfiguration will help until
 * ADR-0043's E2EE retrofit.
 */
export class MatrixEncryptedRoomError extends Error {
  constructor(readonly roomId: string) {
    super(
      "That room is encrypted, and the bot has no encryption keys, so it cannot post there.",
    );
    this.name = "MatrixEncryptedRoomError";
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
        // Never follow a redirect: `fetch` would re-send the bot's access token to
        // wherever the redirect points, so a hostile or misconfigured homeserver could
        // bounce us to a host it controls and collect the credential. The token stays
        // pinned to the registered origin.
        redirect: "manual",
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

    // With redirect: "manual" a 3xx arrives here as an ordinary not-ok response
    // (undici) or as an opaque redirect (status 0). Either way it is not an answer.
    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      throw new MatrixApiError(
        "The homeserver redirected the request. Point the URL directly at the Client-Server API base.",
        response.status,
      );
    }

    if (!response.ok) {
      const parsed = await this.readErrorBody(response);
      throw new MatrixApiError(
        // The homeserver's own `error` string is attacker-controlled for a URL the
        // user chose, so it is kept on the error object for logging but deliberately
        // not used as the message the router echoes back. `errcode` is a controlled
        // vocabulary and is safe to name.
        parsed.errcode
          ? `Matrix request failed (${response.status} ${parsed.errcode})`
          : `Matrix request failed (${response.status})`,
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

  /**
   * Room ids the bot has joined. The bot can only post where it is joined, so this is
   * the whole universe of reachable rooms — there is no directory search here by design.
   */
  async joinedRooms(): Promise<string[]> {
    const body = await this.request<{ joined_rooms?: string[] }>(
      "GET",
      "/joined_rooms",
    );
    return body.joined_rooms ?? [];
  }

  /**
   * Read one piece of room state, treating "not set" as `null` rather than an error.
   *
   * A room with no name and a room with no encryption both answer 404 `M_NOT_FOUND`,
   * which is a normal, expected answer — most rooms have no `m.room.encryption` event
   * at all, and that is exactly the case we want to treat as postable.
   */
  private async roomState<T>(roomId: string, eventType: string): Promise<T | null> {
    try {
      return await this.request<T>(
        "GET",
        `/rooms/${encodeURIComponent(roomId)}/state/${encodeURIComponent(eventType)}`,
      );
    } catch (error) {
      if (error instanceof MatrixApiError && error.status === 404) return null;
      // 403 means the bot cannot read this room's state — treat as unknown rather than
      // failing the whole listing over one room.
      if (error instanceof MatrixApiError && error.isForbidden) return null;
      throw error;
    }
  }

  /**
   * Name and encryption status for each room, resolved concurrently but bounded.
   *
   * Encryption is the load-bearing field: the bot has no crypto stack (ADR-0043), and a
   * homeserver will happily accept a plaintext event into an encrypted room, where it is
   * unreadable by convention and looks broken. So we must know before offering the room.
   */
  async roomSummaries(roomIds: readonly string[]): Promise<MatrixRoomSummary[]> {
    return mapWithConcurrency(roomIds, 8, async (roomId) => {
      const [nameEvent, encryptionEvent] = await Promise.all([
        this.roomState<{ name?: string }>(roomId, "m.room.name"),
        this.roomState<{ algorithm?: string }>(roomId, "m.room.encryption"),
      ]);
      return {
        roomId,
        name: nameEvent?.name ?? null,
        isEncrypted: encryptionEvent !== null,
      };
    });
  }

  /**
   * Rooms the bot has been invited to but has not joined.
   *
   * Without this, "I invited the bot and nothing happened" is a dead end: an invited bot
   * appears in no listing and can post nowhere, with no way to tell from the app that an
   * invite is even waiting. One stateless `/sync?timeout=0` — the bot has no sync loop,
   * so this is a point-in-time read, not a subscription.
   *
   * Name and encryption come from the invite's stripped state, which is all a
   * non-member can see; both may legitimately be absent.
   */
  async pendingInvites(): Promise<MatrixRoomSummary[]> {
    const body = await this.request<SyncResponse>(
      "GET",
      `/sync?timeout=0&filter=${encodeURIComponent(INVITE_ONLY_SYNC_FILTER)}`,
    );

    return Object.entries(body.rooms?.invite ?? {}).map(([roomId, room]) => {
      const events = room.invite_state?.events ?? [];
      const nameEvent = events.find((event) => event.type === "m.room.name");
      return {
        roomId,
        name: nameEvent?.content?.name ?? null,
        isEncrypted: events.some((event) => event.type === "m.room.encryption"),
      };
    });
  }

  /**
   * Send a formatted message into a room.
   *
   * Refuses encrypted rooms *before* the network call, even though the picker already
   * filters them. Belt and braces on purpose: the homeserver would accept the plaintext
   * event and every client would render it as undecryptable, so a post that "succeeded"
   * would be invisible. A room can also become encrypted between listing and sending.
   *
   * `txnId` must be derived from the post's identity, not from a clock or a random
   * value: Matrix deduplicates on it, so a retried request with the same txnId is the
   * same message rather than a second copy. There is no un-send to clean up after.
   */
  async send(
    roomId: string,
    { html, text, txnId }: { html: string; text: string; txnId: string },
  ): Promise<{ eventId: string }> {
    const encryption = await this.roomState<{ algorithm?: string }>(
      roomId,
      "m.room.encryption",
    );
    if (encryption !== null) {
      throw new MatrixEncryptedRoomError(roomId);
    }

    const body = await this.request<{ event_id?: string }>(
      "PUT",
      `/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${encodeURIComponent(txnId)}`,
      {
        msgtype: "m.text",
        body: text,
        format: "org.matrix.custom.html",
        formatted_body: html,
      },
    );

    return { eventId: body.event_id ?? "" };
  }

  /** Accept an invite (or join a public room) by id or alias. */
  async join(roomIdOrAlias: string): Promise<{ roomId: string }> {
    const body = await this.request<{ room_id?: string }>(
      "POST",
      `/join/${encodeURIComponent(roomIdOrAlias)}`,
      {},
    );
    return { roomId: body.room_id ?? roomIdOrAlias };
  }
}

export interface MatrixRoomSummary {
  roomId: string;
  /** The room's display name, or null when it has no `m.room.name` event. */
  name: string | null;
  isEncrypted: boolean;
}

/** Stripped state the homeserver includes with an invite, before the bot has joined. */
interface StrippedStateEvent {
  type?: string;
  content?: { name?: string; algorithm?: string };
}

interface SyncResponse {
  rooms?: {
    invite?: Record<string, { invite_state?: { events?: StrippedStateEvent[] } }>;
  };
}

/**
 * Ask for as little as the homeserver will give us: we only want the invite list, and a
 * first sync on a busy account otherwise returns every room's timeline.
 */
const INVITE_ONLY_SYNC_FILTER = JSON.stringify({
  room: {
    timeline: { limit: 0 },
    state: { lazy_load_members: true },
  },
});

/**
 * `Promise.all` over a mapper, but with at most `limit` requests in flight — a workspace
 * with a few hundred rooms would otherwise open two requests per room at once.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}
