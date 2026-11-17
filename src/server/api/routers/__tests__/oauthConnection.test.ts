/**
 * `oauthConnection.approve` (hosted MCP Agent PRD, D11, V2 form): a person
 * binds an MCP client's connection to one of their own External agents and
 * gets back the redirect carrying a one-time code.
 *
 * Uses `mockDeep<PrismaClient>()`: no real DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});

const envOverrides = vi.hoisted(() => ({ MCP_OAUTH_MODE: "admin" as "off" | "admin" | "on" | undefined }));
vi.mock("~/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/env")>();
  return {
    env: new Proxy(actual.env, {
      get: (target, key) => (key in envOverrides ? envOverrides[key as keyof typeof envOverrides] : Reflect.get(target, key)),
    }),
  };
});

// The app router pulls in NextAuth and the shared Prisma client; neither is
// exercised here (the caller passes its own session and db).
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
vi.mock("~/server/auth", () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));

import { createMockCaller } from "~/test/trpc-helpers";
import { hashOAuthSecret } from "~/server/mcp/oauth/tokens";

const PERSON = "user-person";
const AGENT = "agent-1";
const CLIENT = {
  id: "client-1",
  kind: "registered",
  name: "Claude",
  redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
  metadataUrl: null,
};
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const REQUEST = {
  response_type: "code",
  client_id: CLIENT.id,
  redirect_uri: CLIENT.redirectUris[0],
  state: "st-123",
  code_challenge: CHALLENGE,
  code_challenge_method: "S256",
  resource: "https://app.example.test/api/mcp",
};

let db: DeepMockProxy<PrismaClient>;

function caller(opts: { isAdmin?: boolean; tokenType?: string } = {}) {
  return createMockCaller({ userId: PERSON, db: db as unknown as PrismaClient, isAdmin: opts.isAdmin ?? true, tokenType: opts.tokenType });
}

async function expectRefused(promise: Promise<unknown>, code: TRPCError["code"]) {
  await expect(promise).rejects.toBeInstanceOf(TRPCError);
  await expect(promise).rejects.toMatchObject({ code });
}

beforeEach(() => {
  db = mockDeep<PrismaClient>();
  mockReset(db);
  envOverrides.MCP_OAUTH_MODE = "admin";
  // resolvePrincipal: the caller is a person, not an agent's shadow user.
  db.user.findUnique.mockResolvedValue({ isAgent: false } as never);
  db.oAuthClient.findUnique.mockResolvedValue(CLIENT as never);
  db.externalAgent.findFirst.mockResolvedValue({ id: AGENT } as never);
  db.oAuthConnection.findUnique.mockResolvedValue(null);
  db.oAuthConnection.create.mockResolvedValue({ id: "conn-1" } as never);
  db.$transaction.mockImplementation((fn: unknown) => (fn as (tx: typeof db) => Promise<unknown>)(db));
});

describe("oauthConnection.approve", () => {
  it("creates the connection and a code, and returns the redirect with code, state and iss", async () => {
    const { redirectTo } = await caller().oauthConnection.approve({ request: REQUEST, agentId: AGENT });

    const url = new URL(redirectTo);
    expect(url.origin + url.pathname).toBe(CLIENT.redirectUris[0]);
    expect(url.searchParams.get("state")).toBe("st-123");
    expect(url.searchParams.get("iss")).toBe("https://app.example.test");
    const code = url.searchParams.get("code") ?? "";
    expect(code).toMatch(/^exp_oac_[A-Za-z0-9_-]{43}$/);

    expect(db.oAuthConnection.create).toHaveBeenCalledWith({
      data: {
        ownerId: PERSON,
        clientId: CLIENT.id,
        clientKey: "claude|claude.ai",
        clientName: "Claude",
        agentId: AGENT,
        resource: "https://app.example.test/api/mcp",
      },
      select: { id: true },
    });
    const stored = db.oAuthAuthorizationCode.create.mock.calls[0]?.[0].data;
    expect(stored).toMatchObject({
      connectionId: "conn-1",
      codeHash: hashOAuthSecret(code),
      codeChallenge: CHALLENGE,
      redirectUri: CLIENT.redirectUris[0],
    });
    // Only the hash is stored, never the code itself.
    expect(JSON.stringify(stored)).not.toContain(code);
  });

  it("offers only the person's own agents, never an Assistant's principal", async () => {
    await caller().oauthConnection.approve({ request: REQUEST, agentId: AGENT });

    expect(db.externalAgent.findFirst).toHaveBeenCalledWith({
      where: { id: AGENT, ownerId: PERSON, assistant: { is: null } },
      select: { id: true },
    });
  });

  it("refuses an agent the person does not own", async () => {
    db.externalAgent.findFirst.mockResolvedValue(null);

    await expectRefused(caller().oauthConnection.approve({ request: REQUEST, agentId: "someone-elses" }), "NOT_FOUND");
    expect(db.oAuthAuthorizationCode.create).not.toHaveBeenCalled();
  });

  it("reuses the connection on reconnect and clears disconnectedAt", async () => {
    db.oAuthConnection.findUnique.mockResolvedValue({ id: "conn-1", agentId: AGENT } as never);

    await caller().oauthConnection.approve({ request: REQUEST, agentId: AGENT });

    expect(db.oAuthConnection.create).not.toHaveBeenCalled();
    expect(db.oAuthConnection.update).toHaveBeenCalledWith({
      where: { id: "conn-1" },
      data: expect.objectContaining({ agentId: AGENT, disconnectedAt: null }) as unknown,
    });
    expect(db.oAuthToken.deleteMany).not.toHaveBeenCalled();
  });

  it("drops the old tokens when a reconnect binds a different agent", async () => {
    db.oAuthConnection.findUnique.mockResolvedValue({ id: "conn-1", agentId: "agent-old" } as never);

    await caller().oauthConnection.approve({ request: REQUEST, agentId: AGENT });

    expect(db.oAuthToken.deleteMany).toHaveBeenCalledWith({ where: { connectionId: "conn-1" } });
    expect(db.oAuthAuthorizationCode.deleteMany).toHaveBeenCalledWith({ where: { connectionId: "conn-1" } });
  });

  it("refuses an agent principal: only a person can grant access", async () => {
    db.user.findUnique.mockResolvedValue({ isAgent: true } as never);
    db.externalAgent.findUnique.mockResolvedValue({ id: "agent-x", ownerId: "owner" } as never);

    await expectRefused(
      caller({ tokenType: "agent-key" }).oauthConnection.approve({ request: REQUEST, agentId: AGENT }),
      "FORBIDDEN",
    );
    expect(db.oAuthConnection.create).not.toHaveBeenCalled();
  });

  it("refuses a non-admin while MCP_OAUTH_MODE is admin", async () => {
    await expectRefused(
      caller({ isAdmin: false }).oauthConnection.approve({ request: REQUEST, agentId: AGENT }),
      "FORBIDDEN",
    );
    expect(db.oAuthConnection.create).not.toHaveBeenCalled();
  });

  it("lets anyone approve with MCP_OAUTH_MODE=on", async () => {
    envOverrides.MCP_OAUTH_MODE = "on";

    await expect(
      caller({ isAdmin: false }).oauthConnection.approve({ request: REQUEST, agentId: AGENT }),
    ).resolves.toHaveProperty("redirectTo");
  });

  it.each([undefined, "off"] as const)("does not exist with MCP_OAUTH_MODE=%s", async (mode) => {
    envOverrides.MCP_OAUTH_MODE = mode;

    await expectRefused(caller().oauthConnection.approve({ request: REQUEST, agentId: AGENT }), "NOT_FOUND");
  });

  it.each([
    ["PKCE without S256", { code_challenge_method: "plain" }],
    ["no PKCE", { code_challenge: undefined, code_challenge_method: undefined }],
    ["an unregistered redirect URI", { redirect_uri: "https://evil.example/cb" }],
    ["another resource", { resource: "https://other.example/api/mcp" }],
  ])("re-validates the request and refuses %s", async (_label, overrides) => {
    await expectRefused(
      caller().oauthConnection.approve({ request: { ...REQUEST, ...overrides }, agentId: AGENT }),
      "BAD_REQUEST",
    );
    expect(db.oAuthConnection.create).not.toHaveBeenCalled();
    expect(db.oAuthAuthorizationCode.create).not.toHaveBeenCalled();
  });
});

describe("oauthConnection.approve with a new agent", () => {
  const NEW_AGENT = { name: "Claude", workspaceIds: ["ws-personal", "ws-team"] };

  beforeEach(() => {
    db.workspaceUser.findMany.mockResolvedValue([
      { workspaceId: "ws-personal", role: "owner" },
      { workspaceId: "ws-team", role: "member" },
    ] as never);
    db.user.create.mockResolvedValue({ id: "shadow-new" } as never);
    db.externalAgent.create.mockResolvedValue({ id: "agent-new" } as never);
  });

  function expectNothingWritten() {
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.externalAgent.create).not.toHaveBeenCalled();
    expect(db.oAuthConnection.create).not.toHaveBeenCalled();
    expect(db.oAuthAuthorizationCode.create).not.toHaveBeenCalled();
  }

  it("creates the agent, its workspaces, the connection and the code in one transaction", async () => {
    const { redirectTo } = await caller().oauthConnection.approve({ request: REQUEST, newAgent: NEW_AGENT });

    expect(new URL(redirectTo).searchParams.get("code")).toMatch(/^exp_oac_/);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.user.create).toHaveBeenCalledWith({ data: { name: "Claude", isAgent: true } });
    expect(db.externalAgent.create).toHaveBeenCalledWith({
      data: { name: "Claude", description: null, ownerId: PERSON, shadowUserId: "shadow-new" },
    });
    expect(db.workspaceUser.createMany).toHaveBeenCalledWith({
      data: [
        { userId: "shadow-new", workspaceId: "ws-personal", role: "member" },
        { userId: "shadow-new", workspaceId: "ws-team", role: "member" },
      ],
    });
    expect(db.oAuthConnection.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ agentId: "agent-new" }) as unknown }),
    );
    // No key: the connection's OAuth tokens are the agent's only credential.
    expect(db.externalAgentKey.create).not.toHaveBeenCalled();
    expect(db.externalAgent.findFirst).not.toHaveBeenCalled();
  });

  it("refuses a workspace the person cannot delegate, and writes nothing", async () => {
    db.workspaceUser.findMany.mockResolvedValue([
      { workspaceId: "ws-personal", role: "owner" },
      { workspaceId: "ws-team", role: "viewer" },
    ] as never);
    db.workspace.findMany.mockResolvedValue([{ name: "Team" }] as never);

    await expectRefused(caller().oauthConnection.approve({ request: REQUEST, newAgent: NEW_AGENT }), "FORBIDDEN");
    expectNothingWritten();
  });

  it.each([
    ["no workspace", { request: REQUEST, newAgent: { name: "Claude", workspaceIds: [] } }],
    ["a blank name", { request: REQUEST, newAgent: { name: "   ", workspaceIds: ["ws-personal"] } }],
    ["both an agent and a new agent", { request: REQUEST, agentId: AGENT, newAgent: NEW_AGENT }],
    ["neither an agent nor a new agent", { request: REQUEST }],
  ])("refuses %s, and writes nothing", async (_label, input) => {
    await expectRefused(caller().oauthConnection.approve(input), "BAD_REQUEST");
    expectNothingWritten();
  });

  it("refuses a non-admin while MCP_OAUTH_MODE is admin, before creating anything", async () => {
    await expectRefused(
      caller({ isAdmin: false }).oauthConnection.approve({ request: REQUEST, newAgent: NEW_AGENT }),
      "FORBIDDEN",
    );
    expectNothingWritten();
  });
});
