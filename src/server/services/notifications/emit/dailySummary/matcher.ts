/**
 * Match recorded Meetings (TranscriptionSession rows) to yesterday's calendar
 * events — a heuristic held only here (ADR-0059): no link is persisted.
 *
 * A recording matches an event when its `meetingDate` falls inside the event's
 * window padded by {@link DEFAULT_PAD_MS} on both sides. Among several
 * candidate events the one sharing the most title words (lower-cased, ≥ 3
 * letters) wins; ties go to the earliest start. Greedy in `meetingDate` order:
 * each event takes at most one recording and each recording matches at most
 * one event. Whatever is left over is reported as unmatched, for the builder
 * to append as "recorded" rows.
 */

export const DEFAULT_PAD_MS = 15 * 60 * 1000;

export interface MatchableEvent {
  title: string;
  /** Instants for timed events; an all-day event (null start) never matches. */
  start: Date | null;
  end: Date | null;
}

export interface MatchableRecording {
  title: string | null;
  meetingDate: Date;
}

export interface RecordingMatchResult<E, R> {
  /** Event → the one recording matched to it. */
  byEvent: Map<E, R>;
  /** Recordings no event claimed, in `meetingDate` order. */
  unmatched: R[];
}

/** Lower-cased words of at least three letters/digits — the title-overlap vocabulary. */
export function titleWords(title: string | null | undefined): Set<string> {
  const words = (title ?? "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3);
  return new Set(words);
}

function sharedWordCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
}

export function matchRecordingsToEvents<
  E extends MatchableEvent,
  R extends MatchableRecording,
>(events: E[], recordings: R[], padMs: number = DEFAULT_PAD_MS): RecordingMatchResult<E, R> {
  const byEvent = new Map<E, R>();
  const unmatched: R[] = [];
  const eventWords = new Map<E, Set<string>>(events.map((e) => [e, titleWords(e.title)]));

  const ordered = [...recordings].sort(
    (a, b) => a.meetingDate.getTime() - b.meetingDate.getTime(),
  );

  for (const recording of ordered) {
    const at = recording.meetingDate.getTime();
    const words = titleWords(recording.title);

    let best: E | null = null;
    let bestShared = -1;
    for (const event of events) {
      if (!event.start || byEvent.has(event)) continue;
      const startMs = event.start.getTime();
      const endMs = (event.end ?? event.start).getTime();
      if (at < startMs - padMs || at > endMs + padMs) continue;

      const shared = sharedWordCount(words, eventWords.get(event)!);
      const earlier = best?.start ? startMs < best.start.getTime() : true;
      if (shared > bestShared || (shared === bestShared && earlier)) {
        best = event;
        bestShared = shared;
      }
    }

    if (best) byEvent.set(best, recording);
    else unmatched.push(recording);
  }

  return { byEvent, unmatched };
}
