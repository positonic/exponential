/**
 * Per-person questions for the async-first update (ADR-0059, V3). The
 * ceremony's `kind` drives them, exactly as it drives the default agenda
 * template — a standup asks the familiar three, and kinds that have no async
 * format ask nothing, which is how `supportsAsyncUpdates` decides whether the
 * occurrence page offers the panel at all.
 *
 * Answers are Markdown (ADR-0017) keyed by `key`; the keys are persisted in
 * `CeremonyOccurrenceUpdate.answers`, so renaming one orphans existing
 * answers. Add a question rather than repurposing a key.
 */
import type { CeremonyKind } from "@prisma/client";

export interface PerPersonQuestion {
  key: string;
  /** Shown as the field label on the occurrence page. */
  prompt: string;
  /** Placeholder when the participant has nothing drafted. */
  placeholder: string;
  /**
   * Which draft source fills this question. `none` means the participant
   * always writes it themselves — there is no record of a blocker to read.
   */
  draftFrom: "completed-actions" | "open-actions" | "none";
}

const STANDUP_QUESTIONS: readonly PerPersonQuestion[] = [
  {
    key: "done",
    prompt: "What did you get done since the last standup?",
    placeholder: "Shipped the importer's dry-run pass…",
    draftFrom: "completed-actions",
  },
  {
    key: "today",
    prompt: "What are you working on next?",
    placeholder: "Finishing the review queue…",
    draftFrom: "open-actions",
  },
  {
    key: "blockers",
    prompt: "Anything blocking you?",
    placeholder: "Waiting on the staging database credentials…",
    draftFrom: "none",
  },
];

const QUESTIONS_BY_KIND: Partial<Record<CeremonyKind, readonly PerPersonQuestion[]>> = {
  STANDUP: STANDUP_QUESTIONS,
};

/** The questions for a kind; empty for kinds with no async format. */
export function perPersonQuestions(kind: CeremonyKind): readonly PerPersonQuestion[] {
  return QUESTIONS_BY_KIND[kind] ?? [];
}

/** Whether this kind's occurrences collect per-participant updates. */
export function supportsAsyncUpdates(kind: CeremonyKind): boolean {
  return perPersonQuestions(kind).length > 0;
}

/** Drops keys that no longer belong to the kind, so a rename can't resurrect them. */
export function readAnswers(value: unknown, kind: CeremonyKind): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const keys = new Set(perPersonQuestions(kind).map((q) => q.key));
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (keys.has(key) && typeof raw === "string") out[key] = raw;
  }
  return out;
}
