import { type Context } from "~/server/auth/types";

export async function getMyOutcomes({ ctx }: { ctx: Context }) {
  return await ctx.db.outcome.findMany({
    where: {
      userId: ctx.session?.user?.id
    },
    select: {
      id: true,
      description: true,
      dueDate: true,
      type: true,
      projects: true,
      goals: true
    }
  });
}

export const createOutcome = async ({ ctx, input }) => {
  return await ctx.db.outcome.create({
    data: {
      description: input.description,
      dueDate: input.dueDate,
      type: input.type,
      userId: ctx.session.user.id,
      projects: input.projectId ? {
        connect: {
          id: input.projectId
        }
      } : undefined,
    },
    include: {
      projects: true,
      goals: true,
    },
  });
};

export const updateOutcome = async ({ ctx, input }) => {
  // First verify the outcome belongs to the user
  const existingOutcome = await ctx.db.outcome.findFirst({
    where: {
      id: input.id,
      userId: ctx.session.user.id,
    },
  });

  if (!existingOutcome) {
    throw new Error("Outcome not found or unauthorized");
  }

  return await ctx.db.outcome.update({
    where: {
      id: input.id,
    },
    data: {
      description: input.description,
      dueDate: input.dueDate,
      type: input.type,
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
      projects: true,
      goals: true,
    },
  });
}; 