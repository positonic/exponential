/**
 * voiceEventLog — a small, pure ring buffer of timestamped Realtime events for
 * one voice session, so an incident can be reconstructed afterwards.
 *
 * Why this exists: the Realtime data channel is the only place where tool
 * calls, their latency, and the ORDER responses were generated in is visible.
 * None of it was persisted — the conversation view is built from paired
 * transcripts — so the "Zoe fabricated an answer, then corrected herself"
 * incident (ticket humble.basin) could only be reconstructed by inference.
 *
 * `useVoiceSession` pushes events here; on each committed assistant transcript
 * it drains everything since the previous one and hands the slice to the
 * caller, which persists it alongside the turn (AiInteractionHistory.actionsTaken).
 * PURE — no React, no WebRTC — so it is trivially testable.
 */

/** One logged event. `t` is milliseconds since the log was created. */
export interface VoiceEvent {
  t: number;
  type: VoiceEventType;
  /** Short, redaction-safe detail: ids, names, lengths, decisions. Never audio. */
  detail?: Record<string, string | number | boolean | null>;
}

export type VoiceEventType =
  | "session.configured"
  | "session.seeded"
  | "speech.started"
  | "speech.committed"
  | "response.requested"
  | "response.deferred"
  | "response.created"
  | "response.done"
  | "transcript.user"
  | "transcript.assistant"
  | "tool.called"
  | "tool.result"
  | "tool.error"
  | "server.error"
  | "session.ended";

/** Upper bound on retained events so a long session can't grow unbounded. */
export const VOICE_EVENT_LOG_CAPACITY = 500;

/** Longest excerpt of free text (a speakable, a transcript) we keep in detail. */
const EXCERPT_LENGTH = 160;

export interface VoiceEventLog {
  /** Record one event with the current timestamp. */
  push: (type: VoiceEventType, detail?: VoiceEvent["detail"]) => void;
  /** Return and clear every event recorded since the previous drain. */
  drain: () => VoiceEvent[];
  /** Everything retained (bounded by capacity), without clearing. */
  all: () => readonly VoiceEvent[];
}

export interface VoiceEventLogOptions {
  /** Injectable clock for tests; defaults to Date.now. */
  now?: () => number;
  /** Mirror each event to console.debug (development only by default). */
  echo?: (event: VoiceEvent) => void;
  capacity?: number;
}

export function createVoiceEventLog(
  options: VoiceEventLogOptions = {},
): VoiceEventLog {
  const now = options.now ?? Date.now;
  const capacity = options.capacity ?? VOICE_EVENT_LOG_CAPACITY;
  const startedAt = now();
  // Everything retained for the session, oldest first.
  let retained: VoiceEvent[] = [];
  // Index into `retained` of the first event not yet drained.
  let drainedUpTo = 0;

  return {
    push(type, detail) {
      const event: VoiceEvent = { t: now() - startedAt, type, ...(detail ? { detail } : {}) };
      retained.push(event);
      if (retained.length > capacity) {
        const overflow = retained.length - capacity;
        retained = retained.slice(overflow);
        drainedUpTo = Math.max(0, drainedUpTo - overflow);
      }
      options.echo?.(event);
    },
    drain() {
      const slice = retained.slice(drainedUpTo);
      drainedUpTo = retained.length;
      return slice;
    },
    all() {
      return retained;
    },
  };
}

/** Trim free text to a short, log-safe excerpt. */
export function excerpt(text: string | undefined | null): string {
  if (!text) return "";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > EXCERPT_LENGTH ? `${flat.slice(0, EXCERPT_LENGTH - 1)}…` : flat;
}

/**
 * Shape a drained slice into `AiInteractionHistory.actionsTaken` rows
 * (`{ action, result, data }`), the existing per-interaction audit column, so no
 * schema change is needed and the metrics UI already shows it.
 */
export interface VoiceEventLike {
  t: number;
  type: string;
  detail?: VoiceEvent["detail"];
}

export function toActionsTaken(
  events: readonly VoiceEventLike[],
): Array<{ action: string; result: string; data?: unknown }> {
  return events.map((e) => ({
    action: e.type,
    result: summarize(e),
    data: { t: e.t, ...(e.detail ?? {}) },
  }));
}

function summarize(e: VoiceEventLike): string {
  const d = e.detail ?? {};
  switch (e.type) {
    case "tool.called":
      return `${String(d.name ?? "?")}(${String(d.phrase ?? "")})`;
    case "tool.result":
      return `${String(d.name ?? "?")} in ${String(d.durationMs ?? "?")}ms: ${String(d.speakable ?? "")}`;
    case "tool.error":
      return `${String(d.name ?? "?")} failed after ${String(d.durationMs ?? "?")}ms: ${String(d.error ?? "")}`;
    case "response.requested":
    case "response.deferred":
      return String(d.reason ?? "");
    case "response.done":
      return `${String(d.responseId ?? "")} ${String(d.status ?? "")}`.trim();
    case "transcript.user":
    case "transcript.assistant":
      return String(d.text ?? "");
    default:
      return Object.keys(d).length ? JSON.stringify(d) : "";
  }
}
