import { describe, it, expect } from "vitest";
import type { JSONContent } from "@tiptap/core";

import {
  reconcileThreads,
  collectAnchoredThreadIds,
  type ReconcilableComment,
} from "../thread-reconciliation";

function comment(
  over: Partial<ReconcilableComment> & { id: string; threadId: string | null },
): ReconcilableComment {
  return {
    parentId: null,
    quotedText: null,
    resolvedAt: null,
    ...over,
  };
}

/** A doc with `text` carrying a comment mark for `threadId`. */
function docWithThread(threadId: string, text = "anchored"): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "before " },
          {
            type: "text",
            text,
            marks: [{ type: "comment", attrs: { threadId } }],
          },
        ],
      },
    ],
  };
}

describe("collectAnchoredThreadIds", () => {
  it("finds threadIds on comment marks, nested anywhere", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "x",
                      marks: [{ type: "comment", attrs: { threadId: "t1" } }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(collectAnchoredThreadIds(doc)).toEqual(new Set(["t1"]));
  });

  it("returns empty for null/empty docs", () => {
    expect(collectAnchoredThreadIds(null)).toEqual(new Set());
    expect(collectAnchoredThreadIds({ type: "doc", content: [] })).toEqual(
      new Set(),
    );
  });
});

describe("reconcileThreads", () => {
  it("marks a thread anchored when its mark is present", () => {
    const doc = docWithThread("t1");
    const comments = [comment({ id: "c1", threadId: "t1", quotedText: "anchored" })];
    const [thread] = reconcileThreads(doc, comments);
    expect(thread?.status).toBe("anchored");
    expect(thread?.anchored).toBe(true);
  });

  it("marks a thread orphaned (and surfaces quotedText) when the mark is gone", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "edited away" }] }],
    };
    const comments = [
      comment({ id: "c1", threadId: "t1", quotedText: "the original words" }),
    ];
    const [thread] = reconcileThreads(doc, comments);
    expect(thread?.status).toBe("orphaned");
    expect(thread?.anchored).toBe(false);
    expect(thread?.quotedText).toBe("the original words");
  });

  it("classifies multiple threads in one doc independently", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "still here",
              marks: [{ type: "comment", attrs: { threadId: "t1" } }],
            },
            { type: "text", text: " and gone" },
          ],
        },
      ],
    };
    const comments = [
      comment({ id: "a", threadId: "t1" }),
      comment({ id: "b", threadId: "t2", quotedText: "deleted span" }),
    ];
    const byId = Object.fromEntries(
      reconcileThreads(doc, comments).map((t) => [t.threadId, t.status]),
    );
    expect(byId.t1).toBe("anchored");
    expect(byId.t2).toBe("orphaned");
  });

  it("groups replies under their thread and picks the parentless root", () => {
    const doc = docWithThread("t1");
    const comments = [
      comment({ id: "root", threadId: "t1", quotedText: "anchored" }),
      comment({ id: "reply", threadId: "t1", parentId: "root" }),
    ];
    const [thread] = reconcileThreads(doc, comments);
    expect(thread?.comments).toHaveLength(2);
    expect(thread?.root.id).toBe("root");
  });

  it("treats a resolved root as resolved regardless of anchoring", () => {
    const doc = docWithThread("t1");
    const comments = [
      comment({
        id: "root",
        threadId: "t1",
        resolvedAt: new Date("2026-06-18T00:00:00Z"),
      }),
    ];
    const [thread] = reconcileThreads(doc, comments);
    expect(thread?.status).toBe("resolved");
  });

  it("treats a resolved thread as resolved even when its anchor was deleted", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "gone" }] }],
    };
    const comments = [
      comment({
        id: "root",
        threadId: "t1",
        quotedText: "deleted span",
        resolvedAt: new Date("2026-06-18T00:00:00Z"),
      }),
    ];
    const [thread] = reconcileThreads(doc, comments);
    expect(thread?.status).toBe("resolved");
    expect(thread?.anchored).toBe(false);
  });

  it("ignores doc-level (null threadId) comments", () => {
    const threads = reconcileThreads(docWithThread("t1"), [
      comment({ id: "c1", threadId: null }),
    ]);
    expect(threads).toHaveLength(0);
  });
});
