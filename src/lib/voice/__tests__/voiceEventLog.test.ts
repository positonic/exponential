import { describe, expect, it } from "vitest";

import {
  createVoiceEventLog,
  excerpt,
  toActionsTaken,
} from "~/lib/voice/voiceEventLog";

function clock(start = 1_000) {
  let t = start;
  return { now: () => t, tick: (ms: number) => (t += ms) };
}

describe("createVoiceEventLog", () => {
  it("timestamps events relative to creation", () => {
    const c = clock();
    const log = createVoiceEventLog({ now: c.now });
    c.tick(250);
    log.push("speech.started");
    c.tick(100);
    log.push("speech.committed", { itemId: "item_1" });
    expect(log.all()).toEqual([
      { t: 250, type: "speech.started" },
      { t: 350, type: "speech.committed", detail: { itemId: "item_1" } },
    ]);
  });

  it("drain returns only what arrived since the previous drain", () => {
    const log = createVoiceEventLog({ now: () => 0 });
    log.push("tool.called", { name: "query" });
    log.push("transcript.assistant", { text: "one sec" });
    expect(log.drain().map((e) => e.type)).toEqual([
      "tool.called",
      "transcript.assistant",
    ]);
    expect(log.drain()).toEqual([]);
    log.push("tool.result", { name: "query" });
    expect(log.drain().map((e) => e.type)).toEqual(["tool.result"]);
    // Retained history is untouched by draining.
    expect(log.all()).toHaveLength(3);
  });

  it("drops the oldest events past capacity without losing undrained ones", () => {
    const log = createVoiceEventLog({ now: () => 0, capacity: 3 });
    log.push("speech.started", { n: 1 });
    log.drain();
    log.push("speech.started", { n: 2 });
    log.push("speech.started", { n: 3 });
    log.push("speech.started", { n: 4 }); // evicts n=1 (already drained)
    expect(log.all().map((e) => e.detail?.n)).toEqual([2, 3, 4]);
    expect(log.drain().map((e) => e.detail?.n)).toEqual([2, 3, 4]);
  });

  it("echoes each event to the sink", () => {
    const seen: string[] = [];
    const log = createVoiceEventLog({ now: () => 0, echo: (e) => seen.push(e.type) });
    log.push("server.error", { message: "boom" });
    expect(seen).toEqual(["server.error"]);
  });
});

describe("excerpt", () => {
  it("flattens whitespace and bounds length", () => {
    expect(excerpt("  hello\n  world ")).toBe("hello world");
    expect(excerpt("x".repeat(500))).toHaveLength(160);
    expect(excerpt("x".repeat(500)).endsWith("…")).toBe(true);
    expect(excerpt(undefined)).toBe("");
  });
});

describe("toActionsTaken", () => {
  it("renders the tool round-trip as readable audit rows", () => {
    const rows = toActionsTaken([
      { t: 10, type: "tool.called", detail: { name: "ask_exponential", phrase: "contacts in Madrid" } },
      { t: 15_010, type: "tool.result", detail: { name: "ask_exponential", durationMs: 15_000, speakable: "No contacts in Madrid." } },
      { t: 15_020, type: "response.requested", detail: { reason: "tool_output" } },
    ]);
    expect(rows).toEqual([
      {
        action: "tool.called",
        result: "ask_exponential(contacts in Madrid)",
        data: { t: 10, name: "ask_exponential", phrase: "contacts in Madrid" },
      },
      {
        action: "tool.result",
        result: "ask_exponential in 15000ms: No contacts in Madrid.",
        data: { t: 15_010, name: "ask_exponential", durationMs: 15_000, speakable: "No contacts in Madrid." },
      },
      {
        action: "response.requested",
        result: "tool_output",
        data: { t: 15_020, reason: "tool_output" },
      },
    ]);
  });
});
