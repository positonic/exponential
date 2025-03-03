import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";

import { getUserDays, createUserDay, getDayByDate } from "~/server/services/dayService";

export const dayRouter = createTRPCRouter({
  getUserDays: protectedProcedure.query(getUserDays),
  
  getByDate: protectedProcedure
    .input(z.object({ date: z.date() }))
    .query(getDayByDate),

  createUserDay: protectedProcedure
    .input(z.object({
      date: z.date(),
      weekId: z.number(),
    }))
    .mutation(createUserDay),
});
