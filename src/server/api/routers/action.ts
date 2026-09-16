import { z } from "zod";
import type { Prisma } from "@prisma/client";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { PRIORITY_VALUES, type Priority } from "~/types/priority";
import { parseActionInput } from "~/server/services/parsing";
import { ScoringService } from "~/server/services/ScoringService";
import { startOfDay } from "date-fns";
import { findUserByEmailInWorkspace, getWorkspaceMembership } from "~/server/services/access/resolvers/workspaceResolver";
import { getActionAccess, canViewAction, canEditAction, getProjectAccess, hasProjectAccess, isProjectInsider, canEditProject, buildActionAccessWhere } from "~/server/services/access";
import { apiKeyMiddleware } from "~/server/api/middleware/apiKeyAuth";
import { uploadToBlob } from "~/lib/blob";
import { emitNotification } from "~/server/services/notifications/emit/emitNotification";
import { NOTIFICATION_CATEGORIES } from "~/server/services/notifications/emit/constants";
import { PRODUCT_NAME } from "~/lib/brand";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";
import {
  logActionDiffActivities,
  logProjectActivity,
  PROJECT_ACTIVITY_TYPES,
} from "~/server/services/projectActivity";
import { recordActivity } from "~/server/services/activity/recordActivity";
import {
  actionWriteSchema,
  actionCreateAttachmentsSchema,
  actionUpdatePatchSchema,
  applyActionUpdate,
  assertAssignableUsers,
  assertCanWriteToWorkspace,
  createAction,
  isActionSource,
  KANBAN_STATUS_VALUES,
  actionWriteDeps,
  type ActionSource,
} from "~/server/services/actions";
import { partitionActions } from "~/lib/actions/partition";
import {
  myActionsDueTodayWhere,
  myActionsOwnershipWhere,
  myInboxActionsWhere,
} from "~/server/services/actions/myActionsWhere";
import { groupOverdueCohorts, daysOverdue } from "~/lib/actions/triage";

/**
 * Which surface a session-authenticated write came from, by principal: an
 * external-agent key is an agent (ADR-0049), a personal API token is the
 * CLI / SDK, anything else (browser session, extension, device) is the UI.
 */
function sourceForPrincipal(tokenType: string | undefined): ActionSource {
  if (tokenType === "agent-key") return "agent";
  if (tokenType === "api-token") return "cli";
  return "ui";
}

/**
 * `quickCreate` keeps its free-form `source` input (the iOS shortcut has sent
 * its legacy default for years), but `createAction` only accepts the closed
 * set. A value in the set passes through; the legacy `ios-shortcut` default
 * is the iOS shortcut, as is any call authenticated by an x-api-key header;
 * anything else is named from the principal.
 */
function resolveQuickCreateSource(
  requested: string,
  ctx: { tokenType?: string; viaApiKey: boolean },
): ActionSource {
  if (isActionSource(requested)) return requested;
  if (requested === "ios-shortcut" || ctx.viaApiKey) return "ios";
  return sourceForPrincipal(ctx.tokenType);
}

export const actionRouter = createTRPCRouter({
  getAll: protectedProcedure
    .input(z.object({
      assigneeId: z.string().optional(),
      workspaceId: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    // Base condition: show tasks I created (with no assignees) OR assigned to me.
    // Workspace filter matches either the action's own workspaceId or its project's
    // workspaceId so actions with no project (projectId=null) are still scoped correctly.
    const whereClause: any = {
      AND: [
        myActionsOwnershipWhere(userId),
        ...(input?.workspaceId
          ? [
              {
                OR: [
                  { workspaceId: input.workspaceId },
                  { project: { workspaceId: input.workspaceId } },
                ],
              },
            ]
          : []),
      ],
      status: {
        notIn: ["DELETED", "DRAFT"],
      },
    };

    // Add additional assignee filtering if specified (for filtering within user's tasks)
    if (input?.assigneeId) {
      whereClause.assignees = {
        some: {
          userId: input.assigneeId,
        },
      };
    }

    return ctx.db.action.findMany({
      where: whereClause,
      include: {
        project: true,
        syncs: true, // Include ActionSync records to show sync status
        assignees: {
          include: { user: { select: { id: true, name: true, email: true, image: true } } },
        },
        createdBy: { select: { id: true, name: true, email: true, image: true } },
        tags: { include: { tag: true } },
        lists: {
          include: {
            list: { select: { id: true, name: true, slug: true, listType: true, status: true } },
          },
        },
        epic: { select: { id: true, name: true, status: true } },
      },
      orderBy: {
        project: {
          priority: "asc",
        },
      },
    });
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const action = await ctx.db.action.findFirst({
        where: {
          id: input.id,
          status: { notIn: ["DELETED", "DRAFT"] },
          ...buildActionAccessWhere(userId),
        },
        include: {
          project: true,
          syncs: true,
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          createdBy: { select: { id: true, name: true, email: true, image: true } },
          tags: { include: { tag: true } },
          lists: {
            include: {
              list: { select: { id: true, name: true, slug: true, listType: true, status: true } },
            },
          },
          epic: { select: { id: true, name: true, status: true } },
          actionScreenshots: {
            include: {
              screenshot: { select: { id: true, url: true, timestamp: true } },
            },
          },
        },
      });

      if (!action) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Action not found or access denied",
        });
      }

      return action;
    }),

  /**
   * The rows behind a set of action ids, for surfaces that hold ids rather
   * than actions — the "Log a decision" modal stages its linked actions
   * client-side until the decision itself exists. Access-scoped like every
   * other read; ids the caller may not see are simply absent.
   */
  getByIds: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).max(50) }))
    .query(async ({ ctx, input }) => {
      if (input.ids.length === 0) return [];
      return ctx.db.action.findMany({
        where: {
          id: { in: input.ids },
          status: { notIn: ["DELETED", "DRAFT"] },
          ...buildActionAccessWhere(ctx.session.user.id),
        },
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          kanbanStatus: true,
          priority: true,
          dueDate: true,
          projectId: true,
          assignees: {
            select: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
        },
      });
    }),

  getByTranscription: protectedProcedure
    .input(
      z.object({
        transcriptionId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.action.findMany({
        where: {
          transcriptionSessionId: input.transcriptionId,
          status: { notIn: ["DELETED", "DRAFT"] },
          ...buildActionAccessWhere(ctx.session.user.id),
        },
        include: {
          project: true,
          syncs: true,
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          createdBy: { select: { id: true, name: true, email: true, image: true } },
          tags: { include: { tag: true } },
          lists: {
            include: {
              list: { select: { id: true, name: true, slug: true, listType: true, status: true } },
            },
          },
          epic: { select: { id: true, name: true, status: true } },
          actionScreenshots: {
            include: {
              screenshot: { select: { id: true, url: true, timestamp: true } },
            },
          },
        },
        orderBy: [
          { kanbanOrder: { sort: "asc", nulls: "last" } },
          { priority: "asc" },
          { dueDate: "asc" }
        ],
      });
    }),

  getDraftByTranscription: protectedProcedure
    .input(
      z.object({
        transcriptionId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.action.findMany({
        where: {
          transcriptionSessionId: input.transcriptionId,
          status: "DRAFT",
          createdById: ctx.session.user.id,
        },
        include: {
          project: true,
          syncs: true,
          assignees: {
            include: {
              user: { select: { id: true, name: true, email: true, image: true } },
            },
          },
          createdBy: { select: { id: true, name: true, email: true, image: true } },
          tags: { include: { tag: true } },
          lists: {
            include: {
              list: { select: { id: true, name: true, slug: true, listType: true, status: true } },
            },
          },
          epic: { select: { id: true, name: true, status: true } },
          actionScreenshots: {
            include: {
              screenshot: { select: { id: true, url: true, timestamp: true } },
            },
          },
        },
        orderBy: { id: "asc" },
      });
    }),

  getProjectActions: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      assigneeId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      // Verify user has access to this project
      const projectAccess = await getProjectAccess(ctx.db, ctx.session.user.id, input.projectId);
      if (!hasProjectAccess(projectAccess)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this project",
        });
      }

      const whereClause: any = {
        projectId: input.projectId,
        status: {
          notIn: ["DELETED", "DRAFT"],
        },
      };

      // Add assignee filtering if specified
      if (input.assigneeId) {
        whereClause.assignees = {
          some: {
            userId: input.assigneeId,
          },
        };
      }

      return ctx.db.action.findMany({
        where: whereClause,
        include: {
          // Every row in this query shares one project, so a full project row
          // (description, aiInstructions, taskManagementConfig JSON) would be
          // duplicated N times per response. Select only what rows render.
          project: { select: { id: true, name: true, slug: true, workspaceId: true } },
          syncs: true, // Include ActionSync records to show sync status
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          createdBy: { select: { id: true, name: true, email: true, image: true } },
          tags: { include: { tag: true } },
        },
        orderBy: [
          { kanbanOrder: { sort: "asc", nulls: "last" } },
          { priority: "asc" },
          { dueDate: "asc" }
        ],
      });
    }),

  // Get actions imported from Notion that don't have a project assigned
  getNotionImportedWithoutProject: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.session.user.id;

      return ctx.db.action.findMany({
        where: {
          // Same logic as getAll - show actions I created (with no assignees) OR assigned to me
          OR: [
            { createdById: userId, assignees: { none: {} } },
            { assignees: { some: { userId: userId } } },
          ],
          projectId: null,
          status: { notIn: ["DELETED", "DRAFT"] },
          syncs: {
            some: { provider: "notion" }
          }
        },
        include: {
          syncs: true,
          project: true,
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          tags: { include: { tag: true } },
        },
        orderBy: { id: 'desc' }
      });
    }),

  // Get actions for Kanban board with comprehensive filtering
  getKanbanActions: protectedProcedure
    .input(z.object({
      projectId: z.string().optional(),
      assigneeId: z.string().optional(),
      kanbanStatus: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const whereClause: any = {
        createdById: ctx.session.user.id,
        status: {
          notIn: ["DELETED", "DRAFT"],
        },
        // Only include actions that have a kanbanStatus (project-associated actions)
        kanbanStatus: {
          not: null,
        },
      };

      // Add project filtering if specified
      if (input?.projectId) {
        whereClause.projectId = input.projectId;
      }

      // Add assignee filtering if specified
      if (input?.assigneeId) {
        whereClause.assignees = {
          some: {
            userId: input.assigneeId,
          },
        };
      }

      // Add kanban status filtering if specified
      if (input?.kanbanStatus) {
        whereClause.kanbanStatus = input.kanbanStatus;
      }

      return ctx.db.action.findMany({
        where: whereClause,
        include: {
          project: true,
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          tags: { include: { tag: true } },
        },
        orderBy: [
          { kanbanStatus: "asc" }, // Order by kanban status first
          { kanbanOrder: { sort: "asc", nulls: "last" } },
          { priority: "asc" },
          { dueDate: "asc" }
        ],
      });
    }),

  create: protectedProcedure
    // The shared write shape plus the optional attachments: the app sends
    // tags, assignees and sprint with the create and gets them in one
    // transaction; an external caller may still create and then attach.
    .input(actionWriteSchema.merge(actionCreateAttachmentsSchema))
    .mutation(({ ctx, input }) =>
      createAction(actionWriteDeps(ctx), {
        ...input,
        // The *who* is createdById (for an agent, its shadow user; ADR-0049),
        // the *how* is source, named from the principal.
        source: sourceForPrincipal(ctx.tokenType),
      }),
    ),

  /**
   * Idempotently ensure a "Do daily plan" prompt Action exists for today.
   * Deduped via source="daily-plan-prompt" (kept distinct from "daily-plan",
   * the source of a task converted from a plan, or a planned task due today
   * would suppress the prompt). Safe to call on every app load.
   */
  ensureDailyPlanPromptAction: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().optional(),
      }).optional(),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // `createAction` gates the write itself; this up-front check is so the
      // existence probe below never runs against a workspace the caller
      // cannot write to (the same free-form `workspaceId` as `create`).
      if (input?.workspaceId) {
        await assertCanWriteToWorkspace(ctx.db, userId, input.workspaceId);
      }

      const today = startOfDay(new Date());
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const existing = await ctx.db.action.findFirst({
        where: {
          createdById: userId,
          source: "daily-plan-prompt",
          status: "ACTIVE",
          dueDate: { gte: today, lt: tomorrow },
          ...(input?.workspaceId ? { workspaceId: input.workspaceId } : {}),
        },
        select: { id: true },
      });

      if (existing) {
        return { created: false, actionId: existing.id };
      }

      const created = await createAction(actionWriteDeps(ctx), {
        name: "Do daily plan",
        description: "Set aside 5 minutes to plan your day.",
        dueDate: today,
        // The canonical top priority. The row used to carry the legacy
        // integration value "High", which is outside PRIORITY_VALUES and
        // which the shared write schema refuses.
        priority: "1st Priority",
        status: "ACTIVE",
        source: "daily-plan-prompt",
        workspaceId: input?.workspaceId,
      });

      return { created: true, actionId: created.id };
    }),

  update: protectedProcedure
    // The shared update patch, minus the with-order callers' `kanbanOrder`
    // and with `projectId` as this procedure always took it (no clearing).
    .input(
      actionUpdatePatchSchema.omit({ kanbanOrder: true }).extend({
        id: z.string(),
        projectId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input;

      const { action: updatedAction, previous, transitions } = await applyActionUpdate(
        actionWriteDeps(ctx),
        id,
        patch,
        { include: { dailyPlanActions: { include: { dailyPlan: true } } } },
      );

      // Project activity audit log: explicit status + dueDate diffs
      // (fire-and-forget). A kanban-driven status change is already logged
      // by the module as the column move; logging the coarse diff too would
      // record one drag twice.
      if (previous.projectId) {
        const statusDiff =
          patch.status !== undefined && transitions.statusChanged
            ? { from: previous.status, to: transitions.nextStatus }
            : undefined;
        const dueDateDiff =
          patch.dueDate !== undefined
            ? { from: previous.dueDate ?? null, to: patch.dueDate ?? null }
            : undefined;

        if (statusDiff || dueDateDiff) {
          void logActionDiffActivities(ctx.db, {
            projectId: previous.projectId,
            actionId: id,
            changedById: ctx.session.user.id,
            diff: { status: statusDiff, dueDate: dueDateDiff },
          }).catch((err: unknown) => {
            console.error("[projectActivity] action.update diff:", err);
          });
        }
      }

      // Recalculate score if completion status changed and action is linked to daily plan
      // Run async without blocking the response for faster UI
      if (transitions.completing || transitions.uncompleting) {
        if (updatedAction.dailyPlanActions.length > 0) {
          // Fire and forget - don't await scoring calculation
          void Promise.all(
            updatedAction.dailyPlanActions.map((dpa) =>
              ScoringService.calculateDailyScore(
                ctx,
                dpa.dailyPlan.date,
                dpa.dailyPlan.workspaceId ?? undefined
              ).catch((err) => {
                console.error("[action.update] Failed to recalculate score:", err);
              })
            )
          );
        }
      }

      // Recalculate score if an overdue task's date was changed (overdue count affects score)
      const dateChanged = patch.scheduledStart !== undefined || patch.dueDate !== undefined;
      if (dateChanged && previous.scheduledStart) {
        const today = startOfDay(new Date());
        const wasOverdue = startOfDay(previous.scheduledStart) < today;

        if (wasOverdue) {
          // Check if all overdue tasks are now cleared
          const remainingOverdue = await ctx.db.action.count({
            where: {
              createdById: ctx.session.user.id,
              status: "ACTIVE",
              id: { not: id },
              scheduledStart: { lt: today },
            },
          });

          if (remainingOverdue === 0) {
            // All overdue tasks cleared - mark processedOverdue on today's daily plan
            await ctx.db.dailyPlan.updateMany({
              where: {
                userId: ctx.session.user.id,
                date: today,
                processedOverdue: false,
              },
              data: { processedOverdue: true },
            });

            // Also mark on DailyScore directly (decoupled from daily plan)
            await ctx.db.dailyScore.updateMany({
              where: {
                userId: ctx.session.user.id,
                date: today,
                processedOverdue: false,
              },
              data: { processedOverdue: true },
            });
          }

          // Fire and forget - recalculate today's score since overdue count changed
          void ScoringService.calculateDailyScore(
            ctx,
            today,
            updatedAction.workspaceId ?? undefined
          ).catch((err) => {
            console.error("[action.update] Failed to recalculate score after overdue change:", err);
          });
        }
      }

      return updatedAction;
    }),

  // Update kanban status (for drag-and-drop)
  updateKanbanStatus: protectedProcedure
    .input(z.object({
      actionId: z.string(),
      kanbanStatus: z.enum(KANBAN_STATUS_VALUES),
    }))
    .mutation(async ({ ctx, input }) => {
      // Gate, kanban ⇄ status lockstep, analytics row and activity are all
      // the module's; this procedure only names the column.
      const { action } = await applyActionUpdate(
        actionWriteDeps(ctx),
        input.actionId,
        { kanbanStatus: input.kanbanStatus },
        {
          include: {
            project: true,
            assignees: {
              include: { user: { select: { id: true, name: true, email: true, image: true } } },
            },
          },
        },
      );
      return action;
    }),

 getToday: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.action.findMany({
        where: myActionsDueTodayWhere(ctx.session.user.id, new Date(), input?.workspaceId),
        include: {
          project: true,
          syncs: true, // Include ActionSync records to show sync status
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          createdBy: { select: { id: true, name: true, email: true, image: true } },
          tags: { include: { tag: true } },
        },
        orderBy: {
          project: {
            priority: "desc",
          },
        },
      });
    }),

  // The sidebar's Inbox and Today badges. Counts only: the badges used to
  // download every action (action.getAll, ~2 MB for a busy user) on every
  // page just to count them. Same sets as filtering getAll() by
  // `!projectId && status === "ACTIVE"` and as getToday().length.
  getSidebarCounts: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const [inboxCount, todayCount] = await Promise.all([
      ctx.db.action.count({ where: myInboxActionsWhere(userId) }),
      ctx.db.action.count({ where: myActionsDueTodayWhere(userId, new Date()) }),
    ]);
    return { inboxCount, todayCount };
  }),

  // Today's actions (ADR-0034): the cross-workspace, scheduled-or-due set the
  // /today page renders, exposed for Zoe's `get-todays-actions` tool. Uses the
  // same `partitionActions()` source of truth as the client hook, so "what
  // counts as today" agrees by construction. Distinct from the due-only
  // Daily brief (`generateBriefingData`).
  getTodaysActions: protectedProcedure
    .input(
      z
        .object({
          workspaceId: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Same ownership as action.getAll: created-by-me-with-no-assignees OR
      // assigned-to-me. Cross-workspace by default; optional workspaceId filter
      // matches either the action's own workspace or its project's workspace
      // (so project-less actions are still scoped correctly).
      const actions = await ctx.db.action.findMany({
        where: {
          AND: [
            {
              OR: [
                { createdById: userId, assignees: { none: {} } },
                { assignees: { some: { userId } } },
              ],
            },
            ...(input?.workspaceId
              ? [
                  {
                    OR: [
                      { workspaceId: input.workspaceId },
                      { project: { workspaceId: input.workspaceId } },
                    ],
                  },
                ]
              : []),
          ],
          status: "ACTIVE",
        },
        select: {
          id: true,
          name: true,
          status: true,
          priority: true,
          scheduledStart: true,
          dueDate: true,
          projectId: true,
          completedAt: true,
          project: {
            select: {
              name: true,
              workspace: { select: { name: true } },
            },
          },
          workspace: { select: { name: true } },
        },
      });

      const partition = partitionActions(actions, { today: new Date() });

      const PER_GROUP_CAP = 50;
      const toRow = (a: (typeof actions)[number]) => ({
        id: a.id,
        name: a.name,
        status: a.status,
        scheduledStart: a.scheduledStart,
        dueDate: a.dueDate,
        projectName: a.project?.name ?? null,
        workspaceName: a.workspace?.name ?? a.project?.workspace?.name ?? null,
      });

      const toGroup = (group: (typeof actions)) => ({
        count: group.length,
        actions: group.slice(0, PER_GROUP_CAP).map(toRow),
      });

      return {
        overdue: toGroup(partition.overdue),
        today: toGroup(partition.todays),
        inbox: toGroup(partition.inbox),
      };
    }),

  // Why is the overdue pile the size it is? `getTodaysActions` answers "what is
  // overdue"; this answers "what kind of overdue", which is what anyone (human
  // or agent) needs before proposing a disposition.
  //
  // The signal is the anchor timestamp. A human dating actions one at a time
  // produces distinct times; a bulk write — a generated project plan, an
  // import, a template — stamps every row with a single millisecond-identical
  // value. So actions sharing an exact anchor are a **cohort**: almost
  // certainly never individually due, and the right disposition is amnesty
  // (`bulkDefer`), not another reschedule. Everything else is `loose` — real,
  // individually-dated debt worth actually looking at.
  getOverdueTriage: protectedProcedure
    .input(
      z
        .object({
          workspaceId: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Same ownership and scoping rules as getTodaysActions, so the triage
      // view and the /today page always describe the same pile.
      const actions = await ctx.db.action.findMany({
        where: {
          AND: [
            {
              OR: [
                { createdById: userId, assignees: { none: {} } },
                { assignees: { some: { userId } } },
              ],
            },
            ...(input?.workspaceId
              ? [
                  {
                    OR: [
                      { workspaceId: input.workspaceId },
                      { project: { workspaceId: input.workspaceId } },
                    ],
                  },
                ]
              : []),
          ],
          status: "ACTIVE",
        },
        select: {
          id: true,
          name: true,
          status: true,
          priority: true,
          scheduledStart: true,
          dueDate: true,
          projectId: true,
          completedAt: true,
          project: { select: { name: true } },
        },
      });

      const today = new Date();
      const { overdue } = partitionActions(actions, { today });
      const triage = groupOverdueCohorts(overdue, { today });

      const toRow = (a: (typeof overdue)[number]) => ({
        id: a.id,
        name: a.name,
        priority: a.priority,
        scheduledStart: a.scheduledStart,
        dueDate: a.dueDate,
        projectName: a.project?.name ?? null,
        daysOverdue: daysOverdue(a, today),
      });

      return {
        totalOverdue: triage.totalOverdue,
        cohortCount: triage.cohortCount,
        cohorts: triage.cohorts.map((c) => ({
          stampedAt: c.stampedAt,
          daysOverdue: c.daysOverdue,
          count: c.count,
          projectNames: c.projectNames,
          actionIds: c.actionIds,
          actions: c.actions.map(toRow),
        })),
        loose: triage.loose.map(toRow),
      };
    }),

  getByDateRange: protectedProcedure
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
        workspaceId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      return ctx.db.action.findMany({
        where: {
          OR: [
            // Created by me AND no assignees
            { createdById: userId, assignees: { none: {} } },
            // Assigned to me via ActionAssignee
            { assignees: { some: { userId: userId } } },
          ],
          dueDate: {
            gte: input.startDate,
            lt: input.endDate,
          },
          status: "ACTIVE",
          // Filter by workspace via the action's project
          ...(input.workspaceId ? { project: { workspaceId: input.workspaceId } } : {}),
        },
        include: {
          project: true,
          syncs: true,
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          createdBy: { select: { id: true, name: true, email: true, image: true } },
          tags: { include: { tag: true } },
        },
        orderBy: { dueDate: "asc" },
      });
    }),

  // Get scheduled actions for calendar display
  getScheduledByDate: protectedProcedure
    .input(
      z.object({
        date: z.date(),
        workspaceId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Get start and end of the day
      const startOfDay = new Date(input.date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(input.date);
      endOfDay.setHours(23, 59, 59, 999);

      return ctx.db.action.findMany({
        where: {
          OR: [
            { createdById: userId, assignees: { none: {} } },
            { assignees: { some: { userId: userId } } },
          ],
          scheduledStart: {
            gte: startOfDay,
            lte: endOfDay,
          },
          status: "ACTIVE",
          ...(input.workspaceId ? { project: { workspaceId: input.workspaceId } } : {}),
        },
        include: {
          project: true,
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          createdBy: { select: { id: true, name: true, email: true, image: true } },
          tags: { include: { tag: true } },
        },
        orderBy: { scheduledStart: "asc" },
      });
    }),

  // Get scheduled actions for a date range (calendar week/month view)
  getScheduledByDateRange: protectedProcedure
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
        workspaceId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [scheduledActions, scheduledDailyPlanTasks] = await Promise.all([
        ctx.db.action.findMany({
          where: {
            OR: [
              { createdById: userId, assignees: { none: {} } },
              { assignees: { some: { userId: userId } } },
            ],
            scheduledStart: {
              gte: input.startDate,
              lte: input.endDate,
            },
            status: "ACTIVE",
            ...(input.workspaceId ? { project: { workspaceId: input.workspaceId } } : {}),
          },
          include: {
            project: true,
            assignees: {
              include: { user: { select: { id: true, name: true, email: true, image: true } } },
            },
            createdBy: { select: { id: true, name: true, email: true, image: true } },
            tags: { include: { tag: true } },
          },
          orderBy: { scheduledStart: "asc" },
        }),
        ctx.db.dailyPlanAction.findMany({
          where: {
            actionId: null,
            scheduledStart: {
              gte: input.startDate,
              lte: input.endDate,
            },
            dailyPlan: {
              userId,
              ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
            },
          },
          include: {
            action: {
              include: {
                project: true,
              },
            },
          },
        }),
      ]);

      const scheduledItems = [
        ...scheduledActions.map((action) => ({
          id: action.id,
          actionId: action.id,
          dailyPlanActionId: null,
          name: action.name,
          scheduledStart: action.scheduledStart!,
          scheduledEnd: action.scheduledEnd,
          duration: action.duration,
          status: action.status,
          project: action.project,
          source: "action" as const,
        })),
        ...scheduledDailyPlanTasks.map((task) => ({
          id: task.id,
          actionId: null,
          dailyPlanActionId: task.id,
          name: task.name,
          scheduledStart: task.scheduledStart!,
          scheduledEnd: task.scheduledEnd,
          duration: task.duration,
          status: task.completed ? "COMPLETED" : "ACTIVE",
          project: task.action?.project ?? null,
          source: "daily-plan" as const,
        })),
      ];

      return scheduledItems.sort(
        (a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime()
      );
    }),

  updateActionsProject: protectedProcedure
    .input(
      z.object({
        transcriptionSessionId: z.string(),
        projectId: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      console.log('🔄 updateActionsProject called with:', {
        transcriptionSessionId: input.transcriptionSessionId,
        projectId: input.projectId,
        userId: ctx.session.user.id
      });

      // First, let's check what actions exist for this transcription session
      let existingActions;
      try {
        existingActions = await ctx.db.action.findMany({
          where: {
            transcriptionSessionId: input.transcriptionSessionId,
            createdById: ctx.session.user.id,
          },
          select: {
            id: true,
            name: true,
            projectId: true,
            transcriptionSessionId: true,
          },
        });

        console.log('📋 Found existing actions for this transcription:', {
          count: existingActions.length,
          actions: existingActions.map((a) => ({
            id: a.id,
            name: a.name,
            currentProjectId: a.projectId,
            transcriptionSessionId: a.transcriptionSessionId
          }))
        });
      } catch (error) {
        console.error('❌ Error finding actions:', error);
        throw new Error(`Failed to find actions: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Verify edit access on the target project once, up front (no-op when
      // clearing the project), so the batch is refused as a whole.
      if (input.projectId) {
        const access = await getProjectAccess(
          ctx.db,
          ctx.session.user.id,
          input.projectId,
        );
        if (!canEditProject(access)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "You don't have permission to assign actions to this project",
          });
        }
      }

      // Each of the caller's own actions from this transcript goes through
      // applyActionUpdate: target re-check, workspace from the project,
      // kanban re-seed (or clear) and the activity event.
      const deps = actionWriteDeps(ctx);
      let count = 0;
      for (const { id } of existingActions) {
        try {
          await applyActionUpdate(deps, id, { projectId: input.projectId });
          count += 1;
        } catch (error) {
          console.error('❌ Error updating action:', id, error);
          throw new Error(`Failed to update actions: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      console.log('✅ Update result:', {
        count,
        message: `Updated ${count} action${count === 1 ? '' : 's'}`,
        existingActionsFound: existingActions.length
      });

      return {
        count,
        message: `Updated ${count} action${count === 1 ? '' : 's'}`,
      };
    }),

  // Debug endpoint to check action-transcription relationships
  debugTranscriptionActions: protectedProcedure
    .input(z.object({ transcriptionSessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const actions = await ctx.db.action.findMany({
        where: {
          createdById: ctx.session.user.id,
        },
        select: {
          id: true,
          name: true,
          projectId: true,
          transcriptionSessionId: true,
        },
        orderBy: {
          id: 'desc'
        }
      });

      const transcriptionSession = await ctx.db.transcriptionSession.findUnique({
        where: { id: input.transcriptionSessionId },
        select: {
          id: true,
          sessionId: true,
          title: true,
        }
      });

      return {
        transcriptionSession,
        allUserActions: actions,
        actionsForThisTranscription: actions.filter((a: any) => a.transcriptionSessionId === input.transcriptionSessionId),
        totalActions: actions.length,
      };
    }),

  // Link existing actions to a transcription session
  linkActionsToTranscription: protectedProcedure
    .input(z.object({ 
      actionIds: z.array(z.string()),
      transcriptionSessionId: z.string() 
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.action.updateMany({
        where: {
          id: { in: input.actionIds },
          createdById: ctx.session.user.id, // Ensure user owns the actions
        },
        data: {
          transcriptionSessionId: input.transcriptionSessionId,
        },
      });

      return {
        count: result.count,
        message: `Linked ${result.count} action${result.count === 1 ? '' : 's'} to transcription`,
      };
    }),

  // Bulk delete actions
  bulkDelete: protectedProcedure
    .input(z.object({
      actionIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      // Snapshot project links + names BEFORE deleting so we can write activity rows.
      const toDelete = await ctx.db.action.findMany({
        where: {
          id: { in: input.actionIds },
          ...buildActionAccessWhere(ctx.session.user.id),
        },
        select: { id: true, name: true, projectId: true },
      });

      const result = await ctx.db.action.deleteMany({
        where: {
          id: { in: input.actionIds },
          ...buildActionAccessWhere(ctx.session.user.id),
        },
      });

      const projectScoped = toDelete.filter((a) => a.projectId !== null);
      if (projectScoped.length > 0) {
        void Promise.all(
          projectScoped.map((a) =>
            logProjectActivity(ctx.db, {
              projectId: a.projectId!,
              actionId: null,
              type: PROJECT_ACTIVITY_TYPES.ACTION_DELETED,
              fromValue: a.name,
              changedById: ctx.session.user.id,
            }),
          ),
        ).catch((err: unknown) => {
          console.error("[projectActivity] bulkDelete:", err);
        });
      }

      return {
        count: result.count,
        message: `Deleted ${result.count} action${result.count === 1 ? '' : 's'}`,
      };
    }),

  // Bulk reschedule actions: moves the do-date (`scheduledStart`) and the
  // deadline (`dueDate`) together onto the chosen day.
  //
  // `scheduledStart` is the field that decides the bucket. `partitionActions`
  // treats an action as overdue when its `scheduledStart` is before today and
  // only consults `dueDate` when there is no `scheduledStart` at all — schedule
  // wins. Writing the deadline alone therefore leaves a past `scheduledStart`
  // untouched and the action stays in the overdue pile, which turns "Reschedule
  // all overdue" into a no-op against exactly the rows it was aimed at.
  //
  // What genuinely was broken is the *value*: this used to stamp the caller's
  // wall-clock instant, so a bulk reschedule drew every action as an hour-long
  // block seconds apart on the agenda rail. Callers now send local midnight
  // (see `resolveQuickReschedule`) — normalised client-side, because the day
  // boundary belongs to the viewer's timezone, not the server's.
  //
  // A null date clears both fields, so "No date" empties the pile rather than
  // leaving a stale time-block behind. `bulkDefer` remains the intent-carrying
  // path for amnesty — it also writes activity rows.
  bulkReschedule: protectedProcedure
    .input(z.object({
      actionIds: z.array(z.string()),
      dueDate: z.date().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.action.updateMany({
        where: {
          id: { in: input.actionIds },
          ...buildActionAccessWhere(ctx.session.user.id),
        },
        data: {
          scheduledStart: input.dueDate,
          dueDate: input.dueDate,
        },
      });

      return {
        count: input.actionIds.length,
        actionIds: input.actionIds,
      };
    }),

  // Amnesty: un-date actions back to their project backlog.
  //
  // Lands on the same columns as `bulkReschedule({ dueDate: null })`, but keep
  // both: this one records activity rows for what was cleared, and the name is
  // what callers (and agents doing tool discovery) match on. The difference is
  // intent, and intent is what they need to express:
  // rescheduling says "this is still due, later"; deferring says "this was
  // never really due — stop counting it against me". Most large overdue piles
  // are the second case (a project plan bulk-stamped with one date), and
  // rescheduling them just re-inflicts the pile tomorrow.
  //
  // Only the dates are touched. Kanban status is left alone on purpose: an
  // action can be untimed and still be IN_PROGRESS on a board.
  bulkDefer: protectedProcedure
    .input(z.object({
      actionIds: z.array(z.string()).min(1).max(200),
    }))
    .mutation(async ({ ctx, input }) => {
      // Snapshot before clearing so the activity rows record what was lost.
      const toDefer = await ctx.db.action.findMany({
        where: {
          id: { in: input.actionIds },
          ...buildActionAccessWhere(ctx.session.user.id),
        },
        select: { id: true, projectId: true, dueDate: true, scheduledStart: true },
      });

      const result = await ctx.db.action.updateMany({
        where: {
          id: { in: toDefer.map((a) => a.id) },
          ...buildActionAccessWhere(ctx.session.user.id),
        },
        data: {
          scheduledStart: null,
          scheduledEnd: null,
          dueDate: null,
        },
      });

      const projectScoped = toDefer.filter((a) => a.projectId !== null);
      if (projectScoped.length > 0) {
        void Promise.all(
          projectScoped.map((a) =>
            logProjectActivity(ctx.db, {
              projectId: a.projectId!,
              actionId: a.id,
              type: PROJECT_ACTIVITY_TYPES.DUE_DATE_CHANGED,
              fromValue: (a.dueDate ?? a.scheduledStart)?.toISOString() ?? null,
              toValue: null,
              changedById: ctx.session.user.id,
            }),
          ),
        ).catch((err: unknown) => {
          console.error("[projectActivity] bulkDefer:", err);
        });
      }

      return {
        count: result.count,
        actionIds: toDefer.map((a) => a.id),
        message: `Deferred ${result.count} action${result.count === 1 ? '' : 's'} back to the backlog`,
      };
    }),

  // Bulk assign project to multiple actions
  bulkAssignProject: protectedProcedure
    .input(z.object({
      actionIds: z.array(z.string()),
      projectId: z.string().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify the caller can edit the destination project once, up front,
      // so the batch is refused as a whole rather than skipped per Action.
      if (input.projectId) {
        const access = await getProjectAccess(
          ctx.db,
          ctx.session.user.id,
          input.projectId,
        );
        if (!canEditProject(access)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "You don't have permission to assign actions to this project",
          });
        }
      }

      // Same reader set as before: the actions the caller may touch. Each
      // then goes through applyActionUpdate, which re-checks the target,
      // takes its workspace and re-seeds (or clears) the kanban column.
      const accessible = await ctx.db.action.findMany({
        where: {
          id: { in: input.actionIds },
          ...buildActionAccessWhere(ctx.session.user.id),
        },
        select: { id: true },
      });

      const deps = actionWriteDeps(ctx);
      let count = 0;
      for (const { id } of accessible) {
        try {
          await applyActionUpdate(deps, id, { projectId: input.projectId });
          count += 1;
        } catch (err) {
          // The target was checked above, so a FORBIDDEN here is one Action
          // the caller may read but not edit, and a NOT_FOUND one that went
          // away since the lookup: both skipped, as updateMany did.
          if (err instanceof TRPCError && (err.code === "FORBIDDEN" || err.code === "NOT_FOUND")) continue;
          throw err;
        }
      }

      return {
        count,
        actionIds: input.actionIds,
        projectId: input.projectId,
      };
    }),

  // Assign users to an action
  assign: protectedProcedure
    .input(z.object({
      actionId: z.string(),
      userIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify the action exists and user has permission to modify it
      const action = await ctx.db.action.findUnique({
        where: { id: input.actionId },
        select: { id: true, projectId: true, teamId: true, workspaceId: true },
      });

      if (!action) {
        throw new Error("Action not found");
      }

      // Check if user has permission to modify this action (creator, assignee, project member, or team member)
      const hasPermission = await ctx.db.action.findFirst({
        where: {
          id: input.actionId,
          ...buildActionAccessWhere(ctx.session.user.id),
        },
        select: { id: true },
      });

      if (!hasPermission) {
        throw new Error("You don't have permission to modify this action");
      }

      // Same containment rule `createAction` applies to assignees attached on
      // create, so attaching later cannot reach further than attaching at
      // creation. Rejects with NOT_FOUND and never names the rejected user.
      await assertAssignableUsers(
        ctx.db,
        ctx.session.user.id,
        {
          projectId: action.projectId,
          teamId: action.teamId,
          workspaceId: action.workspaceId,
        },
        input.userIds,
      );

      // Snapshot existing assignees so we can compute the diff for activity logging.
      const priorAssignees = await ctx.db.actionAssignee.findMany({
        where: { actionId: input.actionId },
        select: { userId: true },
      });
      const priorIds = priorAssignees.map((a) => a.userId);
      const nextIds = Array.from(new Set([...priorIds, ...input.userIds]));

      // Create assignments for each user (using createMany with skipDuplicates)
      await ctx.db.actionAssignee.createMany({
        data: input.userIds.map(userId => ({
          actionId: input.actionId,
          userId,
        })),
        skipDuplicates: true,
      });

      if (action.projectId && nextIds.length !== priorIds.length) {
        void logActionDiffActivities(ctx.db, {
          projectId: action.projectId,
          actionId: input.actionId,
          changedById: ctx.session.user.id,
          diff: { assigneeIds: { from: priorIds, to: nextIds } },
        }).catch((err: unknown) => {
          console.error("[projectActivity] assign:", err);
        });
      }

      // Unified notification pipeline (ADR-0045): emit an Assignment notification.
      // Resolves recipients + enabled channels, persists a durable Notification
      // record, and delivers best-effort synchronously; the cron worker retries
      // any channel that failed. Never notifies the assigner about their own action.
      void emitNotification({
        category: NOTIFICATION_CATEGORIES.ASSIGNMENT,
        actorUserId: ctx.session.user.id,
        subject: {
          actionId: input.actionId,
          assignedUserIds: input.userIds,
        },
        db: ctx.db,
      });

      // Return updated action with assignees
      return ctx.db.action.findUnique({
        where: { id: input.actionId },
        include: {
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          project: true,
        },
      });
    }),

  // Unassign users from an action
  unassign: protectedProcedure
    .input(z.object({
      actionId: z.string(),
      userIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check if user is removing themselves (self-removal should always be allowed)
      const isSelfRemoval = input.userIds.length === 1 && input.userIds[0] === ctx.session.user.id;

      // Verify the action exists
      const action = await ctx.db.action.findFirst({
        where: {
          id: input.actionId,
          // For self-removal, just verify the action exists
          // For unassigning others, verify user has permission
          ...(isSelfRemoval ? {} : buildActionAccessWhere(ctx.session.user.id)),
        },
      });

      if (!action) {
        // Check if the action exists at all (to give appropriate error message)
        const actionExists = await ctx.db.action.findUnique({
          where: { id: input.actionId },
          select: { id: true },
        });

        if (!actionExists) {
          throw new Error("Action not found");
        }
        throw new Error("You don't have permission to modify this action");
      }

      // Snapshot existing assignees so we can log the diff
      const priorAssignees = await ctx.db.actionAssignee.findMany({
        where: { actionId: input.actionId },
        select: { userId: true },
      });
      const priorIds = priorAssignees.map((a) => a.userId);
      const removeSet = new Set(input.userIds);
      const nextIds = priorIds.filter((id) => !removeSet.has(id));

      // Remove assignments
      await ctx.db.actionAssignee.deleteMany({
        where: {
          actionId: input.actionId,
          userId: { in: input.userIds },
        },
      });

      if (action.projectId && nextIds.length !== priorIds.length) {
        void logActionDiffActivities(ctx.db, {
          projectId: action.projectId,
          actionId: input.actionId,
          changedById: ctx.session.user.id,
          diff: { assigneeIds: { from: priorIds, to: nextIds } },
        }).catch((err: unknown) => {
          console.error("[projectActivity] unassign:", err);
        });
      }

      // Return updated action with assignees
      return ctx.db.action.findUnique({
        where: { id: input.actionId },
        include: {
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          project: true,
        },
      });
    }),

  // Bulk assign users to multiple actions
  bulkAssign: protectedProcedure
    .input(z.object({
      actionIds: z.array(z.string()),
      userIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify all actions exist and user has permission to modify them
      const actions = await ctx.db.action.findMany({
        where: {
          id: { in: input.actionIds },
          createdById: ctx.session.user.id, // Ensure user owns all actions
        },
        select: { id: true, name: true, projectId: true, teamId: true, workspaceId: true },
      });

      if (actions.length !== input.actionIds.length) {
        throw new Error("Some actions not found or you don't have permission to modify them");
      }

      // Same containment rule as `assign` and `createAction`, per action.
      // Names the action (the caller owns it) but never the rejected user.
      for (const action of actions) {
        try {
          await assertAssignableUsers(
            ctx.db,
            ctx.session.user.id,
            {
              projectId: action.projectId,
              teamId: action.teamId,
              workspaceId: action.workspaceId,
            },
            input.userIds,
          );
        } catch (err) {
          if (err instanceof TRPCError && err.code === "NOT_FOUND") {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `${err.message} (action "${action.name}")`,
            });
          }
          throw err;
        }
      }

      // Create all assignments
      const assignments = input.actionIds.flatMap(actionId =>
        input.userIds.map(userId => ({ actionId, userId }))
      );

      await ctx.db.actionAssignee.createMany({
        data: assignments,
        skipDuplicates: true,
      });

      return {
        count: assignments.length,
        message: `Assigned ${input.userIds.length} user${input.userIds.length === 1 ? '' : 's'} to ${input.actionIds.length} action${input.actionIds.length === 1 ? '' : 's'}`,
      };
    }),

  // Get users available for assignment to a specific action
  // Returns all users from all teams the current user belongs to
  getAssignableUsers: protectedProcedure
    .input(z.object({
      actionId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      // Get the action to verify it exists and get context. The access probe
      // runs alongside it — both are independent reads keyed off actionId.
      const [action, access] = await Promise.all([
        ctx.db.action.findUnique({
          where: { id: input.actionId },
          include: {
            project: true,
            team: true,
          },
        }),
        getActionAccess(ctx.db, ctx.session.user.id, input.actionId),
      ]);

      // Without this, naming any action id returned its whole assignable
      // roster — every workspace and project member, emails included — to any
      // logged-in caller. View access is the right bar: assignment itself is
      // separately gated on canEditAction, and a viewer legitimately needs the
      // roster to render existing assignees.
      //
      // Missing and forbidden collapse into the same NOT_FOUND deliberately:
      // distinguishable responses would confirm which action CUIDs exist. Same
      // rule as `getById` above and as `assignability.ts`.
      if (!action || !access || !canViewAction(access)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Action not found or access denied",
        });
      }

      // Collect assignable users from multiple sources
      const userMap = new Map<string, { id: string; name: string | null; email: string | null; image: string | null }>();

      const isRestrictedProject = action.project?.isRestricted ?? false;

      // 1. Get users from teams the current user belongs to.
      //    Skip when the action's project is restricted - only ProjectMembers
      //    (plus creator + workspace owner/admin escape hatch) are valid.
      const userTeams = await ctx.db.team.findMany({
        where: {
          members: {
            some: {
              userId: ctx.session.user.id,
            },
          },
        },
        include: {
          members: {
            include: {
              user: {
                select: { id: true, name: true, email: true, image: true },
              },
            },
          },
        },
      });

      if (!isRestrictedProject) {
        userTeams.forEach(team => {
          team.members.forEach(member => {
            userMap.set(member.user.id, member.user);
          });
        });
      }

      // 2. Get workspace members (if action belongs to a project in a workspace).
      //    On restricted projects, only owner/admin workspace roles are eligible
      //    (they are escape-hatch project editors).
      //
      //    Gated on `isProjectInsider`, NOT `canViewAction`: a public project
      //    satisfies the view gate for any authenticated caller, and bounty
      //    action ids for public projects are published by the unauthenticated
      //    /api/bounties feed. Public visibility grants the project, never the
      //    workspace roster behind it.
      if (action.project?.workspaceId && access.isProjectInsider) {
        const workspaceUsers = await ctx.db.workspaceUser.findMany({
          where: {
            workspaceId: action.project.workspaceId,
            ...(isRestrictedProject
              ? { role: { in: ["owner", "admin"] } }
              : {}),
          },
          include: {
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        });
        workspaceUsers.forEach(wu => {
          userMap.set(wu.user.id, wu.user);
        });
      }

      // 3. Get project members (if action belongs to a project)
      if (action.projectId) {
        const projectMembers = await ctx.db.projectMember.findMany({
          where: { projectId: action.projectId },
          include: {
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        });
        projectMembers.forEach(pm => {
          userMap.set(pm.user.id, pm.user);
        });

        // Always include the project creator (synthetic "Owner" axis).
        if (action.project?.createdById && !userMap.has(action.project.createdById)) {
          const creator = await ctx.db.user.findUnique({
            where: { id: action.project.createdById },
            select: { id: true, name: true, email: true, image: true },
          });
          if (creator) userMap.set(creator.id, creator);
        }
      }

      // 4. Always include the current user
      if (!userMap.has(ctx.session.user.id)) {
        const currentUser = await ctx.db.user.findUnique({
          where: { id: ctx.session.user.id },
          select: { id: true, name: true, email: true, image: true },
        });
        if (currentUser) {
          userMap.set(currentUser.id, currentUser);
        }
      }

      const assignableUsers = Array.from(userMap.values());

      return {
        assignableUsers,
        actionContext: {
          hasProject: !!action.projectId,
          hasTeam: !!action.teamId,
          projectName: action.project?.name,
          teamName: action.team?.name,
          userTeamCount: userTeams.length,
        }
      };
    }),

  // Variant of getAssignableUsers for the action-creation flow, where there is
  // no actionId yet. Caller passes the prospective project/workspace context so
  // the same membership rules apply (teams, workspace members, project members,
  // restricted-project escape hatch, current user fallback).
  getAssignableUsersForContext: protectedProcedure
    .input(z.object({
      projectId: z.string().optional(),
      workspaceId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      let project: { id: string; name: string; workspaceId: string | null; isRestricted: boolean } | null = null;
      // Whether the caller reached the project by a membership path rather than
      // by its `isPublic` flag. Only an insider inherits the workspace roster
      // below — see the precedence comment further down.
      let projectInsider = false;
      if (input.projectId) {
        const access = await getProjectAccess(ctx.db, ctx.session.user.id, input.projectId);
        if (!hasProjectAccess(access)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have access to this project",
          });
        }
        projectInsider = isProjectInsider(access);
        project = await ctx.db.project.findUnique({
          where: { id: input.projectId },
          select: { id: true, name: true, workspaceId: true, isRestricted: true },
        });
      }

      // Workspace precedence, and why the two paths are gated differently:
      // a workspace reached *through* a project the caller is an insider on is
      // already covered by the project check above, and must NOT be re-checked
      // — workspace guests (project-only members with no WorkspaceUser row)
      // would fail a membership probe and lose the roster on their own
      // projects.
      // `isProjectInsider`, not `hasProjectAccess`: the latter is satisfied by
      // a merely *public* project, so inheriting the workspace from it would
      // hand the whole roster to any authenticated caller holding a public
      // project id — the same leak this guard exists to close.
      // A caller-supplied `workspaceId` has no such backing, so it needs an
      // explicit check: without one, any logged-in user who knows or guesses a
      // workspace CUID got back every member's id, name, email and avatar.
      // Plain membership is the bar — this is a read, so viewers pass.
      let effectiveWorkspaceId = projectInsider ? (project?.workspaceId ?? null) : null;
      if (!effectiveWorkspaceId && input.workspaceId) {
        const membership = await getWorkspaceMembership(
          ctx.db,
          ctx.session.user.id,
          input.workspaceId,
        );
        if (!membership) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have access to this workspace",
          });
        }
        effectiveWorkspaceId = input.workspaceId;
      }

      const isRestrictedProject = project?.isRestricted ?? false;

      const userMap = new Map<string, { id: string; name: string | null; email: string | null; image: string | null }>();

      const userTeams = await ctx.db.team.findMany({
        where: {
          members: { some: { userId: ctx.session.user.id } },
          ...(effectiveWorkspaceId ? { workspaceId: effectiveWorkspaceId } : {}),
        },
        include: {
          members: {
            include: {
              user: { select: { id: true, name: true, email: true, image: true } },
            },
          },
        },
      });

      if (!isRestrictedProject) {
        userTeams.forEach(team => {
          team.members.forEach(member => {
            userMap.set(member.user.id, member.user);
          });
        });
      }

      if (effectiveWorkspaceId) {
        const workspaceUsers = await ctx.db.workspaceUser.findMany({
          where: {
            workspaceId: effectiveWorkspaceId,
            ...(isRestrictedProject ? { role: { in: ["owner", "admin"] } } : {}),
          },
          include: {
            user: { select: { id: true, name: true, email: true, image: true } },
          },
        });
        workspaceUsers.forEach(wu => {
          userMap.set(wu.user.id, wu.user);
        });
      }

      if (project?.id) {
        const projectMembers = await ctx.db.projectMember.findMany({
          where: { projectId: project.id },
          include: {
            user: { select: { id: true, name: true, email: true, image: true } },
          },
        });
        projectMembers.forEach(pm => {
          userMap.set(pm.user.id, pm.user);
        });

        const projectRecord = await ctx.db.project.findUnique({
          where: { id: project.id },
          select: { createdById: true },
        });
        if (projectRecord?.createdById && !userMap.has(projectRecord.createdById)) {
          const creator = await ctx.db.user.findUnique({
            where: { id: projectRecord.createdById },
            select: { id: true, name: true, email: true, image: true },
          });
          if (creator) userMap.set(creator.id, creator);
        }
      }

      if (!userMap.has(ctx.session.user.id)) {
        const currentUser = await ctx.db.user.findUnique({
          where: { id: ctx.session.user.id },
          select: { id: true, name: true, email: true, image: true },
        });
        if (currentUser) {
          userMap.set(currentUser.id, currentUser);
        }
      }

      return {
        assignableUsers: Array.from(userMap.values()),
        actionContext: {
          hasProject: !!project,
          hasTeam: false,
          projectName: project?.name,
          teamName: undefined as string | undefined,
          userTeamCount: userTeams.length,
        },
      };
    }),

  updateKanbanStatusWithOrder: protectedProcedure
    .input(z.object({
      actionId: z.string(),
      kanbanStatus: z.enum(KANBAN_STATUS_VALUES),
      targetPosition: z.number().optional(),
      droppedOnTaskId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { actionId, kanbanStatus, targetPosition, droppedOnTaskId } = input;

      // Column bookkeeping (reads only; nothing read here is returned). The
      // write — and the edit gate, and the kanban ⇄ status lockstep this
      // procedure used to skip — is `applyActionUpdate`'s.
      const action = await ctx.db.action.findUnique({
        where: { id: actionId },
        select: { projectId: true },
      });
      if (!action) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Action not found" });
      }

      let newOrder: number;
      let tasksToShift: { id: string; kanbanOrder: number | null }[] = [];

      if (droppedOnTaskId) {
        const targetTask = await ctx.db.action.findUnique({
          where: { id: droppedOnTaskId },
          select: { kanbanOrder: true, kanbanStatus: true },
        });
        if (!targetTask) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Target task not found" });
        }
        const targetOrder = targetTask.kanbanOrder ?? 1;

        // Everything in the column from the target down moves one slot.
        tasksToShift = await ctx.db.action.findMany({
          where: {
            projectId: action.projectId,
            kanbanStatus,
            kanbanOrder: { gte: targetOrder },
            id: { not: actionId },
          },
          select: { id: true, kanbanOrder: true },
          orderBy: { kanbanOrder: "asc" },
        });
        newOrder = targetOrder;
      } else if (targetPosition !== undefined) {
        newOrder = targetPosition;
      } else {
        const [maxOrderInColumn, maxOrderAcrossBoard] = await Promise.all([
          ctx.db.action.findFirst({
            where: { projectId: action.projectId, kanbanStatus, kanbanOrder: { not: null } },
            orderBy: { kanbanOrder: "desc" },
            select: { kanbanOrder: true },
          }),
          ctx.db.action.findFirst({
            where: { projectId: action.projectId, kanbanOrder: { not: null } },
            orderBy: { kanbanOrder: "desc" },
            select: { kanbanOrder: true },
          }),
        ]);
        if (maxOrderInColumn?.kanbanOrder) {
          newOrder = maxOrderInColumn.kanbanOrder + 1;
        } else if (maxOrderAcrossBoard?.kanbanOrder) {
          newOrder = maxOrderAcrossBoard.kanbanOrder + 1;
        } else {
          newOrder = 1;
        }
      }

      const { action: updated } = await applyActionUpdate(
        actionWriteDeps(ctx),
        actionId,
        { kanbanStatus, kanbanOrder: newOrder },
        {
          include: {
            assignees: {
              include: { user: { select: { id: true, name: true, email: true, image: true } } },
            },
            project: { select: { id: true, name: true } },
          },
        },
      );

      // Shift the displaced cards after the gated write, so a refused move
      // displaces nothing.
      if (tasksToShift.length > 0) {
        await ctx.db.$transaction(
          tasksToShift.map((task) =>
            ctx.db.action.update({
              where: { id: task.id },
              data: { kanbanOrder: (task.kanbanOrder ?? 0) + 1 },
            }),
          ),
        );
      }

      return updated;
    }),

  reorderKanbanCard: protectedProcedure
    .input(z.object({
      actionId: z.string(),
      newPosition: z.number(), // 0-based index position
      targetColumnStatus: z.enum(KANBAN_STATUS_VALUES),
    }))
    .mutation(async ({ ctx, input }) => {
      const { actionId, newPosition, targetColumnStatus } = input;

      // The moved card first: the gated write (and the lockstep, if the
      // column changed). A refused move renumbers nothing.
      const { previous } = await applyActionUpdate(actionWriteDeps(ctx), actionId, {
        kanbanStatus: targetColumnStatus,
        kanbanOrder: newPosition + 1, // Convert 0-based to 1-based
      });

      // Then renumber the rest of the target column around it.
      const columnTasks = await ctx.db.action.findMany({
        where: {
          projectId: previous.projectId,
          kanbanStatus: targetColumnStatus,
          id: { not: actionId },
        },
        select: { id: true, kanbanOrder: true },
        orderBy: { kanbanOrder: "asc" },
      });

      await ctx.db.$transaction(
        columnTasks.map((task, i) =>
          ctx.db.action.update({
            where: { id: task.id },
            // Cards before the insertion point keep their slot; the rest shift down one.
            data: { kanbanOrder: i < newPosition ? i + 1 : i + 2 },
          }),
        ),
      );

      return { message: "Reordering completed successfully" };
    }),

  // Utility endpoint to initialize kanban orders for existing tasks
  initializeKanbanOrders: protectedProcedure
    .input(z.object({
      projectId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get all actions in this project without kanban orders
      const actionsWithoutOrder = await ctx.db.action.findMany({
        where: {
          projectId: input.projectId,
          kanbanOrder: null,
        },
        orderBy: [
          { kanbanStatus: 'asc' },
          // { createdAt: 'asc' }
        ],
      });

      if (actionsWithoutOrder.length === 0) {
        return { message: 'No actions need order initialization', updated: 0 };
      }

      // Get the current highest order in the project
      const maxOrder = await ctx.db.action.findFirst({
        where: {
          projectId: input.projectId,
          kanbanOrder: { not: null }
        },
        orderBy: { kanbanOrder: 'desc' },
        select: { kanbanOrder: true }
      });

      const startingOrder = maxOrder?.kanbanOrder ? maxOrder.kanbanOrder + 1 : 1;

      // Update each action with a kanban order
      const updates = actionsWithoutOrder.map(async (action: any, index: number) => {
        // Set default kanban status if not set
        const kanbanStatus = action.kanbanStatus || "TODO";
        
        return ctx.db.action.update({
          where: { id: action.id },
          data: {
            kanbanStatus,
            kanbanOrder: startingOrder + index,
          },
        });
      });

      await Promise.all(updates);

      return { 
        message: `Initialized kanban orders for ${actionsWithoutOrder.length} actions`,
        updated: actionsWithoutOrder.length 
      };
    }),

  // Get actions completed today
  getCompletedToday: protectedProcedure
    .query(async ({ ctx }) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      return ctx.db.action.findMany({
        where: {
          createdById: ctx.session.user.id,
          completedAt: {
            gte: today,
            lt: tomorrow,
          },
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          completedAt: 'desc',
        },
      });
    }),

  // Get recent completed actions with date range
  getRecentCompleted: protectedProcedure
    .input(z.object({
      days: z.number().min(1).max(90).default(7), // Default to last 7 days, max 90
    }))
    .query(async ({ ctx, input }) => {
      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - input.days);
      startDate.setHours(0, 0, 0, 0);

      return ctx.db.action.findMany({
        where: {
          createdById: ctx.session.user.id,
          completedAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          completedAt: 'desc',
        },
      });
    }),

  // Quick create action via API key (for iOS shortcuts, external integrations)
  // Supports natural language date parsing (e.g., "Call John tomorrow")
  quickCreate: apiKeyMiddleware
    .input(
      z.object({
        name: z.string().min(1),
        projectId: z.string().optional(),
        priority: z.enum(PRIORITY_VALUES).default("Quick"),
        source: z.string().default("ios-shortcut"),
        parseNaturalLanguage: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.userId;

      // Verify user exists
      const user = await ctx.db.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Parse natural language input using shared helper. Parsing stays
      // here (it is the quick-create callers' concern); the create itself is
      // the module's, which gates on the project the parser actually resolved.
      const parsed = await parseActionInput(input.name, userId, ctx.db, {
        projectId: input.projectId,
        parseNaturalLanguage: input.parseNaturalLanguage,
      });

      const created = await createAction(
        {
          db: ctx.db,
          actor: {
            userId,
            tokenType: ctx.tokenType,
            isAdmin: ctx.session?.user?.isAdmin ?? false,
          },
        },
        {
          name: parsed.name,
          projectId: parsed.projectId ?? undefined,
          priority: input.priority,
          status: "ACTIVE",
          scheduledStart: parsed.scheduledStart ?? undefined,
          dueDate: parsed.dueDate ?? undefined,
          source: resolveQuickCreateSource(input.source, {
            tokenType: ctx.tokenType,
            viaApiKey: !ctx.session?.user?.id,
          }),
        },
      );

      // Same projection this procedure has always returned.
      const action = {
        id: created.id,
        name: created.name,
        priority: created.priority,
        status: created.status,
        dueDate: created.dueDate,
        project: created.project
          ? { id: created.project.id, name: created.project.name }
          : null,
      };

      return {
        success: true,
        message: `✅ Added to ${PRODUCT_NAME}`,
        title: action.name,
        url: `${getPublicBaseUrlFromEnv()}/actions?actionId=${action.id}`,
        action,
        parsing: parsed.parsingMetadata,
      };
    }),

  // Search actions for dependency picker
  searchForDependencies: protectedProcedure
    .input(
      z.object({
        query: z.string(),
        workspaceId: z.string().optional(),
        excludeId: z.string().optional(),
        limit: z.number().default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // When a workspaceId is provided, search the workspace's actions the
      // caller can read — but only after verifying the caller is actually a
      // member. Without this check any logged-in user could enumerate other
      // workspaces' actions. Membership alone isn't access, though: actions in
      // a restricted project stay out of reach unless the caller has a path
      // into it, so the access clause is applied on top.
      // Without a workspaceId, fall back to only the caller's own actions.
      if (input.workspaceId) {
        const membership = await getWorkspaceMembership(
          ctx.db,
          userId,
          input.workspaceId,
        );
        if (!membership) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      const ownershipFilter = input.workspaceId
        ? {}
        : { createdById: userId };

      // Both clauses are `OR`-shaped, so they have to be AND-ed explicitly -
      // spreading the second over the first silently drops the workspace
      // scope and widens the search instead of narrowing it. Same shape as
      // `assertLinkableActions` in decision.ts, which guards the link itself.
      const workspaceFilter = input.workspaceId
        ? {
            AND: [
              {
                OR: [
                  { workspaceId: input.workspaceId },
                  { project: { workspaceId: input.workspaceId } },
                ],
              },
              buildActionAccessWhere(userId),
            ],
          }
        : {};

      return ctx.db.action.findMany({
        where: {
          name: { contains: input.query, mode: "insensitive" },
          status: { notIn: ["COMPLETED", "CANCELLED", "DELETED"] },
          ...ownershipFilter,
          ...workspaceFilter,
          ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
        },
        take: input.limit,
        select: {
          id: true,
          name: true,
          status: true,
          kanbanStatus: true,
          project: { select: { id: true, name: true } },
        },
        orderBy: { name: "asc" },
      });
    }),

  /**
   * Search actions by title for the time-tracking plugin autocomplete.
   *
   * Workspace-scoped, user-access-scoped via the standard action access where.
   * Status filter (default): open kanban statuses (TODO, IN_PROGRESS, IN_REVIEW,
   * BACKLOG) + actions with no kanbanStatus (the v1 plugin-created actions) +
   * DONE actions touched in the last 30 days. CANCELLED always excluded.
   *
   * Match: case-insensitive `startsWith` first; if the result set is smaller
   * than the limit, top it up with `contains` matches (prefix-with-fallback).
   */
  searchByTitle: apiKeyMiddleware
    .input(
      z.object({
        workspaceId: z.string().optional(),
        query: z.string().min(1),
        statuses: z.array(z.enum([
          "BACKLOG",
          "TODO",
          "IN_PROGRESS",
          "IN_REVIEW",
          "DONE",
        ])).optional(),
        limit: z.number().int().min(1).max(50).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const statusFilter: Prisma.ActionWhereInput = input.statuses
        ? {
            OR: [
              ...(input.statuses.includes("DONE")
                ? [
                    {
                      kanbanStatus: "DONE" as const,
                      completedAt: { gte: thirtyDaysAgo },
                    },
                  ]
                : []),
              {
                kanbanStatus: {
                  in: input.statuses.filter((s) => s !== "DONE"),
                },
              },
            ],
          }
        : {
            OR: [
              {
                kanbanStatus: {
                  in: ["TODO", "IN_PROGRESS", "IN_REVIEW", "BACKLOG"],
                },
              },
              { kanbanStatus: null },
              {
                kanbanStatus: "DONE",
                completedAt: { gte: thirtyDaysAgo },
              },
            ],
          };

      // Compose the workspace + access scope. Restricting to the apiKey user's
      // accessible actions reuses `buildActionAccessWhere` for parity with the
      // rest of the action router. CANCELLED is excluded implicitly by the
      // kanban statusFilter (its allowed-list never includes CANCELLED). An
      // explicit `status` guard keeps DRAFT and legacy COMPLETED actions out
      // of autocomplete results - both are valid Action.status values in this
      // codebase but neither is a valid pick for "track time against".
      const baseWhere: Prisma.ActionWhereInput = {
        AND: [
          ...(input.workspaceId ? [{ workspaceId: input.workspaceId }] : []),
          buildActionAccessWhere(ctx.userId),
          { status: { notIn: ["DRAFT", "COMPLETED"] } },
          statusFilter,
        ],
      };

      const select = {
        id: true,
        name: true,
        kanbanStatus: true,
        projectId: true,
        workspaceId: true,
        project: { select: { id: true, name: true } },
      } satisfies Prisma.ActionSelect;

      const prefixMatches = await ctx.db.action.findMany({
        where: {
          ...baseWhere,
          name: { startsWith: input.query, mode: "insensitive" },
        },
        take: input.limit,
        orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
        select,
      });

      if (prefixMatches.length >= input.limit) {
        return prefixMatches;
      }

      const remaining = input.limit - prefixMatches.length;
      const prefixIds = prefixMatches.map((a) => a.id);
      const containsMatches = await ctx.db.action.findMany({
        where: {
          ...baseWhere,
          name: { contains: input.query, mode: "insensitive" },
          NOT: { name: { startsWith: input.query, mode: "insensitive" } },
          ...(prefixIds.length ? { id: { notIn: prefixIds } } : {}),
        },
        take: remaining,
        orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
        select,
      });

      return [...prefixMatches, ...containsMatches];
    }),

  // Save a screenshot and associate it with an action
  saveScreenshot: apiKeyMiddleware
    .input(
      z.object({
        actionId: z.string(),
        screenshot: z.string(),
        timestamp: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const filename = `screenshots/actions/${input.actionId}/${input.timestamp.replace(/[/:]/g, "-")}.png`;
        const blob = await uploadToBlob(input.screenshot, filename);

        const screenshot = await ctx.db.screenshot.create({
          data: {
            url: blob.url,
            timestamp: input.timestamp,
          },
        });

        await ctx.db.actionScreenshot.create({
          data: {
            actionId: input.actionId,
            screenshotId: screenshot.id,
          },
        });

        return { success: true, url: blob.url };
      } catch (error) {
        console.error("Error saving action screenshot:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to save screenshot",
        });
      }
    }),

  // Upload an image from the web UI and associate it with an action
  uploadImage: protectedProcedure
    .input(
      z.object({
        actionId: z.string(),
        base64Data: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const access = await getActionAccess(
        ctx.db,
        ctx.session.user.id,
        input.actionId,
      );
      if (!access || !canEditAction(access)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to upload images to this action",
        });
      }

      const timestamp = new Date()
        .toISOString()
        .replace(/[/:]/g, "-");
      const filename = `screenshots/actions/${input.actionId}/${timestamp}.png`;
      const blob = await uploadToBlob(input.base64Data, filename);

      const screenshot = await ctx.db.screenshot.create({
        data: {
          url: blob.url,
          timestamp: new Date().toISOString(),
        },
      });

      await ctx.db.actionScreenshot.create({
        data: {
          actionId: input.actionId,
          screenshotId: screenshot.id,
        },
      });

      return { url: blob.url };
    }),

  // ────────────────────────────────────────────────────────────────────
  // One2b agent integration: bulk-create actions extracted from a meeting
  // transcript. Each item may carry an assignee email which is resolved
  // via a 3-tier strategy (workspace user → existing participant → new
  // participant). Per-item failures are collected in `skipped` rather
  // than aborting the entire batch.
  // ────────────────────────────────────────────────────────────────────
  bulkCreateFromTranscript: protectedProcedure
    .input(
      z.object({
        transcriptionSessionId: z.string(),
        workspaceId: z.string(),
        projectId: z.string().nullable().optional(),
        items: z
          .array(
            z.object({
              description: z.string().min(1),
              assigneeEmail: z.string().email().optional(),
              assigneeName: z.string().optional(),
              priority: z.enum(["HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
              dueDate: z.string().datetime().optional(),
              category: z.string().optional(),
              rawText: z.string().optional(),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Refuse anyone without a write role in the workspace before any
      //    lookup, so the transcript and project probes below can never act
      //    as an existence oracle for a stranger. The write itself is still
      //    gated per item by `createAction` (project edit access, or this
      //    same workspace role); a FORBIDDEN from there is re-thrown rather
      //    than skipped, since it holds for every item alike.
      await assertCanWriteToWorkspace(ctx.db, ctx.session.user.id, input.workspaceId);

      // 2. Verify the transcript exists and belongs to this workspace.
      const transcript = await ctx.db.transcriptionSession.findUnique({
        where: { id: input.transcriptionSessionId },
        select: { id: true, workspaceId: true },
      });
      if (!transcript) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transcription session not found",
        });
      }
      if (transcript.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Transcription session does not belong to this workspace",
        });
      }

      // 3. Resolve effective projectId. Verify ownership if provided.
      const resolvedProjectId: string | null = input.projectId ?? null;
      if (resolvedProjectId) {
        const project = await ctx.db.project.findUnique({
          where: { id: resolvedProjectId },
          select: { id: true, workspaceId: true },
        });
        if (!project || project.workspaceId !== input.workspaceId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Project does not belong to this workspace",
          });
        }
      }

      // 4. Map agent priority strings to internal priority values.
      const mapPriority = (p: "HIGH" | "MEDIUM" | "LOW"): Priority => {
        if (p === "HIGH") return "1st Priority";
        if (p === "LOW") return "5th Priority";
        return "Quick";
      };

      const includeShape = {
        project: true,
        transcriptionSession: { select: { id: true, title: true } },
        assignees: {
          include: {
            user: { select: { id: true, name: true, email: true, image: true } },
          },
        },
        participantAssignees: { include: { participant: true } },
      } satisfies Prisma.ActionInclude;

      type CreatedAction = Prisma.ActionGetPayload<{ include: typeof includeShape }>;
      const created: CreatedAction[] = [];
      const skipped: { rawText: string | undefined; reason: string }[] = [];

      // 5. Process each item with a per-item try/catch so one failure
      //    doesn't abort the whole batch. We deliberately do NOT wrap the
      //    loop in an outer transaction - each item is logically independent
      //    and we want partial successes to persist.
      const deps = actionWriteDeps(ctx);
      for (const item of input.items) {
        try {
          const action = await createAction(deps, {
            name: item.description,
            description: item.rawText ?? undefined,
            dueDate: item.dueDate ? new Date(item.dueDate) : undefined,
            priority: mapPriority(item.priority),
            status: "ACTIVE",
            workspaceId: input.workspaceId,
            projectId: resolvedProjectId ?? undefined,
            source: "meeting",
            transcriptionSessionId: input.transcriptionSessionId,
            sourceType: "meeting",
            sourceId: input.transcriptionSessionId,
            lastUpdatedBy: "AGENT",
            lastUpdatedSource: "agent-action-items-tool",
          });

          // 5b. Resolve assignee using 3-tier strategy.
          if (item.assigneeEmail) {
            const workspaceUser = await findUserByEmailInWorkspace(
              item.assigneeEmail,
              input.workspaceId,
            );

            if (workspaceUser) {
              await ctx.db.actionAssignee.create({
                data: { actionId: action.id, userId: workspaceUser.id },
              });
            } else {
              const existingParticipant =
                await ctx.db.transcriptionSessionParticipant.findUnique({
                  where: {
                    transcriptionSessionId_email: {
                      transcriptionSessionId: input.transcriptionSessionId,
                      email: item.assigneeEmail,
                    },
                  },
                  select: { id: true },
                });

              const participantId =
                existingParticipant?.id ??
                (
                  await ctx.db.transcriptionSessionParticipant.create({
                    data: {
                      transcriptionSessionId: input.transcriptionSessionId,
                      workspaceId: input.workspaceId,
                      email: item.assigneeEmail,
                      name: item.assigneeName ?? null,
                    },
                    select: { id: true },
                  })
                ).id;

              await ctx.db.actionParticipantAssignee.create({
                data: {
                  actionId: action.id,
                  participantId,
                  workspaceId: input.workspaceId,
                },
              });
            }
          }

          // Reload with the include shape so the returned object is consistent.
          const hydrated = await ctx.db.action.findUniqueOrThrow({
            where: { id: action.id },
            include: includeShape,
          });
          created.push(hydrated);
        } catch (err) {
          // Not a member, or cannot edit the project: the same answer for
          // every item, so refuse the batch as before rather than reporting
          // N skipped rows.
          if (err instanceof TRPCError && err.code === "FORBIDDEN") throw err;
          const reason =
            err instanceof Error ? err.message : "Unknown error creating action";
          skipped.push({ rawText: item.rawText, reason });
        }
      }

      return { created, skipped };
    }),

  // Look up actions by their (sourceType, sourceId) provenance, optionally
  // filtered by assignee email and status. Used by the one2b agent to
  // surface actions tied to a meeting/email/etc.
  findBySource: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        sourceType: z.string(),
        sourceId: z.string().optional(),
        assigneeEmail: z.string().email().optional(),
        status: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify caller workspace membership.
      const membership = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: { userId, workspaceId: input.workspaceId },
        },
        select: { userId: true },
      });
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this workspace",
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = {
        workspaceId: input.workspaceId,
        sourceType: input.sourceType,
      };
      if (input.sourceId) where.sourceId = input.sourceId;
      if (input.status) where.status = input.status;

      if (input.assigneeEmail) {
        const user = await findUserByEmailInWorkspace(
          input.assigneeEmail,
          input.workspaceId,
        );
        if (user) {
          where.assignees = { some: { userId: user.id } };
        } else {
          where.participantAssignees = {
            some: { participant: { email: input.assigneeEmail } },
          };
        }
      }

      return ctx.db.action.findMany({
        where,
        include: {
          project: true,
          transcriptionSession: { select: { id: true, title: true } },
          assignees: {
            include: {
              user: { select: { id: true, name: true, email: true, image: true } },
            },
          },
          participantAssignees: { include: { participant: true } },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  /**
   * Idempotent create keyed on `(sourceType, sourceId)` inside one workspace
   * — the Daily worklog's "one Action per conversation" path (convention:
   * `sourceType = "claude-session"`, `sourceId = <sessionId>`). A match has
   * its name and links refreshed; otherwise the Action is created exactly as
   * `create` would (agent principals stamp `source: "agent"`, ADR-0049).
   *
   * Links are validated against the target workspace: a project or ticket
   * from another workspace is NOT_FOUND, never linked.
   */
  upsertBySource: protectedProcedure
    .input(
      z.object({
        sourceType: z.string().min(1).max(100),
        sourceId: z.string().min(1).max(500),
        name: z.string().min(1),
        workspaceId: z.string(),
        description: z.string().optional(),
        projectId: z.string().nullish(),
        ticketId: z.string().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await assertCanWriteToWorkspace(ctx.db, userId, input.workspaceId);

      if (input.projectId) {
        const [access, project] = await Promise.all([
          getProjectAccess(ctx.db, userId, input.projectId),
          ctx.db.project.findUnique({
            where: { id: input.projectId },
            select: { workspaceId: true },
          }),
        ]);
        if (
          !access ||
          !hasProjectAccess(access) ||
          project?.workspaceId !== input.workspaceId
        ) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
        }
      }

      if (input.ticketId) {
        const ticket = await ctx.db.ticket.findUnique({
          where: { id: input.ticketId },
          select: { product: { select: { workspaceId: true } } },
        });
        if (ticket?.product.workspaceId !== input.workspaceId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
        }
      }

      // Under an agent key the Action records the OWNER's work (the Daily
      // worklog writes one per conversation), so the owner is assigned to it:
      // that is the view path getActionAccess grants them, and the one
      // timeEntry.create needs before an agent may log the owner's time on it
      // (ADR-0061). The writer stays the shadow user (ADR-0049).
      let ownerAssigneeId: string | null = null;
      if (ctx.tokenType === "agent-key") {
        const agent = await ctx.db.externalAgent.findUnique({
          where: { shadowUserId: userId },
          select: { ownerId: true },
        });
        ownerAssigneeId = agent?.ownerId ?? null;
      }

      // A remembered answer (Daily worklog V4): when the incoming Action has
      // no Project or Ticket, a TimeResolutionRule the owner saved for this
      // exact title supplies one — but only inside this workspace, so a rule
      // can never point a conversation at another workspace's data.
      let projectId = input.projectId;
      let ticketId = input.ticketId;
      if (!projectId && !ticketId) {
        const rule = await ctx.db.timeResolutionRule.findFirst({
          where: {
            userId: ownerAssigneeId ?? userId,
            titlePattern: { equals: input.name.trim(), mode: "insensitive" },
          },
          select: {
            projectId: true,
            ticketId: true,
            project: { select: { workspaceId: true } },
            ticket: { select: { product: { select: { workspaceId: true } } } },
          },
        });
        if (rule?.ticketId && rule.ticket?.product.workspaceId === input.workspaceId) {
          ticketId = rule.ticketId;
        } else if (rule?.projectId && rule.project?.workspaceId === input.workspaceId) {
          projectId = rule.projectId;
        }
      }

      const include = {
        project: { select: { id: true, name: true, workspaceId: true } },
        ticket: { select: { id: true, number: true, shortId: true, productId: true } },
        // Same shape as `create` returns, so clients that read
        // `assignees[].user` (the CLI's transformAction) keep working.
        assignees: {
          include: { user: { select: { id: true, name: true, email: true, image: true } } },
        },
      } as const;

      const existing = await ctx.db.action.findFirst({
        where: {
          workspaceId: input.workspaceId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          status: { not: "DELETED" },
        },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });

      if (existing) {
        const action = await ctx.db.action.update({
          where: { id: existing.id },
          data: {
            name: input.name,
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(projectId !== undefined ? { projectId } : {}),
            ...(ticketId !== undefined ? { ticketId } : {}),
            ...(ownerAssigneeId
              ? {
                  assignees: {
                    connectOrCreate: {
                      where: { actionId_userId: { actionId: existing.id, userId: ownerAssigneeId } },
                      create: { userId: ownerAssigneeId },
                    },
                  },
                }
              : {}),
          },
          include,
        });
        return { action, outcome: "updated" as const };
      }

      const action = await ctx.db.action.create({
        data: {
          name: input.name,
          description: input.description,
          workspaceId: input.workspaceId,
          projectId: projectId ?? undefined,
          ticketId: ticketId ?? undefined,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          createdById: userId,
          status: "ACTIVE",
          priority: "Quick",
          ...(projectId ? { kanbanStatus: "TODO" } : {}),
          ...(ctx.tokenType === "agent-key" ? { source: "agent" } : {}),
          ...(ownerAssigneeId ? { assignees: { create: { userId: ownerAssigneeId } } } : {}),
        },
        include,
      });

      const activityWorkspaceId = action.workspaceId ?? action.project?.workspaceId ?? null;
      if (activityWorkspaceId) {
        await recordActivity(ctx.db, {
          workspaceId: activityWorkspaceId,
          userId,
          entityType: "action",
          entityId: action.id,
          action: "created",
          metadata: { name: action.name },
        }).catch(() => {
          /* instrumentation failure is non-fatal */
        });
      }

      return { action, outcome: "created" as const };
    }),
});