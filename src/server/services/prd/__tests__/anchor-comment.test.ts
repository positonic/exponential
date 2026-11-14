/**
 * Quote-only anchoring (the CLI/SDK/agent path for new comment threads): the
 * server finds the span from `quotedText` + context, deriving the doc from
 * Markdown when the host has none yet, and reports when it can't.
 */

import { describe, it, expect, vi } from "vitest";
import type { JSONContent } from "@tiptap/core";

vi.mock("~/server/utils/reportHandledErrorServer", () => ({
  reportHandledErrorServer: vi.fn(),
}));

import { anchorThreadByQuote, docWithQuotedThread } from "../anchor-comment";

function paragraph(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

const doc: JSONContent = {
  type: "doc",
  content: [paragraph("Ship the API first."), paragraph("Then document the API.")],
};

/** The text each `threadId` mark covers, in document order. */
function markedText(json: JSONContent, threadId: string): string[] {
  const out: string[] = [];
  const walk = (node: JSONContent) => {
    if (
      node.type === "text" &&
      node.marks?.some((m) => m.type === "comment" && m.attrs?.threadId === threadId)
    ) {
      out.push(node.text ?? "");
    }
    node.content?.forEach(walk);
  };
  walk(json);
  return out;
}

describe("docWithQuotedThread", () => {
  it("marks a quote that occurs once", () => {
    const next = docWithQuotedThread({ doc, markdown: null }, "t1", { exact: "Ship the API first" });
    expect(next && markedText(next, "t1")).toEqual(["Ship the API first"]);
  });

  it("refuses a repeated quote with nothing to choose between the copies", () => {
    expect(docWithQuotedThread({ doc, markdown: null }, "t1", { exact: "API" })).toBeNull();
  });

  it("picks the copy the context points at", () => {
    const next = docWithQuotedThread({ doc, markdown: null }, "t1", {
      exact: "API",
      prefix: "Then document the ",
    });
    expect(next).not.toBeNull();
    // The second paragraph's "API" carries the mark, the first's doesn't.
    const second = next!.content![1]!.content!;
    expect(second.find((n) => n.text === "API")?.marks?.[0]?.attrs?.threadId).toBe("t1");
    expect(next!.content![0]!.content!.some((n) => n.marks?.length)).toBe(false);
  });

  it("refuses a quote that isn't in the body", () => {
    expect(docWithQuotedThread({ doc, markdown: null }, "t1", { exact: "nowhere to be found" })).toBeNull();
  });

  it("matches the rendered text, not Markdown syntax", () => {
    const stored = { doc: null, markdown: "Keep **the rollout** small." };
    expect(docWithQuotedThread(stored, "t1", { exact: "**the rollout**" })).toBeNull();
    const next = docWithQuotedThread(stored, "t1", { exact: "the rollout" });
    expect(next && markedText(next, "t1")).toEqual(["the rollout"]);
  });

  it("derives the doc from Markdown when the host has none", () => {
    const next = docWithQuotedThread(
      { doc: null, markdown: "# Plan\n\nWe pick the indicator later." },
      "t1",
      { exact: "the indicator" },
    );
    expect(next?.content?.[0]?.type).toBe("heading");
    expect(next && markedText(next, "t1")).toEqual(["the indicator"]);
  });

  it("has nothing to anchor to on an empty page", () => {
    expect(docWithQuotedThread({ doc: null, markdown: "  " }, "t1", { exact: "x" })).toBeNull();
    expect(docWithQuotedThread({ doc: null, markdown: null }, "t1", { exact: "x" })).toBeNull();
  });
});

describe("anchorThreadByQuote", () => {
  it("writes the marked doc against the version it read", async () => {
    const write = vi.fn().mockResolvedValue(true);
    const outcome = await anchorThreadByQuote({
      threadId: "t1",
      quote: { exact: "Ship the API first" },
      read: async () => ({ doc, markdown: null, docVersion: 4 }),
      write,
    });
    expect(outcome).toEqual({ status: "anchored", docVersion: 5 });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]![1]).toBe(4);
    expect(markedText(write.mock.calls[0]![0] as JSONContent, "t1")).toEqual(["Ship the API first"]);
  });

  it("re-reads once after losing the compare-and-set", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({ doc, markdown: null, docVersion: 4 })
      .mockResolvedValueOnce({ doc, markdown: null, docVersion: 5 });
    const write = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const outcome = await anchorThreadByQuote({
      threadId: "t1",
      quote: { exact: "Ship the API first" },
      read,
      write,
    });
    expect(outcome).toEqual({ status: "anchored", docVersion: 6 });
    expect(write.mock.calls.map((c) => c[1] as number)).toEqual([4, 5]);
  });

  it("gives up as a conflict when both writes lose", async () => {
    const outcome = await anchorThreadByQuote({
      threadId: "t1",
      quote: { exact: "Ship the API first" },
      read: async () => ({ doc, markdown: null, docVersion: 4 }),
      write: async () => false,
    });
    expect(outcome).toEqual({ status: "conflict" });
  });

  it("reports a quote that doesn't resolve without writing", async () => {
    const write = vi.fn();
    const outcome = await anchorThreadByQuote({
      threadId: "t1",
      quote: { exact: "API" },
      read: async () => ({ doc, markdown: null, docVersion: 4 }),
      write,
    });
    expect(outcome).toEqual({ status: "not_found" });
    expect(write).not.toHaveBeenCalled();
  });
});
