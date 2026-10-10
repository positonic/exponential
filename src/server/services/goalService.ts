import type { Prisma } from "@prisma/client";
import { type Context } from "~/server/auth/types";
import {
  getWorkspaceMembership,
  canEditWorkspaceContent,
} from "~/server/services/access/resolvers/workspaceResolver";
import { resolveGoalProgress, isManualProgress } from "~/server/services/goalProgress";
import { recordActivity } from "~/server/services/activity/recordActivity";

/**
 * Verifies the current user has access to the given goal.
 * Returns the goal if access is granted, throws otherwise.
 */
export async function verifyGoalAccess({ ctx, goalId }: { ctx: Context; goalId: number }) {
  const userId = ctx.session?.user?.id;
  if (!userId) throw new Error("User not authenticated");

  const goal = await ctx.db.goal.findUnique({
    where: { id: goalId },
    // `title` rides along for the activity-feed write sites (bare rows carry
    // the objective title) so instrumented callers don't re-fetch the row.
    select: { id: true, userId: true, driUserId: true, workspaceId: true, title: true },
  });

  if (!goal) throw new Error("Goal not found");

  // Owner or DRI always has access
  if (goal.userId === userId || goal.driUserId === userId) return goal;

  // Workspace member has access
  if (goal.workspaceId) {
    const membership = await getWorkspaceMembership(ctx.db, userId, goal.workspaceId);
    if (membership) return goal;
  }

  throw new Error("Access denied");
}

/** The health a check-in can set. Mirrors the auto `Goal.health` values an
 * Objective update writes — never the manual `healthOverride` (ADR-0004). */
export type GoalUpdateHealth = "on-track" | "at-risk" | "off-track";

/**
 * Creates an **Objective update** (`GoalUpdate`) — a health-bearing check-in
 * (content + health). Authored by the calling user. In the same transaction it
 * syncs the Objective's **auto** health cache (`Goal.health` + `healthUpdatedAt`)
 * so the status badge moves — but it NEVER writes the manual `healthOverride`,
 * which stays the "Set status" CTA's job (ADR-0004). A set override is left
 * intact, so the effective badge stays `healthOverride ?? health`.
 *
 * This is the single place the update-write rule lives: both the human router
 * (`goalUpdate.addUpdate`) and the agent-facing proxy (`mastra.addGoalUpdate`)
 * call it, so the health-sync behaviour cannot drift between surfaces. Access
 * mirrors the human path exactly via `verifyGoalAccess`. See ADR-0016.
 */
export async function createGoalUpdate({
  ctx,
  goalId,
  content,
  health,
}: {
  ctx: Context;
  goalId: number;
  content: string;
  health: GoalUpdateHealth;
}) {
  const goal = await verifyGoalAccess({ ctx, goalId });

  const userId = ctx.session?.user?.id;
  if (!userId) throw new Error("User not authenticated");

  const [update] = await ctx.db.$transaction([
    ctx.db.goalUpdate.create({
      data: {
        goalId,
        authorId: userId,
        content,
        health,
      },
      include: {
        author: { select: { id: true, name: true, image: true } },
      },
    }),
    // Sync the goal's cached (auto) health status. Never touches healthOverride.
    ctx.db.goal.update({
      where: { id: goalId },
      data: {
        health,
        healthUpdatedAt: new Date(),
      },
    }),
  ]);

  // Surface the posted update in the workspace feed — distinct from comment
  // events. This seam covers both the human router and Zoe's mastra proxy
  // (ADR-0016). metadata.goalId is the drawer target; personal objectives are
  // silent by design. Fire-and-forget.
  if (goal.workspaceId) {
    await recordActivity(ctx.db, {
      workspaceId: goal.workspaceId,
      userId,
      entityType: "goal_update",
      entityId: update.id,
      action: "created",
      metadata: { title: goal.title, goalId },
    }).catch(() => {
      /* instrumentation failure is non-fatal */
    });
  }

  return update;
}

/**
 * Creates an **Objective comment** (`GoalComment`) — a narrative note with no
 * health that never moves the status badge. Authored by the calling user.
 *
 * This is the single place the comment-write rule lives: both the human router
 * (`goalComment.addComment`) and the agent-facing proxy (`mastra.addGoalComment`)
 * call it, so access control and behaviour cannot drift between surfaces.
 * Access mirrors the human path exactly via `verifyGoalAccess`. See ADR-0016.
 */
export async function createGoalComment({
  ctx,
  goalId,
  content,
  parentUpdateId,
}: {
  ctx: Context;
  goalId: number;
  content: string;
  parentUpdateId?: string | null;
}) {
  const goal = await verifyGoalAccess({ ctx, goalId });

  const userId = ctx.session?.user?.id;
  if (!userId) throw new Error("User not authenticated");

  const comment = await ctx.db.goalComment.create({
    data: {
      goalId,
      authorId: userId,
      content,
      parentUpdateId: parentUpdateId ?? null,
    },
    include: {
      author: { select: { id: true, name: true, image: true } },
    },
  });

  // Surface the comment in the workspace feed. This seam covers both the
  // human router and Zoe's mastra proxy (ADR-0016). metadata.goalId is the
  // drawer target; personal objectives are silent. Fire-and-forget.
  if (goal.workspaceId) {
    await recordActivity(ctx.db, {
      workspaceId: goal.workspaceId,
      userId,
      entityType: "goal_comment",
      entityId: comment.id,
      action: "created",
      metadata: { title: goal.title, goalId },
    }).catch(() => {
      /* instrumentation failure is non-fatal */
    });
  }

  return comment;
}

export async function getMyPublicGoals({ ctx }: { ctx: Context }) {
  const userId = ctx.session?.user?.id;
  return await ctx.db.goal.findMany({
    where: {
      userId
    },
    include: {
      lifeDomain: true,
      projects: true
    }
  });
}

export async function getAllMyGoals({ ctx }: { ctx: Context }) {
  const userId = ctx.session?.user?.id;
  return await ctx.db.goal.findMany({
    where: {
      userId
    },
    include: {
      lifeDomain: true,
      projects: true,
      parentGoal: { select: { id: true, title: true } }
    }
  });
}

interface GoalInput {
  title: string;
  description?: string;
  whyThisGoal?: string;
  notes?: string;
  dueDate?: Date;
  period?: string; // OKR period e.g., "Q1-2026", "Annual-2026"
  status?: string; // "planned" | "active" | "completed" | "archived"
  lifeDomainId?: number;
  projectId?: string;
  driUserId?: string;
  workspaceId?: string;
  parentGoalId?: number | null;
  icon?: string | null;
  iconColor?: string | null;
}

export async function createGoal({ ctx, input }: { ctx: Context, input: GoalInput }) {
  if (!ctx.session?.user?.id) {
    throw new Error("User not authenticated");
  }

  // A sub-goal's parent must be ACCESSIBLE to the caller — never nest under
  // another user's goal (that would inject a child into their tree and pollute
  // their health roll-up) — and the chain must stay within the depth cap.
  // Shared validation with updateGoal/setGoalParent.
  if (input.parentGoalId) {
    await verifyGoalAccess({ ctx, goalId: input.parentGoalId });
    await validateParentAssignment({ ctx, parentGoalId: input.parentGoalId });
  }

  // Same rule as the move path in updateGoal: you may only file a goal into a
  // workspace you belong to.
  if (input.workspaceId) {
    await assertCanPlaceGoalInWorkspace({ ctx, workspaceId: input.workspaceId });
  }

  const goal = await ctx.db.goal.create({
    data: {
      title: input.title,
      description: input.description,
      whyThisGoal: input.whyThisGoal,
      notes: input.notes,
      dueDate: input.dueDate,
      period: input.period ?? null,
      status: input.status ?? "active",
      lifeDomainId: input.lifeDomainId ?? null,
      userId: ctx.session.user.id,
      driUserId: input.driUserId ?? ctx.session.user.id,
      workspaceId: input.workspaceId ?? null,
      parentGoalId: input.parentGoalId ?? null,
      icon: input.icon ?? null,
      iconColor: input.iconColor ?? null,
      projects: input.projectId ? {
        connect: [{ id: input.projectId }]
      } : undefined,
    },
    include: {
      lifeDomain: true,
      projects: true,
    },
  });

  // Surface workspace-scoped objective creation in the activity feed. This
  // seam covers every service caller (Zoe's mastra proxies included);
  // personal objectives are silent by design. Fire-and-forget.
  if (goal.workspaceId) {
    await recordActivity(ctx.db, {
      workspaceId: goal.workspaceId,
      userId: ctx.session.user.id,
      entityType: "goal",
      entityId: String(goal.id),
      action: "created",
      metadata: { title: goal.title },
    }).catch(() => {
      /* instrumentation failure is non-fatal */
    });
  }

  return goal;
}

/**
 * Assert the caller may place a goal into this workspace.
 *
 * Guards the create and move paths — a goal's workspace decides who can see and
 * edit it, so writing one is an access change, not a field edit. Bare
 * membership is not the test: `viewer` is read-only and `guest` is synthesized
 * for project-only access, and neither should be filing goals into a workspace.
 * `canEditWorkspaceContent` is the repo's answer (see its docstring).
 */
async function assertCanPlaceGoalInWorkspace({
  ctx,
  workspaceId,
}: {
  ctx: Context;
  workspaceId: string;
}) {
  const userId = ctx.session?.user?.id;
  if (!userId) throw new Error("User not authenticated");
  const membership = await getWorkspaceMembership(ctx.db, userId, workspaceId);
  if (!canEditWorkspaceContent(membership?.role ?? null)) {
    throw new Error("You are not a member of the target workspace");
  }
}

/**
 * Validate a proposed parentGoalId: no self-parent, no cycle, and the resulting
 * chain stays within the 5-level nesting cap. Shared by updateGoal and
 * setGoalParent. Pass `goalId` for an existing goal being re-parented; omit it for
 * a brand-new goal (createGoal) where self/cycle checks don't apply.
 */
async function validateParentAssignment({
  ctx,
  goalId,
  parentGoalId,
}: {
  ctx: Context;
  goalId?: number;
  parentGoalId: number;
}) {
  if (goalId !== undefined && parentGoalId === goalId) {
    throw new Error("A goal cannot be its own parent");
  }
  let depth = 1;
  let currentParentId: number | null = parentGoalId;
  while (currentParentId) {
    const parent: { parentGoalId: number | null } | null = await ctx.db.goal.findUnique({
      where: { id: currentParentId },
      select: { parentGoalId: true },
    });
    if (!parent) break;
    if (goalId !== undefined && parent.parentGoalId === goalId) {
      throw new Error("Cannot set a descendant goal as parent (would create a cycle)");
    }
    currentParentId = parent.parentGoalId;
    depth++;
    if (depth > 5) {
      throw new Error("Maximum nesting depth of 5 levels exceeded");
    }
  }
}

/**
 * A **partial** goal update. Every field is optional and follows one rule:
 *
 *   - key absent / `undefined` → leave the column exactly as it is
 *   - key present with a value → write that value
 *   - key present as `null`    → clear the column (nullable fields only)
 *
 * This matters because the goal form in the web UI posts every field, while API
 * and CLI consumers send only what changed. The old full-overwrite shape wiped
 * `period`, `workspaceId`, `lifeDomainId` and every project link on any caller
 * that omitted them — orphaning workspace goals out of their workspace, which in
 * turn locked the caller out of their own goal (the access check falls through
 * to owner-only once `workspaceId` is null).
 */
interface UpdateGoalInput {
  id: number;
  title?: string;
  description?: string | null;
  whyThisGoal?: string | null;
  notes?: string | null;
  dueDate?: Date | null;
  period?: string | null;
  status?: string;
  lifeDomainId?: number | null;
  /** Replace the goal's project links with this one project; `null` clears them. */
  projectId?: string | null;
  /** Replace the goal's project links wholesale; `[]` clears them. */
  projectIds?: string[];
  driUserId?: string | null;
  workspaceId?: string | null;
  parentGoalId?: number | null;
  displayOrder?: number;
  icon?: string | null;
  iconColor?: string | null;
}

export async function updateGoal({ ctx, input }: { ctx: Context, input: UpdateGoalInput }) {
  if (!ctx.session?.user?.id) {
    throw new Error("User not authenticated");
  }

  await verifyGoalAccess({ ctx, goalId: input.id });

  const existingGoal = await ctx.db.goal.findUniqueOrThrow({
    where: { id: input.id },
  });

  // Validate parent change (no self/cycle, within depth cap). Shared with setGoalParent.
  if (
    input.parentGoalId !== undefined &&
    input.parentGoalId !== existingGoal.parentGoalId &&
    input.parentGoalId
  ) {
    await validateParentAssignment({ ctx, goalId: input.id, parentGoalId: input.parentGoalId });
  }

  // Moving a goal between workspaces is an access change, so the caller must
  // belong to where it lands. Without this, anyone who can edit a goal can push
  // it into a workspace they cannot see — orphaning it exactly like the
  // overwrite bug above — or into one they can, exposing it to that workspace's
  // members. Clearing to null (making it personal) needs no membership.
  if (
    input.workspaceId !== undefined &&
    input.workspaceId !== null &&
    input.workspaceId !== existingGoal.workspaceId
  ) {
    await assertCanPlaceGoalInWorkspace({ ctx, workspaceId: input.workspaceId });
  }

  const data: Prisma.GoalUncheckedUpdateInput = {};
  // Only keys the caller actually supplied are written — see UpdateGoalInput.
  const assign = <K extends keyof Prisma.GoalUncheckedUpdateInput>(
    key: K,
    value: Prisma.GoalUncheckedUpdateInput[K] | undefined,
  ) => {
    if (value !== undefined) data[key] = value;
  };

  assign("title", input.title);
  assign("description", input.description);
  assign("whyThisGoal", input.whyThisGoal);
  assign("notes", input.notes);
  assign("dueDate", input.dueDate);
  assign("period", input.period);
  assign("status", input.status);
  assign("lifeDomainId", input.lifeDomainId);
  assign("driUserId", input.driUserId);
  assign("workspaceId", input.workspaceId);
  assign("parentGoalId", input.parentGoalId);
  assign("displayOrder", input.displayOrder);
  assign("icon", input.icon);
  assign("iconColor", input.iconColor);

  // Project links are replaced only when the caller names them. `projectIds`
  // wins over the legacy single-project `projectId` when both are sent.
  if (input.projectIds !== undefined) {
    data.projects = { set: input.projectIds.map((id) => ({ id })) };
  } else if (input.projectId !== undefined) {
    data.projects =
      input.projectId === null
        ? { set: [] }
        : { set: [], connect: [{ id: input.projectId }] };
  }

  const updated = await ctx.db.goal.update({
    where: {
      id: input.id,
    },
    data,
    include: {
      lifeDomain: true,
      projects: true,
    },
  });

  // One event per lifecycle status change — `completed` on the transition into
  // completed, `status_changed` otherwise. Plain field edits are silent, as are
  // personal objectives (guarded on the post-update workspace, so a goal moved
  // out of its workspace in the same call logs nothing). Fire-and-forget.
  if (
    input.status !== undefined &&
    input.status !== existingGoal.status &&
    updated.workspaceId
  ) {
    await recordActivity(ctx.db, {
      workspaceId: updated.workspaceId,
      userId: ctx.session.user.id,
      entityType: "goal",
      entityId: String(updated.id),
      action: input.status === "completed" ? "completed" : "status_changed",
      metadata: { title: updated.title },
    }).catch(() => {
      /* instrumentation failure is non-fatal */
    });
  }

  return updated;
}

/**
 * Re-parent a goal (or detach it with parentGoalId = null) WITHOUT touching any
 * of its other fields. Unlike updateGoal (a full overwrite that clears projects,
 * period, workspace, etc.), this only writes parentGoalId — safe for nesting an
 * existing goal under another. Validates access to both goal and parent, and the
 * no-self/no-cycle/depth rules.
 */
export async function setGoalParent({
  ctx,
  goalId,
  parentGoalId,
}: {
  ctx: Context;
  goalId: number;
  parentGoalId: number | null;
}) {
  if (!ctx.session?.user?.id) {
    throw new Error("User not authenticated");
  }
  await verifyGoalAccess({ ctx, goalId });
  if (parentGoalId !== null) {
    await verifyGoalAccess({ ctx, goalId: parentGoalId });
    await validateParentAssignment({ ctx, goalId, parentGoalId });
  }
  return await ctx.db.goal.update({
    where: { id: goalId },
    data: { parentGoalId },
    include: { parentGoal: { select: { id: true, title: true } } },
  });
}

/**
 * Returns all goals for a specific project for the current user.
 * @param ctx - The request context containing session and db
 * @param projectId - The project ID to filter goals by
 */
export async function getProjectGoals({ ctx, projectId }: { ctx: Context, projectId: string }) {
  const userId = ctx.session?.user?.id;
  if (!userId) throw new Error("User not authenticated");
  return await ctx.db.goal.findMany({
    where: {
      userId,
      projects: {
        some: { id: projectId },
      },
    },
    include: {
      lifeDomain: true,
      projects: true,
      // The list nests sub-goals under their parent; the parent's title is what
      // labels a sub-goal whose parent isn't itself on this project.
      parentGoal: { select: { id: true, title: true } },
      driUser: { select: { id: true, name: true, image: true } },
    },
    orderBy: { displayOrder: "asc" },
  });
}

/**
 * Returns a tree of goals for a workspace, with nested childGoals.
 * Root-level goals (no parent) are returned, each with their children recursively included.
 */
export async function getGoalTree({ ctx, workspaceId, status }: { ctx: Context, workspaceId?: string, status?: string }) {
  const userId = ctx.session?.user?.id;
  if (!userId) throw new Error("User not authenticated");

  const goals = await ctx.db.goal.findMany({
    where: {
      ...(workspaceId ? { workspaceId } : { userId }),
      ...(status ? { status } : {}),
    },
    include: {
      lifeDomain: true,
      projects: true,
      keyResults: { select: { id: true, status: true, currentValue: true, targetValue: true } },
      childGoals: {
        include: {
          lifeDomain: true,
          projects: true,
          keyResults: { select: { id: true, status: true, currentValue: true, targetValue: true } },
          childGoals: {
            include: {
              lifeDomain: true,
              projects: true,
              keyResults: { select: { id: true, status: true, currentValue: true, targetValue: true } },
              childGoals: {
                include: {
                  lifeDomain: true,
                  projects: true,
                  childGoals: {
                    include: {
                      lifeDomain: true,
                      projects: true,
                      childGoals: true,
                    },
                    orderBy: { displayOrder: "asc" },
                  },
                },
                orderBy: { displayOrder: "asc" },
              },
            },
            orderBy: { displayOrder: "asc" },
          },
        },
        orderBy: { displayOrder: "asc" },
      },
    },
    orderBy: { displayOrder: "asc" },
  });

  // Return only root-level goals (no parent)
  return goals.filter(g => g.parentGoalId === null);
}

/**
 * Computes and updates the health status for a goal based on:
 * 1. Key Result statuses (weighted by progress)
 * 2. Linked project progress
 * 3. Child goal health (recursive rollup)
 */
export async function computeGoalHealth({ ctx, goalId }: { ctx: Context, goalId: number }) {
  const goal = await ctx.db.goal.findUnique({
    where: { id: goalId },
    include: {
      keyResults: {
        select: {
          currentValue: true,
          targetValue: true,
          status: true,
          updatedAt: true,
        },
      },
      projects: {
        select: {
          progress: true,
          createdAt: true,
        },
      },
      childGoals: {
        select: {
          health: true,
          healthUpdatedAt: true,
        },
      },
    },
  });

  if (!goal) return null;

  const healthScores: number[] = [];
  let latestUpdate: Date | null = null;

  // 1. Key Results: map progress percentage to health score
  for (const kr of goal.keyResults) {
    const progress = kr.targetValue > 0 ? (kr.currentValue / kr.targetValue) * 100 : 0;
    healthScores.push(progress);
    if (kr.updatedAt && (!latestUpdate || kr.updatedAt > latestUpdate)) {
      latestUpdate = kr.updatedAt;
    }
  }

  // 2. Projects: use progress field (already stored 0-100)
  for (const project of goal.projects) {
    if (project.progress !== null && project.progress !== undefined) {
      healthScores.push(Math.max(0, Math.min(100, Number(project.progress))));
    }
    if (project.createdAt && (!latestUpdate || project.createdAt > latestUpdate)) {
      latestUpdate = project.createdAt;
    }
  }

  // 3. Child goals: map health string to score
  const healthToScore: Record<string, number> = {
    "on-track": 80,
    "at-risk": 50,
    "off-track": 20,
    "no-update": 0,
  };
  for (const child of goal.childGoals) {
    if (child.health) {
      healthScores.push(healthToScore[child.health] ?? 0);
    }
    if (child.healthUpdatedAt && (!latestUpdate || child.healthUpdatedAt > latestUpdate)) {
      latestUpdate = child.healthUpdatedAt;
    }
  }

  // Determine health status
  let health: string;
  if (healthScores.length === 0) {
    health = "no-update";
  } else {
    // Check staleness: if no updates in 14 days, mark as no-update
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    if (latestUpdate && latestUpdate < fourteenDaysAgo) {
      health = "no-update";
    } else {
      const avgScore = healthScores.reduce((a, b) => a + b, 0) / healthScores.length;
      if (avgScore >= 70) health = "on-track";
      else if (avgScore >= 40) health = "at-risk";
      else health = "off-track";
    }
  }

  // Update the goal's cached health
  await ctx.db.goal.update({
    where: { id: goalId },
    data: { health, healthUpdatedAt: new Date() },
  });

  // If this goal has a parent, recompute parent health too
  if (goal.parentGoalId) {
    // Fire-and-forget to avoid deep recursion blocking
    void computeGoalHealth({ ctx, goalId: goal.parentGoalId });
  }

  return health;
}

export async function getGoalById({ ctx, id }: { ctx: Context, id: number }) {
  const userId = ctx.session?.user?.id;
  if (!userId) throw new Error("User not authenticated");

  const goal = await ctx.db.goal.findUnique({
    where: { id },
    include: {
      lifeDomain: true,
      projects: {
        select: {
          id: true,
          name: true,
          status: true,
          progress: true,
          priority: true,
          endDate: true,
          createdById: true,
          createdBy: { select: { id: true, name: true, image: true } },
        },
      },
      keyResults: {
        select: {
          id: true,
          title: true,
          status: true,
          statusOverride: true, // ADR-0004: needed for effective-status badges
          startValue: true,
          currentValue: true,
          targetValue: true,
          unit: true,
        },
      },
      childGoals: {
        select: { id: true, title: true, status: true, health: true },
      },
      parentGoal: {
        select: { id: true, title: true },
      },
      comments: {
        include: { author: { select: { id: true, name: true, image: true } } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      user: { select: { id: true, name: true, image: true } },
      driUser: { select: { id: true, name: true, image: true } },
      workspace: { select: { id: true, name: true, slug: true } },
    },
  });

  if (!goal) return goal;

  // Attach the resolved progress (manual override > KR mean > null) so every
  // consumer reads one number instead of recomputing. See goalProgress.ts.
  return {
    ...goal,
    resolvedProgress: resolveGoalProgress(goal),
    isProgressManual: isManualProgress(goal),
  };
}

export async function deleteGoal({ ctx, input }: { ctx: Context, input: { id: number } }) {
  // The access check already fetches the title + workspaceId the feed row
  // needs, captured here before the row is gone.
  const goal = await verifyGoalAccess({ ctx, goalId: input.id });

  const deleted = await ctx.db.goal.delete({
    where: { id: input.id },
  });

  // Personal objectives are silent by design. Fire-and-forget.
  if (goal.workspaceId) {
    await recordActivity(ctx.db, {
      workspaceId: goal.workspaceId,
      userId: ctx.session?.user?.id ?? null,
      entityType: "goal",
      entityId: String(input.id),
      action: "deleted",
      metadata: { title: goal.title },
    }).catch(() => {
      /* instrumentation failure is non-fatal */
    });
  }

  return deleted;
}

export async function updateGoalIcon({ ctx, input }: { ctx: Context; input: { id: number; icon: string | null; iconColor: string | null } }) {
  await verifyGoalAccess({ ctx, goalId: input.id });

  return ctx.db.goal.update({
    where: { id: input.id },
    data: { icon: input.icon, iconColor: input.iconColor },
  });
}
