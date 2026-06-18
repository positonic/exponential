import { Mark, mergeAttributes } from "@tiptap/core";

/**
 * Inline mark that anchors a {@link FeatureComment} thread to a span of the PRD
 * body. The mark carries only a `threadId`; the comment content lives in the
 * `FeatureComment` table (ADR-0024). Because the mark is part of the
 * ProseMirror document, ProseMirror position mapping keeps the highlight glued
 * to the marked words as the document is edited.
 *
 * The visual highlight + click-to-open behaviour is layered on in later slices;
 * here we only need the schema (so the codec can round-trip documents that
 * contain comment marks) and the guarantee that the mark **drops cleanly from
 * the Markdown projection** — comment marks are a view concern with no Markdown
 * form (ADR-0024 §5).
 */
export interface CommentMarkOptions {
  HTMLAttributes: Record<string, unknown>;
}

export const COMMENT_HIGHLIGHT_CLASS = "prd-comment-highlight";

export const CommentMark = Mark.create<CommentMarkOptions>({
  name: "comment",

  // Multiple overlapping threads may cover the same text.
  excludes: "",
  inclusive: false,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      threadId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-comment-thread"),
        renderHTML: (attributes) => {
          const threadId = attributes.threadId as string | null;
          if (!threadId) return {};
          return { "data-comment-thread": threadId };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-comment-thread]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: COMMENT_HIGHLIGHT_CLASS,
      }),
      0,
    ];
  },

  /**
   * tiptap-markdown reads `extension.storage.markdown`. Empty open/close means
   * the mark contributes nothing to the Markdown output — the text passes
   * through unwrapped, so comment marks vanish from the projection while the
   * canonical JSON keeps them.
   */
  addStorage() {
    return {
      markdown: {
        serialize: { open: "", close: "", mixable: true },
        parse: {},
      },
    };
  },
});
