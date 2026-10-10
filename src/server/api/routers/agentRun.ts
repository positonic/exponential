import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { getActionAccess, canViewAction, buildActionEditWhere } from "~/server/services/access";
import { appendRunEvent, appendRunEvents } from "~/server/services/agentRuns/events";
import { onRunFinished } from "~/server/services/agentRuns/finish";
import { requireAgentKeyPrincipal, requireClaimedRunForRunner } from "~/server/services/agentRuns/callbacks";
import { loadRunBrief, LOCAL_RUNNER_CLOSING } from "~/server/services/agentRuns/dispatch";
import { createActionComment } from "~/server/services/actions/comments";
import { isWaitingForRunner } from "~/server/services/agentRuns/presentation";

/** How many times `claim` retries when another runner wins the row it picked. */
const CLAIM_ATTEMPTS = 3;

const runnerEventSchema = z.object({
  seq: z.number().int().min(1),
  kind: z.enum(["status", "tool_call", "tool_result", "text", "log", "error"]),
  payload: z.record(z.unknown()),
});

/**
 * Agent runs as seen by humans (ADR-0067, Agent PRD D10). Everyone who can
 * view the action sees status, duration, tool count and the finish summary;
 * the event transcript is owner-only and is selected server-side, never
 * filtered on the client.
 */
export const agentRunRouter = createTRPCRouter({
  /** Runs on one action, newest first. */
  listForAction: protectedProcedure
    .input(z.object({ actionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const access = await getActionAccess(ctx.db, ctx.session.user.id, input.actionId);
      if (!access || !canViewAction(access)) {
        // Same NOT_FOUND-not-FORBIDDEN rule as action.getById: never confirm an id.
        throw new TRPCError({ code: "NOT_FOUND", message: "Action not found or access denied" });
      }
      const runs = await ctx.db.agentRun.findMany({
        where: { actionId: input.actionId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          executor: true,
          startedAt: true,
          finishedAt: true,
          lastEventAt: true,
          createdAt: true,
          toolCallCount: true,
          summary: true,
          readyToClose: true,
          error: true,
          requestedById: true,
          agent: {
            select: {
              id: true,
              name: true,
              ownerId: true,
              shadowUser: { select: { id: true, name: true, image: true } },
              assistant: { select: { emoji: true } },
            },
          },
        },
      });
      // The transcript is owner-only, selected server-side: a non-owner's
      // response never carries events, so there is nothing to filter on the client.
      const ownedRunIds = runs.filter((r) => r.agent.ownerId === ctx.session.user.id).map((r) => r.id);
      const events = ownedRunIds.length
        ? await ctx.db.agentRunEvent.findMany({
            where: { runId: { in: ownedRunIds } },
            orderBy: { seq: "asc" },
            select: { id: true, runId: true, seq: true, kind: true, payload: true, createdAt: true },
          })
        : [];
      const now = new Date();
      return runs.map((run) => {
        const isOwner = run.agent.ownerId === ctx.session.user.id;
        return {
          ...run,
          // The raw error (a truncated Mastra response body) is owner-only like
          // the transcript; everyone else sees the status.
          error: isOwner ? run.error : null,
          isOwner,
          // A LOCAL_CLI run nobody has claimed for ten minutes (V2); derived
          // here so the pill and the Delegated tab read one rule.
          waitingForRunner: isWaitingForRunner(run, now),
          events: isOwner ? events.filter((e) => e.runId === run.id) : undefined,
        };
      });
    }),

  /**
   * Cancel a live run from the Action page (Agent PRD D7). Anyone who may edit
   * the action may cancel. QUEUED → CANCELLED outright; RUNNING → CANCELLED
   * as a flag: the callbacks refuse a non-RUNNING run and the dispatcher
   * never overwrites a cancel, so late results are discarded. The in-flight
   * Mastra call itself is not aborted (accepted; maxSteps bounds it).
   */
  cancel: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const run = await ctx.db.agentRun.findFirst({
        where: {
          id: input.runId,
          status: { in: ["QUEUED", "RUNNING"] },
          action: buildActionEditWhere(ctx.session.user.id),
        },
        select: { id: true, status: true },
      });
      if (!run) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Live run not found" });
      }
      const updated = await ctx.db.agentRun.updateMany({
        where: { id: run.id, status: run.status },
        data: { status: "CANCELLED", finishedAt: new Date(), lastEventAt: new Date() },
      });
      if (updated.count === 1) {
        await appendRunEvent(ctx.db, {
          runId: run.id,
          kind: "status",
          payload: { status: "CANCELLED", by: ctx.session.user.id, was: run.status },
        });
        await onRunFinished(ctx.db, run.id);
      }
      return { cancelled: updated.count === 1, was: run.status };
    }),

  /** One run's events after `afterSeq` — owner only — for an incremental transcript poll. */
  get: protectedProcedure
    .input(z.object({ runId: z.string(), afterSeq: z.number().int().min(0).default(0) }))
    .query(async ({ ctx, input }) => {
      const run = await ctx.db.agentRun.findFirst({
        where: { id: input.runId, agent: { ownerId: ctx.session.user.id } },
        select: { id: true, status: true, toolCallCount: true, summary: true, finishedAt: true },
      });
      if (!run) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
      }
      const events = await ctx.db.agentRunEvent.findMany({
        where: { runId: run.id, seq: { gt: input.afterSeq } },
        orderBy: { seq: "asc" },
        select: { id: true, seq: true, kind: true, payload: true, createdAt: true },
      });
      return { ...run, events };
    }),

  // ─── Local runner (Agent PRD V2, D2) ─────────────────────────────────────
  // Called by the owner's own machine with the Assistant's `exp_agent_` key
  // (`ctx.tokenType === "agent-key"`, the session user is the shadow user).
  // Every procedure resolves the run through the caller's agent; a run id on
  // its own is never trusted. The hosted dispatcher never touches a
  // `LOCAL_CLI` run, and these procedures never touch a `MASTRA` one.

  /**
   * Claim the oldest QUEUED `LOCAL_CLI` run of the caller's agent: an atomic
   * `updateMany` guarded on QUEUED, exactly like the hosted dispatcher, so two
   * runners polling the same key cannot both run it. Returns the run with the
   * same persona + brief Mastra would receive, or `null` when nothing is queued.
   */
  claim: protectedProcedure
    .input(z.object({ runnerId: z.string().trim().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const agent = await requireAgentKeyPrincipal(ctx.db, {
        tokenType: ctx.tokenType,
        userId: ctx.session.user.id,
      });
      for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
        const next = await ctx.db.agentRun.findFirst({
          where: { agentId: agent.id, status: "QUEUED", executor: "LOCAL_CLI" },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
        if (!next) return null;
        const now = new Date();
        const claimed = await ctx.db.agentRun.updateMany({
          where: { id: next.id, status: "QUEUED" },
          data: { status: "RUNNING", startedAt: now, lastEventAt: now, claimedBy: input.runnerId },
        });
        if (claimed.count !== 1) continue;

        const { run, system, brief } = await loadRunBrief(ctx.db, next.id, { closing: LOCAL_RUNNER_CLOSING });
        await appendRunEvent(ctx.db, {
          runId: run.id,
          kind: "status",
          payload: { status: "RUNNING", claimedBy: input.runnerId },
        });
        return {
          id: run.id,
          actionId: run.actionId,
          predecessorId: run.predecessorId,
          claimedBy: input.runnerId,
          startedAt: now,
          action: {
            id: run.action.id,
            name: run.action.name,
            description: run.action.description,
            dueDate: run.action.dueDate,
            workspaceId: run.action.workspaceId,
            projectId: run.action.projectId,
            project: run.action.project,
          },
          owner: run.agent.owner,
          /** The persona system message and the brief, as the hosted executor would send them. */
          messages: [
            { role: "system" as const, content: system },
            { role: "user" as const, content: brief },
          ],
        };
      }
      return null;
    }),

  /** Keep a claimed run alive: the cron sweep times out a RUNNING run silent for five minutes. */
  heartbeat: protectedProcedure
    .input(z.object({ runId: z.string(), runnerId: z.string().trim().min(1).max(100).optional() }))
    .mutation(async ({ ctx, input }) => {
      const agent = await requireAgentKeyPrincipal(ctx.db, {
        tokenType: ctx.tokenType,
        userId: ctx.session.user.id,
      });
      const run = await requireClaimedRunForRunner(ctx.db, {
        agentId: agent.id,
        runId: input.runId,
        runnerId: input.runnerId,
      });
      const now = new Date();
      await ctx.db.agentRun.updateMany({
        where: { id: run.id, status: "RUNNING" },
        data: { lastEventAt: now },
      });
      return { ok: true as const, lastEventAt: now };
    }),

  /**
   * Append runner-numbered events. Idempotent on `seq`: a retried batch
   * inserts nothing twice and bumps `toolCallCount` only by the new
   * `tool_call` rows (`appendRunEvents`).
   */
  appendEvents: protectedProcedure
    .input(
      z.object({
        runId: z.string(),
        runnerId: z.string().trim().min(1).max(100).optional(),
        events: z.array(runnerEventSchema).min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const agent = await requireAgentKeyPrincipal(ctx.db, {
        tokenType: ctx.tokenType,
        userId: ctx.session.user.id,
      });
      const run = await requireClaimedRunForRunner(ctx.db, {
        agentId: agent.id,
        runId: input.runId,
        runnerId: input.runnerId,
      });
      const result = await appendRunEvents(ctx.db, {
        runId: run.id,
        events: input.events.map((e) => ({ seq: e.seq, kind: e.kind, payload: e.payload as never })),
      });
      return { ...result, toolCallCount: run.toolCallCount + result.newToolCalls };
    }),

  /**
   * Finish a claimed run. SUCCEEDED / FAILED: a guarded write from RUNNING
   * (a cancel that landed meanwhile wins and already ran the finish hook),
   * then `onRunFinished` — notification, activity, Agent-run time.
   * WAITING_ON_OWNER: the runner has no `mastra.askOwner`, so `finish` takes
   * the `question`, posts the mention comment exactly as ask-owner does and
   * moves the row to WAITING_ON_OWNER — terminal for this row; the owner's
   * reply on the action starts a resume run the runner claims next (D6).
   */
  finish: protectedProcedure
    .input(
      z
        .object({
          runId: z.string(),
          runnerId: z.string().trim().min(1).max(100).optional(),
          status: z.enum(["SUCCEEDED", "FAILED", "WAITING_ON_OWNER"]),
          summary: z.string().max(10000).optional(),
          readyToClose: z.boolean().optional(),
          error: z.string().max(2000).optional(),
          usage: z.record(z.unknown()).optional(),
          /** Required with WAITING_ON_OWNER: what to ask the owner. */
          question: z.string().min(1).max(10000).optional(),
        })
        .refine((v) => v.status !== "WAITING_ON_OWNER" || !!v.question, {
          message: "WAITING_ON_OWNER needs a question for the owner",
          path: ["question"],
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const agent = await requireAgentKeyPrincipal(ctx.db, {
        tokenType: ctx.tokenType,
        userId: ctx.session.user.id,
      });
      const run = await requireClaimedRunForRunner(ctx.db, {
        agentId: agent.id,
        runId: input.runId,
        runnerId: input.runnerId,
      });
      const now = new Date();
      const summary = input.summary?.trim();

      if (input.status === "WAITING_ON_OWNER") {
        const owner = await ctx.db.user.findUniqueOrThrow({
          where: { id: agent.ownerId },
          select: { id: true, name: true },
        });
        // Same mention shape as mastra.askOwner: `@[Name](id)`, with the
        // characters that would break the parser stripped from the label.
        const label = (owner.name ?? "Owner").replace(/[[\]()]/g, "").trim() || "Owner";
        const comment = await createActionComment(ctx.db, {
          actionId: run.actionId,
          authorId: ctx.session.user.id,
          content: `@[${label}](${owner.id}) ${input.question!}`,
        });
        await appendRunEvent(ctx.db, {
          runId: run.id,
          kind: "tool_call",
          payload: { tool: "ask-owner", commentId: comment.id, snippet: input.question!.slice(0, 200) },
        });
        const updated = await ctx.db.agentRun.updateMany({
          where: { id: run.id, status: "RUNNING" },
          data: {
            status: "WAITING_ON_OWNER",
            finishedAt: now,
            lastEventAt: now,
            ...(summary ? { summary } : {}),
            ...(input.usage !== undefined ? { usage: input.usage as never } : {}),
          },
        });
        return { finished: updated.count === 1, status: "WAITING_ON_OWNER" as const, commentId: comment.id };
      }

      const updated = await ctx.db.agentRun.updateMany({
        where: { id: run.id, status: "RUNNING" },
        data: {
          status: input.status,
          finishedAt: now,
          lastEventAt: now,
          ...(summary ? { summary } : {}),
          ...(input.readyToClose !== undefined ? { readyToClose: input.readyToClose } : {}),
          ...(input.error !== undefined ? { error: input.error } : {}),
          ...(input.usage !== undefined ? { usage: input.usage as never } : {}),
        },
      });
      if (updated.count === 1) {
        await appendRunEvent(ctx.db, { runId: run.id, kind: "status", payload: { status: input.status } });
        await onRunFinished(ctx.db, run.id);
      }
      return { finished: updated.count === 1, status: input.status };
    }),
});
