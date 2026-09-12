/**
 * Draft one participant's async-first update from their own activity
 * (ADR-0059, V3). Each per-person question names the sources that fill it;
 * this assembles their lines into Markdown bullets, running every source at
 * most once however many questions ask for it.
 *
 * Deterministic-then-refine (ADR-0007): the answer is a list of records the
 * participant can point at, never a generated narrative. A question whose
 * sources found nothing drafts empty, so they write it themselves rather than
 * editing a plausible account of a day they didn't have.
 */
import type { PrismaClient } from "@prisma/client";
import type { DraftSource, PerPersonQuestion } from "./questions";
import {
  commitLines,
  completedActionLines,
  openActionLines,
  ticketMoveLines,
  type ActivityWindow,
} from "./sources";

const SOURCE_QUERIES: Record<DraftSource, (db: PrismaClient, window: ActivityWindow) => Promise<string[]>> = {
  "completed-actions": completedActionLines,
  "open-actions": openActionLines,
  "ticket-moves": ticketMoveLines,
  commits: commitLines,
};

export interface DraftAnswersInput extends ActivityWindow {
  /** The ceremony's kind decides which questions exist. */
  questions: readonly PerPersonQuestion[];
}

export interface DraftAnswersResult {
  answers: Record<string, string>;
  /** True when at least one question drafted a non-empty answer. */
  hasContent: boolean;
}

export async function buildDraftAnswers(
  db: PrismaClient,
  input: DraftAnswersInput,
): Promise<DraftAnswersResult> {
  const { questions, ...window } = input;
  const wanted = new Set<DraftSource>(questions.flatMap((q) => q.draftFrom));

  const lines = new Map<DraftSource, string[]>();
  for (const source of wanted) {
    lines.set(source, await SOURCE_QUERIES[source](db, window));
  }

  const answers: Record<string, string> = {};
  for (const question of questions) {
    const bullets = question.draftFrom.flatMap((source) => lines.get(source) ?? []);
    answers[question.key] = bullets.map((line) => `- ${line}`).join("\n");
  }
  return { answers, hasContent: Object.values(answers).some((v) => v.length > 0) };
}
