/**
 * Unit tests for the `matrixServer` router.
 *
 * Two things this suite exists to hold: only owners and admins may hand Exponential a
 * bot credential, and the credential never comes back out. Mocked Prisma throughout —
 * no real DB, ever (see CLAUDE.md "Test database safety").
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "sk-test-dummy";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.GOOGLE_CLIENT_ID ??= "test";
  process.env.GOOGLE_CLIENT_SECRET ??= "test";
  process.env.MASTRA_API_URL ??= "http://localhost:4111";
  process.env.AUTH_DISCORD_ID ??= "test";
  process.env.AUTH_DISCORD_SECRET ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  // A real 32-byte key, not the "0".repeat(64) the other router suites copy: that
  // value is neither 32 raw bytes nor base64 for 32, so `encryptCredential` throws
  // on it. Harmless in suites that never encrypt; this one does.
  process.env.DATABASE_ENCRYPTION_KEY = "0".repeat(32);
});

vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(_opts?: unknown) {
      // intentionally empty
    }
  },
}));

vi.mock("next-auth", () => ({
  default: () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("next-auth/providers/discord", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/notion", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/postmark", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/microsoft-entra-id", () => ({ default: vi.fn() }));

vi.mock("~/server/auth", () => ({
  auth: () => null,
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = { current: null };
function getDbMock(): DeepMockProxy<PrismaClient> {
  if (!dbHolder.current) dbHolder.current = mockDeep<PrismaClient>();
  return dbHolder.current;
}
vi.mock("~/server/db", () => {
  const proxy = new Proxy(
    {},
    {
      get(_t, prop) {
        const m = getDbMock() as unknown as Record<string | symbol, unknown>;
        return m[prop as string];
      },
    },
  );
  return { db: proxy };
});

import { createMockCaller } from "~/test/trpc-helpers";
import { MATRIX_SERVER_PROVIDER } from "~/server/services/matrix/constants";

const USER_ID = "user-1";
const WORKSPACE_ID = "ws-1";
const TOKEN = "syt_super_secret_token";
const HOMESERVER = "https://matrix.example.org";
const BOT = "@summaries:example.org";

const OK = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const ERR = (status: number, body: unknown = {}) =>
  ({ ok: false, status, json: async () => body }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;

function asRole(role: string) {
  return { role, workspaceId: WORKSPACE_ID };
}

describe("matrixServer.register", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    // Non-agent principal, so humanOnlyProcedure lets the call through.
    dbMock.user.findUnique.mockResolvedValue({ isAgent: false } as never);
    dbMock.integration.findMany.mockResolvedValue([] as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a workspace member who is not an owner or admin", async () => {
    dbMock.workspaceUser.findUnique.mockResolvedValue(asRole("member") as never);

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await expect(
      caller.matrixServer.register({
        workspaceId: WORKSPACE_ID,
        homeserverUrl: HOMESERVER,
        accessToken: TOKEN,
      }),
    ).rejects.toThrow(/requires the owner or admin role/);

    // Refused before anything reached the homeserver or the database.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dbMock.integration.create).not.toHaveBeenCalled();
  });

  it("rejects a non-member outright", async () => {
    dbMock.workspaceUser.findUnique.mockResolvedValue(null as never);
    dbMock.teamUser.findFirst.mockResolvedValue(null as never);

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await expect(
      caller.matrixServer.register({
        workspaceId: WORKSPACE_ID,
        homeserverUrl: HOMESERVER,
        accessToken: TOKEN,
      }),
    ).rejects.toThrow(/not a member of this workspace/);
    expect(dbMock.integration.create).not.toHaveBeenCalled();
  });

  it("persists nothing when the homeserver rejects the token", async () => {
    dbMock.workspaceUser.findUnique.mockResolvedValue(asRole("admin") as never);
    fetchMock.mockResolvedValue(ERR(401, { errcode: "M_UNKNOWN_TOKEN" }));

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await expect(
      caller.matrixServer.register({
        workspaceId: WORKSPACE_ID,
        homeserverUrl: HOMESERVER,
        accessToken: TOKEN,
      }),
    ).rejects.toThrow(/rejected that access token/);

    expect(dbMock.integration.create).not.toHaveBeenCalled();
    expect(dbMock.integrationCredential.create).not.toHaveBeenCalled();
  });

  it("reports an unreachable homeserver as a URL problem, not a token problem", async () => {
    dbMock.workspaceUser.findUnique.mockResolvedValue(asRole("owner") as never);
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await expect(
      caller.matrixServer.register({
        workspaceId: WORKSPACE_ID,
        homeserverUrl: HOMESERVER,
        accessToken: TOKEN,
      }),
    ).rejects.toThrow(/Could not reach/);
    expect(dbMock.integration.create).not.toHaveBeenCalled();
  });

  it("stores a verified server under a provider distinct from the shared gateway's", async () => {
    dbMock.workspaceUser.findUnique.mockResolvedValue(asRole("owner") as never);
    fetchMock.mockResolvedValue(OK({ user_id: BOT }));
    dbMock.integration.create.mockResolvedValue({
      id: "int-1",
      name: `Matrix (${BOT})`,
      status: "ACTIVE",
      createdAt: new Date("2026-08-11T00:00:00Z"),
    } as never);
    dbMock.integrationCredential.create.mockResolvedValue({ id: "cred-1" } as never);

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    const result = await caller.matrixServer.register({
      workspaceId: WORKSPACE_ID,
      homeserverUrl: `${HOMESERVER}/`,
      accessToken: TOKEN,
    });

    expect(result).toMatchObject({
      id: "int-1",
      homeserverUrl: HOMESERVER,
      botUserId: BOT,
    });

    const created = dbMock.integration.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(created.data).toMatchObject({
      provider: MATRIX_SERVER_PROVIDER,
      type: "MESSAGING",
      workspaceId: WORKSPACE_ID,
      providerConfig: { homeserverUrl: HOMESERVER, botUserId: BOT },
    });
    // Never "matrix": that provider is the shared gateway's system row (ADR-0043).
    expect(created.data.provider).not.toBe("matrix");
    // Workspace-owned, not user-owned — Integration.user cascades on delete.
    expect(created.data.userId).toBeUndefined();
  });

  it("stores the access token encrypted and never returns it", async () => {
    dbMock.workspaceUser.findUnique.mockResolvedValue(asRole("owner") as never);
    fetchMock.mockResolvedValue(OK({ user_id: BOT }));
    dbMock.integration.create.mockResolvedValue({
      id: "int-1",
      name: "Matrix",
      status: "ACTIVE",
      createdAt: new Date("2026-08-11T00:00:00Z"),
    } as never);
    dbMock.integrationCredential.create.mockResolvedValue({ id: "cred-1" } as never);

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    const result = await caller.matrixServer.register({
      workspaceId: WORKSPACE_ID,
      homeserverUrl: HOMESERVER,
      accessToken: TOKEN,
    });

    expect(JSON.stringify(result)).not.toContain(TOKEN);

    const cred = dbMock.integrationCredential.create.mock.calls[0]![0] as {
      data: { key: string; keyType: string; isEncrypted: boolean };
    };
    expect(cred.data.keyType).toBe("matrix_access_token");
    expect(cred.data.isEncrypted).toBe(true);
    expect(cred.data.key).not.toBe(TOKEN);
    expect(cred.data.key).not.toContain(TOKEN);
  });

  it("refuses to register the same bot on the same homeserver twice", async () => {
    dbMock.workspaceUser.findUnique.mockResolvedValue(asRole("owner") as never);
    fetchMock.mockResolvedValue(OK({ user_id: BOT }));
    dbMock.integration.findMany.mockResolvedValue([
      {
        id: "int-existing",
        name: "Matrix",
        status: "ACTIVE",
        createdAt: new Date("2026-08-01T00:00:00Z"),
        providerConfig: { homeserverUrl: HOMESERVER, botUserId: BOT },
      },
    ] as never);

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await expect(
      caller.matrixServer.register({
        workspaceId: WORKSPACE_ID,
        homeserverUrl: HOMESERVER,
        accessToken: TOKEN,
      }),
    ).rejects.toThrow(/already registered/);
    expect(dbMock.integration.create).not.toHaveBeenCalled();
  });
});

describe("matrixServer.list", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
  });

  it("returns each server without its access token", async () => {
    dbMock.workspaceUser.findUnique.mockResolvedValue(asRole("member") as never);
    dbMock.integration.findMany.mockResolvedValue([
      {
        id: "int-1",
        name: "Matrix",
        status: "ACTIVE",
        createdAt: new Date("2026-08-01T00:00:00Z"),
        providerConfig: { homeserverUrl: HOMESERVER, botUserId: BOT },
      },
    ] as never);

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    const servers = await caller.matrixServer.list({ workspaceId: WORKSPACE_ID });

    expect(servers).toEqual([
      {
        id: "int-1",
        name: "Matrix",
        homeserverUrl: HOMESERVER,
        botUserId: BOT,
        status: "ACTIVE",
        createdAt: new Date("2026-08-01T00:00:00Z"),
      },
    ]);
    // The select must not pull credentials in at all.
    const args = dbMock.integration.findMany.mock.calls[0]![0] as {
      select: Record<string, unknown>;
    };
    expect(args.select.credentials).toBeUndefined();
  });

  it("drops a row whose providerConfig never parsed rather than showing a dead server", async () => {
    dbMock.workspaceUser.findUnique.mockResolvedValue(asRole("admin") as never);
    dbMock.integration.findMany.mockResolvedValue([
      {
        id: "int-broken",
        name: "Matrix",
        status: "ACTIVE",
        createdAt: new Date(),
        providerConfig: null,
      },
    ] as never);

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await expect(
      caller.matrixServer.list({ workspaceId: WORKSPACE_ID }),
    ).resolves.toEqual([]);
  });

  it("refuses a caller with no membership at all", async () => {
    dbMock.workspaceUser.findUnique.mockResolvedValue(null as never);
    dbMock.teamUser.findFirst.mockResolvedValue(null as never);

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await expect(
      caller.matrixServer.list({ workspaceId: WORKSPACE_ID }),
    ).rejects.toThrow(/not a member of this workspace/);
  });
});

describe("matrixServer.acceptInvite", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  const SERVER_ROW = {
    id: "int-1",
    providerConfig: { homeserverUrl: HOMESERVER, botUserId: BOT },
  };

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    dbMock.user.findUnique.mockResolvedValue({ isAgent: false } as never);
    dbMock.workspaceUser.findUnique.mockResolvedValue(asRole("member") as never);
    dbMock.integration.findFirst.mockResolvedValue(SERVER_ROW as never);
    dbMock.integrationCredential.findMany.mockResolvedValue([
      { key: TOKEN, keyType: "matrix_access_token", isEncrypted: false },
    ] as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Route stubbed fetch by path so the procedure's call sequence stays honest. */
  function homeserver(handlers: {
    invites?: unknown;
    join?: () => Response;
    state?: Record<string, { name?: string; encrypted?: boolean }>;
  }) {
    return (url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.includes("/sync")) {
        return Promise.resolve(OK(handlers.invites ?? { rooms: { invite: {} } }));
      }
      if (path.includes("/join/")) {
        return Promise.resolve(
          handlers.join ? handlers.join() : OK({ room_id: "!invited:example.org" }),
        );
      }
      const m = /\/rooms\/([^/]+)\/state\/(.+)$/.exec(path);
      if (m) {
        const room = handlers.state?.[decodeURIComponent(m[1]!)];
        const type = decodeURIComponent(m[2]!);
        if (!room) return Promise.resolve(ERR(404, { errcode: "M_NOT_FOUND" }));
        if (type === "m.room.name") {
          return Promise.resolve(
            room.name ? OK({ name: room.name }) : ERR(404, { errcode: "M_NOT_FOUND" }),
          );
        }
        return Promise.resolve(
          room.encrypted
            ? OK({ algorithm: "m.megolm.v1.aes-sha2" })
            : ERR(404, { errcode: "M_NOT_FOUND" }),
        );
      }
      void init;
      return Promise.resolve(ERR(404, { errcode: "M_UNRECOGNIZED" }));
    };
  }

  const ONE_INVITE = {
    rooms: {
      invite: {
        "!invited:example.org": {
          invite_state: { events: [{ type: "m.room.name", content: { name: "Product" } }] },
        },
      },
    },
  };

  it("joins an invited room and returns it as a selectable destination", async () => {
    fetchMock.mockImplementation(
      homeserver({
        invites: ONE_INVITE,
        state: { "!invited:example.org": { name: "Product" } },
      }) as never,
    );

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await expect(
      caller.matrixServer.acceptInvite({
        workspaceId: WORKSPACE_ID,
        serverId: "int-1",
        roomId: "!invited:example.org",
      }),
    ).resolves.toEqual({
      roomId: "!invited:example.org",
      name: "Product",
      isEncrypted: false,
    });

    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/join/")),
    ).toBe(true);
  });

  it("refuses to join a room the bot has no invite to", async () => {
    fetchMock.mockImplementation(homeserver({ invites: ONE_INVITE }) as never);

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await expect(
      caller.matrixServer.acceptInvite({
        workspaceId: WORKSPACE_ID,
        serverId: "int-1",
        roomId: "!never-invited:example.org",
      }),
    ).rejects.toThrow(/no longer inviting this bot/);

    // Crucially: it never attempted the join.
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/join/")),
    ).toBe(false);
  });

  it("re-reads room state as a member, so a room that hid its encryption is caught", async () => {
    // The invite's stripped state showed no encryption, but the room really is encrypted.
    fetchMock.mockImplementation(
      homeserver({
        invites: ONE_INVITE,
        state: { "!invited:example.org": { name: "Product", encrypted: true } },
      }) as never,
    );

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await expect(
      caller.matrixServer.acceptInvite({
        workspaceId: WORKSPACE_ID,
        serverId: "int-1",
        roomId: "!invited:example.org",
      }),
    ).resolves.toMatchObject({ isEncrypted: true });
  });

  it("surfaces a refused join rather than reporting success", async () => {
    fetchMock.mockImplementation(
      homeserver({
        invites: ONE_INVITE,
        join: () => ERR(403, { errcode: "M_FORBIDDEN", error: "Not invited" }),
      }) as never,
    );

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await expect(
      caller.matrixServer.acceptInvite({
        workspaceId: WORKSPACE_ID,
        serverId: "int-1",
        roomId: "!invited:example.org",
      }),
    ).rejects.toThrow(/refused the request/);
  });

  it("will not reach a server registered to a different workspace", async () => {
    dbMock.integration.findFirst.mockResolvedValue(null as never);

    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await expect(
      caller.matrixServer.acceptInvite({
        workspaceId: WORKSPACE_ID,
        serverId: "int-other-workspace",
        roomId: "!invited:example.org",
      }),
    ).rejects.toThrow(/not registered in this workspace/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
