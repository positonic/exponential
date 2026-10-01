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
import { createSaveQueue } from "~/lib/prd/save-queue";

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

/** The doc version the editor's next save starts from. */
const BASE_VERSION = 3;

/**
 * A stand-in for RichDocEditor's save machinery: a real save queue, a version
 * base the fake server advances, and a log of the base each save went out on.
 * Like the real editor, a save with nothing changed since the last one is a
 * no-op.
 */
let version: number;
let savedAt: number[];
let currentEditor: Editor | null;
let lastSaved: string | null;
let flushSave: ReturnType<typeof vi.fn<() => Promise<void>>>;
let fastForward: ReturnType<typeof vi.fn<(from: number, next: number) => void>>;
let runExclusive: <T>(fn: () => Promise<T>) => Promise<T>;
beforeEach(() => {
  version = BASE_VERSION;
  savedAt = [];
  currentEditor = null;
  lastSaved = null;
  const queue = createSaveQueue(async () => {
    const json = JSON.stringify(currentEditor?.getJSON());
    if (json === lastSaved) return;
    lastSaved = json;
    savedAt.push(version);
    version++;
  });
  flushSave = vi.fn(() => queue.request());
  fastForward = vi.fn((from: number, next: number) => {
    if (version === from) version = next;
  });
  runExclusive = (fn) => {
    void queue.request();
    return queue.exclusive(fn);
  };
});

function setup(editor: Editor, adapter: AnchoredCommentsAdapter) {
  currentEditor = editor;
  lastSaved = JSON.stringify(editor.getJSON());
  const hook = renderHook(() =>
    useAnchoredComments({ enabled: true, editable: true, adapter }),
  );
  act(() =>
    hook.result.current.handleReady({
      editor,
      flushSave,
      baseVersion: () => version,
      fastForward,
      runExclusive,
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
    // The server wrote on top of this tab's base, so the tab adopts its
    // version, and the mirrored mark saves on top of that — no conflict.
    expect(fastForward).toHaveBeenCalledWith(BASE_VERSION, BASE_VERSION + 1);
    expect(flushSave).toHaveBeenCalledTimes(1);
    await act(() => flushSave());
    expect(savedAt).toEqual([BASE_VERSION + 1]);
    expect(getPendingComment(editor.state)).toBeNull();
    expect(panel().pendingThreadId).toBeNull();
  });

  it("an edit saved during the post goes out after it, on the adopted version", async () => {
    const editor = makeEditor();
    const createThread = vi.fn(async () => {
      // The user types meanwhile, and that edit's save fires mid-post.
      editor.commands.insertContentAt(editor.state.doc.content.size - 1, "!");
      void flushSave();
      await Promise.resolve();
      // The server's anchor write made v4 on top of the tab's v3.
      return { anchored: true, docVersion: BASE_VERSION + 1, fastForward: true };
    });
    const { panel, startComment } = setup(editor, makeAdapter({ createThread }));
    selectWord(editor, "brave");
    startComment();

    await act(() => panel().onSubmit(panel().pendingThreadId!, "Why brave?"));
    await act(() => flushSave());

    // Held back until the post settled, the edit saved on the adopted v4 —
    // never on the stale v3 the server had already moved past.
    expect(savedAt.length).toBeGreaterThan(0);
    expect(savedAt).not.toContain(BASE_VERSION);
    expect(savedAt[0]).toBe(BASE_VERSION + 1);
  });

  it("keeps its base, and doesn't force a doomed save, when someone else changed the doc first", async () => {
    const editor = makeEditor();
    const createThread = vi.fn(async () => ({
      anchored: true,
      docVersion: BASE_VERSION + 5,
      fastForward: false,
    }));
    const { panel, startComment } = setup(editor, makeAdapter({ createThread }));
    selectWord(editor, "brave");
    startComment();
    const threadId = panel().pendingThreadId!;

    await act(() => panel().onSubmit(threadId, "Why brave?"));

    expect(fastForward).not.toHaveBeenCalled();
    // The highlight still shows locally, but no save is pushed into a conflict.
    expect([...markedThreads(editor)]).toEqual([threadId]);
    expect(flushSave).not.toHaveBeenCalled();
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
