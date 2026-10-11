/**
 * `resolvePrincipal` decides human vs agent from verified credentials only
 * (Agent principles PRD, Phase 3 item 1; D-0016): the DB key lookup (which
 * yields `tokenType: "agent-key"`), the JWT's verified `tokenType` and `runId`
 * claims, and `User.isAgent`. One case per credential, plus the rule that
 * caller-supplied input never moves the answer.
 *
 * Mocked Prisma — no real DB.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { resolvePrincipal, type PrincipalContext } from "../principal";

const PERSON = "user-person";
const SHADOW = "user-shadow";
const AGENT = { id: "agent-1", ownerId: PERSON };

function ctxFor(
  db: PrismaClient,
  userId: string,
  tokenType?: string,
  agentRunId?: string,
): PrincipalContext {
  return { db, session: { user: { id: userId } }, tokenType, agentRunId };
}

describe("resolvePrincipal", () => {
  const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

  beforeEach(() => {
    mockReset(db);
    db.user.findUnique.mockImplementation(((args: { where: { id: string } }) =>
      Promise.resolve({ isAgent: args.where.id === SHADOW })) as never);
    db.externalAgent.findUnique.mockImplementation(((args: {
      where: { shadowUserId: string };
    }) =>
      Promise.resolve(args.where.shadowUserId === SHADOW ? AGENT : null)) as never);
  });

  it("a cookie session (no token type) is a human on the web surface", async () => {
    expect(await resolvePrincipal(ctxFor(db, PERSON))).toEqual({
      kind: "human",
      userId: PERSON,
      surface: "web",
    });
  });

  it("a person's api-token is a human", async () => {
    expect(await resolvePrincipal(ctxFor(db, PERSON, "api-token"))).toEqual({
      kind: "human",
      userId: PERSON,
      surface: "api-token",
    });
  });

  it.each([
    ["device-token", "device"],
    ["extension-token", "extension"],
  ] as const)("a %s is a human", async (tokenType, surface) => {
    expect(await resolvePrincipal(ctxFor(db, PERSON, tokenType))).toEqual({
      kind: "human",
      userId: PERSON,
      surface,
    });
  });

  it("an agent-key is the agent, carrying its id and accountable owner", async () => {
    expect(await resolvePrincipal(ctxFor(db, SHADOW, "agent-key"))).toEqual({
      kind: "agent",
      userId: SHADOW,
      agentId: AGENT.id,
      ownerId: AGENT.ownerId,
      surface: "agent-key",
    });
  });

  it("an agent-context JWT with a runId and a shadow sub is the agent, carrying the run", async () => {
    expect(
      await resolvePrincipal(ctxFor(db, SHADOW, "agent-context", "run-9")),
    ).toEqual({
      kind: "agent",
      userId: SHADOW,
      agentId: AGENT.id,
      ownerId: AGENT.ownerId,
      runId: "run-9",
      surface: "agent-run",
    });
  });

  it("a shadow user is an agent whatever token type carried it", async () => {
    // A credential laundered into another token type still resolves to the
    // agent: the principal is keyed on User.isAgent, not on how it signed in.
    const principal = await resolvePrincipal(ctxFor(db, SHADOW, "api-token"));
    expect(principal.kind).toBe("agent");
  });

  it("an agent-context JWT whose sub is a person is an agent acting for that person (Zoe)", async () => {
    expect(await resolvePrincipal(ctxFor(db, PERSON, "agent-context"))).toEqual({
      kind: "agent_for_human",
      userId: PERSON,
      surface: "agent-context",
    });
  });

  it.each([
    ["whatsapp-gateway", "whatsapp"],
    ["telegram-gateway", "telegram"],
    ["matrix-gateway", "matrix"],
    ["voice-session", "voice"],
  ] as const)(
    "a %s JWT is an agent acting for the person, on that surface",
    async (tokenType, surface) => {
      expect(await resolvePrincipal(ctxFor(db, PERSON, tokenType))).toEqual({
        kind: "agent_for_human",
        userId: PERSON,
        surface,
      });
    },
  );

  it("an unrecognised token type never resolves to a human", async () => {
    expect(await resolvePrincipal(ctxFor(db, PERSON, "mystery-token"))).toEqual({
      kind: "agent_for_human",
      userId: PERSON,
      surface: "unknown",
    });
  });

  it("an agent principal with no ExternalAgent row is refused, not downgraded to a human", async () => {
    db.externalAgent.findUnique.mockResolvedValue(null);
    await expect(
      resolvePrincipal(ctxFor(db, SHADOW, "agent-key")),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a caller-supplied source label changes nothing", async () => {
    // Labels a caller chooses (an input `source`, an `isAgent` field) live on
    // the request input, which resolvePrincipal never reads. Smuggling them
    // onto the context object changes nothing either.
    const spoofed = {
      ...ctxFor(db, SHADOW, "agent-key"),
      input: { source: "ui", isAgent: false },
      source: "ui",
    } as PrincipalContext;
    expect((await resolvePrincipal(spoofed)).kind).toBe("agent");

    const spoofedHuman = {
      ...ctxFor(db, PERSON, "agent-context"),
      input: { source: "MANUAL" },
      source: "MANUAL",
    } as PrincipalContext;
    expect((await resolvePrincipal(spoofedHuman)).kind).toBe("agent_for_human");
  });

  it("an unauthenticated context is refused", async () => {
    await expect(
      resolvePrincipal({ db, session: null, tokenType: undefined }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
