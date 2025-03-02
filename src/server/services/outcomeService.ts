import { type Context } from "~/server/auth/types";

export async function getMyOutcomes({ ctx }: { ctx: Context }) {
  const userId = ctx.session?.user?.id;
  return await ctx.db.outcome.findMany({
    where: {
      userId
    },
    include: {
      projects: true,
      goals: true
    }
  });
}

export async function createOutcome({ ctx, input }: { 
  ctx: Context, 
  input: { 
    description: string, 
    dueDate?: Date,
    projectIds?: string[],
    goalIds?: number[]
  } 
}) {
  if (!ctx.session?.user?.id) {
    throw new Error("User not authenticated");
  }

  return await ctx.db.outcome.create({
    data: {
      description: input.description,
      dueDate: input.dueDate,
      userId: ctx.session.user.id,
      projects: input.projectIds ? {
        connect: input.projectIds.map(id => ({ id }))
      } : undefined,
      goals: input.goalIds ? {
        connect: input.goalIds.map(id => ({ id }))
      } : undefined
    },
    include: {
      projects: true,
      goals: true
    }
  });
} 