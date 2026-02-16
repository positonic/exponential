import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { pmScheduler } from "~/server/services/pm";

/**
 * PM Scheduler API Router
 * 
 * Provides endpoints to control and monitor the PM automation scheduler.
 */
export const pmSchedulerRouter = createTRPCRouter({
  /**
   * Get status of all scheduled tasks
   */
  getStatus: protectedProcedure.query(() => {
    return pmScheduler.getStatus();
  }),

  /**
   * Start the scheduler
   */
  start: protectedProcedure.mutation(() => {
    pmScheduler.start();
    return { success: true, message: 'Scheduler started' };
  }),

  /**
   * Stop the scheduler
   */
  stop: protectedProcedure.mutation(() => {
    pmScheduler.stop();
    return { success: true, message: 'Scheduler stopped' };
  }),

  /**
   * Run a specific task immediately (for testing/debugging)
   */
  runTask: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(async ({ input }) => {
      await pmScheduler.runTask(input.taskId);
      return { success: true, message: `Task ${input.taskId} executed` };
    }),
});
