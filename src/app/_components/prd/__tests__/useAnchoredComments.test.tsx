import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { act, renderHook } from "@testing-library/react";
import { Editor, type JSONContent } from "@tiptap/core";

import { PRD_EXTENSIONS } from "~/lib/prd/extensions";
import { CommentResolution } from "~/lib/prd/comment-resolution";
import { PendingCommentHighlight, getPendingComment } from "~/lib/prd/pending-comment";
import { collectAnchoredThreadIds } from "~/lib/prd/thread-reconciliation";
import type { AnchoredCommentsAdapter } from "../useAnchoredComments";
import type { FeatureCommentRow, PanelThread } from "../PrdCommentsPanel";

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null }) }));
vi.mock("~/hooks/useWorkspaceMentionCandidates", () => ({
  useWorkspaceMentionCandidates: () => [],
}));
vi.mock("@mantine/notifications", () => ({ notifications: { show: vi.fn() } }));
vi.mock("@mantine/tiptap", () => ({ RichTextEditor: { Control: () => null } }));
// The hook returns these as elements; the tests drive their callbacks directly.
vi.mock("~/app/_components/prd/PrdCommentsPanel", () => ({ PrdCommentsPanel: () => null }));
vi.mock("~/app/_components/prd/PrdThreadPopover", () => ({ PrdThreadPopover: () => null }));

const { useAnchoredComments } = await import("../useAnchoredComments");

interface PanelProps {
  threads: PanelThread[];
  pendingThreadId: string | null;
  onSelect: (threadId: string) => void;
  onSubmit: (threadId: string, body: string) => Promise<void>;
}

const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
});

function makeEditor(content: string | JSONContent = "<p>Hello brave new world</p>") {
  const editor = new Editor({
    extensions: [...PRD_EXTENSIONS, CommentResolution, PendingCommentHighlight],
    content,
  });
  editors.push(editor);
  return editor;
}

function selectWord(editor: Editor, word: string) {
  let range: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (range || !node.isText || !node.text) return undefined;
    const i = node.text.indexOf(word);
    if (i >= 0) range = { from: pos + i, to: pos + i + word.length };
    return undefined;
  });
  if (!range) throw new Error(`"${word}" not in doc`);
  editor.commands.setTextSelection(range);
}

function makeAdapter(over: Partial<AnchoredCommentsAdapter> = {}): AnchoredCommentsAdapter {
  return {
    comments: [],
    createThread: vi.fn(async () => undefined),
    reply: vi.fn(async () => undefined),
    editComment: vi.fn(async () => undefined),
    deleteComment: vi.fn(async () => undefined),
    resolveThread: vi.fn(async () => undefined),
    unresolveThread: vi.fn(async () => undefined),
    isSubmitting: false,
    ...over,
  };
}

/** The doc version the editor's next save would send as its base. */
const BASE_VERSION = 3;

let flushSave: ReturnType<typeof vi.fn<() => Promise<void>>>;
let fastForward: ReturnType<typeof vi.fn<(from: number, next: number) => void>>;
beforeEach(() => {
  flushSave = vi.fn(async () => undefined);
  fastForward = vi.fn();
});

function setup(editor: Editor, adapter: AnchoredCommentsAdapter) {
  const hook = renderHook(() =>
    useAnchoredComments({ enabled: true, editable: true, adapter }),
  );
  act(() =>
    hook.result.current.handleReady({
      editor,
      flushSave,
      baseVersion: () => BASE_VERSION,
      fastForward,
    }),
  );
  const panel = () => (hook.result.current.panel as ReactElement<PanelProps>).props;
  const startComment = () =>
    act(() => {
      (hook.result.current.bubbleExtras as ReactElement<{ onClick: () => void }>).props.onClick();
    });
  return { hook, panel, startComment };
}

const markedThreads = (editor: Editor) => collectAnchoredThreadIds(editor.getJSON());

describe("useAnchoredComments — pending threads", () => {
  it("starting a comment neither marks nor saves the document", () => {
    const editor = makeEditor();
    const { panel, startComment } = setup(editor, makeAdapter());
    selectWord(editor, "brave");

    startComment();

    const threadId = panel().pendingThreadId;
    expect(threadId).toBeTruthy();
    expect(getPendingComment(editor.state)?.threadId).toBe(threadId);
    // Nothing a reload could turn into an orphaned highlight.
    expect(markedThreads(editor).size).toBe(0);
    expect(flushSave).not.toHaveBeenCalled();
  });

  it("leaves no highlight behind when the page goes away before posting", () => {
    const editor = makeEditor();
    const { hook, startComment } = setup(editor, makeAdapter());
    selectWord(editor, "brave");
    startComment();

    hook.unmount();

    expect(markedThreads(editor).size).toBe(0);
    expect(flushSave).not.toHaveBeenCalled();
  });

  it("posting the first comment sends the anchor to the server, then mirrors the mark", async () => {
    const editor = makeEditor();
    let markedDuringPost: string[] = [];
    const createThread = vi.fn(async () => {
      markedDuringPost = [...markedThreads(editor)];
      return { anchored: true, docVersion: BASE_VERSION + 1, fastForward: true };
    });
    const { panel, startComment } = setup(editor, makeAdapter({ createThread }));
    selectWord(editor, "brave");
    const { from, to } = editor.state.selection;
    startComment();
    const threadId = panel().pendingThreadId!;

    await act(() => panel().onSubmit(threadId, "Why brave?"));

    expect(createThread).toHaveBeenCalledWith({
      threadId,
      body: "Why brave?",
      quotedText: "brave",
      anchor: { baseVersion: BASE_VERSION, from, to, prefix: "Hello ", suffix: " new world" },
    });
    // The server pins the mark; the editor only mirrors it once the post is in.
    expect(markedDuringPost).toEqual([]);
    expect([...markedThreads(editor)]).toEqual([threadId]);
    // Edits are flushed before the post (so its positions match the store),
    // and the mirrored mark is saved after it.
    expect(flushSave).toHaveBeenCalledTimes(2);
    const [before, after] = flushSave.mock.invocationCallOrder;
    expect(before).toBeLessThan(createThread.mock.invocationCallOrder[0]!);
    expect(after).toBeGreaterThan(createThread.mock.invocationCallOrder[0]!);
    // The server wrote on top of this tab's base, so the tab adopts its version.
    expect(fastForward).toHaveBeenCalledWith(BASE_VERSION, BASE_VERSION + 1);
    expect(getPendingComment(editor.state)).toBeNull();
    expect(panel().pendingThreadId).toBeNull();
  });

  it("keeps its base when someone else changed the doc before the server anchored", async () => {
    const editor = makeEditor();
    const createThread = vi.fn(async () => ({
      anchored: true,
      docVersion: BASE_VERSION + 2,
      fastForward: false,
    }));
    const { panel, startComment } = setup(editor, makeAdapter({ createThread }));
    selectWord(editor, "brave");
    startComment();

    await act(() => panel().onSubmit(panel().pendingThreadId!, "Why brave?"));

    expect(fastForward).not.toHaveBeenCalled();
  });

  it("shows the thread as anchored, not orphaned, while its post lands", async () => {
    const editor = makeEditor();
    const adapter = makeAdapter();
    const { hook, panel, startComment } = setup(editor, adapter);
    selectWord(editor, "brave");
    startComment();
    const threadId = panel().pendingThreadId!;
    let statusDuringPost: string | undefined;
    adapter.createThread = vi.fn(async () => {
      // The host refreshes its comment rows before resolving (adapter contract).
      adapter.comments = [
        {
          id: "c1",
          threadId,
          parentId: null,
          quotedText: "brave",
          resolvedAt: null,
          body: "Why brave?",
          createdAt: new Date(),
          createdBy: { id: "u1", name: "U", image: null },
        } satisfies FeatureCommentRow,
      ];
      hook.rerender();
      statusDuringPost = panel().threads.find((t) => t.threadId === threadId)?.status;
      return { anchored: true, docVersion: BASE_VERSION + 1, fastForward: true };
    });

    await act(() => panel().onSubmit(threadId, "Why brave?"));

    expect(statusDuringPost).toBe("anchored");
    expect(panel().threads.find((t) => t.threadId === threadId)?.status).toBe("anchored");
  });

  it("a failed post leaves no mark and keeps the pending thread to retry", async () => {
    const editor = makeEditor();
    const createThread = vi.fn(async () => {
      throw new Error("network down");
    });
    const { panel, startComment } = setup(editor, makeAdapter({ createThread }));
    selectWord(editor, "brave");
    startComment();
    const threadId = panel().pendingThreadId!;

    await act(async () => {
      await expect(panel().onSubmit(threadId, "Why brave?")).rejects.toThrow("network down");
    });

    expect(markedThreads(editor).size).toBe(0);
    expect(getPendingComment(editor.state)?.threadId).toBe(threadId);
    expect(panel().pendingThreadId).toBe(threadId);
  });

  it("switching to another thread discards the pending one without saving", () => {
    const editor = makeEditor();
    const { panel, startComment } = setup(editor, makeAdapter());
    selectWord(editor, "brave");
    startComment();

    act(() => panel().onSelect("some-other-thread"));

    expect(getPendingComment(editor.state)).toBeNull();
    expect(panel().pendingThreadId).toBeNull();
    expect(markedThreads(editor).size).toBe(0);
    expect(flushSave).not.toHaveBeenCalled();
  });
});

describe("useAnchoredComments — highlight with no comment rows", () => {
  it("snapshots the marked text as quotedText when its first comment posts", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello " },
            {
              type: "text",
              text: "old highlight",
              marks: [{ type: "comment", attrs: { threadId: "t-old" } }],
            },
          ],
        },
      ],
    });
    const adapter = makeAdapter();
    const { panel } = setup(editor, adapter);

    await act(() => panel().onSubmit("t-old", "Finally a comment"));

    expect(adapter.createThread).toHaveBeenCalledWith({
      threadId: "t-old",
      body: "Finally a comment",
      quotedText: "old highlight",
    });
  });
});
