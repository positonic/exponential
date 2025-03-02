import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";

import { getUserDays, createUserDay } from "~/server/services/dayService";

export const dayRouter = createTRPCRouter({
  getUserDays: protectedProcedure.query(getUserDays),

  createUserDay: protectedProcedure
    .input(z.object({
      date: z.date(),
      weekId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => createUserDay({ ctx, input })),

});
