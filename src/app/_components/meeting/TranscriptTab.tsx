"use client";

import { useMemo, useState } from "react";
import { IconSearch, IconUsers } from "@tabler/icons-react";
import { MpAvatar } from "./MpAvatar";
import { getInitial } from "~/utils/avatarColors";
import type {
  MeetingChapter,
  MeetingParticipant,
  ParticipantFlavor,
} from "~/lib/meeting-view-model";

interface Sentence {
  text: string;
  speakerName: string | null;
  startTime: number;
}

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

/** Parse the best available diarized transcript. Prefers `sentencesJson`,
 *  falls back to a Fireflies-shaped `transcription` string, else null. */
function parseSentences(transcription: string | null, sentencesJson: unknown): Sentence[] | null {
  const fromArray = (arr: unknown[]): Sentence[] | null => {
    const rows = arr
      .map((s) => {
        if (!s || typeof s !== "object") return null;
        const obj = s as Record<string, unknown>;
        const text = typeof obj.text === "string" ? obj.text : null;
        if (text === null) return null;
        const speakerName =
          typeof obj.speaker_name === "string" ? obj.speaker_name : null;
        const startTime = typeof obj.start_time === "number" ? obj.start_time : 0;
        return { text, speakerName, startTime };
      })
      .filter((r): r is Sentence => r !== null);
    return rows.length > 0 ? rows : null;
  };

  if (Array.isArray(sentencesJson)) {
    const parsed = fromArray(sentencesJson);
    if (parsed) return parsed;
  }
  if (transcription) {
    try {
      const obj: unknown = JSON.parse(transcription);
      if (obj && typeof obj === "object" && Array.isArray((obj as { sentences?: unknown }).sentences)) {
        return fromArray((obj as { sentences: unknown[] }).sentences);
      }
    } catch {
      /* not JSON — plain text */
    }
  }
  return null;
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

  const sentences = useMemo(
    () => parseSentences(transcription, sentencesJson),
    [transcription, sentencesJson],
  );

  // speaker name → identity flavor (match participants first, then rotate)
  const flavorBySpeaker = useMemo(() => {
    const map = new Map<string, ParticipantFlavor>();
    for (const p of participants) map.set(p.name, p.flavor);
    if (sentences) {
      let rotation = 0;
      const rotated: ParticipantFlavor[] = ["them", "alt"];
      for (const s of sentences) {
        const name = s.speakerName ?? "";
        if (!name || map.has(name)) continue;
        map.set(name, rotated[rotation % rotated.length]!);
        rotation += 1;
      }
    }
    return map;
  }, [participants, sentences]);

  const hostNames = useMemo(
    () => new Set(participants.filter((p) => p.flavor === "me").map((p) => p.name)),
    [participants],
  );

  // Plain-text fallback: no diarization data.
  if (!sentences) {
    if (!transcription) {
      return <div className="mp-empty">No transcript available yet.</div>;
    }
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
          {withHighlight(transcription, query)}
        </p>
      </div>
    );
  }

  const filtered = sentences.filter((s) => {
    if (onlyMe && !(s.speakerName && hostNames.has(s.speakerName))) return false;
    if (query && !s.text.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  // interleave chapter markers by start time (only when not filtering)
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
        {hostNames.size > 0 && (
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
        filtered.map((s, i) => {
          const chapterMarkers: React.ReactNode[] = [];
          if (showChapters) {
            while (
              nextChapter < sortedChapters.length &&
              s.startTime >= sortedChapters[nextChapter]!.startTime
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

          const name = s.speakerName ?? "";
          const flavor = flavorBySpeaker.get(name) ?? "them";
          return (
            <div key={`row-${i}`}>
              {chapterMarkers}
              <div className="mp-turn">
                <div className="mp-turn__gutter">
                  <span className="mp-turn__time">{formatTime(s.startTime)}</span>
                  {name && (
                    <MpAvatar
                      initial={getInitial(name)}
                      flavor={flavor}
                      className="mp-turn__avatar"
                    />
                  )}
                </div>
                <div>
                  {name && <div className={`mp-turn__name mp-turn__name--${flavor}`}>{name}</div>}
                  <p className="mp-turn__text">{withHighlight(s.text, query)}</p>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
