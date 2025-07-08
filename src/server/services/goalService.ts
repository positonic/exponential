import { type Context } from "~/server/auth/types";

export async function getMyPublicGoals({ ctx }: { ctx: Context }) {
  const userId = ctx.session?.user?.id;
  return await ctx.db.goal.findMany({
    where: {
      userId
    },
    include: {
      lifeDomain: true,
      projects: true,
      outcomes: true
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
      outcomes: true
    }
  });
}

interface GoalInput {
  title: string;
  description?: string;
  dueDate?: Date;
  lifeDomainId: number;
  projectId?: string;
}

export async function createGoal({ ctx, input }: { ctx: Context, input: GoalInput }) {
  if (!ctx.session?.user?.id) {
    throw new Error("User not authenticated");
  }
  
  return await ctx.db.goal.create({
    data: {
      title: input.title,
      description: input.description,
      dueDate: input.dueDate,
      lifeDomainId: input.lifeDomainId,
      userId: ctx.session.user.id,
      projects: input.projectId ? {
        connect: [{ id: input.projectId }]
      } : undefined,
    },
    include: {
      lifeDomain: true,
      projects: true,
      outcomes: true,
    },
  });
}

interface UpdateGoalInput extends GoalInput {
  id: number;
}

export async function updateGoal({ ctx, input }: { ctx: Context, input: UpdateGoalInput }) {
  if (!ctx.session?.user?.id) {
    throw new Error("User not authenticated");
  }
  
  // First verify the goal belongs to the user
  const existingGoal = await ctx.db.goal.findFirst({
    where: {
      id: input.id,
      userId: ctx.session.user.id,
    },
  });

  if (!existingGoal) {
    throw new Error("Goal not found or unauthorized");
  }

  return await ctx.db.goal.update({
    where: {
      id: input.id,
    },
    data: {
      title: input.title,
      description: input.description,
      dueDate: input.dueDate,
      lifeDomainId: input.lifeDomainId,
      projects: input.projectId ? {
        set: [], // Clear existing connections
        connect: [{ id: input.projectId }]
      } : {
        set: [] // Clear project connection if no projectId provided
      },
    },
    include: {
      lifeDomain: true,
      projects: true,
      outcomes: true,
    },
  });
}

/**
 * Returns all goals for a specific project for the current user.
 * @param ctx - The request context containing session and db
 * @param projectId - The project ID to filter goals by
 */
export async function getProjectGoals({ ctx, projectId }: { ctx: Context, projectId: string }) {
  const userId = ctx.session?.user?.id;
  console.log("projectId", projectId);
  console.log("userId", userId);
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
      outcomes: true,
    },
  });
}
