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

export async function createGoal({ ctx, input }) {
  return await ctx.db.goal.create({
    data: {
      title: input.title,
      description: input.description,
      dueDate: input.dueDate,
      lifeDomainId: input.lifeDomainId,
      userId: ctx.session.user.id,
      projects: input.projectId ? {
        connect: {
          id: input.projectId
        }
      } : undefined,
    },
    include: {
      lifeDomain: true,
      projects: true,
      outcomes: true,
    },
  });
}

export async function updateGoal({ ctx, input }) {
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
        connect: {
          id: input.projectId
        }
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
