import type { PrismaClient } from "@prisma/client";
import { generateJWT } from "~/server/utils/jwt";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";
import { onRunFinished } from "./finish";

/**
 * The hosted executor (ADR-0067, Agent PRD D4). Claims one QUEUED run at a
 * time with an atomic `updateMany` (the enrichment-sweep pattern), calls the
 * `assistantRunAgent` on Mastra as the Assistant's shadow user, and records
 * the outcome. Events are written by the app inside the run tools' callbacks
 * (`mastra.*` procedures), never streamed from here.
 *
 * Runs inside a Vercel function (`maxDuration = 300`): `maxSteps: 12` on the
 * agent bounds a single run's wall-clock.
 */

const MASTRA_API_URL = process.env.MASTRA_API_URL;
const BATCH_SIZE = 5;
const RUN_JWT_MINUTES = 30;

export interface DispatchResult {
  claimed: number;
  succeeded: string[];
  waiting: string[];
  failed: Array<{ id: string; error: string }>;
}

/** What the Mastra `generate` endpoint returns that we read (defensively). */
interface GenerateOutput {
  text?: string;
  steps?: Array<{ toolCalls?: unknown[] }>;
  toolCalls?: unknown[];
  usage?: unknown;
}

/** Pick up to `BATCH_SIZE` QUEUED MASTRA runs and execute each, oldest first. */
export async function dispatchQueuedRuns(
  db: PrismaClient,
  now: Date,
  options: { onlyRunId?: string; queuedBefore?: Date } = {},
): Promise<DispatchResult> {
  const result: DispatchResult = { claimed: 0, succeeded: [], waiting: [], failed: [] };
  if (!MASTRA_API_URL) {
    console.warn("[agentRuns] MASTRA_API_URL not set; skipping dispatch");
    return result;
  }

  const queued = await db.agentRun.findMany({
    where: {
      status: "QUEUED",
      executor: "MASTRA",
      ...(options.onlyRunId ? { id: options.onlyRunId } : {}),
      // The cron sweep only picks up rows the after() kick has had time to miss.
      ...(options.queuedBefore ? { createdAt: { lt: options.queuedBefore } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
    select: { id: true },
  });

  for (const { id } of queued) {
    // Atomic claim: two dispatchers racing for the same row — the `after()`
    // kick and the minute cron — cannot both run it.
    const claim = await db.agentRun.updateMany({
      where: { id, status: "QUEUED" },
      data: { status: "RUNNING", startedAt: now, lastEventAt: now },
    });
    if (claim.count !== 1) continue;
    result.claimed += 1;

    try {
      const outcome = await runOne(db, id);
      if (outcome === "WAITING_ON_OWNER") result.waiting.push(id);
      else result.succeeded.push(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await finishRun(db, id, { status: "FAILED", error: message.slice(0, 2000) });
      result.failed.push({ id, error: message });
    }
  }
  return result;
}

/** Build the persona system message exactly as /api/chat/stream does for assistantAgent. */
export function buildPersonaMessage(assistant: {
  name: string;
  emoji: string | null;
  personality: string;
  instructions: string | null;
  userContext: string | null;
}): string {
  const parts: string[] = [];
  parts.push(`# Your Identity\nName: ${assistant.name}${assistant.emoji ? ` ${assistant.emoji}` : ""}`);
  if (assistant.personality) {
    parts.push(`# Personality & Soul\n<user_data type="personality">\n${assistant.personality}\n</user_data>`);
  }
  if (assistant.instructions) {
    parts.push(`# Instructions\n<user_data type="instructions">\n${assistant.instructions}\n</user_data>`);
  }
  if (assistant.userContext) {
    parts.push(`# About the User/Team\n<user_data type="user_context">\n${assistant.userContext}\n</user_data>`);
  }
  return parts.join("\n\n");
}

/** The user turn: the action brief the run works from. */
export function buildActionBrief(input: {
  action: { id: string; name: string; description: string | null; dueDate: Date | null; project: { name: string } | null };
  ownerName: string | null;
  requesterName: string | null;
  predecessorSummary: string | null;
  wakeComment: string | null;
}): string {
  const lines = [
    `You have been assigned the action "${input.action.name}" (id ${input.action.id})` +
      (input.action.project ? ` in project "${input.action.project.name}".` : "."),
    input.action.description ? `Description:\n${input.action.description}` : "No description.",
    input.action.dueDate ? `Due: ${input.action.dueDate.toISOString().slice(0, 10)}.` : "",
    input.requesterName ? `Assigned by ${input.requesterName}.` : "",
    input.ownerName ? `Your owner is ${input.ownerName}.` : "",
  ];
  if (input.predecessorSummary) {
    lines.push(`You are resuming. Your previous run ended with:\n${input.predecessorSummary}`);
  }
  if (input.wakeComment) {
    lines.push(`Your owner replied:\n${input.wakeComment}`);
  }
  lines.push("Start with get-run-context, do the work, and end with finish-run (or ask-owner if you are stuck).");
  return lines.filter(Boolean).join("\n\n");
}

/** Count tool calls across the agent's steps (provider-side tools included). */
export function countToolCalls(output: GenerateOutput): number {
  if (Array.isArray(output.steps) && output.steps.length > 0) {
    return output.steps.reduce((n, step) => n + (Array.isArray(step.toolCalls) ? step.toolCalls.length : 0), 0);
  }
  return Array.isArray(output.toolCalls) ? output.toolCalls.length : 0;
}

async function runOne(db: PrismaClient, runId: string): Promise<"SUCCEEDED" | "WAITING_ON_OWNER"> {
  const run = await db.agentRun.findUniqueOrThrow({
    where: { id: runId },
    include: {
      action: { include: { project: { select: { name: true } } } },
      agent: {
        include: {
          shadowUser: { select: { id: true, email: true, name: true, image: true } },
          owner: { select: { id: true, name: true } },
          assistant: {
            select: { name: true, emoji: true, personality: true, instructions: true, userContext: true },
          },
        },
      },
      requestedBy: { select: { name: true } },
      predecessor: { select: { summary: true } },
    },
  });

  const wakeComment = run.wakeCommentId
    ? await db.actionComment.findUnique({ where: { id: run.wakeCommentId }, select: { content: true } })
    : null;

  const shadow = run.agent.shadowUser;
  // The run acts as the Assistant's own principal: every write the callbacks
  // make attributes to the shadow user. `runId` is a claim on this token, so
  // the callbacks address the run from the JWT and never from tool input.
  const authToken = generateJWT(
    { id: shadow.id, email: shadow.email, name: shadow.name, image: shadow.image },
    { tokenType: "agent-context", expiryMinutes: RUN_JWT_MINUTES, extraClaims: { runId: run.id } },
  );

  const persona = run.agent.assistant ?? {
    name: run.agent.name,
    emoji: null,
    personality: "",
    instructions: null,
    userContext: null,
  };

  const messages = [
    { role: "system", content: buildPersonaMessage(persona) },
    {
      role: "user",
      content: buildActionBrief({
        action: run.action,
        ownerName: run.agent.owner.name,
        requesterName: run.requestedBy?.name ?? null,
        predecessorSummary: run.predecessor?.summary ?? null,
        wakeComment: wakeComment?.content ?? null,
      }),
    },
  ];

  const res = await fetch(`${MASTRA_API_URL}/api/agents/assistantRunAgent/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({
      messages,
      requestContext: {
        authToken,
        userId: shadow.id,
        ownerUserId: run.agent.owner.id,
        workspaceId: run.action.workspaceId ?? undefined,
        runId: run.id,
        todoAppBaseUrl: getPublicBaseUrlFromEnv(),
      },
      // Observational memory is thread-scoped (ADR-0015): one thread per
      // action, so nothing leaks between actions.
      memory: { resource: shadow.id, thread: { id: `action-${run.actionId}` } },
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Mastra assistantRunAgent failed (${res.status}): ${errText.slice(0, 500)}`);
  }
  const output = (await res.json()) as GenerateOutput;

  // Re-read: the callbacks may have recorded a finish or a question while
  // the HTTP call was in flight, and a human may have cancelled.
  const after = await db.agentRun.findUniqueOrThrow({
    where: { id: runId },
    select: { status: true, summary: true, readyToClose: true, toolCallCount: true },
  });
  if (after.status === "CANCELLED") return "SUCCEEDED";

  const toolCallCount = Math.max(after.toolCallCount, countToolCalls(output));
  const usage = output.usage === undefined ? undefined : (output.usage as object);

  if (after.status === "WAITING_ON_OWNER") {
    await db.agentRun.update({
      where: { id: runId },
      data: { toolCallCount, usage: usage as never, finishedAt: new Date(), lastEventAt: new Date() },
    });
    return "WAITING_ON_OWNER";
  }

  // A run that never called finish-run still succeeded: its text is the summary.
  await finishRun(db, runId, {
    status: "SUCCEEDED",
    summary: after.summary ?? (output.text?.trim() || null),
    readyToClose: after.readyToClose,
    toolCallCount,
    usage,
  });
  return "SUCCEEDED";
}

async function finishRun(
  db: PrismaClient,
  runId: string,
  data: {
    status: "SUCCEEDED" | "FAILED";
    summary?: string | null;
    readyToClose?: boolean;
    toolCallCount?: number;
    usage?: object;
    error?: string;
  },
): Promise<void> {
  // Never overwrite a cancel that landed while we were running.
  await db.agentRun.updateMany({
    where: { id: runId, status: { in: ["RUNNING", "QUEUED"] } },
    data: {
      status: data.status,
      finishedAt: new Date(),
      lastEventAt: new Date(),
      ...(data.summary !== undefined ? { summary: data.summary } : {}),
      ...(data.readyToClose !== undefined ? { readyToClose: data.readyToClose } : {}),
      ...(data.toolCallCount !== undefined ? { toolCallCount: data.toolCallCount } : {}),
      ...(data.usage !== undefined ? { usage: data.usage as never } : {}),
      ...(data.error !== undefined ? { error: data.error } : {}),
    },
  });
  await onRunFinished(db, runId);
}

/**
 * Kick the dispatcher right after an assignment. Posts to the internal route
 * with the cron secret so the run leaves the request's own function: the
 * assign mutation must not wait minutes on Mastra. Best-effort — the minute
 * cron sweeps anything this misses.
 */
export async function triggerDispatch(runId?: string): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[agentRuns] CRON_SECRET not set; dispatch left to the cron sweep");
    return;
  }
  const url = new URL("/api/internal/agent-runs/dispatch", getPublicBaseUrlFromEnv());
  if (runId) url.searchParams.set("runId", runId);
  try {
    const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
    if (!res.ok) console.error(`[agentRuns] dispatch kick failed (${res.status})`);
  } catch (err) {
    console.error("[agentRuns] dispatch kick failed:", err);
  }
}
