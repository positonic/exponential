"use client";

import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";

interface OutlineHeading {
  level: number;
  text: string;
  pos: number;
}

/** Bar width per heading level — the collapsed outline reads like a tiny
 * indented contents list. */
const BAR_WIDTH: Record<number, number> = { 1: 20, 2: 14, 3: 10 };

/**
 * The floating page outline: one short bar per heading at the viewport's
 * right edge, expanding on hover into the heading list. Reads headings off
 * the live editor so it tracks edits, and jumps by scrolling the heading's
 * DOM node (its `scroll-margin-top` keeps it clear of the sticky page bar).
 */
export function PageOutline({ editor }: { editor: Editor | null }) {
  const [headings, setHeadings] = useState<OutlineHeading[]>([]);

  useEffect(() => {
    if (!editor) return;
    const collect = () => {
      const next: OutlineHeading[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading") {
          next.push({
            level: Number(node.attrs.level ?? 1),
            text: node.textContent,
            pos,
          });
          return false;
        }
        return true;
      });
      setHeadings(next);
    };
    collect();
    editor.on("update", collect);
    return () => {
      editor.off("update", collect);
    };
  }, [editor]);

  if (!editor || headings.length === 0) return null;

  const jump = (pos: number) => {
    const dom = editor.view.nodeDOM(pos);
    if (dom instanceof HTMLElement) {
      dom.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <nav
      aria-label="Page outline"
      className="group fixed right-5 top-40 z-10 hidden xl:block"
      data-testid="page-outline"
    >
      <div className="flex flex-col items-end gap-2 py-1 group-hover:invisible">
        {headings.map((h) => (
          <span
            key={h.pos}
            className="h-0.5 rounded-full bg-text-muted opacity-60"
            style={{ width: BAR_WIDTH[h.level] ?? 8 }}
          />
        ))}
      </div>
      <ul className="invisible absolute right-0 top-0 w-60 rounded-md border border-border-primary bg-background-elevated py-2 shadow-md group-hover:visible">
        {headings.map((h) => (
          <li key={h.pos}>
            <button
              type="button"
              className="block w-full truncate px-3 py-1 text-left text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              style={{ paddingLeft: 12 + (h.level - 1) * 12 }}
              onClick={() => jump(h.pos)}
            >
              {h.text || "Untitled"}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
