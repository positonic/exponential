import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import {
  getWorkspaceMembership,
  canEditWorkspaceContent,
} from "~/server/services/access/resolvers/workspaceResolver";
import {
  getProjectAccess,
  canEditProject,
} from "~/server/services/access/resolvers/projectResolver";
import { computeGoalHealth } from "~/server/services/goalService";
import { resolveGoalProgress } from "~/server/services/goalProgress";
import {
  mergeObjectiveActivity,
  type ObjectiveActivityItem,
} from "../objectiveActivity";

// "Done" for the delivery signal = the Delivery metrics page's completion
// definition (ADR-0047, SprintAnalyticsService): DONE or DEPLOYED —
// deliberately narrower than lib/ticket-statuses' COMPLETED_TICKET_STATUSES,
// which also counts ARCHIVED.
const DELIVERY_DONE_STATUSES: ReadonlySet<string> = new Set([
  "DONE",
  "DEPLOYED",
]);

/**
 * Done/total ticket counts for the given features — the V2 delivery signal on
 * a key result's "Executing work" list (ADR-0050). Computed read-side on
 * request, never stored; strictly display context — nothing here ever writes
 * KeyResult.currentValue. Ticketless features are absent from the map so the
 * UI renders no chip (never "0/0").
 */
async function getTicketProgressByFeature(
  db: PrismaClient,
  featureIds: string[],
): Promise<Map<string, { done: number; total: number }>> {
  const progress = new Map<string, { done: number; total: number }>();
  // The same feature may execute several key results in one response
  // (getByObjective) — dedupe before querying.
  const uniqueIds = [...new Set(featureIds)];
  if (uniqueIds.length === 0) return progress;

  const grouped = await db.ticket.groupBy({
    by: ["featureId", "status"],
    where: { featureId: { in: uniqueIds } },
    _count: { _all: true },
  });

  for (const row of grouped) {
    if (row.featureId == null) continue;
    const entry = progress.get(row.featureId) ?? { done: 0, total: 0 };
    entry.total += row._count._all;
    if (DELIVERY_DONE_STATUSES.has(row.status)) entry.done += row._count._all;
    progress.set(row.featureId, entry);
  }
  return progress;
}

/**
 * May this user WRITE this key result?
 *
 * `create`/`update`/`checkIn`/`delete` used to require ownership, which meant a
 * teammate (or a service account driving an agent) could link work to a key
 * result but never move its value — the exact shape that blocks agent-driven
 * check-ins. So membership counts, but only membership that carries edit
 * rights: `viewer` is read-only and `guest` is synthesized for project-only
 * access, and `getWorkspaceMembership` alone would let both write. That is what
 * `canEditWorkspaceContent` exists to decide (see its docstring).
 *
 * The row's own owner always qualifies, regardless of workspace role.
 * Pass the already-fetched record so callers needing the full row don't query
 * twice.
 */
async function canWriteKeyResult(
  db: PrismaClient,
  userId: string,
  keyResult: { userId: string; workspaceId: string | null } | null,
): Promise<boolean> {
  if (!keyResult) return false;
  if (keyResult.userId === userId) return true;
  if (!keyResult.workspaceId) return false;
  const membership = await getWorkspaceMembership(db, userId, keyResult.workspaceId);
  return canEditWorkspaceContent(membership?.role ?? null);
}

/**
 * May this user attach or move key results on this objective? Same rule as
 * above: owner or DRI outright — both are explicit designations on the row —
 * otherwise a workspace role that carries edit rights, never bare membership.
 */
async function canWriteGoalKeyResults(
  db: PrismaClient,
  userId: string,
  goal: { userId: string; driUserId: string | null; workspaceId: string | null } | null,
): Promise<boolean> {
  if (!goal) return false;
  if (goal.userId === userId || goal.driUserId === userId) return true;
  if (!goal.workspaceId) return false;
  const membership = await getWorkspaceMembership(db, userId, goal.workspaceId);
  return canEditWorkspaceContent(membership?.role ?? null);
}

// Input validation schemas
const createKeyResultInput = z.object({
  goalId: z.number(),
  title: z.string().min(1),
  description: z.string().optional(),
  targetValue: z.number(),
  startValue: z.number().default(0),
  currentValue: z.number().default(0),
  unit: z
    .enum(["percent", "count", "currency", "hours", "custom"])
    .default("percent"),
  unitLabel: z.string().optional(),
  period: z.string(), // e.g., "Q1-2025"
  periodStart: z.date().optional(),
  periodEnd: z.date().optional(),
  driUserId: z.string().optional(),
  workspaceId: z.string().optional(),
});

const updateKeyResultInput = z.object({
  id: z.string(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  targetValue: z.number().optional(),
  currentValue: z.number().optional(),
  startValue: z.number().optional(),
  unit: z.enum(["percent", "count", "currency", "hours", "custom"]).optional(),
  unitLabel: z.string().optional(),
  status: z
    .enum(["not-started", "on-track", "at-risk", "off-track", "achieved"])
    .optional(),
  confidence: z.number().min(0).max(100).optional(),
  driUserId: z.string().optional(),
  goalId: z.number().optional(),
});

const checkInInput = z.object({
  keyResultId: z.string(),
  newValue: z.number(),
  notes: z.string().optional(),
});


/**
 * Get the parent annual period for a quarterly or half-year period.
 * @example getParentPeriodFromString("Q1-2026") => "Annual-2026"
 */
function getParentPeriodFromString(period: string): string | null {
  const match = period.match(/^(Q[1-4]|H[12])-(\d{4})$/);
  if (!match) return null;
  return `Annual-${match[2]}`;
}

/**
 * Calculate the end date for a period string.
 * Supports formats: Q1-2025, H1-2025, Annual-2025
 */
function getPeriodEndDate(period: string): Date | null {
  const match = period.match(/^(Q[1-4]|H[12]|Annual)-(\d{4})$/);
  if (!match) return null;

  const [, type, yearStr] = match;
  const year = parseInt(yearStr ?? "0", 10);

  switch (type) {
    case "Q1":
      return new Date(year, 2, 31); // March 31
    case "Q2":
      return new Date(year, 5, 30); // June 30
    case "Q3":
      return new Date(year, 8, 30); // Sept 30
    case "Q4":
      return new Date(year, 11, 31); // Dec 31
    case "H1":
      return new Date(year, 5, 30); // June 30
    case "H2":
      return new Date(year, 11, 31); // Dec 31
    case "Annual":
      return new Date(year, 11, 31); // Dec 31
    default:
      return null;
  }
}

export const keyResultRouter = createTRPCRouter({
  // Get all key results for a workspace/user
  getAll: protectedProcedure
    .input(
      z
        .object({
          workspaceId: z.string().optional(),
          goalId: z.number().optional(),
          period: z.string().optional(),
          status: z
            .enum(["not-started", "on-track", "at-risk", "off-track", "achieved"])
            .optional(),
          /** Narrow a workspace-scoped list back to the caller's own KRs. */
          onlyMine: z.boolean().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      // Workspace-scoped means workspace-wide, mirroring getByObjective: validate
      // membership, then return every member's KRs. Scoping by userId as well
      // would hand a member an empty list for a colleague's key results.
      // Without a workspaceId this stays the caller's personal list.
      // Bind it once: the local narrows on its own, which keeps the where
      // clause free of non-null assertions on an optional input.
      const workspaceId = input?.workspaceId;
      if (workspaceId) {
        const membership = await getWorkspaceMembership(
          ctx.db,
          ctx.session.user.id,
          workspaceId,
        );
        if (!membership) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have access to this workspace",
          });
        }
      }

      return ctx.db.keyResult.findMany({
        where: {
          ...(workspaceId
            ? {
                workspaceId,
                ...(input?.onlyMine ? { userId: ctx.session.user.id } : {}),
              }
            : { userId: ctx.session.user.id }),
          ...(input?.goalId ? { goalId: input.goalId } : {}),
          ...(input?.period ? { period: input.period } : {}),
          ...(input?.status ? { status: input.status } : {}),
        },
        include: {
          goal: {
            include: {
              lifeDomain: true,
            },
          },
          checkIns: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
        orderBy: [{ goal: { title: "asc" } }, { createdAt: "desc" }],
      });
    }),

  // Get key results grouped by objective (goal)
  getByObjective: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().optional(),
        period: z.string().optional(),
        includePairedPeriod: z.boolean().optional(),
        onlyMine: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // When workspaceId is provided, validate membership and show all workspace OKRs
      // When no workspaceId, show only the current user's OKRs
      const isWorkspaceScoped = !!input.workspaceId;
      if (isWorkspaceScoped) {
        const membership = await getWorkspaceMembership(ctx.db, ctx.session.user.id, input.workspaceId!);
        if (!membership) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have access to this workspace",
          });
        }
      }

      // Build period filter - optionally include parent annual period
      let periodFilter: { period: string } | { period: { in: string[] } } | undefined;
      if (input.period) {
        if (input.includePairedPeriod) {
          // Include both the selected period and its parent annual period
          const parentPeriod = getParentPeriodFromString(input.period);
          const periods = parentPeriod
            ? [input.period, parentPeriod]
            : [input.period];
          periodFilter = { period: { in: periods } };
        } else {
          periodFilter = { period: input.period };
        }
      }

      // Build goal period filter to match goals by their period field
      // Include goals that match the period OR have no period set (legacy goals)
      let goalPeriodFilter: { OR: Array<{ period: string | null } | { period: { in: string[] } }> } | undefined;
      if (input.period) {
        if (input.includePairedPeriod) {
          const parentPeriod = getParentPeriodFromString(input.period);
          const periods = parentPeriod
            ? [input.period, parentPeriod]
            : [input.period];
          goalPeriodFilter = {
            OR: [
              { period: { in: periods } },
              { period: null }, // Include legacy goals without period
            ],
          };
        } else {
          goalPeriodFilter = {
            OR: [
              { period: input.period },
              { period: null }, // Include legacy goals without period
            ],
          };
        }
      }

      // When workspace-scoped, show all goals in the workspace (not just user's own)
      // When not workspace-scoped, show only the current user's goals
      const goals = await ctx.db.goal.findMany({
        where: {
          ...(isWorkspaceScoped
            ? { workspaceId: input.workspaceId }
            : { userId: ctx.session.user.id }),
          // Both onlyMine and the period filter use `OR`, so combine them under
          // `AND` to avoid the two `OR` keys overwriting each other.
          AND: [
            // "My Goals" is strictly a DRI view: show an objective only when the
            // user is the DRI on the objective itself OR the DRI on at least one
            // of its key results. Being the creator/owner (`userId`) is NOT
            // enough — that's what surfaced objectives the user merely created.
            ...(isWorkspaceScoped && input.onlyMine
              ? [
                  {
                    OR: [
                      { driUserId: ctx.session.user.id },
                      {
                        keyResults: {
                          some: { driUserId: ctx.session.user.id },
                        },
                      },
                    ],
                  },
                ]
              : []),
            ...(goalPeriodFilter ? [goalPeriodFilter] : []),
          ],
        },
        include: {
          lifeDomain: true,
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
          driUser: {
            select: { id: true, name: true, email: true, image: true },
          },
          keyResults: {
            where: {
              ...periodFilter,
              // Workspace-wide OKRs view: show every key result.
              // "My Goals" view (onlyMine): show only key results the user is the
              // DRI for — being the creator/owner is not enough, matching the
              // DRI-only objective filter above.
              // Outside any workspace (personal view): scope to the user's own
              // key results (owner or DRI).
              ...(isWorkspaceScoped
                ? input.onlyMine
                  ? { driUserId: ctx.session.user.id }
                  : {}
                : {
                    OR: [
                      { userId: ctx.session.user.id },
                      { driUserId: ctx.session.user.id },
                    ],
                  }),
            },
            include: {
              checkIns: {
                orderBy: { createdAt: "desc" },
                take: 20,
              },
              user: {
                select: { id: true, name: true, email: true, image: true },
              },
              driUser: {
                select: { id: true, name: true, email: true, image: true },
              },
              projects: {
                include: {
                  project: {
                    select: {
                      id: true,
                      name: true,
                      status: true,
                      slug: true,
                    },
                  },
                },
              },
              // Linked Features — the second typed execution edge (ADR-0050).
              features: {
                include: {
                  feature: {
                    select: {
                      id: true,
                      name: true,
                      status: true,
                      product: {
                        select: {
                          id: true,
                          name: true,
                          slug: true,
                          icon: true,
                          color: true,
                        },
                      },
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { title: "asc" },
      });

      // V2 delivery signal (ADR-0050): one groupBy across every linked
      // feature in the response, attached as done/total per feature below.
      const progressByFeature = await getTicketProgressByFeature(
        ctx.db,
        goals.flatMap((goal) =>
          goal.keyResults.flatMap((kr) =>
            kr.features.map((link) => link.feature.id),
          ),
        ),
      );

      // Calculate progress for each objective. A manual progressOverride wins
      // over the KR-derived mean (see goalProgress.ts); falls back to 0 when a
      // goal has neither an override nor measurable key results.
      return goals.map((goal) => {
        const keyResults = goal.keyResults;
        const resolved = resolveGoalProgress(goal) ?? 0;

        const statusCounts = {
          "on-track": keyResults.filter((kr) => kr.status === "on-track")
            .length,
          "at-risk": keyResults.filter((kr) => kr.status === "at-risk").length,
          "off-track": keyResults.filter((kr) => kr.status === "off-track")
            .length,
          achieved: keyResults.filter((kr) => kr.status === "achieved").length,
        };

        return {
          ...goal,
          keyResults: keyResults.map((kr) => ({
            ...kr,
            features: kr.features.map((link) => ({
              ...link,
              feature: {
                ...link.feature,
                ticketProgress:
                  progressByFeature.get(link.feature.id) ?? null,
              },
            })),
          })),
          progress: resolved,
          statusCounts,
        };
      });
    }),

  // Get a single key result
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // Owner OR workspace member. `getAll`/`getByObjective` are workspace-wide,
      // so an owner-only detail read would 404 on rows those lists just returned.
      // The membership test runs after the fetch, through the centralized
      // resolver, so team-derived workspace access is honored — an inline
      // `members.some` sees only direct WorkspaceUser rows and would 404 a team
      // member on the very key result the list handed them. linkProject records
      // having been bitten by exactly that.
      const keyResult = await ctx.db.keyResult.findFirst({
        where: { id: input.id },
        include: {
          goal: {
            include: {
              lifeDomain: true,
            },
          },
          checkIns: {
            orderBy: { createdAt: "desc" },
            include: {
              createdBy: {
                select: { id: true, name: true, image: true },
              },
            },
          },
          projects: {
            include: {
              project: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                },
              },
            },
          },
          // Linked Features — the second typed execution edge (ADR-0050).
          // Lean select only: these payloads transit agent tool calls.
          features: {
            include: {
              feature: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                  product: {
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                      icon: true,
                      color: true,
                    },
                  },
                },
              },
            },
          },
          driUser: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      });

      if (
        !keyResult ||
        !(
          keyResult.userId === ctx.session.user.id ||
          (keyResult.workspaceId &&
            (await getWorkspaceMembership(
              ctx.db,
              ctx.session.user.id,
              keyResult.workspaceId,
            )))
        )
      ) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Key result not found",
        });
      }

      // V2 delivery signal (ADR-0050): attach done/total ticket counts to
      // each linked feature. Null for ticketless features — the drawer
      // renders no chip rather than "0/0".
      const progressByFeature = await getTicketProgressByFeature(
        ctx.db,
        keyResult.features.map((link) => link.feature.id),
      );

      return {
        ...keyResult,
        features: keyResult.features.map((link) => ({
          ...link,
          feature: {
            ...link.feature,
            ticketProgress: progressByFeature.get(link.feature.id) ?? null,
          },
        })),
      };
    }),

  // Batch lookup of KR metadata by ids — used by Phase 3 of weekly review
  // to render the "Your bets this week" recap card. Filters to KRs the
  // current user can access (owns or shares a workspace with).
  getByIds: protectedProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.db.keyResult.findMany({
        where: {
          id: { in: input.ids },
          OR: [
            { userId },
            { workspace: { members: { some: { userId } } } },
          ],
        },
        select: {
          id: true,
          title: true,
          currentValue: true,
          targetValue: true,
          startValue: true,
          unit: true,
          status: true,
          workspaceId: true,
          goalId: true,
          goal: { select: { id: true, title: true } },
          // Full linked-project ids so callers (e.g. weekly-plan Phase 3
          // recap card) can mutate via okr.updateLinkedProjects without
          // dropping links to projects outside the active-only view.
          projects: { select: { projectId: true } },
        },
      });
    }),

  // Create a new key result
  create: protectedProcedure
    .input(createKeyResultInput)
    .mutation(async ({ ctx, input }) => {
      // Owner, DRI or workspace member may add a key result to an objective.
      const goal = await ctx.db.goal.findUnique({
        where: { id: input.goalId },
        select: { id: true, userId: true, driUserId: true, workspaceId: true },
      });

      if (!(await canWriteGoalKeyResults(ctx.db, ctx.session.user.id, goal))) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Goal not found or access denied",
        });
      }

      // A key result's workspace is not the caller's to choose: it decides who
      // can see and write the row, and letting it diverge from the objective's
      // would strand the two behind different access checks. It is inherited,
      // and an explicit value that disagrees is refused rather than ignored.
      if (
        input.workspaceId !== undefined &&
        input.workspaceId !== goal!.workspaceId
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "A key result must belong to its objective's workspace",
        });
      }

      return ctx.db.keyResult.create({
        data: {
          ...input,
          workspaceId: goal!.workspaceId,
          driUserId: input.driUserId ?? ctx.session.user.id,
          userId: ctx.session.user.id,
        },
        include: {
          goal: true,
        },
      });
    }),

  // Update a key result
  update: protectedProcedure
    .input(updateKeyResultInput)
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      // Owner OR workspace member (mirrors linkProject).
      const existing = await ctx.db.keyResult.findFirst({ where: { id } });

      if (!(await canWriteKeyResult(ctx.db, ctx.session.user.id, existing))) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Key result not found",
        });
      }

      // Reassigning to a different objective requires access to the target too.
      let movedWorkspaceId: string | null | undefined;
      if (updateData.goalId != null && updateData.goalId !== existing!.goalId) {
        const targetGoal = await ctx.db.goal.findUnique({
          where: { id: updateData.goalId },
          select: { id: true, userId: true, driUserId: true, workspaceId: true },
        });

        if (!(await canWriteGoalKeyResults(ctx.db, ctx.session.user.id, targetGoal))) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Objective not found",
          });
        }

        // A key result follows its objective's workspace — the same invariant
        // `create` enforces. Retargeting without moving it would leave the row
        // readable and writable by the ORIGINAL workspace's members while it
        // hangs off another workspace's objective.
        movedWorkspaceId = targetGoal!.workspaceId;
      }

      return ctx.db.keyResult.update({
        where: { id },
        data: {
          ...updateData,
          ...(movedWorkspaceId !== undefined
            ? { workspaceId: movedWorkspaceId }
            : {}),
        },
        include: {
          goal: true,
        },
      });
    }),

  // Record a check-in (progress update)
  checkIn: protectedProcedure
    .input(checkInInput)
    .mutation(async ({ ctx, input }) => {
      // Owner OR workspace member (mirrors linkProject) — a check-in is the
      // routine team/agent write on a KR, so it must not be owner-only.
      const keyResult = await ctx.db.keyResult.findFirst({
        where: { id: input.keyResultId },
      });

      if (
        !keyResult ||
        !(await canWriteKeyResult(ctx.db, ctx.session.user.id, keyResult))
      ) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Key result not found",
        });
      }

      // Determine new status based on progress
      const range = keyResult.targetValue - keyResult.startValue;
      const progress =
        range > 0
          ? ((input.newValue - keyResult.startValue) / range) * 100
          : 0;

      let newStatus = keyResult.status;
      if (progress >= 100) {
        newStatus = "achieved";
      } else if (progress >= 70) {
        newStatus = "on-track";
      } else if (progress >= 40) {
        newStatus = "at-risk";
      } else {
        newStatus = "off-track";
      }

      // Create check-in and update key result in transaction
      const [checkIn] = await ctx.db.$transaction([
        ctx.db.keyResultCheckIn.create({
          data: {
            keyResultId: input.keyResultId,
            previousValue: keyResult.currentValue,
            newValue: input.newValue,
            notes: input.notes,
            createdById: ctx.session.user.id,
          },
        }),
        ctx.db.keyResult.update({
          where: { id: input.keyResultId },
          data: {
            currentValue: input.newValue,
            status: newStatus,
          },
        }),
      ]);

      // Recompute parent goal health after check-in (fire-and-forget)
      void computeGoalHealth({ ctx, goalId: keyResult.goalId }).catch(
        (err: unknown) => { console.error("[goal-health] recompute after KR check-in:", err); },
      );

      return checkIn;
    }),

  // Delete a key result
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Owner OR workspace member (mirrors linkProject).
      const existing = await ctx.db.keyResult.findFirst({
        where: { id: input.id },
      });

      if (!(await canWriteKeyResult(ctx.db, ctx.session.user.id, existing))) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Key result not found",
        });
      }

      await ctx.db.keyResult.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // Update linked projects (batch operation for modal save)
  updateLinkedProjects: protectedProcedure
    .input(
      z.object({
        keyResultId: z.string(),
        projectIds: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user owns the key result
      const keyResult = await ctx.db.keyResult.findFirst({
        where: {
          id: input.keyResultId,
          userId: ctx.session.user.id,
        },
      });

      if (!keyResult) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Key result not found",
        });
      }

      // Use transaction to ensure atomicity
      await ctx.db.$transaction(async (tx) => {
        // Delete all existing project links
        await tx.keyResultProject.deleteMany({
          where: { keyResultId: input.keyResultId },
        });

        // Create new project links
        if (input.projectIds.length > 0) {
          await tx.keyResultProject.createMany({
            data: input.projectIds.map((projectId) => ({
              keyResultId: input.keyResultId,
              projectId,
            })),
          });
        }
      });

      // Return updated key result with projects
      return ctx.db.keyResult.findUnique({
        where: { id: input.keyResultId },
        include: {
          projects: {
            include: {
              project: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                },
              },
            },
          },
        },
      });
    }),

  // Link a single project to a key result
  linkProject: protectedProcedure
    .input(
      z.object({
        keyResultId: z.string(),
        projectId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Authorize the KR by ownership OR workspace membership — the weekly-plan
      // KR pool (getByObjective) is workspace-scoped, so a member must be able
      // to link a KR owned by another member of the same workspace. Uses the
      // centralized resolver so team-derived workspace access is honored (the
      // inline members.some check missed team membership).
      const userId = ctx.session.user.id;
      const keyResult = await ctx.db.keyResult.findFirst({
        where: { id: input.keyResultId },
        select: { id: true, userId: true, workspaceId: true },
      });

      if (
        !keyResult ||
        (keyResult.userId !== userId &&
          !(keyResult.workspaceId &&
            (await getWorkspaceMembership(ctx.db, userId, keyResult.workspaceId))))
      ) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Key result not found",
        });
      }

      // Verify the user can edit the project being linked.
      const projectAccess = await getProjectAccess(ctx.db, userId, input.projectId);
      if (!canEditProject(projectAccess)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to link this project",
        });
      }

      // Create the link (will be ignored if already exists due to unique constraint)
      await ctx.db.keyResultProject.upsert({
        where: {
          keyResultId_projectId: {
            keyResultId: input.keyResultId,
            projectId: input.projectId,
          },
        },
        create: {
          keyResultId: input.keyResultId,
          projectId: input.projectId,
        },
        update: {}, // No-op if already exists
      });

      return { success: true };
    }),

  // Unlink a single project from a key result
  unlinkProject: protectedProcedure
    .input(
      z.object({
        keyResultId: z.string(),
        projectId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Authorize the KR by ownership OR workspace membership (mirrors
      // linkProject) via the centralized resolver, so team-derived workspace
      // access is honored when unlinking workspace-shared KRs.
      const userId = ctx.session.user.id;
      const keyResult = await ctx.db.keyResult.findFirst({
        where: { id: input.keyResultId },
        select: { id: true, userId: true, workspaceId: true },
      });

      if (
        !keyResult ||
        (keyResult.userId !== userId &&
          !(keyResult.workspaceId &&
            (await getWorkspaceMembership(ctx.db, userId, keyResult.workspaceId))))
      ) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Key result not found",
        });
      }

      // Verify the user can edit the project being unlinked.
      const projectAccess = await getProjectAccess(ctx.db, userId, input.projectId);
      if (!canEditProject(projectAccess)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to unlink this project",
        });
      }

      // Delete the link
      await ctx.db.keyResultProject.deleteMany({
        where: {
          keyResultId: input.keyResultId,
          projectId: input.projectId,
        },
      });

      return { success: true };
    }),

  // ── Feature execution links (ADR-0050) ────────────────────────────────
  // Features are the second typed execution edge of a key result, mirroring
  // the project procedures above. KR-side authz matches linkProject (owner OR
  // workspace membership via the centralized resolver — NOT the owner-only
  // check updateLinkedProjects uses). Feature-side guard matches
  // feature.update: the feature must live in the same workspace as the KR and
  // the caller must be a member of that workspace.

  // Update linked features (batch operation for modal save). Transactional
  // delete-all-then-recreate mirroring updateLinkedProjects' shape, but with
  // linkFeature's workspace-member authz (deliberately NOT the owner-only
  // check updateLinkedProjects retains).
  updateLinkedFeatures: protectedProcedure
    .input(
      z.object({
        keyResultId: z.string(),
        featureIds: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const keyResult = await ctx.db.keyResult.findFirst({
        where: { id: input.keyResultId },
        select: { id: true, userId: true, workspaceId: true, goalId: true },
      });

      const membership =
        keyResult?.workspaceId != null
          ? await getWorkspaceMembership(ctx.db, userId, keyResult.workspaceId)
          : null;

      if (!keyResult || (keyResult.userId !== userId && !membership)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Key result not found",
        });
      }

      const featureIds = [...new Set(input.featureIds)];

      if (featureIds.length > 0) {
        const features = await ctx.db.feature.findMany({
          where: { id: { in: featureIds } },
          select: {
            id: true,
            goalId: true,
            product: { select: { workspaceId: true } },
          },
        });

        if (features.length !== featureIds.length) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "One or more features not found",
          });
        }

        if (
          !keyResult.workspaceId ||
          features.some(
            (f) => f.product.workspaceId !== keyResult.workspaceId
          )
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Feature belongs to a different workspace than this key result",
          });
        }

        if (!membership) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have access to this workspace",
          });
        }

        // Fill-on-null applies to every link the replace creates (ADR-0050):
        // features with no Objective alignment inherit the KR's Objective;
        // aligned ones are never overwritten.
        const unalignedIds = features
          .filter((f) => f.goalId == null)
          .map((f) => f.id);

        await ctx.db.$transaction(async (tx) => {
          await tx.keyResultFeature.deleteMany({
            where: { keyResultId: input.keyResultId },
          });
          await tx.keyResultFeature.createMany({
            data: featureIds.map((featureId) => ({
              keyResultId: input.keyResultId,
              featureId,
            })),
          });
          if (unalignedIds.length > 0) {
            await tx.feature.updateMany({
              where: { id: { in: unalignedIds } },
              data: { goalId: keyResult.goalId },
            });
          }
        });
      } else {
        // Clearing the set removes link rows only — no feature-side guard
        // needed, and no goalId is ever cleared on unlink.
        await ctx.db.keyResultFeature.deleteMany({
          where: { keyResultId: input.keyResultId },
        });
      }

      // Return the key result with both execution edges, lean select only.
      return ctx.db.keyResult.findUnique({
        where: { id: input.keyResultId },
        include: {
          projects: {
            include: {
              project: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                },
              },
            },
          },
          features: {
            include: {
              feature: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                  product: {
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                      icon: true,
                      color: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
    }),

  // Link a single feature to a key result
  linkFeature: protectedProcedure
    .input(
      z.object({
        keyResultId: z.string(),
        featureId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const keyResult = await ctx.db.keyResult.findFirst({
        where: { id: input.keyResultId },
        select: { id: true, userId: true, workspaceId: true, goalId: true },
      });

      // Resolve workspace membership once — it serves both the KR-side authz
      // (owner OR member, mirroring linkProject) and the feature-side guard.
      const membership =
        keyResult?.workspaceId != null
          ? await getWorkspaceMembership(ctx.db, userId, keyResult.workspaceId)
          : null;

      if (!keyResult || (keyResult.userId !== userId && !membership)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Key result not found",
        });
      }

      const feature = await ctx.db.feature.findUnique({
        where: { id: input.featureId },
        select: {
          id: true,
          goalId: true,
          product: { select: { workspaceId: true } },
        },
      });

      if (!feature) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature not found",
        });
      }

      // Cross-workspace links are rejected: the feature's product must belong
      // to the key result's workspace.
      if (
        !keyResult.workspaceId ||
        feature.product.workspaceId !== keyResult.workspaceId
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Feature belongs to a different workspace than this key result",
        });
      }

      // Parity with feature.update's assertWorkspaceMember guard: the caller
      // must be a member of the feature's workspace (a KR owner who isn't a
      // member of the workspace may not link its features).
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have access to this workspace",
        });
      }

      // Create the link and apply the Objective-alignment glue in one
      // transaction (ADR-0050): a feature with no alignment inherits the KR's
      // Objective; a feature already aligned — same or different Objective —
      // is never overwritten.
      await ctx.db.$transaction(async (tx) => {
        // Idempotent: the unique (keyResultId, featureId) pair is created once.
        await tx.keyResultFeature.upsert({
          where: {
            keyResultId_featureId: {
              keyResultId: input.keyResultId,
              featureId: input.featureId,
            },
          },
          create: {
            keyResultId: input.keyResultId,
            featureId: input.featureId,
          },
          update: {}, // No-op if already exists
        });

        if (feature.goalId == null) {
          await tx.feature.update({
            where: { id: feature.id },
            data: { goalId: keyResult.goalId },
          });
        }
      });

      return { success: true };
    }),

  // Unlink a single feature from a key result. Deletes only the link row —
  // never the feature or the key result on the other side.
  unlinkFeature: protectedProcedure
    .input(
      z.object({
        keyResultId: z.string(),
        featureId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const keyResult = await ctx.db.keyResult.findFirst({
        where: { id: input.keyResultId },
        select: { id: true, userId: true, workspaceId: true },
      });

      const membership =
        keyResult?.workspaceId != null
          ? await getWorkspaceMembership(ctx.db, userId, keyResult.workspaceId)
          : null;

      if (!keyResult || (keyResult.userId !== userId && !membership)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Key result not found",
        });
      }

      const feature = await ctx.db.feature.findUnique({
        where: { id: input.featureId },
        select: {
          id: true,
          product: { select: { workspaceId: true } },
        },
      });

      if (!feature) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature not found",
        });
      }

      if (
        !keyResult.workspaceId ||
        feature.product.workspaceId !== keyResult.workspaceId
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Feature belongs to a different workspace than this key result",
        });
      }

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have access to this workspace",
        });
      }

      // Delete only the link row. The feature's goalId is deliberately left
      // untouched — unlink never clears Objective alignment (ADR-0050).
      await ctx.db.keyResultFeature.deleteMany({
        where: {
          keyResultId: input.keyResultId,
          featureId: input.featureId,
        },
      });

      return { success: true };
    }),

  // Get available periods (quarters)
  getPeriods: protectedProcedure.query(() => {
    const currentYear = new Date().getFullYear();
    const periods = [];

    // Generate quarters for current and next year
    for (const year of [currentYear, currentYear + 1]) {
      periods.push(
        { value: `Q1-${year}`, label: `Q1 ${year} (Jan-Mar)` },
        { value: `Q2-${year}`, label: `Q2 ${year} (Apr-Jun)` },
        { value: `Q3-${year}`, label: `Q3 ${year} (Jul-Sep)` },
        { value: `Q4-${year}`, label: `Q4 ${year} (Oct-Dec)` },
        { value: `H1-${year}`, label: `H1 ${year} (Jan-Jun)` },
        { value: `H2-${year}`, label: `H2 ${year} (Jul-Dec)` },
        { value: `Annual-${year}`, label: `Annual ${year}` }
      );
    }

    return periods;
  }),

  // Get OKR statistics for dashboard
  getStats: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().optional(),
        period: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // When workspace-scoped, validate membership and show all workspace stats
      const isWorkspaceScoped = !!input.workspaceId;
      if (isWorkspaceScoped) {
        const membership = await getWorkspaceMembership(ctx.db, ctx.session.user.id, input.workspaceId!);
        if (!membership) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have access to this workspace",
          });
        }
      }

      const where = {
        ...(isWorkspaceScoped
          ? { workspaceId: input.workspaceId }
          : { userId: ctx.session.user.id }),
        ...(input.period ? { period: input.period } : {}),
      };

      const [totalKeyResults, onTrack, atRisk, offTrack, achieved, objectives] =
        await Promise.all([
          ctx.db.keyResult.count({ where }),
          ctx.db.keyResult.count({ where: { ...where, status: "on-track" } }),
          ctx.db.keyResult.count({ where: { ...where, status: "at-risk" } }),
          ctx.db.keyResult.count({ where: { ...where, status: "off-track" } }),
          ctx.db.keyResult.count({ where: { ...where, status: "achieved" } }),
          ctx.db.goal.count({
            where: {
              ...(isWorkspaceScoped
                ? { workspaceId: input.workspaceId }
                : { userId: ctx.session.user.id }),
            },
          }),
        ]);

      // Calculate average progress and confidence
      const keyResults = await ctx.db.keyResult.findMany({
        where,
        select: {
          currentValue: true,
          startValue: true,
          targetValue: true,
          confidence: true,
        },
      });

      const avgProgress =
        keyResults.length > 0
          ? keyResults.reduce((acc, kr) => {
              const range = kr.targetValue - kr.startValue;
              const progress =
                range > 0
                  ? ((kr.currentValue - kr.startValue) / range) * 100
                  : 0;
              return acc + Math.min(100, Math.max(0, progress));
            }, 0) / keyResults.length
          : 0;

      // Calculate average confidence from KRs that have it set
      const krsWithConfidence = keyResults.filter((kr) => kr.confidence !== null);
      const avgConfidence =
        krsWithConfidence.length > 0
          ? krsWithConfidence.reduce((acc, kr) => acc + (kr.confidence ?? 0), 0) /
            krsWithConfidence.length
          : null;

      // Calculate period end date for "days left" display
      const periodEndDate = input.period
        ? getPeriodEndDate(input.period)
        : null;

      return {
        totalObjectives: objectives,
        totalKeyResults,
        completedKeyResults: achieved,
        statusBreakdown: { onTrack, atRisk, offTrack, achieved },
        averageProgress: Math.round(avgProgress),
        averageConfidence:
          avgConfidence !== null ? Math.round(avgConfidence) : null,
        periodEndDate,
      };
    }),

  // Get objective and key result counts for all periods in a year
  getCountsByYear: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().optional(),
        year: z.string(),
        onlyMine: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // When workspace-scoped, validate membership and show all workspace counts
      const isWorkspaceScoped = !!input.workspaceId;
      if (isWorkspaceScoped) {
        const membership = await getWorkspaceMembership(ctx.db, ctx.session.user.id, input.workspaceId!);
        if (!membership) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have access to this workspace",
          });
        }
      }

      const periods = ["Annual", "Q1", "Q2", "Q3", "Q4"];
      const counts: Record<
        string,
        { objectives: number; keyResults: number; averageProgress: number }
      > = {};

      await Promise.all(
        periods.map(async (periodType) => {
          const period = `${periodType}-${input.year}`;
          const where = {
            ...(isWorkspaceScoped ? { workspaceId: input.workspaceId } : {}),
            // "My Goals" view: count only the key results the user is the DRI
            // for — matching the DRI-only cards. A my-DRI KR's objective always
            // surfaces on some card (via the objective's `keyResults.some` DRI
            // filter), so no extra goal-ownership scoping is needed here.
            // Personal (non-workspace) view: count the user's own KRs (owner or
            // DRI). Workspace-wide OKRs view: count every KR in the period.
            ...(isWorkspaceScoped
              ? input.onlyMine
                ? { driUserId: ctx.session.user.id }
                : {}
              : {
                  OR: [
                    { userId: ctx.session.user.id },
                    { driUserId: ctx.session.user.id },
                  ],
                }),
            period,
          };

          const [keyResultCount, objectiveIds, krsForProgress] = await Promise.all([
            ctx.db.keyResult.count({ where }),
            ctx.db.keyResult.findMany({
              where,
              select: { goalId: true },
              distinct: ["goalId"],
            }),
            ctx.db.keyResult.findMany({
              where,
              select: { startValue: true, currentValue: true, targetValue: true },
            }),
          ]);

          const averageProgress =
            krsForProgress.length > 0
              ? Math.round(
                  krsForProgress.reduce((acc, kr) => {
                    const range = kr.targetValue - kr.startValue;
                    const progress =
                      range > 0
                        ? ((kr.currentValue - kr.startValue) / range) * 100
                        : 0;
                    return acc + Math.min(100, Math.max(0, progress));
                  }, 0) / krsForProgress.length,
                )
              : 0;

          counts[periodType] = {
            objectives: objectiveIds.length,
            keyResults: keyResultCount,
            averageProgress,
          };
        }),
      );

      return counts;
    }),

  // Get goals that can be used as objectives (for selection in forms)
  getAvailableGoals: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.goal.findMany({
        where: {
          userId: ctx.session.user.id,
          ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        },
        include: {
          lifeDomain: true,
        },
        orderBy: { title: "asc" },
      });
    }),

  // ============================================
  // OKR Discussion Comments
  // ============================================

  // Add comment to an objective (goal)
  addGoalComment: protectedProcedure
    .input(
      z.object({
        goalId: z.number(),
        content: z.string().min(1).max(5000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Access mirrors getObjectiveActivity: owner, or any member of the goal's
      // workspace. Shared-workspace OKRs are commentable by members.
      const goal = await ctx.db.goal.findUnique({
        where: { id: input.goalId },
        select: { id: true, userId: true, workspaceId: true },
      });

      if (!goal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Objective not found",
        });
      }

      if (goal.workspaceId) {
        const membership = await getWorkspaceMembership(
          ctx.db,
          ctx.session.user.id,
          goal.workspaceId,
        );
        if (!membership && goal.userId !== ctx.session.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
      } else if (goal.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const comment = await ctx.db.goalComment.create({
        data: {
          goalId: input.goalId,
          authorId: ctx.session.user.id,
          content: input.content,
        },
        include: {
          author: {
            select: { id: true, name: true, image: true },
          },
        },
      });

      return comment;
    }),

  // Get comments for an objective (goal)
  getGoalComments: protectedProcedure
    .input(
      z.object({
        goalId: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Access mirrors getObjectiveActivity: owner, or any member of the goal's
      // workspace. Shared-workspace OKRs are readable by members.
      const goal = await ctx.db.goal.findUnique({
        where: { id: input.goalId },
        select: { id: true, userId: true, workspaceId: true },
      });

      if (!goal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Objective not found",
        });
      }

      if (goal.workspaceId) {
        const membership = await getWorkspaceMembership(
          ctx.db,
          ctx.session.user.id,
          goal.workspaceId,
        );
        if (!membership && goal.userId !== ctx.session.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
      } else if (goal.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      return ctx.db.goalComment.findMany({
        where: { goalId: input.goalId },
        include: {
          author: {
            select: { id: true, name: true, image: true },
          },
        },
        orderBy: { createdAt: "asc" },
      });
    }),

  // Delete own comment from an objective
  deleteGoalComment: protectedProcedure
    .input(
      z.object({
        commentId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.goalComment.findFirst({
        where: { id: input.commentId, authorId: ctx.session.user.id },
      });

      if (!comment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Comment not found or you don't have permission to delete it",
        });
      }

      await ctx.db.goalComment.delete({ where: { id: input.commentId } });
      return { success: true };
    }),

  // Add comment to a key result
  addKeyResultComment: protectedProcedure
    .input(
      z.object({
        keyResultId: z.string(),
        content: z.string().min(1).max(5000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user owns this key result
      const keyResult = await ctx.db.keyResult.findFirst({
        where: { id: input.keyResultId, userId: ctx.session.user.id },
      });

      if (!keyResult) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Key result not found",
        });
      }

      const comment = await ctx.db.keyResultComment.create({
        data: {
          keyResultId: input.keyResultId,
          authorId: ctx.session.user.id,
          content: input.content,
        },
        include: {
          author: {
            select: { id: true, name: true, image: true },
          },
        },
      });

      return comment;
    }),

  // Get comments for a key result
  getKeyResultComments: protectedProcedure
    .input(
      z.object({
        keyResultId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify user owns this key result
      const keyResult = await ctx.db.keyResult.findFirst({
        where: { id: input.keyResultId, userId: ctx.session.user.id },
      });

      if (!keyResult) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Key result not found",
        });
      }

      return ctx.db.keyResultComment.findMany({
        where: { keyResultId: input.keyResultId },
        include: {
          author: {
            select: { id: true, name: true, image: true },
          },
        },
        orderBy: { createdAt: "asc" },
      });
    }),

  // Merged, time-sorted activity timeline for an objective: the objective's
  // own comments/updates rolled up with the comments and check-ins of ALL its
  // child key results. Read-side union over existing tables (no schema change,
  // same pattern as ADR-0001). The merge happens here so the client never
  // fans out per-KR (no N+1). KR-sourced items carry the KR id/title/code so
  // the UI can render a clickable source chip.
  getObjectiveActivity: protectedProcedure
    .input(z.object({ goalId: z.number() }))
    .query(async ({ ctx, input }): Promise<ObjectiveActivityItem[]> => {
      // Access check mirrors goal.getById: owner, or any member of the goal's
      // workspace. Shared workspace OKRs stay readable here.
      const goal = await ctx.db.goal.findUnique({
        where: { id: input.goalId },
        select: { id: true, userId: true, workspaceId: true },
      });

      if (!goal) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Objective not found" });
      }

      if (goal.workspaceId) {
        const membership = await getWorkspaceMembership(
          ctx.db,
          ctx.session.user.id,
          goal.workspaceId,
        );
        if (!membership && goal.userId !== ctx.session.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
      } else if (goal.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const authorSelect = {
        select: { id: true, name: true, image: true },
      } as const;

      const [goalCommentRows, goalUpdateRows, keyResultRows] = await Promise.all([
        ctx.db.goalComment.findMany({
          where: { goalId: input.goalId },
          include: { author: authorSelect },
        }),
        ctx.db.goalUpdate.findMany({
          where: { goalId: input.goalId },
          include: { author: authorSelect },
        }),
        // Order by createdAt asc, then id asc as a deterministic tiebreaker so
        // the per-objective KR code (KR1, KR2, …) is stable even when two KRs
        // share a createdAt timestamp, and matches the KRs tab's listing order.
        ctx.db.keyResult.findMany({
          where: { goalId: input.goalId },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            title: true,
            comments: { include: { author: authorSelect } },
            checkIns: {
              include: {
                createdBy: { select: { id: true, name: true, image: true } },
              },
            },
          },
        }),
      ]);

      return mergeObjectiveActivity({
        goalComments: goalCommentRows,
        goalUpdates: goalUpdateRows,
        keyResults: keyResultRows,
      });
    }),

  // ============================================
  // Manual status override (ADR-0004)
  // ============================================

  // Set or clear an objective's manual health override. Writes ONLY the
  // override columns (healthOverride + audit) — the auto `health` cache that
  // recomputeHealth maintains is never touched here. Passing status: null
  // clears the override ("Auto"), at which point the derived value reappears.
  setObjectiveStatusOverride: protectedProcedure
    .input(
      z.object({
        goalId: z.number(),
        status: z.enum(["on-track", "at-risk", "off-track"]).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const goal = await ctx.db.goal.findFirst({
        where: { id: input.goalId, userId: ctx.session.user.id },
      });

      if (!goal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Objective not found",
        });
      }

      return ctx.db.goal.update({
        where: { id: input.goalId },
        data: {
          healthOverride: input.status,
          healthOverrideAt: input.status ? new Date() : null,
          healthOverrideById: input.status ? ctx.session.user.id : null,
        },
      });
    }),

  // Set or clear a key result's manual status override. Writes ONLY the
  // override columns — the auto `status` that check-ins rewrite is never
  // touched here. Passing status: null clears the override ("Auto").
  setKeyResultStatusOverride: protectedProcedure
    .input(
      z.object({
        keyResultId: z.string(),
        status: z
          .enum(["on-track", "at-risk", "off-track", "achieved"])
          .nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const keyResult = await ctx.db.keyResult.findFirst({
        where: { id: input.keyResultId, userId: ctx.session.user.id },
      });

      if (!keyResult) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Key result not found",
        });
      }

      return ctx.db.keyResult.update({
        where: { id: input.keyResultId },
        data: {
          statusOverride: input.status,
          statusOverrideAt: input.status ? new Date() : null,
          statusOverrideById: input.status ? ctx.session.user.id : null,
        },
      });
    }),

  // Delete own comment from a key result
  deleteKeyResultComment: protectedProcedure
    .input(
      z.object({
        commentId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.keyResultComment.findFirst({
        where: { id: input.commentId, authorId: ctx.session.user.id },
      });

      if (!comment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Comment not found or you don't have permission to delete it",
        });
      }

      await ctx.db.keyResultComment.delete({ where: { id: input.commentId } });
      return { success: true };
    }),
});
