"use client";

import { TextInput } from "@mantine/core";
import { IconSearch, IconUser } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Chapter, ParsedTurn } from "./helpers";
import { initialsOf } from "./helpers";

interface TranscriptPaneProps {
  turns: ParsedTurn[];
  chapters: Chapter[];
  /** Display name used by the "Only mine" filter chip (e.g. the current user) */
  meName: string | null;
  /** Set by parent when a Key Moment is clicked. Cleared after the flash. */
  jumpToSeconds: number | null;
  onJumpHandled: () => void;
}

export function TranscriptPane({
  turns,
  chapters,
  meName,
  jumpToSeconds,
  onJumpHandled,
}: TranscriptPaneProps) {
  const [search, setSearch] = useState("");
  const [filterMine, setFilterMine] = useState(false);
  const turnRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Build a flat sequence interleaving chapters and turns by startSeconds.
  const items = useMemo(() => {
    type Item =
      | { kind: "chapter"; key: string; startSeconds: number; chapter: Chapter }
      | { kind: "turn"; key: string; startSeconds: number; turn: ParsedTurn };

    const list: Item[] = [];
    for (const c of chapters) {
      list.push({ kind: "chapter", key: `c-${c.startSeconds}`, startSeconds: c.startSeconds, chapter: c });
    }
    for (const t of turns) {
      list.push({ kind: "turn", key: t.id, startSeconds: t.startSeconds, turn: t });
    }
    list.sort((a, b) => a.startSeconds - b.startSeconds);
    return list;
  }, [chapters, turns]);

  // Jump-to-timestamp scrolls the closest turn into view and flashes it.
  useEffect(() => {
    if (jumpToSeconds === null) return;
    // Find the nearest turn at or after the requested time.
    let target: ParsedTurn | null = null;
    for (const t of turns) {
      if (t.startSeconds >= jumpToSeconds) {
        target = t;
        break;
      }
    }
    if (!target && turns.length > 0) target = turns[turns.length - 1] ?? null;
    if (!target) {
      onJumpHandled();
      return;
    }
    const el = turnRefs.current[target.id];
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.add("is-flash");
      const id = window.setTimeout(() => {
        el.classList.remove("is-flash");
        onJumpHandled();
      }, 1200);
      return () => window.clearTimeout(id);
    }
    onJumpHandled();
  }, [jumpToSeconds, turns, onJumpHandled]);

  const meKey = meName?.toLowerCase().trim();
  const term = search.trim().toLowerCase();
  const speakerMatchesMe = (speaker: string) =>
    meKey && speaker.toLowerCase().includes(meKey);

  return (
    <div className="mdm-pane">
      <div className="mdm-transcript">
        <div className="mdm-transcript__toolbar">
          <TextInput
            leftSection={<IconSearch size={14} />}
            placeholder="Search the transcript"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            className="flex-1"
            size="xs"
          />
          {meKey && (
            <button
              type="button"
              onClick={() => setFilterMine((v) => !v)}
              className="mdm-rail__quick-btn"
              style={{
                width: "auto",
                padding: "6px 10px",
                color: filterMine
                  ? "var(--accent-meetings)"
                  : "var(--color-text-secondary)",
                borderColor: filterMine
                  ? "rgba(167, 139, 250, 0.25)"
                  : "var(--color-border-subtle)",
                background: filterMine
                  ? "rgba(167, 139, 250, 0.10)"
                  : "transparent",
              }}
            >
              <IconUser size={12} />
              Only {meName}
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <p className="text-text-muted text-sm italic py-4">
            No transcript captured for this meeting.
          </p>
        ) : (
          items.map((item) => {
            if (item.kind === "chapter") {
              return (
                <div key={item.key} className="mdm-chapter">
                  <span className="mdm-chapter__label">{item.chapter.title}</span>
                  <span className="mdm-chapter__line" />
                  <span className="mdm-chapter__time">{item.chapter.time}</span>
                </div>
              );
            }
            const t = item.turn;
            if (filterMine && !speakerMatchesMe(t.speaker)) return null;
            if (term && !t.text.toLowerCase().includes(term)) return null;
            const isMe = speakerMatchesMe(t.speaker) ?? false;
            return (
              <div
                key={t.id}
                ref={(el) => {
                  turnRefs.current[t.id] = el;
                }}
                className="mdm-turn"
              >
                <div className="mdm-turn__gutter">
                  {t.time && <span className="mdm-turn__time">{t.time}</span>}
                  <div
                    className={`mdm-turn__avatar mdm-turn__avatar--${isMe ? "me" : "them"}`}
                  >
                    {initialsOf(t.speaker)}
                  </div>
                </div>
                <div className="min-w-0">
                  <div
                    className={`mdm-turn__name mdm-turn__name--${isMe ? "me" : "them"}`}
                  >
                    {t.speaker}
                  </div>
                  <p className="mdm-turn__text">{renderText(t.text, term)}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/**
 * Render text with case-insensitive matches wrapped in <mark>. Splits on the
 * literal term so we don't have to compile a regex per render.
 */
function renderText(text: string, term: string): React.ReactNode {
  if (!term) return text;
  const lower = text.toLowerCase();
  const out: React.ReactNode[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const idx = lower.indexOf(term, cursor);
    if (idx === -1) {
      out.push(text.slice(cursor));
      break;
    }
    if (idx > cursor) out.push(text.slice(cursor, idx));
    out.push(<mark key={`${idx}`}>{text.slice(idx, idx + term.length)}</mark>);
    cursor = idx + term.length;
  }
  return out;
}
