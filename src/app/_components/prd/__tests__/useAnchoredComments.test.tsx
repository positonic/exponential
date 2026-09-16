import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { act, renderHook } from "@testing-library/react";
import { Editor, type JSONContent } from "@tiptap/core";

import { PRD_EXTENSIONS } from "~/lib/prd/extensions";
import { CommentResolution } from "~/lib/prd/comment-resolution";
import { PendingCommentHighlight, getPendingComment } from "~/lib/prd/pending-comment";
import { collectAnchoredThreadIds } from "~/lib/prd/thread-reconciliation";
import type { AnchoredCommentsAdapter } from "../useAnchoredComments";

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

let flushSave: ReturnType<typeof vi.fn<() => Promise<void>>>;
beforeEach(() => {
  flushSave = vi.fn(async () => undefined);
});

function setup(editor: Editor, adapter: AnchoredCommentsAdapter) {
  const hook = renderHook(() =>
    useAnchoredComments({ enabled: true, editable: true, adapter }),
  );
  act(() => hook.result.current.handleReady({ editor, flushSave }));
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

  it("posting the first comment anchors the mark, then persists it", async () => {
    const editor = makeEditor();
    let markedDuringPost: string[] = [];
    const createThread = vi.fn(async () => {
      markedDuringPost = [...markedThreads(editor)];
    });
    const { panel, startComment } = setup(editor, makeAdapter({ createThread }));
    selectWord(editor, "brave");
    startComment();
    const threadId = panel().pendingThreadId!;

    await act(() => panel().onSubmit(threadId, "Why brave?"));

    expect(createThread).toHaveBeenCalledWith({
      threadId,
      body: "Why brave?",
      quotedText: "brave",
    });
    expect(markedDuringPost).toEqual([threadId]);
    expect([...markedThreads(editor)]).toEqual([threadId]);
    // Saved once, and only after the thread row exists.
    expect(flushSave).toHaveBeenCalledTimes(1);
    expect(flushSave.mock.invocationCallOrder[0]).toBeGreaterThan(
      createThread.mock.invocationCallOrder[0]!,
    );
    expect(getPendingComment(editor.state)).toBeNull();
    expect(panel().pendingThreadId).toBeNull();
  });

  it("a failed post rolls the mark back and keeps the pending thread to retry", async () => {
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
