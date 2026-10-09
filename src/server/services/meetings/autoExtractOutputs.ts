import type { PrismaClient } from "@prisma/client";
import { TranscriptionProcessingService } from "~/server/services/TranscriptionProcessingService";
import { reportHandledErrorServer } from "~/server/utils/reportHandledErrorServer";

/**
 * Auto-extract sweep for ceremony recordings (`Ceremony.autoExtractOutputs`).
 *
 * The meeting page's "Extract outputs" button drafts actions, decisions and
 * open questions from one reading of a recording. A ceremony with the flag
 * on gets that run without the click: every recording attached to one of
 * its occurrences is picked up here, the same code path the button uses
 * (`TranscriptionProcessingService.extractMeetingOutputs`), with the
 * meeting's owner as the acting user — they always pass the edit-access bar
 * the drafts require, and the decision drafts notify them to review.
 *
 * Runs inside the quarter-hourly cron request (`/api/cron/auto-extract-
 * meeting-outputs`), all work within the request — never post-response.
 * Separate from the auto-summarize sweep on purpose: an extraction is a
 * chunked model reading that can take a minute, and chaining it onto the
 * summary batch would blow that function's budget (see
 * `ensureMeetingSummary`). Its own small batch and its own 300 s keep both
 * sweeps inside their limits.
 *
 * Idempotent: it only ever picks up rows with `outputsExtractedAt IS NULL`,
 * and the service stamps that column when a run gets through (or already
 * had drafts), so a meeting is read at most once. A run killed mid-way
 * leaves the stamp unset and is retried next sweep, where the halves that
 * already landed short-circuit on their existing drafts. A run that fails
 * for a reason a retry cannot fix (no edit access, meeting outside a
 * workspace) is stamped here so it stops occupying a slot; the person can
 * still press the button.
 */

/** Meetings extracted per sweep (bounds model cost and the function budget). */
export const DEFAULT_AUTO_EXTRACT_LIMIT = 3;

/**
 * How long a recording's row must have been untouched before it is read.
 * Device recordings append their transcript in chunks while the meeting is
 * still going (`saveTranscription`), and a titled one attaches to its
 * occurrence at start — reading it early would draft outputs from half a
 * meeting and stamp it done. Ten quiet minutes means the transcript has
 * stopped changing.
 */
export const AUTO_EXTRACT_QUIET_PERIOD_MS = 10 * 60_000;

/** Failures a second run would only repeat — stamp and move on. */
const TERMINAL_ERROR_PATTERNS = [/access/i, /not in a workspace/i, /not found/i];

export function isTerminalExtractionFailure(errors: string[]): boolean {
  return errors.length > 0 && errors.every((e) => TERMINAL_ERROR_PATTERNS.some((p) => p.test(e)));
}

export interface AutoExtractOutputsSweepOptions {
  /** Max meetings extracted in one sweep. Defaults to {@link DEFAULT_AUTO_EXTRACT_LIMIT}. */
  limit?: number;
  /** Injectable clock for tests. */
  now?: Date;
}

export interface AutoExtractOutputsSweepResult {
  /** Eligible meetings this sweep picked up. */
  candidates: number;
  /** Meetings whose run got through (drafts created, or already drafted). */
  extracted: number;
  /** Meetings that failed for a reason a retry cannot fix; stamped so they are not retried. */
  givenUp: number;
  /** Meetings that failed and were left for the next sweep. */
  failed: number;
}

/**
 * Run one auto-extract sweep. Never throws for a per-meeting failure — each
 * is reported and counted — so one bad transcript cannot sink the batch.
 */
export async function runAutoExtractOutputsSweep(
  db: PrismaClient,
  options: AutoExtractOutputsSweepOptions = {},
): Promise<AutoExtractOutputsSweepResult> {
  const limit = options.limit ?? DEFAULT_AUTO_EXTRACT_LIMIT;
  const now = options.now ?? new Date();
  const result: AutoExtractOutputsSweepResult = { candidates: 0, extracted: 0, givenUp: 0, failed: 0 };

  // Newest first: a recording that keeps failing for a transient reason
  // must not hold the slots back from the meeting that just ended.
  const rows = await db.transcriptionSession.findMany({
    where: {
      outputsExtractedAt: null,
      archivedAt: null,
      userId: { not: null },
      transcription: { not: null },
      NOT: { transcription: "" },
      updatedAt: { lte: new Date(now.getTime() - AUTO_EXTRACT_QUIET_PERIOD_MS) },
      occurrence: { ceremony: { autoExtractOutputs: true, isActive: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: { id: true, title: true, userId: true },
  });
  result.candidates = rows.length;

  for (const row of rows) {
    try {
      const outcome = await TranscriptionProcessingService.extractMeetingOutputs(row.id, row.userId!, {
        trigger: "auto_extract",
      });
      if (outcome.extracted) {
        result.extracted += 1;
        continue;
      }
      const errors = Array.from(new Set([...outcome.actions.errors, ...outcome.decisions.errors]));
      const terminal = isTerminalExtractionFailure(errors);
      reportHandledErrorServer(new Error(`Auto-extract failed: ${errors.join(", ") || "no outputs"}`), {
        area: "meetings.autoExtractOutputs",
        context: { meetingId: row.id, title: row.title ?? "", terminal: String(terminal) },
      });
      if (terminal) {
        await db.transcriptionSession.update({
          where: { id: row.id },
          data: { outputsExtractedAt: now },
        });
        result.givenUp += 1;
      } else {
        result.failed += 1;
      }
    } catch (error) {
      result.failed += 1;
      reportHandledErrorServer(error, { area: "meetings.autoExtractOutputs", context: { meetingId: row.id } });
    }
  }

  return result;
}
