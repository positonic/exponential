import { describe, it, expect } from "vitest";

import {
  VOICE_TOOL_CATALOG,
  VOICE_TOOL_NAMES,
  VOICE_ROUTER_INSTRUCTIONS,
} from "~/lib/voice/voiceToolCatalog";

describe("voice tool catalog (ADR-0005 contract)", () => {
  it("declares exactly the canonical tool names, in order", () => {
    expect(VOICE_TOOL_CATALOG.map((t) => t.name)).toEqual([...VOICE_TOOL_NAMES]);
  });

  it("includes the brain passthrough as the catch-all tool", () => {
    expect(VOICE_TOOL_NAMES).toContain("ask_exponential");
    expect(VOICE_TOOL_CATALOG.some((t) => t.name === "ask_exponential")).toBe(
      true,
    );
  });
});

describe("router persona (ADR-0005 / ADR-0006)", () => {
  it("preserves the YOU ARE THE SYSTEM superset paragraph (no drift regression)", () => {
    // Guards the ADR-0005 persona reconciliation — the canonical persona must
    // keep the iOS-superset rules web previously lacked.
    expect(VOICE_ROUTER_INSTRUCTIONS).toContain("YOU ARE THE SYSTEM");
  });

  it("carries the referential-routing rule (ADR-0006 §3)", () => {
    // Referential phrases must route to the memory-aware brain, not a coarse
    // tool — otherwise "capture that one" parses literally into a junk title.
    expect(VOICE_ROUTER_INSTRUCTIONS).toContain("REFERENTIAL REQUESTS");
    expect(VOICE_ROUTER_INSTRUCTIONS).toMatch(
      /referential[\s\S]*ask_exponential|REFERENTIAL REQUESTS — route to ask_exponential/i,
    );
  });

  it("keeps self-contained phrases on the fast coarse path", () => {
    // The rule must explicitly carve out self-contained captures so the coarse
    // fast path is preserved (no agent roundtrip for "capture buy milk Friday").
    expect(VOICE_ROUTER_INSTRUCTIONS.toLowerCase()).toContain("self-contained");
  });
});
