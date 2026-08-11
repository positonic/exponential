/**
 * Unit tests for the stateless Matrix Client-Server API wrapper.
 *
 * `fetch` is stubbed in the style of `MatrixNotificationService.test.ts`, including its
 * OK/ERR response helpers — no network, ever.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  MatrixApiError,
  MatrixClient,
  normalizeHomeserverUrl,
} from "~/server/services/matrix/MatrixClient";

const OK = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const ERR = (status: number, body: unknown = {}) =>
  ({ ok: false, status, json: async () => body }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;

function makeClient(overrides: { homeserverUrl?: string } = {}) {
  return new MatrixClient({
    homeserverUrl: overrides.homeserverUrl ?? "https://matrix.example.org",
    accessToken: "syt_secret",
    fetchImpl: fetchMock as unknown as typeof fetch,
  });
}

beforeEach(() => {
  fetchMock = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeHomeserverUrl", () => {
  it("strips trailing slashes and surrounding whitespace", () => {
    expect(normalizeHomeserverUrl("  https://matrix.example.org///  ")).toBe(
      "https://matrix.example.org",
    );
  });
});

describe("MatrixClient.whoami", () => {
  it("returns the token's owner and sends it as a bearer token", async () => {
    fetchMock.mockResolvedValue(OK({ user_id: "@summaries:example.org" }));

    await expect(makeClient().whoami()).resolves.toEqual({
      userId: "@summaries:example.org",
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://matrix.example.org/_matrix/client/v3/account/whoami",
    );
    expect((init as RequestInit).method).toBe("GET");
    expect(
      (init as Record<string, Record<string, string>>).headers.Authorization,
    ).toBe("Bearer syt_secret");
  });

  it("builds the same URL whether or not the homeserver URL has a trailing slash", async () => {
    fetchMock.mockResolvedValue(OK({ user_id: "@bot:example.org" }));
    await makeClient({ homeserverUrl: "https://matrix.example.org/" }).whoami();

    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://matrix.example.org/_matrix/client/v3/account/whoami",
    );
  });

  it("reports a rejected token as unauthorized, carrying the homeserver's errcode", async () => {
    fetchMock.mockResolvedValue(
      ERR(401, { errcode: "M_UNKNOWN_TOKEN", error: "Invalid access token" }),
    );

    const error = await makeClient()
      .whoami()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MatrixApiError);
    expect((error as MatrixApiError).isUnauthorized).toBe(true);
    expect((error as MatrixApiError).errcode).toBe("M_UNKNOWN_TOKEN");
    expect((error as MatrixApiError).message).toBe("Invalid access token");
  });

  it("distinguishes an unreachable homeserver (status 0) from a rejected request", async () => {
    fetchMock.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));

    const error = await makeClient()
      .whoami()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MatrixApiError);
    expect((error as MatrixApiError).status).toBe(0);
    expect((error as MatrixApiError).isUnauthorized).toBe(false);
    expect((error as MatrixApiError).message).toContain("Could not reach");
  });

  it("survives an error body that is not JSON (a proxy's HTML error page)", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    } as unknown as Response);

    const error = await makeClient()
      .whoami()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MatrixApiError);
    expect((error as MatrixApiError).status).toBe(502);
  });
});

describe("MatrixClient.joinedRooms", () => {
  it("returns the joined room ids", async () => {
    fetchMock.mockResolvedValue(OK({ joined_rooms: ["!a:example.org", "!b:example.org"] }));

    await expect(makeClient().joinedRooms()).resolves.toEqual([
      "!a:example.org",
      "!b:example.org",
    ]);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://matrix.example.org/_matrix/client/v3/joined_rooms",
    );
  });

  it("treats a missing joined_rooms key as no rooms rather than throwing", async () => {
    fetchMock.mockResolvedValue(OK({}));
    await expect(makeClient().joinedRooms()).resolves.toEqual([]);
  });
});

describe("MatrixClient.roomSummaries", () => {
  /** Answer name/encryption state per room, 404ing for state a room does not have. */
  function stateResponder(
    rooms: Record<string, { name?: string; encrypted?: boolean }>,
  ) {
    return (url: string) => {
      const match = /\/rooms\/([^/]+)\/state\/(.+)$/.exec(String(url));
      if (!match) return ERR(404, { errcode: "M_NOT_FOUND" });
      const roomId = decodeURIComponent(match[1]!);
      const eventType = decodeURIComponent(match[2]!);
      const room = rooms[roomId];
      if (!room) return ERR(404, { errcode: "M_NOT_FOUND" });
      if (eventType === "m.room.name") {
        return room.name ? OK({ name: room.name }) : ERR(404, { errcode: "M_NOT_FOUND" });
      }
      if (eventType === "m.room.encryption") {
        return room.encrypted
          ? OK({ algorithm: "m.megolm.v1.aes-sha2" })
          : ERR(404, { errcode: "M_NOT_FOUND" });
      }
      return ERR(404, { errcode: "M_NOT_FOUND" });
    };
  }

  it("reports name and encryption status per room", async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        stateResponder({
          "!plain:example.org": { name: "Engineering" },
          "!secret:example.org": { name: "Board", encrypted: true },
        })(url),
      ),
    );

    await expect(
      makeClient().roomSummaries(["!plain:example.org", "!secret:example.org"]),
    ).resolves.toEqual([
      { roomId: "!plain:example.org", name: "Engineering", isEncrypted: false },
      { roomId: "!secret:example.org", name: "Board", isEncrypted: true },
    ]);
  });

  it("treats an absent m.room.name as an unnamed room, not an error", async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(stateResponder({ "!anon:example.org": {} })(url)),
    );

    await expect(makeClient().roomSummaries(["!anon:example.org"])).resolves.toEqual([
      { roomId: "!anon:example.org", name: null, isEncrypted: false },
    ]);
  });

  it("does not let one unreadable room's state fail the whole listing", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes("forbidden")) {
        return Promise.resolve(ERR(403, { errcode: "M_FORBIDDEN" }));
      }
      return Promise.resolve(
        stateResponder({ "!ok:example.org": { name: "Fine" } })(String(url)),
      );
    });

    await expect(
      makeClient().roomSummaries(["!forbidden:example.org", "!ok:example.org"]),
    ).resolves.toEqual([
      { roomId: "!forbidden:example.org", name: null, isEncrypted: false },
      { roomId: "!ok:example.org", name: "Fine", isEncrypted: false },
    ]);
  });

  it("preserves input order even though lookups run concurrently", async () => {
    const rooms = Array.from({ length: 20 }, (_, i) => `!r${i}:example.org`);
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        stateResponder(
          Object.fromEntries(rooms.map((r, i) => [r, { name: `Room ${i}` }])),
        )(String(url)),
      ),
    );

    const summaries = await makeClient().roomSummaries(rooms);
    expect(summaries.map((s) => s.roomId)).toEqual(rooms);
  });
});

describe("MatrixClient.pendingInvites", () => {
  it("parses invited rooms out of a /sync payload, with stripped-state name and encryption", async () => {
    fetchMock.mockResolvedValue(
      OK({
        rooms: {
          invite: {
            "!invited:example.org": {
              invite_state: {
                events: [
                  { type: "m.room.name", content: { name: "Product" } },
                  { type: "m.room.member", content: {} },
                ],
              },
            },
            "!secret-invite:example.org": {
              invite_state: {
                events: [
                  { type: "m.room.encryption", content: { algorithm: "m.megolm.v1.aes-sha2" } },
                ],
              },
            },
          },
        },
      }),
    );

    await expect(makeClient().pendingInvites()).resolves.toEqual([
      { roomId: "!invited:example.org", name: "Product", isEncrypted: false },
      { roomId: "!secret-invite:example.org", name: null, isEncrypted: true },
    ]);
  });

  it("asks for a zero-length timeline so a first sync does not pull every room's history", async () => {
    fetchMock.mockResolvedValue(OK({ rooms: { invite: {} } }));
    await makeClient().pendingInvites();

    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("/sync?timeout=0");
    const filter = decodeURIComponent(url.split("filter=")[1]!);
    expect(JSON.parse(filter)).toMatchObject({ room: { timeline: { limit: 0 } } });
  });

  it("returns nothing when the payload has no invite section at all", async () => {
    fetchMock.mockResolvedValue(OK({}));
    await expect(makeClient().pendingInvites()).resolves.toEqual([]);
  });
});

describe("MatrixClient.join", () => {
  it("POSTs to /join and returns the resolved room id", async () => {
    fetchMock.mockResolvedValue(OK({ room_id: "!resolved:example.org" }));

    await expect(makeClient().join("#alias:example.org")).resolves.toEqual({
      roomId: "!resolved:example.org",
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://matrix.example.org/_matrix/client/v3/join/%23alias%3Aexample.org",
    );
    expect((init as RequestInit).method).toBe("POST");
  });

  it("falls back to the requested id when the homeserver omits room_id", async () => {
    fetchMock.mockResolvedValue(OK({}));
    await expect(makeClient().join("!r:example.org")).resolves.toEqual({
      roomId: "!r:example.org",
    });
  });
});
