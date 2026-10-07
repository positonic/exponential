import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { pickModelTier } from "../pickModelTier";

// ── Test fakes ────────────────────────────────────────────────────────

type PriorInteraction = { agentId: string | null; hadError: boolean };

/**
 * Build a minimal PrismaClient stand-in. pickModelTier only touches
 * `db.aiInteractionHistory.findFirst({ where, orderBy, select })`, so we
 * mock that single call. Every other method is omitted on purpose — if
 * pickModelTier ever starts calling another path, the test should crash
 * loudly so we notice.
 */
function makeDb(prior: PriorInteraction | null): PrismaClient {
  return {
    aiInteractionHistory: {
      findFirst: async () => prior,
    },
  } as unknown as PrismaClient;
}

const userMsg = (content: string) => ({ role: "user" as const, content });

const baseInput = {
  userId: "user-1",
  conversationId: "conv-1",
  finalMessages: [userMsg("hi")],
};

// ── Pass-through for non-Zoe/non-Assistant agents ─────────────────────

describe("pickModelTier — pass-through", () => {
  it("does not downgrade projectManagerAgent (no Haiku variant)", async () => {
    const result = await pickModelTier({
      ...baseInput,
      agentId: "projectManagerAgent",
      db: makeDb(null),
    });
    expect(result.agentId).toBe("projectManagerAgent");
    expect(result.reason).toBe("no-haiku-variant");
  });

  it("does not downgrade weatherAgent", async () => {
    const result = await pickModelTier({
      ...baseInput,
      agentId: "weatherAgent",
      db: makeDb(null),
    });
    expect(result.agentId).toBe("weatherAgent");
  });
});

// ── Conversation stickiness ───────────────────────────────────────────

describe("pickModelTier — stickiness", () => {
  it("sticks to Haiku when prior turn ran on Haiku without error", async () => {
    const result = await pickModelTier({
      ...baseInput,
      agentId: "zoeAgent",
      // Prompt looks like a hard turn — stickiness should win anyway
      finalMessages: [
        userMsg(
          "Please plan a detailed launch strategy for the new mobile app, " +
            "including milestones, owners, and risk mitigations across the " +
            "next two quarters with quantitative targets.",
        ),
      ],
      db: makeDb({ agentId: "zoeAgentHaiku", hadError: false }),
    });
    expect(result.agentId).toBe("zoeAgentHaiku");
    expect(result.reason).toBe("sticky-haiku");
  });

  it("sticks to Sonnet when prior turn ran on Sonnet", async () => {
    const result = await pickModelTier({
      ...baseInput,
      agentId: "zoeAgent",
      // Trivial prompt — heuristics would say Haiku, but stickiness should keep Sonnet
      finalMessages: [userMsg("hi")],
      db: makeDb({ agentId: "zoeAgent", hadError: false }),
    });
    expect(result.agentId).toBe("zoeAgent");
    expect(result.reason).toBe("sticky-sonnet");
  });

  it("escalates Haiku → Sonnet when prior Haiku turn errored", async () => {
    const result = await pickModelTier({
      ...baseInput,
      agentId: "zoeAgent",
      finalMessages: [userMsg("hi")],
      db: makeDb({ agentId: "zoeAgentHaiku", hadError: true }),
    });
    expect(result.agentId).toBe("zoeAgent");
    expect(result.reason).toBe("sticky-escalate-after-error");
  });

  it("ignores stickiness when there is no prior interaction", async () => {
    const result = await pickModelTier({
      ...baseInput,
      agentId: "zoeAgent",
      finalMessages: [userMsg("hi")],
      db: makeDb(null),
    });
    expect(result.agentId).toBe("zoeAgentHaiku");
    expect(result.reason).toBe("haiku-greeting");
  });

  it("ignores stickiness when conversationId is undefined", async () => {
    const result = await pickModelTier({
      ...baseInput,
      conversationId: undefined,
      agentId: "zoeAgent",
      finalMessages: [userMsg("hi")],
      // findFirst should never run, but if it did, it would return this prior
      db: makeDb({ agentId: "zoeAgent", hadError: false }),
    });
    expect(result.agentId).toBe("zoeAgentHaiku");
  });
});

// ── Force-Sonnet heuristics ───────────────────────────────────────────

describe("pickModelTier — force Sonnet", () => {
  it("respects @think opt-in even on a short message", async () => {
    const result = await pickModelTier({
      ...baseInput,
      agentId: "zoeAgent",
      finalMessages: [userMsg("@think hi")],
      db: makeDb(null),
    });
    expect(result.agentId).toBe("zoeAgent");
    expect(result.reason).toBe("force-sonnet-opt-in");
  });

  it("respects @zoe-think opt-in", async () => {
    const result = await pickModelTier({
      ...baseInput,
      agentId: "zoeAgent",
      finalMessages: [userMsg("@zoe-think what should we ship next quarter?")],
      db: makeDb(null),
    });
    expect(result.agentId).toBe("zoeAgent");
    expect(result.reason).toBe("force-sonnet-opt-in");
  });

  it("forces Sonnet for long messages with hard-thinking verbs", async () => {
    // > 200 chars and contains a hard verb — both gates required.
    const longHard =
      "Please plan a detailed rollout for our new analytics dashboard. " +
      "I want to walk through the migration path carefully, covering how " +
      "we handle existing tenants, the backfill strategy, the cutover " +
      "window itself, and any rollback hooks we should keep in our pocket.";
    expect(longHard.length).toBeGreaterThan(200);
    const result = await pickModelTier({
      ...baseInput,
      agentId: "zoeAgent",
      finalMessages: [userMsg(longHard)],
      db: makeDb(null),
    });
    expect(result.agentId).toBe("zoeAgent");
    expect(result.reason).toBe("force-sonnet-hard-prompt");
  });

  it("does NOT force Sonnet on a short message that contains a hard verb", async () => {
    // Length ≤ 200 so the hard-verb gate doesn't trigger
    const result = await pickModelTier({
      ...baseInput,
      agentId: "zoeAgent",
      finalMessages: [userMsg("can you draft a haiku?")],
      db: makeDb(null),
    });
    expect(result.agentId).toBe("zoeAgentHaiku");
  });
});

// ── Fast-path heuristics ──────────────────────────────────────────────

describe("pickModelTier — fast-path to Haiku", () => {
  it.each([
    ["hi"],
    ["hello"],
    ["hey"],
    ["thanks"],
    ["ok"],
    ["yes"],
    ["got it"],
    ["good morning"],
  ])("routes greeting %p to Haiku via greeting fast-path", async (msg) => {
    const result = await pickModelTier({
      ...baseInput,
      agentId: "zoeAgent",
      finalMessages: [userMsg(msg)],
      db: makeDb(null),
    });
    expect(result.agentId).toBe("zoeAgentHaiku");
    expect(result.reason).toBe("haiku-greeting");
  });

  it("routes short message without @mention to Haiku", async () => {
    const result = await pickModelTier({
      ...baseInput,
      agentId: "zoeAgent",
      finalMessages: [userMsg("what was that thing again?")],
      db: makeDb(null),
    });
    expect(result.agentId).toBe("zoeAgentHaiku");
    expect(result.reason).toBe("haiku-short-no-mention");
  });

  it("does NOT take short-no-mention path when message contains an @mention", async () => {
    const result = await pickModelTier({
      ...baseInput,
      agentId: "zoeAgent",
      finalMessages: [userMsg("@alice can you confirm?")],
      db: makeDb(null),
    });
    // Falls through past the short-no-mention gate. Length < 80, no hard
    // verb, no obvious-lookup match — so we land on the Haiku fallback.
    expect(result.agentId).toBe("zoeAgentHaiku");
    expect(result.reason).toBe("haiku-fallback");
  });

  it.each([
    ["what's on my calendar today?"],
    ["list my projects"],
    ["show my projects"],
    ["any unreads?"],
    ["any mentions?"],
    ["what's in slack?"],
  ])("routes obvious-lookup %p to Haiku", async (msg) => {
    const result = await pickModelTier({
      ...baseInput,
      agentId: "zoeAgent",
      finalMessages: [userMsg(msg)],
      db: makeDb(null),
    });
    expect(result.agentId).toBe("zoeAgentHaiku");
    // Either greeting/short-no-mention/obvious-lookup or fallback may match;
    // the contract is "this is a Haiku turn", not the exact reason label.
    expect(result.reason).toMatch(/^haiku-/);
  });

  it("falls back to Haiku for medium-length neutral prompts", async () => {
    // 80–200 chars, no hard verb, no @mention, not a greeting/lookup
    const msg =
      "Hmm I'm not sure what to do about the dashboard widget that keeps " +
      "showing yesterday's number even though the data did refresh.";
    const result = await pickModelTier({
      ...baseInput,
      agentId: "zoeAgent",
      finalMessages: [userMsg(msg)],
      db: makeDb(null),
    });
    expect(result.agentId).toBe("zoeAgentHaiku");
    expect(result.reason).toBe("haiku-fallback");
  });
});

// ── Variant routing for the assistantAgent ────────────────────────────

describe("pickModelTier — assistant variant", () => {
  it("routes assistantAgent → assistantAgentHaiku on greeting", async () => {
    const result = await pickModelTier({
      ...baseInput,
      agentId: "assistantAgent",
      finalMessages: [userMsg("hi")],
      db: makeDb(null),
    });
    expect(result.agentId).toBe("assistantAgentHaiku");
  });

  it("escalates assistantAgentHaiku → assistantAgent after error", async () => {
    const result = await pickModelTier({
      ...baseInput,
      agentId: "assistantAgent",
      finalMessages: [userMsg("hi")],
      db: makeDb({ agentId: "assistantAgentHaiku", hadError: true }),
    });
    expect(result.agentId).toBe("assistantAgent");
    expect(result.reason).toBe("sticky-escalate-after-error");
  });
});

// ── Resilience ─────────────────────────────────────────────────────────

describe("pickModelTier — resilience", () => {
  it("uses heuristics on the LATEST user message, not the first one", async () => {
    const result = await pickModelTier({
      ...baseInput,
      agentId: "zoeAgent",
      finalMessages: [
        userMsg("plan and design a sprawling architecture across N services"),
        { role: "assistant" as const, content: "ok let me think" },
        userMsg("hi"),
      ],
      db: makeDb(null),
    });
    expect(result.agentId).toBe("zoeAgentHaiku");
    expect(result.reason).toBe("haiku-greeting");
  });

  it("handles an empty message list (no user message) by falling back to Haiku", async () => {
    const result = await pickModelTier({
      ...baseInput,
      agentId: "zoeAgent",
      finalMessages: [],
      db: makeDb(null),
    });
    expect(result.agentId).toBe("zoeAgentHaiku");
  });
});

// ── Jev decision layer (ADR-0065) ─────────────────────────────────────

describe("pickModelTier — Jev decision layer", () => {
  const decideFast = async () => ({
    tier: "fast" as const,
    confidence: 0.91,
    probabilities: { fast: 0.95, deep: 0.05 },
    latencyMs: 120,
    model: "jev-1.13.0",
  });
  const decideDeep = async () => ({ ...(await decideFast()), tier: "deep" as const });
  const decideUnsure = async () => null;

  it("routes to Haiku on a confident fast decision, even for a long hard-looking prompt", async () => {
    const result = await pickModelTier({
      ...baseInput,
      agentId: "zoeAgent",
      finalMessages: [
        userMsg(
          "Please plan a detailed launch strategy for the new mobile app, " +
            "including milestones, owners, and risk mitigations across the " +
            "next two quarters with quantitative targets.",
        ),
      ],
      db: makeDb(null),
      decideTier: decideFast,
    });
    expect(result.agentId).toBe("zoeAgentHaiku");
    expect(result.reason).toBe("jev-fast");
    expect(result.decision).toEqual({ confidence: 0.91, latencyMs: 120, model: "jev-1.13.0" });
  });

  it("routes to Sonnet on a confident deep decision, even for a greeting-shaped prompt", async () => {
    const result = await pickModelTier({
      ...baseInput,
      agentId: "zoeAgent",
      finalMessages: [userMsg("hi")],
      db: makeDb(null),
      decideTier: decideDeep,
    });
    expect(result.agentId).toBe("zoeAgent");
    expect(result.reason).toBe("jev-deep");
  });

  it("falls through to the regexes when Jev is unsure or unavailable", async () => {
    const result = await pickModelTier({
      ...baseInput,
      agentId: "zoeAgent",
      finalMessages: [userMsg("hi")],
      db: makeDb(null),
      decideTier: decideUnsure,
    });
    expect(result.agentId).toBe("zoeAgentHaiku");
    expect(result.reason).toBe("haiku-greeting");
    expect(result.decision).toBeUndefined();
  });

  it("does not consult Jev when the user opted in with @think", async () => {
    const decideTier = vi.fn(decideFast);
    const result = await pickModelTier({
      ...baseInput,
      agentId: "zoeAgent",
      finalMessages: [userMsg("@think hi")],
      db: makeDb(null),
      decideTier,
    });
    expect(result.reason).toBe("force-sonnet-opt-in");
    expect(decideTier).not.toHaveBeenCalled();
  });

  it("does not consult Jev when stickiness already decided", async () => {
    const decideTier = vi.fn(decideDeep);
    const result = await pickModelTier({
      ...baseInput,
      agentId: "zoeAgent",
      finalMessages: [userMsg("hi")],
      db: makeDb({ agentId: "zoeAgentHaiku", hadError: false }),
      decideTier,
    });
    expect(result.reason).toBe("sticky-haiku");
    expect(decideTier).not.toHaveBeenCalled();
  });

  it("does not consult Jev for agents without a Haiku variant", async () => {
    const decideTier = vi.fn(decideDeep);
    await pickModelTier({
      ...baseInput,
      agentId: "projectManagerAgent",
      db: makeDb(null),
      decideTier,
    });
    expect(decideTier).not.toHaveBeenCalled();
  });

  it("hands Jev the caller's priorTurns, not finalMessages (which carries no history)", async () => {
    // The route's finalMessages is [latest user message] plus server-injected
    // system context — Mastra thread memory holds the transcript. Jev must
    // get the client transcript explicitly or it decides follow-ups blind.
    const decideTier = vi.fn(decideFast);
    await pickModelTier({
      ...baseInput,
      agentId: "zoeAgent",
      finalMessages: [
        { role: "system" as const, content: "server-injected context" },
        userMsg("do the second one"),
      ],
      priorTurns: [
        userMsg("list my projects"),
        { role: "assistant" as const, content: "1. Alpha\n2. Beta" },
      ],
      db: makeDb(null),
      decideTier,
    });
    expect(decideTier).toHaveBeenCalledWith({
      message: "do the second one",
      priorTurns: [
        { role: "user", content: "list my projects" },
        { role: "assistant", content: "1. Alpha\n2. Beta" },
      ],
    });
  });

  it("derives prior turns from finalMessages when priorTurns is not supplied", async () => {
    const decideTier = vi.fn(decideFast);
    await pickModelTier({
      ...baseInput,
      agentId: "zoeAgent",
      finalMessages: [
        { role: "system" as const, content: "soul" },
        userMsg("first"),
        { role: "assistant" as const, content: "reply" },
        userMsg("second"),
      ],
      db: makeDb(null),
      decideTier,
    });
    expect(decideTier).toHaveBeenCalledWith({
      message: "second",
      priorTurns: [
        { role: "system", content: "soul" },
        { role: "user", content: "first" },
        { role: "assistant", content: "reply" },
      ],
    });
  });
});
