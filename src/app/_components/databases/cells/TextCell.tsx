"use client";

import { useEffect, useRef, useState } from "react";
import type { PropertyDef } from "~/lib/databases/schema";
import styles from "../DatabaseBlock.module.css";

interface TextCellProps {
  def: PropertyDef;
  /** The stored value; the title cell passes the row title. */
  value: string | number | null | undefined;
  /** Shown while not editing (already formatted for display). */
  display: string;
  editing: boolean;
  /** What the person typed to start editing, if a keystroke opened the cell. */
  initial?: string;
  onCommit: (next: string | null) => void;
  onCancel: () => void;
}

/**
 * The inline editor for `title`, `text`, `number` and `url` cells: a bare
 * input in place of the value, committed on Enter or blur, abandoned on
 * Escape. An empty commit clears the cell. The server does the typing —
 * a number cell sends what was typed and a bad value is refused naming the
 * property — so the input stays a plain text field.
 */
export function TextCell({ def, value, display, editing, initial, onCommit, onCancel }: TextCellProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // The commit that already happened on Enter must not fire again on the
  // blur that follows the input unmounting.
  const settledRef = useRef(false);

  useEffect(() => {
    if (!editing) return;
    settledRef.current = false;
    setDraft(initial ?? (value === null || value === undefined ? "" : String(value)));
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      if (initial === undefined) inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [editing, initial, value]);

  if (!editing) {
    if (def.type === "url" && typeof value === "string" && value) {
      return (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className={styles.urlLink}
          onClick={(e) => e.stopPropagation()}
        >
          {display}
        </a>
      );
    }
    return <span className={styles.cellText}>{display}</span>;
  }

  const settle = (commit: boolean) => {
    if (settledRef.current) return;
    settledRef.current = true;
    if (!commit) {
      onCancel();
      return;
    }
    const trimmed = draft.trim();
    const current = value === null || value === undefined ? "" : String(value);
    if (trimmed === current) {
      onCancel();
      return;
    }
    onCommit(trimmed === "" ? null : trimmed);
  };

  return (
    <input
      ref={inputRef}
      className={styles.cellInput}
      value={draft}
      inputMode={def.type === "number" ? "decimal" : def.type === "url" ? "url" : "text"}
      aria-label={def.name}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => settle(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          settle(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          settle(false);
        } else if (e.key === "Tab") {
          // Commit, then let the key move focus to the next cell.
          settle(true);
        }
        e.stopPropagation();
      }}
    />
  );
}
