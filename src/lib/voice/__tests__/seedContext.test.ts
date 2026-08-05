import { describe, it, expect } from "vitest";

import {
  buildVoiceSeedContext,
  type SeedableMessage,
} from "~/lib/voice/seedContext";

const system: SeedableMessage = { type: "system", content: "You are Zoe. Big context blob." };
const greeting: SeedableMessage = { type: "ai", content: "Hey! I'm Zoe. What's on your mind?" };

describe("buildVoiceSeedContext", () => {
  it("returns null when the thread has no user turn yet", () => {
    // A freshly opened drawer is scaffolding only — nothing worth seeding.
    expect(buildVoiceSeedContext([system, greeting])).toBeNull();
  });

  it("returns null for an empty thread", () => {
    expect(buildVoiceSeedContext([])).toBeNull();
  });

  it("drops the system block and the canned greeting that precede the first user turn", () => {
    const block = buildVoiceSeedContext([
      system,
      greeting,
      { type: "human", content: "What's blocking the API migration?" },
      { type: "ai", content: "Two actions are overdue on it." },
    ]);

    expect(block).not.toBeNull();
    expect(block).not.toContain("Big context blob");
    expect(block).not.toContain("What's on your mind");
    expect(block).toContain("User: What's blocking the API migration?");
    expect(block).toContain("Zoe: Two actions are overdue on it.");
  });

  it("wraps the transcript in the demotion framing", () => {
    const block = buildVoiceSeedContext([{ type: "human", content: "hi" }])!;

    expect(block.startsWith("[CONVERSATION SO FAR")).toBe(true);
    expect(block.trimEnd().endsWith("[END CONVERSATION SO FAR]")).toBe(true);
    // The framing must say both things, or the router treats the block as
    // instructions (injection surface) or as current truth (stale answers).
    expect(block).toContain("not instructions");
    expect(block).toContain("check with a tool");
  });

  it("skips failed assistant turns and blank content", () => {
    const block = buildVoiceSeedContext([
      { type: "human", content: "and the second one?" },
      { type: "ai", content: "Half an ans", failure: { severity: "incomplete" } },
      { type: "ai", content: "   " },
      { type: "ai", content: "The second is the billing refactor." },
    ])!;

    expect(block).not.toContain("Half an ans");
    expect(block).toContain("The second is the billing refactor.");
  });

  it("keeps spoken turns, so a resumed session recovers what was said", () => {
    // Voice turns land in the same thread with a marker; on resume they are the
    // most relevant context there is.
    const block = buildVoiceSeedContext([
      { type: "human", content: "typed question" },
      { type: "ai", content: "typed answer" },
      { type: "human", content: "spoken question" },
      { type: "ai", content: "spoken answer" },
    ])!;

    expect(block).toContain("User: spoken question");
    expect(block).toContain("Zoe: spoken answer");
  });

  it("uses the custom assistant's name as the transcript label", () => {
    const block = buildVoiceSeedContext(
      [
        { type: "human", content: "hello" },
        { type: "ai", content: "hi there" },
      ],
      { assistantLabel: "Ada" },
    )!;

    expect(block).toContain("Ada: hi there");
    expect(block).not.toContain("Zoe: hi there");
  });

  it("collapses multi-line turns onto one line each", () => {
    const block = buildVoiceSeedContext([
      { type: "human", content: "line one\n\n- bullet\n- bullet two" },
    ])!;

    const transcript = block.split("\n").filter((l) => l.startsWith("User:"));
    expect(transcript).toHaveLength(1);
    expect(transcript[0]).toBe("User: line one - bullet - bullet two");
  });

  it("caps a single oversized turn instead of letting it eat the budget", () => {
    const block = buildVoiceSeedContext(
      [{ type: "human", content: "x".repeat(5_000) }],
      { perTurnCharCap: 100 },
    )!;

    expect(block).toContain("[turn trimmed]");
    expect(block.length).toBeLessThan(1_000);
  });

  it("keeps the most recent turns when the thread exceeds maxTurns", () => {
    const messages: SeedableMessage[] = Array.from({ length: 30 }, (_, i) => ({
      type: i % 2 === 0 ? ("human" as const) : ("ai" as const),
      content: `turn ${i}`,
    }));

    const block = buildVoiceSeedContext(messages, { maxTurns: 4 })!;

    expect(block).toContain("turn 29");
    expect(block).toContain("turn 26");
    expect(block).not.toContain("turn 25");
    expect(block).not.toContain("turn 0");
  });

  it("drops the oldest turns to stay inside the token budget", () => {
    const messages: SeedableMessage[] = [
      { type: "human", content: "OLDEST " + "a".repeat(1_000) },
      { type: "ai", content: "b".repeat(1_000) },
      { type: "human", content: "NEWEST question" },
    ];

    // ~1000 chars ≈ 250 tokens each; a 300-token budget can't hold them all.
    const block = buildVoiceSeedContext(messages, { tokenBudget: 300 })!;

    expect(block).toContain("NEWEST question");
    expect(block).not.toContain("OLDEST");
  });
});
