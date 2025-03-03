import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import * as lifeDomainService from "~/server/services/lifeDomainService";

export const lifeDomainRouter = createTRPCRouter({
  getAllLifeDomains: protectedProcedure
    .query(({ ctx }) => {
      return lifeDomainService.getAllLifeDomains({ ctx });
    }),
}); 