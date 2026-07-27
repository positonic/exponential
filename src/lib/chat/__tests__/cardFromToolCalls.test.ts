import { describe, it, expect } from "vitest";
import { cardFromToolCalls } from "../cardFromToolCalls";
import type { ToolCall } from "../streamProtocol";

function call(overrides: Partial<ToolCall>): ToolCall {
  return {
    id: "t1",
    name: "ideate-features",
    status: "success",
    args: { transcriptionId: "meeting-1" },
    ...overrides,
  };
}

describe("cardFromToolCalls", () => {
  it("returns a draft-features card for a successful ideate-features call", () => {
    expect(cardFromToolCalls([call({})])).toEqual({
      kind: "draft-features",
      transcriptionId: "meeting-1",
    });
  });

  it("ignores a failed ideate-features call — no empty card promising drafts", () => {
    expect(cardFromToolCalls([call({ status: "error" })])).toBeNull();
  });

  it("ignores unrelated tools", () => {
    expect(
      cardFromToolCalls([call({ name: "quick-create-action" })]),
    ).toBeNull();
  });

  it("ignores a call missing a usable transcriptionId", () => {
    expect(cardFromToolCalls([call({ args: {} })])).toBeNull();
    expect(cardFromToolCalls([call({ args: { transcriptionId: "" } })])).toBeNull();
    expect(cardFromToolCalls([call({ args: undefined })])).toBeNull();
  });

  it("uses the most recent successful ideation when a turn ran it twice", () => {
    const result = cardFromToolCalls([
      call({ args: { transcriptionId: "first" } }),
      call({ args: { transcriptionId: "second" } }),
    ]);
    expect(result?.transcriptionId).toBe("second");
  });

  it("returns null for an empty turn", () => {
    expect(cardFromToolCalls([])).toBeNull();
  });
});
