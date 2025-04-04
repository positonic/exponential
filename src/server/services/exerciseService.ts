import { type inferAsyncReturnType } from "@trpc/server";
import { type createTRPCContext } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

type Context = inferAsyncReturnType<typeof createTRPCContext>;

interface CreateUserExerciseInput {
  title: string;
  description?: string;
  dayId: number;
}

interface GetUserExercisesInput {
  dayId: number;
}

export const createUserExercise = async ({ 
  ctx, 
  input 
}: { 
  ctx: Context; 
  input: CreateUserExerciseInput;
}) => {
  if (!ctx.session || !ctx.session.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const userId = ctx.session.user.id;
  
  // First, find or create the exercise
  // Look for exercise by title first
  let exercise = await ctx.db.exercise.findFirst({
    where: {
      title: input.title,
    },
  });
  
  // If not found, create it
  if (!exercise) {
    exercise = await ctx.db.exercise.create({
      data: {
        title: input.title,
        description: input.description,
      },
    });
  }
  
  // Then create the user exercise link
  const userExercise = await ctx.db.userExercise.create({
    data: {
      userId,
      exerciseId: exercise.id,
      dayId: input.dayId,
    },
    include: {
      exercise: true,
    }
  });
  
  return userExercise;
};

export const getUserExercises = async ({
  ctx,
  input
}: {
  ctx: Context;
  input: GetUserExercisesInput;
}) => {
  if (!ctx.session || !ctx.session.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const userId = ctx.session.user.id;
  
  return await ctx.db.userExercise.findMany({
    where: {
      userId,
      dayId: input.dayId,
    },
    include: {
      exercise: true,
    },
    orderBy: {
      id: 'desc',
    },
  });
}; 