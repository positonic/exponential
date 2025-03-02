import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";

import { getMyOutcomes, createOutcome } from "~/server/services/outcomeService";

export const outcomeRouter = createTRPCRouter({
  getMyOutcomes: protectedProcedure.query(getMyOutcomes),

  createOutcome: protectedProcedure
    .input(z.object({
      description: z.string(),
      dueDate: z.date().optional(),
      projectIds: z.array(z.string()).optional(),
      goalIds: z.array(z.number()).optional(), // Changed to number as Goal uses Int id
    }))
    .mutation(async ({ ctx, input }) => createOutcome({ ctx, input })),
}); 