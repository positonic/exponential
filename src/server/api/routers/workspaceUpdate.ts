import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { requireWorkspaceMembership } from "~/server/services/access/middleware";
import { defaultGenerateDeps } from "~/server/services/workspaceUpdates/deps";
import { generateWorkspaceUpdate, regenerateWorkspaceUpdate } from "~/server/services/workspaceUpdates/generate";
import { defaultDistributeChannels } from "~/server/services/workspaceUpdates/channels";
import { distributeWorkspaceUpdate } from "~/server/services/workspaceUpdates/distribute";
import { canReviewUpdates } from "~/server/services/workspaceUpdates/reviewers";
import {
  WORKSPACE_UPDATE_KIND,
  WORKSPACE_UPDATE_STATUS,
} from "~/server/services/workspaceUpdates/types";
import { manualPeriodKey, resolveWindowStart } from "~/server/services/workspaceUpdates/window";

const CONFIG_SELECT = {
  enabled: true,
  weekday: true,
  hour: true,
  timezone: true,
  reviewerIds: true,
  assistantId: true,
  indexPageId: true,
  enabledAt: true,
  isPublic: true,
  newsletterCollectionId: true,
} as const;

const DEFAULT_CONFIG = {
  enabled: false,
  weekday: 5,
  hour: 9,
  timezone: "UTC",
  reviewerIds: [] as string[],
  assistantId: null as string | null,
  indexPageId: null as string | null,
  enabledAt: null as Date | null,
  isPublic: false,
  newsletterCollectionId: null as string | null,
};

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Load an update and check the caller may review it (reviewer, owner or admin). */
async function loadReviewableUpdate(db: PrismaClient, updateId: string, userId: string) {
  const update = await db.workspaceUpdate.findUnique({
    where: { id: updateId },
    select: { id: true, workspaceId: true, status: true, pageId: true, version: true },
  });
  if (!update || !(await canReviewUpdates(db, update.workspaceId, userId))) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Update not found" });
  }
  return update;
}

/**
 * Move a DRAFT update to `data`. Conditional on still being DRAFT, so a double
 * click or two reviewers racing cannot approve-then-skip (or approve twice).
 */
async function transitionFromDraft(
  db: PrismaClient,
  updateId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const { count } = await db.workspaceUpdate.updateMany({
    where: { id: updateId, status: WORKSPACE_UPDATE_STATUS.DRAFT },
    data,
  });
  if (count === 0) {
    throw new TRPCError({ code: "CONFLICT", message: "This update has already been decided" });
  }
}

export const workspaceUpdateRouter = createTRPCRouter({
  /** The workspace's copywriter settings (defaults when never configured). */
  getConfig: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      const config = await ctx.db.workspaceUpdateConfig.findUnique({
        where: { workspaceId: input.workspaceId },
        select: CONFIG_SELECT,
      });
      return config ?? DEFAULT_CONFIG;
    }),

  updateConfig: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        enabled: z.boolean().optional(),
        weekday: z.number().int().min(0).max(6).optional(),
        hour: z.number().int().min(0).max(23).optional(),
        timezone: z.string().refine(isValidTimeZone, "Unknown time zone").optional(),
        reviewerIds: z.array(z.string()).max(20).optional(),
        assistantId: z.string().nullable().optional(),
        isPublic: z.boolean().optional(),
      }),
    )
    .use(requireWorkspaceMembership("manage_members"))
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, ...patch } = input;

      if (patch.reviewerIds?.length) {
        const members = await ctx.db.workspaceUser.count({
          where: { workspaceId, userId: { in: patch.reviewerIds } },
        });
        if (members !== new Set(patch.reviewerIds).size) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Reviewers must be workspace members" });
        }
      }
      if (patch.assistantId) {
        const assistant = await ctx.db.assistant.findFirst({
          where: { id: patch.assistantId, workspaceId },
          select: { id: true },
        });
        if (!assistant) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown assistant" });
      }

      const existing = await ctx.db.workspaceUpdateConfig.findUnique({
        where: { workspaceId },
        select: { enabled: true },
      });
      // Stamp enabledAt on the off→on edge: the schedule never backfills
      // periods from before the copywriter was switched on.
      const enabledAt =
        patch.enabled === true && !existing?.enabled ? new Date() : undefined;

      return ctx.db.workspaceUpdateConfig.upsert({
        where: { workspaceId },
        create: { workspaceId, ...patch, ...(enabledAt ? { enabledAt } : {}) },
        update: { ...patch, ...(enabledAt ? { enabledAt } : {}) },
        select: CONFIG_SELECT,
      });
    }),

  /**
   * Draft an update now, covering everything since the last scheduled one. A
   * preview: it never moves the scheduled window, and like every draft it
   * waits for approval.
   */
  generateNow: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .use(requireWorkspaceMembership("manage_members"))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const windowStart = await resolveWindowStart(ctx.db, {
        workspaceId: input.workspaceId,
        kind: WORKSPACE_UPDATE_KIND.WEEKLY,
        windowEnd: now,
      });
      return generateWorkspaceUpdate(
        ctx.db,
        {
          workspaceId: input.workspaceId,
          kind: WORKSPACE_UPDATE_KIND.WEEKLY,
          periodKey: manualPeriodKey(now),
          windowStart,
          windowEnd: now,
          actorUserId: ctx.session.user.id,
        },
        defaultGenerateDeps(ctx.db, { workspaceId: input.workspaceId, userId: ctx.session.user.id }),
      );
    }),

  /** Recent updates for the workspace, newest first. */
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string(), limit: z.number().int().min(1).max(50).default(10) }))
    .use(requireWorkspaceMembership("view"))
    .query(({ ctx, input }) =>
      ctx.db.workspaceUpdate.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        select: {
          id: true,
          kind: true,
          status: true,
          windowStart: true,
          windowEnd: true,
          pageId: true,
          createdAt: true,
          page: { select: { title: true } },
        },
      }),
    ),

  /** The update a Page is the body of, for the review banner. Null for ordinary Pages. */
  getForPage: protectedProcedure
    .input(z.object({ pageId: z.string() }))
    .query(async ({ ctx, input }) => {
      const update = await ctx.db.workspaceUpdate.findUnique({
        where: { pageId: input.pageId },
        select: {
          id: true,
          workspaceId: true,
          kind: true,
          status: true,
          windowStart: true,
          windowEnd: true,
          version: true,
          approvedAt: true,
          skippedAt: true,
        },
      });
      if (!update) return null;
      const membership = await ctx.db.workspaceUser.findUnique({
        where: { userId_workspaceId: { userId: ctx.session.user.id, workspaceId: update.workspaceId } },
        select: { role: true },
      });
      if (!membership) return null;
      const canReview = await canReviewUpdates(ctx.db, update.workspaceId, ctx.session.user.id);
      return { ...update, canReview };
    }),

  /**
   * Approve the draft the reviewer saw. Only ever moves DRAFT → APPROVED, and
   * only at the version shown, so a regeneration that landed in between is
   * never approved unseen. The Page's title and body are frozen onto the row:
   * distribution (V2) sends this snapshot, so a later edit to the live Page
   * never goes out unreviewed.
   */
  approve: protectedProcedure
    .input(z.object({ updateId: z.string(), version: z.number().int().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const update = await loadReviewableUpdate(ctx.db, input.updateId, ctx.session.user.id);
      const page = update.pageId
        ? await ctx.db.knowledgePage.findUnique({
            where: { id: update.pageId },
            select: { title: true, body: true },
          })
        : null;
      if (!page) {
        throw new TRPCError({ code: "CONFLICT", message: "This update has no draft to approve" });
      }
      const { count } = await ctx.db.workspaceUpdate.updateMany({
        where: { id: input.updateId, status: WORKSPACE_UPDATE_STATUS.DRAFT, version: input.version },
        data: {
          status: WORKSPACE_UPDATE_STATUS.APPROVED,
          approvedById: ctx.session.user.id,
          approvedAt: new Date(),
          approvedTitle: page.title,
          approvedBody: page.body ?? "",
        },
      });
      if (count === 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This draft changed or was already decided. Reload to see the latest.",
        });
      }
      // Distribute now; anything that fails is retried by the hourly sweep, so
      // a failed channel never undoes the approval.
      try {
        const result = await distributeWorkspaceUpdate(ctx.db, input.updateId, defaultDistributeChannels(ctx.db));
        if (result.kind === "sent") return { status: WORKSPACE_UPDATE_STATUS.SENT };
      } catch (err) {
        console.error("[workspaceUpdate.approve] distribution failed; the sweep will retry", err);
      }
      return { status: WORKSPACE_UPDATE_STATUS.APPROVED };
    }),

  /**
   * Rewrite a draft, optionally steered by feedback. Replaces the Page's
   * content (the reviewer's own edits included) and re-notifies the others.
   */
  regenerate: protectedProcedure
    .input(z.object({ updateId: z.string(), feedback: z.string().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const update = await loadReviewableUpdate(ctx.db, input.updateId, ctx.session.user.id);
      const result = await regenerateWorkspaceUpdate(
        ctx.db,
        { updateId: input.updateId, feedback: input.feedback ?? null, actorUserId: ctx.session.user.id },
        defaultGenerateDeps(ctx.db, { workspaceId: update.workspaceId, userId: ctx.session.user.id }),
      );
      if (result.kind === "not-draft") {
        throw new TRPCError({ code: "CONFLICT", message: "Only a draft can be regenerated" });
      }
      if (result.kind === "conflict") {
        throw new TRPCError({ code: "CONFLICT", message: "The draft changed while rewriting it. Try again." });
      }
      return result;
    }),

  /** Skip this period: nothing will be sent for it, and it is not redrafted. */
  skip: protectedProcedure
    .input(z.object({ updateId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await loadReviewableUpdate(ctx.db, input.updateId, ctx.session.user.id);
      await transitionFromDraft(ctx.db, input.updateId, {
        status: WORKSPACE_UPDATE_STATUS.SKIPPED,
        skippedById: ctx.session.user.id,
        skippedAt: new Date(),
      });
      return { status: WORKSPACE_UPDATE_STATUS.SKIPPED };
    }),
});
