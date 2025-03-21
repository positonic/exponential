import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";

import { getMyOutcomes, createOutcome } from "~/server/services/outcomeService";

const outcomeTypeEnum = z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual', 'life', 'problem']);

export const outcomeRouter = createTRPCRouter({
  getMyOutcomes: protectedProcedure.query(getMyOutcomes),

  createOutcome: protectedProcedure
    .input(z.object({
      description: z.string(),
      dueDate: z.date().optional(),
      type: outcomeTypeEnum.default('daily'),
    }))
    .mutation(createOutcome),
}); 