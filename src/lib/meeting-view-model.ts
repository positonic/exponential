import type { RouterOutputs } from "~/trpc/react";
import { getInitial } from "~/utils/avatarColors";
import { parseFirefliesSummary, isEmptyFirefliesSummary } from "~/lib/fireflies-summary";
import { parseTranscript } from "~/lib/transcript";
import type { FirefliesSummary } from "~/server/services/FirefliesService";

/**
 * The meeting-detail redesign expects a richer record than we store today
 * (key moments, decisions, open questions, talk-time, linked goal). This
 * module maps a real `TranscriptionSession` into the view the UI consumes,
 * deriving what we can from Fireflies summary/analytics and leaving the rest
 * empty so the corresponding sections self-hide (graceful degradation).
 */

export type MeetingSession = NonNullable<RouterOutputs["transcription"]["getById"]>;

/** Avatar/name identity tones. Blue (`me`) for the host/you, others rotate
 *  through the identity palette — never the blue page chrome. */
export type ParticipantFlavor = "me" | "them" | "alt";

export interface MeetingParticipant {
  id: string;
  name: string;
  initial: string;
  /** e.g. "Host", "Product" — best-effort; empty when unknown. */
  role: string;
  /** "41%" — only when derivable from analytics, else null. */
  talk: string | null;
  flavor: ParticipantFlavor;
  isHost: boolean;
}

export interface MeetingChapter {
  title: string;
  startTime: number;
  endTime: number;
}

export interface MeetingViewModel {
  /** Fireflies meeting_type, capitalised; null → no type pill shown. */
  meetingType: string | null;
  /** Parsed Fireflies summary object when present (rich renderer), else null. */
  firefliesSummary: FirefliesSummary | null;
  /** Plain summary text fallback (markdown/plain) when not Fireflies JSON. */
  plainSummary: string | null;
  durationLabel: string | null;
  participants: MeetingParticipant[];
  chapters: MeetingChapter[];
  /** Derived AI sections we have no source for yet → empty until extraction
   *  lands. Kept on the model so the UI shape is stable. */
  keyMoments: never[];
  decisions: never[];
  questions: never[];
  hasVideo: boolean;
  captureCount: number;
  /** Number of canonical transcript turns; 0 for an empty/absent transcript
   *  (so the Transcript tab badge self-hides). */
  transcriptCount: number;
}

/** Count canonical transcript turns via the shared parser registry (ADR-0032).
 *  One source of truth — the same normalization the renderer consumes. */
function countTranscriptTurns(
  transcription: string | null,
  sentencesJson: unknown,
): number {
  // Turn count is independent of speaker flavor, so participants aren't needed.
  return parseTranscript({ transcription, sentencesJson, participants: [] }).length;
}

function capitalise(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Format a duration in seconds into a short human-readable label.
 * @param seconds Duration in seconds; null/undefined/≤0 yields null.
 * @returns e.g. "44 min", "1 hr", "1 hr 30 min", or null when unavailable.
 */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hours} hr` : `${hours} hr ${rem} min`;
}

/** Tolerant extraction of per-speaker talk-time from Fireflies analyticsJson.
 *  Fireflies stores `{ speakers: [{ name, duration }] }`; we sum durations to a
 *  percentage. Returns a name→"NN%" map, empty when the shape isn't present. */
function extractTalkTime(analyticsJson: unknown): Map<string, string> {
  const result = new Map<string, string>();
  if (!analyticsJson || typeof analyticsJson !== "object") return result;
  const speakers = (analyticsJson as { speakers?: unknown }).speakers;
  if (!Array.isArray(speakers)) return result;

  const rows = speakers
    .map((s) => {
      if (!s || typeof s !== "object") return null;
      const obj = s as Record<string, unknown>;
      const name = typeof obj.name === "string" ? obj.name : null;
      const durationRaw =
        typeof obj.duration === "number"
          ? obj.duration
          : typeof obj.duration_pct === "number"
            ? obj.duration_pct
            : null;
      if (!name || durationRaw === null) return null;
      return { name, duration: durationRaw };
    })
    .filter((r): r is { name: string; duration: number } => r !== null);

  const total = rows.reduce((sum, r) => sum + r.duration, 0);
  if (total <= 0) return result;
  for (const row of rows) {
    result.set(row.name, `${Math.round((row.duration / total) * 100)}%`);
  }
  return result;
}

/** Identity of the meeting owner/recorder — the "me" side of the conversation. */
export interface MeetingOwnerIdentity {
  userId: string | null;
  email: string | null;
}

/**
 * Resolve each participant's identity tone (flavor). The participant who is the
 * meeting **owner** (the recorder, whose perspective a device `Me:`/`Them:`
 * transcript is written from) is `"me"`; everyone else rotates `them`/`alt` by
 * order — mirroring the transcript parser's rotation so the participants panel
 * and the transcript agree on colour.
 *
 * Exactly one participant is ever `"me"`: the owner is matched by `userId`
 * first, then by `email`, then we fall back to the first DB-flagged host (legacy
 * meetings where the owner isn't linked as a participant). Resolving to a single
 * index avoids marking two rows `"me"` when, say, a user-linked participant and
 * a manually-added participant share an email.
 */
export function assignParticipantFlavors<
  T extends { userId?: string | null; email?: string | null; isHost?: boolean | null },
>(participants: T[], owner: MeetingOwnerIdentity): ParticipantFlavor[] {
  const { userId: ownerUserId, email: ownerEmail } = owner;
  const byUserId =
    ownerUserId !== null
      ? participants.findIndex((p) => p.userId != null && p.userId === ownerUserId)
      : -1;
  const byEmail =
    ownerEmail !== null
      ? participants.findIndex(
          (p) => p.email != null && p.email.toLowerCase() === ownerEmail.toLowerCase(),
        )
      : -1;
  const meIndex =
    byUserId >= 0
      ? byUserId
      : byEmail >= 0
        ? byEmail
        : participants.findIndex((p) => Boolean(p.isHost));

  const rotatable: ParticipantFlavor[] = ["them", "alt"];
  let rotation = 0;
  return participants.map((_p, index) =>
    index === meIndex ? "me" : rotatable[rotation++ % rotatable.length]!,
  );
}

/**
 * Map a `TranscriptionSession` (+ parsed Fireflies summary/analytics) into the
 * view model the meeting-detail UI consumes. Derives meeting type, summary
 * (rich Fireflies object or plain text), duration, participants with talk-time,
 * and transcript chapters. Sections we have no source for yet (key moments,
 * decisions, open questions) are returned empty so the UI self-hides them.
 * @param session The transcription session record from `transcription.getById`.
 * @returns The derived {@link MeetingViewModel}.
 */
export function buildMeetingViewModel(session: MeetingSession): MeetingViewModel {
  const firefliesSummary = parseFirefliesSummary(session.summary);
  const hasRichSummary =
    firefliesSummary !== null && !isEmptyFirefliesSummary(firefliesSummary);

  const meetingType = firefliesSummary?.meeting_type
    ? capitalise(firefliesSummary.meeting_type)
    : null;

  const talkTime = extractTalkTime(session.analyticsJson);

  const flavors = assignParticipantFlavors(session.participants, {
    userId: session.userId ?? null,
    email: session.user?.email ?? null,
  });

  const participants: MeetingParticipant[] = session.participants.map((p, index) => {
    const name = p.name ?? p.email ?? "Unknown";
    const flavor = flavors[index]!;
    const isMe = flavor === "me";
    const speakerKey = p.speakerLabel ?? p.name ?? "";
    return {
      id: p.id,
      name,
      initial: getInitial(p.name, p.email),
      role: isMe ? "Host" : "",
      talk: talkTime.get(speakerKey) ?? talkTime.get(name) ?? null,
      flavor,
      isHost: isMe,
    };
  });

  const chapters: MeetingChapter[] = (firefliesSummary?.transcript_chapters ?? []).map(
    (c) => ({ title: c.title, startTime: c.start_time, endTime: c.end_time }),
  );

  return {
    meetingType,
    firefliesSummary: hasRichSummary ? firefliesSummary : null,
    plainSummary: hasRichSummary ? null : (session.summary ?? null),
    durationLabel: formatDuration(session.durationSeconds),
    participants,
    chapters,
    keyMoments: [],
    decisions: [],
    questions: [],
    hasVideo: Boolean(session.videoUrl),
    captureCount: session.screenshots.length,
    transcriptCount: countTranscriptTurns(session.transcription, session.sentencesJson),
  };
}
