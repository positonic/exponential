import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown } from "tiptap-markdown";
import { CommentMark } from "./comment-mark";

/**
 * The schema for the **PRD body** — the single scoped exception to ADR-0017
 * where prose is a node-addressable ProseMirror document rather than a Markdown
 * string (ADR-0024). This same extension set is used in three places, so it
 * lives in one shared module:
 *
 *  - the read-only renderer on the Feature detail page,
 *  - the live "Tier B" editor (later slice), and
 *  - the pure {@link ./codec} (Markdown ⇄ ProseMirror JSON).
 *
 * Keeping a single source of truth guarantees the editor and the codec agree on
 * the schema, so a document the editor produces always round-trips through the
 * projection.
 *
 * Capability is deliberately "Tier B / Linear-grade": headings, lists, task
 * lists, code blocks, links, inline marks, and anchored comment marks. Every
 * node/mark here is serialisable by tiptap-markdown except {@link CommentMark},
 * which intentionally drops from the Markdown projection.
 */
export const PRD_DEFAULT_PLACEHOLDER =
  "Write the PRD… select text to format or comment, or type / for blocks.";

export function buildPrdExtensions(
  options: { placeholder?: string } = {},
): Extensions {
  return [
    StarterKit.configure({
      // StarterKit ships a basic codeBlock; keep it (tiptap-markdown serialises
      // it). Everything else in StarterKit is used as-is.
    }),
    Link.configure({
      openOnClick: true,
      autolink: true,
      HTMLAttributes: {
        class: "text-brand-primary underline cursor-pointer",
        rel: "noopener noreferrer nofollow",
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    CommentMark,
    Placeholder.configure({
      placeholder: options.placeholder ?? PRD_DEFAULT_PLACEHOLDER,
    }),
    // Must come last so it can read the other extensions' markdown specs.
    Markdown.configure({
      html: true,
      tightLists: true,
      linkify: true,
      breaks: false,
      transformPastedText: true,
      transformCopiedText: true,
    }),
  ];
}

/** Extension set used by the headless codec (placeholder is irrelevant there). */
export const PRD_EXTENSIONS: Extensions = buildPrdExtensions();
