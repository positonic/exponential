/**
 * `humanOnlyProcedure` decides through `resolvePrincipal` (Agent principles
 * PRD, Phase 3: authorized agency; ADR-0049 §6, ADR-0070, ADR-0071). Only a
 * `human` principal passes; an `agent` (a shadow user, however it
 * authenticated) and an `agent_for_human` (Zoe, the gateways, voice) are
 * refused, and so is a token type nobody classified.
 *
 * Exercised through a one-procedure router so the gate is tested on its own,
 * apart from any router that happens to use it. Mocked Prisma.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.DATABASE_ENCRYPTION_KEY ??= "0".repeat(64);
});

vi.mock("next-auth", () => ({
  default: () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("~/server/auth", () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));

vi.mock("~/server/services/access/principal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/server/services/access/principal")>();
  return { ...actual, resolvePrincipal: vi.fn(actual.resolvePrincipal) };
});

import { createCallerFactory, createTRPCRouter, humanOnlyProcedure } from "~/server/api/trpc";
import { resolvePrincipal } from "~/server/services/access/principal";

const PERSON = "user-person";
const SHADOW = "user-shadow";
const ORPHAN_SHADOW = "user-orphan-shadow";

const router = createTRPCRouter({
  guarded: humanOnlyProcedure.mutation(() => "done"),
});
const createCaller = createCallerFactory(router);

function callerFor(db: PrismaClient, userId: string, tokenType?: string, agentRunId?: string) {
  return createCaller({
    db,
    tokenType,
    agentRunId,
    session: {
      user: { id: userId, email: `${userId}@test.com`, name: "Test", image: null, isAdmin: false },
      expires: new Date(Date.now() + 60_000).toISOString(),
    },
    headers: new Headers(),
  } as never);
}

describe("humanOnlyProcedure decides through resolvePrincipal", () => {
  const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

  beforeEach(() => {
    mockReset(db);
    vi.mocked(resolvePrincipal).mockClear();
    db.user.findUnique.mockImplementation(((args: { where: { id: string } }) =>
      Promise.resolve({ isAgent: args.where.id === SHADOW || args.where.id === ORPHAN_SHADOW })) as never);
    db.externalAgent.findUnique.mockImplementation(((args: { where: { shadowUserId: string } }) =>
      Promise.resolve(args.where.shadowUserId === SHADOW ? { id: "agent-1", ownerId: PERSON } : null)) as never);
  });

  describe("a human principal passes", () => {
    it.each([
      ["a cookie session", undefined],
      ["a personal api-token", "api-token"],
      ["a device token", "device-token"],
      ["an extension token", "extension-token"],
    ])("%s", async (_label, tokenType) => {
      await expect(callerFor(db, PERSON, tokenType).guarded()).resolves.toBe("done");
    });
  });

  describe("an agent principal is refused", () => {
    it("an External agent's agent-key", async () => {
      await expect(callerFor(db, SHADOW, "agent-key").guarded()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("an Assistant run's agent-context JWT (shadow sub, runId claim)", async () => {
      await expect(callerFor(db, SHADOW, "agent-context", "run-1").guarded()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("a shadow user laundered into a person's token type", async () => {
      await expect(callerFor(db, SHADOW, "api-token").guarded()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("a shadow user with no owning agent row", async () => {
      await expect(callerFor(db, ORPHAN_SHADOW).guarded()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("an agent acting for a person (agent_for_human) is refused", () => {
    it.each(["agent-context", "whatsapp-gateway", "telegram-gateway", "matrix-gateway", "voice-session"])(
      "a %s token with the person as session user",
      async (tokenType) => {
        await expect(callerFor(db, PERSON, tokenType).guarded()).rejects.toMatchObject({ code: "FORBIDDEN" });
      },
    );

    it("a token type nobody classified fails closed", async () => {
      await expect(callerFor(db, PERSON, "slack-gateway").guarded()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  it("the resolver's verdict is the gate's verdict", async () => {
    // A cookie session the resolver classifies as an agent acting for the
    // person is refused: the gate has no rule of its own beside the resolver.
    vi.mocked(resolvePrincipal).mockResolvedValueOnce({ kind: "agent_for_human", userId: PERSON, surface: "web" });
    await expect(callerFor(db, PERSON).guarded()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(resolvePrincipal).toHaveBeenCalledTimes(1);
  });
});
