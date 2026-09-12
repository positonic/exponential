/**
 * Draft one participant's async-first update from their own activity
 * (ADR-0059, V3). V3 action 1 reads their Actions: what they completed since
 * the previous occurrence fills the "done" question, and what they still have
 * open fills "what next". Tickets and commits join as sources in action 2.
 *
 * Deterministic-then-refine (ADR-0007): this is a query rendered as Markdown
 * bullets, never a generated narrative — every line names a record the
 * participant can open. A question with nothing behind it drafts as empty,
 * so the participant writes it themselves rather than reading a fabricated
 * summary of their day.
 */
import type { PrismaClient } from "@prisma/client";
import type { PerPersonQuestion } from "./questions";

/** Actions worth listing under "what next" — an unbounded list is noise. */
const OPEN_ACTION_LIMIT = 8;
const COMPLETED_ACTION_LIMIT = 20;

export interface DraftAnswersInput {
  workspaceId: string;
  userId: string;
  /** The ceremony's kind decides which questions exist. */
  questions: readonly PerPersonQuestion[];
  /** Start of the window: the previous occurrence's start, when there is one. */
  since: Date | null;
  /** This occurrence's start; activity after it belongs to the next update. */
  until: Date;
  /** Narrows to the ceremony's project when it has one. */
  projectId?: string | null;
}

export interface DraftAnswersResult {
  answers: Record<string, string>;
  /** True when at least one question drafted a non-empty answer. */
  hasContent: boolean;
}

const bullets = (lines: string[]) => lines.map((line) => `- ${line}`).join("\n");

export async function buildDraftAnswers(
  db: PrismaClient,
  input: DraftAnswersInput,
): Promise<DraftAnswersResult> {
  const needs = new Set(input.questions.map((q) => q.draftFrom));
  const projectScope = input.projectId ? { projectId: input.projectId } : {};
  const assignedToThem = {
    workspaceId: input.workspaceId,
    assignees: { some: { userId: input.userId } },
    ...projectScope,
  };

  const completed = needs.has("completed-actions")
    ? await db.action.findMany({
        where: {
          ...assignedToThem,
          completedAt: { ...(input.since ? { gt: input.since } : {}), lte: input.until },
        },
        select: { id: true, name: true, completedAt: true },
        orderBy: { completedAt: "asc" },
        take: COMPLETED_ACTION_LIMIT,
      })
    : [];

  const open = needs.has("open-actions")
    ? await db.action.findMany({
        where: { ...assignedToThem, status: "ACTIVE" },
        select: { id: true, name: true, dueDate: true },
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
        take: OPEN_ACTION_LIMIT,
      })
    : [];

  const dateFmt: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const answers: Record<string, string> = {};
  for (const question of input.questions) {
    if (question.draftFrom === "completed-actions" && completed.length > 0) {
      answers[question.key] = bullets(completed.map((a) => a.name));
    } else if (question.draftFrom === "open-actions" && open.length > 0) {
      answers[question.key] = bullets(
        open.map((a) => (a.dueDate ? `${a.name} (due ${a.dueDate.toLocaleDateString("en-GB", dateFmt)})` : a.name)),
      );
    } else {
      answers[question.key] = "";
    }
  }
  return { answers, hasContent: Object.values(answers).some((v) => v.length > 0) };
}
