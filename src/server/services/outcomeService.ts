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

interface OutcomeInput {
  description: string;
  dueDate?: Date;
  type: string;
  projectId?: string;
}

export const createOutcome = async ({ ctx, input }: { ctx: Context, input: OutcomeInput }) => {
  if (!ctx.session?.user?.id) {
    throw new Error("User not authenticated");
  }

  return await ctx.db.outcome.create({
    data: {
      description: input.description,
      dueDate: input.dueDate,
      type: input.type,
      userId: ctx.session.user.id,
      projects: input.projectId ? {
        connect: [{ id: input.projectId }]
      } : undefined,
    },
    include: {
      projects: true,
      goals: true,
    },
  });
};

interface UpdateOutcomeInput extends OutcomeInput {
  id: string;
}

export const updateOutcome = async ({ ctx, input }: { ctx: Context, input: UpdateOutcomeInput }) => {
  if (!ctx.session?.user?.id) {
    throw new Error("User not authenticated");
  }

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
        connect: [{ id: input.projectId }]
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

export const deleteOutcome = async ({ ctx, input }: { ctx: Context, input: { id: string } }) => {
  if (!ctx.session?.user?.id) {
    throw new Error("User not authenticated");
  }

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

  return await ctx.db.outcome.delete({
    where: {
      id: input.id,
    },
  });
};

export const deleteOutcomes = async ({ ctx, input }: { ctx: Context, input: { ids: string[] } }) => {
  if (!ctx.session?.user?.id) {
    throw new Error("User not authenticated");
  }

  // Verify all outcomes belong to the user
  const outcomes = await ctx.db.outcome.findMany({
    where: {
      id: { in: input.ids },
      userId: ctx.session.user.id,
    },
  });

  if (outcomes.length !== input.ids.length) {
    throw new Error("Some outcomes not found or unauthorized");
  }

  return await ctx.db.outcome.deleteMany({
    where: {
      id: { in: input.ids },
      userId: ctx.session.user.id,
    },
  });
}; 