import type { Prisma, PrismaClient } from "@prisma/client";
import { createActionComment } from "~/server/services/actions/comments";
import { appendRunEvent } from "./events";

/** What a run needs to ask its question: who assigned it, and whose agent it is. */
export interface QuestionRun {
  id: string;
  actionId: string;
  /** Who assigned the Action, or replied to resume it. Null when an agent reassigned, or for a duty nobody assigned. */
  requestedById: string | null;
  agent: { ownerId: string };
}

/**
 * Who a run's question goes to (decided 2026-10-11, widening owner-only): the
 * person who assigned the Action — they know what they asked for — or the
 * agent's owner when no person did. Either of them may answer and resume it.
 */
export function resolveRunQuestionRecipient(run: Pick<QuestionRun, "requestedById" | "agent">): string {
  return run.requestedById ?? run.agent.ownerId;
}

/**
 * The mention parser reads `@[Name](id)`; brackets or parens in a display name
 * would break it, so they are stripped from the label only.
 */
export function mentionLabel(name: string | null, fallback = "there"): string {
  return (name ?? fallback).replace(/[[\]()]/g, "").trim() || fallback;
}

/**
 * Ask the question, the one path both ask routes share (`mastra.askOwner` for
 * hosted runs, `agentRun.finish` with WAITING_ON_OWNER for local runners), so
 * they cannot drift:
 *
 *  1. park the run RUNNING → WAITING_ON_OWNER, guarded on RUNNING — a cancel
 *     that landed meanwhile wins, and then nothing is posted at all;
 *  2. post a comment, as the agent, mentioning the recipient — the Mention
 *     lands it under their Waiting on me;
 *  3. log an `ask-owner` tool call naming the comment and the recipient.
 *
 * `park` adds caller-specific columns to the status write (a local runner's
 * finish carries `finishedAt`, its summary and usage). Returns null when the
 * run was no longer RUNNING.
 */
export async function postRunQuestion(
  db: PrismaClient,
  input: {
    run: QuestionRun;
    /** The agent's shadow user: the comment is the agent's own. */
    authorId: string;
    question: string;
    park?: Omit<Prisma.AgentRunUpdateManyMutationInput, "status">;
  },
): Promise<{ commentId: string; recipientId: string } | null> {
  const now = new Date();
  const parked = await db.agentRun.updateMany({
    where: { id: input.run.id, status: "RUNNING" },
    data: { lastEventAt: now, ...input.park, status: "WAITING_ON_OWNER" },
  });
  if (parked.count !== 1) return null;

  const recipient = await db.user.findUniqueOrThrow({
    where: { id: resolveRunQuestionRecipient(input.run) },
    select: { id: true, name: true },
  });
  const comment = await createActionComment(db, {
    actionId: input.run.actionId,
    authorId: input.authorId,
    content: `@[${mentionLabel(recipient.name)}](${recipient.id}) ${input.question}`,
  });
  await appendRunEvent(db, {
    runId: input.run.id,
    kind: "tool_call",
    payload: {
      tool: "ask-owner",
      commentId: comment.id,
      recipientId: recipient.id,
      snippet: input.question.slice(0, 200),
    },
  });
  return { commentId: comment.id, recipientId: recipient.id };
}
