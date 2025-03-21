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

export async function createOutcome({ ctx, input }: { 
  ctx: Context, 
  input: { 
    description: string;
    dueDate?: Date;
    type?: string;
  }
}) {
  if (!ctx.session?.user?.id) throw new Error("Unauthorized");
  
  return await ctx.db.outcome.create({
    data: {
      ...input,
      userId: ctx.session.user.id,
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