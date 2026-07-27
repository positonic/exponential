"use client";

import { useMemo, useState } from "react";
import { Badge, Group, Stack, Text } from "@mantine/core";
import { IconCheck, IconCopy, IconSearch, IconUsers } from "@tabler/icons-react";
import { MpAvatar } from "./MpAvatar";
import { getInitial } from "~/utils/avatarColors";
import { parseTranscript, turnsToReadableText } from "~/lib/transcript";
import type { TranscriptTurn } from "~/lib/transcript";
import type { MeetingChapter, MeetingParticipant } from "~/lib/meeting-view-model";

interface TranscriptViewProps {
  transcription: string | null;
  sentencesJson?: unknown;
  provider?: string | null;
  chapters?: MeetingChapter[];
  participants?: MeetingParticipant[];
  /** `full` (default) is the detail-page view with toolbar; `preview` is the
   *  compact meetings-list card (first N turns + "+N more", no toolbar). */
  variant?: "full" | "preview";
  /** Number of turns shown in the `preview` variant before "+N more". */
  previewCount?: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => console.error("Failed to copy transcript:", err));
  };
  return { copied, copy };
}

/** Mantine badge colour for a speaker, by order of first appearance (parity with
 *  the previous meetings-list preview). */
const PREVIEW_COLORS = [
  "blue",
  "green",
  "orange",
  "grape",
  "cyan",
  "pink",
  "yellow",
  "red",
  "indigo",
  "teal",
] as const;

function previewColorFor(speaker: string, order: string[]): string {
  const idx = order.indexOf(speaker);
  return PREVIEW_COLORS[(idx < 0 ? 0 : idx) % PREVIEW_COLORS.length]!;
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

export function TranscriptView({
  transcription,
  sentencesJson,
  provider,
  chapters = [],
  participants = [],
  variant = "full",
  previewCount = 3,
}: TranscriptViewProps) {
  const [query, setQuery] = useState("");
  const [onlyMe, setOnlyMe] = useState(false);
  const { copied, copy } = useCopyToClipboard();

  // Normalize via the canonical parser (ADR-0032): flavor and timestamps are
  // resolved in the parser, so this component is purely presentational.
  const turns = useMemo<TranscriptTurn[]>(
    () =>
      parseTranscript({
        transcription,
        sentencesJson: sentencesJson ?? null,
        provider,
        participants: participants.map((p) => ({ name: p.name, isHost: p.isHost })),
      }),
    [transcription, sentencesJson, provider, participants],
  );

  // ----- Preview variant (meetings-list cards) -----------------------------
  if (variant === "preview") {
    if (turns.length === 0) {
      return (
        <Text size="sm" c="dimmed" ta="center" py="md">
          No transcription available
        </Text>
      );
    }
    const speakerOrder = Array.from(
      new Set(turns.map((t) => t.speaker).filter((s): s is string => s !== null)),
    );
    const shown = turns.slice(0, previewCount);
    const remaining = turns.length - shown.length;
    return (
      <Stack gap="xs">
        {shown.map((turn, i) =>
          turn.speaker ? (
            <Group key={i} gap="xs" wrap="nowrap">
              <Badge size="xs" variant="light" color={previewColorFor(turn.speaker, speakerOrder)}>
                {turn.speaker}
              </Badge>
              <Text size="sm" c="dimmed" lineClamp={1}>
                {turn.text}
              </Text>
            </Group>
          ) : (
            <Text key={i} size="sm" c="dimmed" lineClamp={previewCount}>
              {turn.text}
            </Text>
          ),
        )}
        {remaining > 0 && (
          <Text size="xs" c="dimmed" fs="italic">
            +{remaining} more messages...
          </Text>
        )}
      </Stack>
    );
  }

  // ----- Full variant (detail page) ----------------------------------------
  const hasMe = turns.some((t) => t.flavor === "me");

  if (turns.length === 0) {
    return <div className="mp-empty">No transcript available yet.</div>;
  }

  const copyAllBtn = (
    <button
      className="mp-tr__filter"
      onClick={() => copy(turnsToReadableText(turns))}
      title="Copy the full transcript"
    >
      {copied ? <IconCheck size={12} /> : <IconCopy size={12} />} Copy all
    </button>
  );

  // Speaker-less fallback: a single unstructured block. Render it plainly (no
  // avatar/name, newlines preserved) with search.
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
          {copyAllBtn}
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
        {copyAllBtn}
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
