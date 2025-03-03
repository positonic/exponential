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
    }))
    .mutation(createOutcome),
}); 