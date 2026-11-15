/**
 * `mastra.getModelKey`: the one place a workspace's own Anthropic key leaves
 * the app. It goes to the Mastra server only, and only for a workspace the
 * turn's user belongs to. Everyone else gets FORBIDDEN or a null that says
 * nothing about whether a key exists.
 *
 * `mastra.reportModelKeyFailure`: Mastra's report that Anthropic refused the
 * key. The key is marked as failing and the workspace's owners and admins are
 * told, once.
 *
 * Mocked Prisma (`vitest-mock-extended`), same harness as
 * `mastraCallAgent.test.ts`. The key store itself is covered by
 * `modelKey.test.ts`.
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
  process.env.DATABASE_ENCRYPTION_KEY ??= "0".repeat(64);
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

const getWorkingModelKey = vi.hoisted(() => vi.fn());
const markModelKeyFailing = vi.hoisted(() => vi.fn());
vi.mock("~/server/services/billing/modelKey", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getWorkingModelKey,
  markModelKeyFailing,
}));
// The notification pipeline has its own tests (billingNotification.test.ts).
const emitNotification = vi.hoisted(() => vi.fn());
vi.mock("~/server/services/notifications/emit/emitNotification", () => ({ emitNotification }));

import { createMockCaller } from "~/test/trpc-helpers";
import { MASTRA_SERVER_KEY_HEADER } from "~/server/utils/mastraServerAuth";

const USER_ID = "user-1";
const WORKSPACE = "ws-1";
const SERVER_KEY = "mastra-server-secret";
const WORKSPACE_KEY = "sk-ant-api03-workspace-key-not-real";

describe("mastra.getModelKey", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  const original = { mode: process.env.BILLING_MODE, serverKey: process.env.MASTRA_SERVER_API_KEY };

  /** A callback from Mastra for a turn by USER_ID, presenting `serverKey` (or no server key at all). */
  const ask = (serverKey?: string) =>
    createMockCaller({
      userId: USER_ID,
      db: dbMock,
      tokenType: "agent-context",
      headers: new Headers(serverKey === undefined ? {} : { [MASTRA_SERVER_KEY_HEADER]: serverKey }),
    }).mastra.getModelKey({ workspaceId: WORKSPACE });

  function isMember(member: boolean) {
    dbMock.workspaceUser.findUnique.mockResolvedValue(
      (member ? { role: "member", workspaceId: WORKSPACE } : null) as never,
    );
    dbMock.teamUser.findFirst.mockResolvedValue(null as never);
  }

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    process.env.BILLING_MODE = "meter";
    process.env.MASTRA_SERVER_API_KEY = SERVER_KEY;
    getWorkingModelKey.mockReset().mockResolvedValue(WORKSPACE_KEY);
    isMember(true);
  });

  afterEach(() => {
    if (original.mode === undefined) delete process.env.BILLING_MODE;
    else process.env.BILLING_MODE = original.mode;
    if (original.serverKey === undefined) delete process.env.MASTRA_SERVER_API_KEY;
    else process.env.MASTRA_SERVER_API_KEY = original.serverKey;
  });

  it("gives the Mastra server the key of a workspace the turn's user belongs to", async () => {
    await expect(ask(SERVER_KEY)).resolves.toEqual({ key: WORKSPACE_KEY });
    expect(getWorkingModelKey).toHaveBeenCalledWith(expect.anything(), WORKSPACE);
  });

  it("refuses a caller that holds the agent token but not the server key", async () => {
    await expect(ask()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(ask("not-the-server-key")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getWorkingModelKey).not.toHaveBeenCalled();
  });

  it("refuses everyone when this install has no server key configured", async () => {
    delete process.env.MASTRA_SERVER_API_KEY;

    await expect(ask(SERVER_KEY)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(ask("")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getWorkingModelKey).not.toHaveBeenCalled();
  });

  it("answers null, without reading the key, when the user is not in the workspace", async () => {
    isMember(false);

    await expect(ask(SERVER_KEY)).resolves.toEqual({ key: null });
    expect(getWorkingModelKey).not.toHaveBeenCalled();
  });

  it("answers null when the workspace has no working key", async () => {
    getWorkingModelKey.mockResolvedValue(null);

    await expect(ask(SERVER_KEY)).resolves.toEqual({ key: null });
  });

  it("answers null without touching the database on an install that does not meter", async () => {
    delete process.env.BILLING_MODE;

    await expect(ask(SERVER_KEY)).resolves.toEqual({ key: null });
    expect(dbMock.workspaceUser.findUnique).not.toHaveBeenCalled();
    expect(getWorkingModelKey).not.toHaveBeenCalled();
  });
});

describe("mastra.reportModelKeyFailure", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  const original = { mode: process.env.BILLING_MODE, serverKey: process.env.MASTRA_SERVER_API_KEY };
  const FAILED_AT = new Date("2026-11-15T10:00:00.000Z");

  const report = (serverKey?: string) =>
    createMockCaller({
      userId: USER_ID,
      db: dbMock,
      tokenType: "agent-context",
      headers: new Headers(serverKey === undefined ? {} : { [MASTRA_SERVER_KEY_HEADER]: serverKey }),
    }).mastra.reportModelKeyFailure({ workspaceId: WORKSPACE });

  function isMember(member: boolean) {
    dbMock.workspaceUser.findUnique.mockResolvedValue(
      (member ? { role: "member", workspaceId: WORKSPACE } : null) as never,
    );
    dbMock.teamUser.findFirst.mockResolvedValue(null as never);
  }

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    process.env.BILLING_MODE = "meter";
    process.env.MASTRA_SERVER_API_KEY = SERVER_KEY;
    markModelKeyFailing.mockReset().mockResolvedValue({ last4: "7Q4x", status: "failing", checkedAt: FAILED_AT });
    emitNotification.mockReset().mockResolvedValue(["owner-1"]);
    isMember(true);
  });

  afterEach(() => {
    if (original.mode === undefined) delete process.env.BILLING_MODE;
    else process.env.BILLING_MODE = original.mode;
    if (original.serverKey === undefined) delete process.env.MASTRA_SERVER_API_KEY;
    else process.env.MASTRA_SERVER_API_KEY = original.serverKey;
  });

  it("marks the key as failing and tells the workspace's owners and admins which key", async () => {
    await expect(report(SERVER_KEY)).resolves.toEqual({ marked: true });

    expect(markModelKeyFailing).toHaveBeenCalledWith(expect.anything(), WORKSPACE);
    expect(emitNotification).toHaveBeenCalledTimes(1);
    expect(emitNotification.mock.calls[0]?.[0]).toMatchObject({
      category: "billing",
      // Nobody is left out as "the actor": the owner whose turn hit the dead key must hear too.
      actorUserId: null,
      subject: { workspaceId: WORKSPACE, event: "model_key_failing", keyLast4: "7Q4x", occurredAt: FAILED_AT },
    });
  });

  it("tells nobody again when the key was already marked", async () => {
    markModelKeyFailing.mockResolvedValue(null);

    await expect(report(SERVER_KEY)).resolves.toEqual({ marked: false });
    expect(emitNotification).not.toHaveBeenCalled();
  });

  it("refuses a caller without the server key, and changes nothing", async () => {
    await expect(report()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(report("not-the-server-key")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(markModelKeyFailing).not.toHaveBeenCalled();
    expect(emitNotification).not.toHaveBeenCalled();
  });

  it("does nothing for a workspace the turn's user is not in", async () => {
    isMember(false);

    await expect(report(SERVER_KEY)).resolves.toEqual({ marked: false });
    expect(markModelKeyFailing).not.toHaveBeenCalled();
  });

  it("does nothing on an install that does not meter", async () => {
    delete process.env.BILLING_MODE;

    await expect(report(SERVER_KEY)).resolves.toEqual({ marked: false });
    expect(markModelKeyFailing).not.toHaveBeenCalled();
  });
});

