"use client";

import { useMemo, useState } from "react";
import { IconSearch, IconUsers } from "@tabler/icons-react";
import { MpAvatar } from "./MpAvatar";
import { getInitial } from "~/utils/avatarColors";
import { parseTranscript } from "~/lib/transcript";
import type { TranscriptTurn } from "~/lib/transcript";
import type { MeetingChapter, MeetingParticipant } from "~/lib/meeting-view-model";

interface TranscriptTabProps {
  transcription: string | null;
  sentencesJson: unknown;
  chapters: MeetingChapter[];
  participants: MeetingParticipant[];
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function withHighlight(text: string, query: string) {
  if (!query) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const idx = lower.indexOf(q, i);
    if (idx === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(<mark key={key++}>{text.slice(idx, idx + q.length)}</mark>);
    i = idx + q.length;
  }
  return parts;
}

export function TranscriptTab({
  transcription,
  sentencesJson,
  chapters,
  participants,
}: TranscriptTabProps) {
  const [query, setQuery] = useState("");
  const [onlyMe, setOnlyMe] = useState(false);

  // Normalize via the canonical parser (ADR-0032): flavor and timestamps are
  // resolved in the parser, so this component is purely presentational.
  const turns = useMemo<TranscriptTurn[]>(
    () =>
      parseTranscript({
        transcription,
        sentencesJson,
        participants: participants.map((p) => ({
          name: p.name,
          isHost: p.isHost,
        })),
      }),
    [transcription, sentencesJson, participants],
  );

  const hasMe = useMemo(() => turns.some((t) => t.flavor === "me"), [turns]);

  if (turns.length === 0) {
    return <div className="mp-empty">No transcript available yet.</div>;
  }

  // Speaker-less fallback: a single unstructured block. Render it plainly (no
  // avatar/name, newlines preserved) with search, as before.
  const isPlainFallback = turns.length === 1 && turns[0]!.speaker === null;
  if (isPlainFallback) {
    return (
      <div>
        <div className="mp-tr__toolbar">
          <div className="mp-tr__search">
            <IconSearch size={14} />
            <input
              placeholder="Search the transcript"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
            />
          </div>
        </div>
        <p className="mp-turn__text" style={{ whiteSpace: "pre-wrap" }}>
          {withHighlight(turns[0]!.text, query)}
        </p>
      </div>
    );
  }

  const filtered = turns.filter((t) => {
    if (onlyMe && t.flavor !== "me") return false;
    if (query && !t.text.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  // interleave chapter markers by start time (only when not filtering, and only
  // for timestamped transcripts — plain-text pastes have no times or chapters)
  const sortedChapters = [...chapters].sort((a, b) => a.startTime - b.startTime);
  const showChapters = !query && !onlyMe && sortedChapters.length > 0;
  let nextChapter = 0;

  return (
    <div>
      <div className="mp-tr__toolbar">
        <div className="mp-tr__search">
          <IconSearch size={14} />
          <input
            placeholder="Search the transcript"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
          />
        </div>
        {hasMe && (
          <button
            className={`mp-tr__filter ${onlyMe ? "on" : ""}`}
            onClick={() => setOnlyMe((v) => !v)}
          >
            <IconUsers size={12} /> Only me
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="mp-empty">No matching transcript lines.</div>
      ) : (
        filtered.map((turn, i) => {
          const chapterMarkers: React.ReactNode[] = [];
          if (showChapters && turn.startTime !== null) {
            while (
              nextChapter < sortedChapters.length &&
              turn.startTime >= sortedChapters[nextChapter]!.startTime
            ) {
              const ch = sortedChapters[nextChapter]!;
              chapterMarkers.push(
                <div key={`ch-${nextChapter}`} className="mp-chapter">
                  <span className="mp-chapter__label">{ch.title}</span>
                  <span className="mp-chapter__line" />
                  <span className="mp-chapter__time">{formatTime(ch.startTime)}</span>
                </div>,
              );
              nextChapter += 1;
            }
          }

          const name = turn.speaker ?? "";
          const flavor = turn.flavor ?? "them";
          return (
            <div key={`row-${i}`}>
              {chapterMarkers}
              <div className="mp-turn">
                <div className="mp-turn__gutter">
                  {turn.startTime !== null && (
                    <span className="mp-turn__time">{formatTime(turn.startTime)}</span>
                  )}
                  {name && (
                    <MpAvatar
                      initial={getInitial(name)}
                      flavor={flavor}
                      className="mp-turn__avatar"
                    />
                  )}
                </div>
                <div>
                  {name && (
                    <div className={`mp-turn__name mp-turn__name--${flavor}`}>{name}</div>
                  )}
                  <p className="mp-turn__text">{withHighlight(turn.text, query)}</p>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
