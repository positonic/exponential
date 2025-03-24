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