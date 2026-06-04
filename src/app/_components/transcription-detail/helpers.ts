import type { FirefliesSummary } from "~/server/services/FirefliesService";

export interface FirefliesSentence {
  text: string;
  speaker_name: string;
  start_time: number;
  end_time: number;
}

export interface ParsedTurn {
  id: string;
  time: string;
  startSeconds: number;
  speaker: string;
  text: string;
}

export interface Chapter {
  time: string;
  startSeconds: number;
  title: string;
  summary?: string;
}

export function formatSeconds(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function formatDurationMinutes(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function pickTldr(
  summary: FirefliesSummary | null,
  rawSummary: string | null | undefined,
): string | null {
  if (summary) {
    const candidate = summary.short_summary ?? summary.overview ?? summary.gist;
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  if (typeof rawSummary === "string" && rawSummary.trim().length > 0) {
    return rawSummary.trim();
  }
  return null;
}

export function extractChapters(summary: FirefliesSummary | null): Chapter[] {
  const chapters = summary?.transcript_chapters;
  if (!chapters || !Array.isArray(chapters) || chapters.length === 0) return [];
  return chapters
    .map((c: { title?: string; start_time?: number; summary?: string }) => {
      const startSeconds = typeof c.start_time === "number" ? c.start_time : 0;
      return {
        time: formatSeconds(startSeconds),
        startSeconds,
        title: c.title ?? "Untitled chapter",
        summary: c.summary,
      };
    })
    .sort((a, b) => a.startSeconds - b.startSeconds);
}

/**
 * Parse the transcription field into turns. Supports Fireflies JSON (with sentences)
 * or plain-text fallback. Returns an empty array if nothing usable is found.
 */
export function parseTurns(
  rawTranscription: string | null | undefined,
  sentencesJson: unknown,
): ParsedTurn[] {
  // 1) Prefer structured sentencesJson if present
  if (Array.isArray(sentencesJson) && sentencesJson.length > 0) {
    const turns = collapseConsecutive(
      (sentencesJson as FirefliesSentence[]).map((s, idx) => ({
        id: `s-${idx}`,
        time: formatSeconds(s.start_time ?? 0),
        startSeconds: s.start_time ?? 0,
        speaker: s.speaker_name ?? "Speaker",
        text: s.text ?? "",
      })),
    );
    return turns;
  }

  // 2) Parse transcription as Fireflies JSON
  if (typeof rawTranscription === "string" && rawTranscription.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(rawTranscription) as { sentences?: FirefliesSentence[] };
      if (Array.isArray(parsed.sentences)) {
        return collapseConsecutive(
          parsed.sentences.map((s, idx) => ({
            id: `s-${idx}`,
            time: formatSeconds(s.start_time ?? 0),
            startSeconds: s.start_time ?? 0,
            speaker: s.speaker_name ?? "Speaker",
            text: s.text ?? "",
          })),
        );
      }
    } catch {
      // fall through
    }
  }

  // 3) Plain-text fallback. Strip [SCREENSHOT] markers, split on speaker labels
  // like "Name:" at the start of a line. If no speaker labels are found, return
  // a single turn so the text is still readable.
  if (typeof rawTranscription === "string" && rawTranscription.trim().length > 0) {
    const cleaned = rawTranscription.replace(/\s*\[SCREENSHOT\]\.?\s*/g, " ").trim();
    const speakerPattern = /^([A-Z][A-Za-z0-9 .'-]{0,30}):\s*/;
    const lines = cleaned.split(/\n+/);
    const turns: ParsedTurn[] = [];
    let current: ParsedTurn | null = null;
    let idx = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = speakerPattern.exec(trimmed);
      if (match) {
        if (current) turns.push(current);
        current = {
          id: `p-${idx++}`,
          time: "",
          startSeconds: 0,
          speaker: match[1] ?? "Speaker",
          text: trimmed.slice(match[0].length),
        };
      } else if (current) {
        current.text = `${current.text} ${trimmed}`.trim();
      } else {
        current = {
          id: `p-${idx++}`,
          time: "",
          startSeconds: 0,
          speaker: "Transcript",
          text: trimmed,
        };
      }
    }
    if (current) turns.push(current);
    return turns;
  }

  return [];
}

/** Merge adjacent sentences from the same speaker into a single turn. */
function collapseConsecutive(rows: ParsedTurn[]): ParsedTurn[] {
  if (rows.length === 0) return rows;
  const out: ParsedTurn[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && last.speaker === r.speaker && r.startSeconds - last.startSeconds < 60) {
      last.text = `${last.text} ${r.text}`.trim();
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

/**
 * Format an exact timestamp like "04 Jun 2026, 18:19:02" for the Details rail.
 */
export function formatTimestamp(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Truncated session id for display, e.g. "…942278". */
export function shortSessionId(id: string | null | undefined): string {
  if (!id) return "—";
  return id.length <= 6 ? id : `…${id.slice(-6)}`;
}

export function initialsOf(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return (
    (parts[0]?.slice(0, 1) ?? "") + (parts[parts.length - 1]?.slice(0, 1) ?? "")
  ).toUpperCase();
}

interface AnalyticsSpeakers {
  speakers?: Array<{ name?: string; email?: string; duration_pct?: number; duration?: number }>;
}

/**
 * Read talk-time percentages out of analyticsJson when present. Returns a map
 * keyed by lowercased email and by lowercased name (so we can match either).
 * Defensive: any parse failure returns an empty map.
 */
export function extractTalkShares(analyticsJson: unknown): Map<string, number> {
  const out = new Map<string, number>();
  if (!analyticsJson) return out;

  let data: unknown = analyticsJson;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return out;
    }
  }
  if (typeof data !== "object" || data === null) return out;

  const speakers = (data as AnalyticsSpeakers).speakers;
  if (!Array.isArray(speakers)) return out;

  for (const s of speakers) {
    const pct =
      typeof s.duration_pct === "number"
        ? s.duration_pct
        : typeof s.duration === "number"
          ? s.duration
          : undefined;
    if (typeof pct !== "number") continue;
    if (s.email) out.set(s.email.toLowerCase(), pct);
    if (s.name) out.set(s.name.toLowerCase(), pct);
  }
  return out;
}

export function formatMeetingDate(d: Date | string | null | undefined): {
  dayLabel: string;
  fullLabel: string;
  timeLabel: string;
} {
  if (!d) return { dayLabel: "—", fullLabel: "—", timeLabel: "" };
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return { dayLabel: "—", fullLabel: "—", timeLabel: "" };
  const fullLabel = date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const dayLabel = date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timeLabel = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return { dayLabel, fullLabel, timeLabel };
}
