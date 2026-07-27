/**
 * Canonical transcript types — see ADR-0032 and the **Transcript turn** term in
 * CONTEXT.md. This module is pure and dependency-free (no React/DB/network) so
 * it runs identically on the client and the server.
 */

/** Identity tone of a turn, resolved in the parser (never the renderer). */
export type TranscriptFlavor = "me" | "them" | "alt";

/**
 * The canonical normalized unit a transcript renders as — one contiguous block
 * of speech by one Speaker.
 *
 * - `speaker` is `null` only for the speaker-less raw fallback.
 * - `flavor` is `null` only when there is no speaker to attribute.
 * - `startTime` is `null` for timeless sources (plain-text pastes); the renderer
 *   hides the time gutter rather than faking `00:00`.
 */
export interface TranscriptTurn {
  text: string;
  speaker: string | null;
  flavor: TranscriptFlavor | null;
  startTime: number | null;
}

/**
 * A participant as the parser needs it for identity mapping. Intentionally a
 * minimal, structural shape so callers can map their own richer participant
 * model onto it without coupling this module to the DB.
 */
export interface TranscriptParticipant {
  name?: string | null;
  speakerLabel?: string | null;
  isHost?: boolean | null;
}

/**
 * Everything a parser needs to normalize a stored transcript. `provider` is a
 * soft hint only — parsing must succeed when it is null or stale, because the
 * Fireflies JSON shape is self-identifying and older/manual rows have no
 * provider.
 */
export interface TranscriptInput {
  transcription: string | null;
  sentencesJson: unknown;
  provider?: string | null;
  participants: TranscriptParticipant[];
}

/**
 * A content-sniffing parser. Parsers are tried in priority order; the first one
 * whose `canParse` returns `true` produces the turns.
 */
export interface TranscriptParser {
  name: string;
  canParse: (input: TranscriptInput) => boolean;
  parse: (input: TranscriptInput) => TranscriptTurn[];
}
