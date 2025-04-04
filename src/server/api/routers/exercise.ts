import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { createUserExercise, getUserExercises } from "~/server/services/exerciseService";

export const exerciseRouter = createTRPCRouter({
  createUserExercise: protectedProcedure
    .input(z.object({
      title: z.string(),
      description: z.string().optional(),
      dayId: z.number(),
    }))
    .mutation(createUserExercise),
  
  getUserExercises: protectedProcedure
    .input(z.object({
      dayId: z.number(),
    }))
    .query(getUserExercises),
}); 