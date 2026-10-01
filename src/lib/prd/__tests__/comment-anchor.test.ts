// @vitest-environment node
// Node, not happy-dom: these helpers run inside tRPC procedures, so they must
// work without any DOM.
import { describe, expect, it } from "vitest";
import { getSchema, type JSONContent } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";

import { buildPrdExtensions } from "../extensions";
import {
  anchorThread,
  carryCommentMarks,
  docHasCommentMarks,
  quoteAt,
} from "../comment-anchor";
import { collectAnchoredThreadIds } from "../thread-reconciliation";

const schema = getSchema(buildPrdExtensions());

const para = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", content });
const text = (t: string, threadIds: string[] = []): JSONContent => ({
  type: "text",
  text: t,
  ...(threadIds.length
    ? { marks: threadIds.map((threadId) => ({ type: "comment", attrs: { threadId } })) }
    : {}),
});
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });

/** The text under each thread's marks, joined per thread. */
function markedText(json: JSONContent): Record<string, string> {
  const out: Record<string, string> = {};
  PMNode.fromJSON(schema, json).descendants((node) => {
    for (const m of node.marks) {
      if (m.type.name !== "comment") continue;
      const id = m.attrs.threadId as string;
      out[id] = (out[id] ?? "") + (node.text ?? "");
    }
  });
  return out;
}

function rangeOf(json: JSONContent, needle: string, nth = 0) {
  const node = PMNode.fromJSON(schema, json);
  let seen = 0;
  let found: { from: number; to: number } | null = null;
  node.descendants((n, pos) => {
    if (found || !n.isText || !n.text) return undefined;
    let i = n.text.indexOf(needle);
    while (i !== -1) {
      if (seen++ === nth) {
        found = { from: pos + i, to: pos + i + needle.length };
        return false;
      }
      i = n.text.indexOf(needle, i + 1);
    }
    return undefined;
  });
  if (!found) throw new Error(`"${needle}" #${nth} not in doc`);
  return found as { from: number; to: number };
}

const CLEAR = doc(
  para(
    text(
      "It can change what the user is looking at (Agent navigation, always undoable) but never changes data.",
    ),
  ),
);

describe("anchorThread", () => {
  it("marks the hinted range when it still holds the quote", () => {
    const hint = rangeOf(CLEAR, "Agent navigation");
    const out = anchorThread(CLEAR, "t1", { exact: "Agent navigation" }, hint);
    expect(out && markedText(out)).toEqual({ t1: "Agent navigation" });
  });

  it("finds the quote when the doc changed under the hint", () => {
    // A CLI rewrite prepended a sentence, shifting every position.
    const rewritten = doc(
      para(text("New intro sentence from an agent.")),
      ...(CLEAR.content ?? []),
    );
    const staleHint = rangeOf(CLEAR, "Agent navigation");
    const out = anchorThread(rewritten, "t1", { exact: "Agent navigation" }, staleHint);
    expect(out && markedText(out)).toEqual({ t1: "Agent navigation" });
  });

  it("uses the context to pick between repeats of the quote", () => {
    const repeated = doc(
      para(text("the alpha agent runs first.")),
      para(text("then the beta agent runs.")),
    );
    const { from, to } = rangeOf(repeated, "agent", 1);
    const quote = quoteAt(PMNode.fromJSON(schema, repeated), from, to);
    expect(quote.exact).toBe("agent");
    const out = anchorThread(repeated, "t1", quote)!;
    // The mark sits in the second paragraph (after "beta "), not the first.
    expect(collectAnchoredThreadIds(out.content![0])).toEqual(new Set());
    expect(collectAnchoredThreadIds(out.content![1])).toEqual(new Set(["t1"]));
  });

  it("trusts a quote with no recorded context only when it is unique", () => {
    const repeated = doc(para(text("agent one, agent two")));
    expect(anchorThread(repeated, "t1", { exact: "agent" })).toBeNull();
    expect(anchorThread(repeated, "t1", { exact: "agent one" })).not.toBeNull();
  });

  it("returns null when the quoted text is gone", () => {
    expect(anchorThread(CLEAR, "t1", { exact: "deleted words" })).toBeNull();
  });

  it("is a no-op for a thread that is already marked", () => {
    const marked = anchorThread(CLEAR, "t1", { exact: "Agent navigation" })!;
    expect(anchorThread(marked, "t1", { exact: "Agent navigation" })).toBeNull();
  });

  it("matches a quote that crosses a block boundary", () => {
    const twoParas = doc(para(text("end of one")), para(text("start of two")));
    const out = anchorThread(twoParas, "t1", { exact: "one start" });
    expect(out && markedText(out)).toEqual({ t1: "onestart" });
  });
});

describe("quoteAt", () => {
  it("aligns the context with a quote that starts at a block's end", () => {
    const json = doc(para(text("alpha")), para(text("beta gamma")));
    const node = PMNode.fromJSON(schema, json);
    // From the very end of "alpha" to the end of "beta".
    const from = 1 + "alpha".length;
    const to = rangeOf(json, "beta").to;
    const quote = quoteAt(node, from, to);
    expect(quote.exact).toBe(" beta");
    expect(quote.prefix).toBe("alpha");
    expect(quote.suffix).toBe(" gamma");
    // So the context actually scores when the quote is re-found.
    const out = anchorThread(json, "t1", quote);
    expect(out && markedText(out)).toEqual({ t1: "beta" });
  });
});

describe("carryCommentMarks", () => {
  it("re-applies marks to a doc re-derived from Markdown", () => {
    const before = doc(
      para(
        text("It can change what the user is looking at ("),
        text("Agent navigation", ["t1"]),
        text(", always undoable) but never changes data."),
      ),
    );
    const after = doc(
      para(text("Edited intro.")),
      para(
        text(
          "It can change what the user is looking at (Agent navigation, always undoable) but never changes data.",
        ),
      ),
    );
    const res = carryCommentMarks(before, after);
    expect(res.carried).toEqual(["t1"]);
    expect(res.dropped).toEqual([]);
    expect(markedText(res.doc)).toEqual({ t1: "Agent navigation" });
  });

  it("drops a thread whose text was removed, keeping a distinctive phrase whose context changed", () => {
    const before = doc(
      para(text("keep this sentence", ["keep"]), text(" and "), text("lose me", ["lose"])),
    );
    const after = doc(para(text("keep this sentence, then something else")));
    const res = carryCommentMarks(before, after);
    expect(res.carried).toEqual(["keep"]);
    expect(res.dropped).toEqual(["lose"]);
    expect(markedText(res.doc)).toEqual({ keep: "keep this sentence" });
  });

  it("carries a run split across text nodes by another mark", () => {
    const before = doc(
      para(
        text("plain "),
        text("bold", ["t1"]),
        { type: "text", text: " part", marks: [{ type: "bold" }, { type: "comment", attrs: { threadId: "t1" } }] },
        text(" tail"),
      ),
    );
    const after = doc(para(text("plain bold part tail")));
    expect(markedText(carryCommentMarks(before, after).doc)).toEqual({ t1: "bold part" });
  });

  it("carries overlapping threads", () => {
    const before = doc(para(text("a "), text("shared", ["t1", "t2"]), text(" b", ["t2"])));
    const after = doc(para(text("a shared b")));
    expect(markedText(carryCommentMarks(before, after).doc)).toEqual({
      t1: "shared",
      t2: "shared b",
    });
  });

  it("orphans a short quote rather than re-pinning it to the same words elsewhere", () => {
    // The pricing line is deleted; a different "TBD" survives the rewrite.
    const before = doc(
      para(text("Pricing: "), text("TBD", ["pricing"])),
      para(text("Rollout plan: TBD by legal")),
    );
    const after = doc(para(text("Rollout plan: TBD by legal")));
    const res = carryCommentMarks(before, after);
    expect(res.carried).toEqual([]);
    expect(res.dropped).toEqual(["pricing"]);
    expect(docHasCommentMarks(res.doc)).toBe(false);
  });

  it("passes the new doc through when the old one had no marks", () => {
    const after = doc(para(text("x")));
    expect(carryCommentMarks(CLEAR, after).doc).toBe(after);
    expect(carryCommentMarks(null, after).doc).toBe(after);
  });
});

describe("docHasCommentMarks", () => {
  it("detects nested comment marks", () => {
    expect(docHasCommentMarks(CLEAR)).toBe(false);
    expect(docHasCommentMarks(doc(para(text("x", ["t1"]))))).toBe(true);
    expect(docHasCommentMarks(null)).toBe(false);
  });
});
