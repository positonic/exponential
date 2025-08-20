import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { GoogleCalendarService } from "~/server/services/GoogleCalendarService";

export const calendarRouter = createTRPCRouter({
  getConnectionStatus: protectedProcedure.query(async ({ ctx }) => {
    const account = await ctx.db.account.findFirst({
      where: {
        userId: ctx.session.user.id,
        provider: "google",
      },
      select: {
        access_token: true,
        scope: true,
        expires_at: true,
      },
    });

    if (!account?.access_token) {
      return { isConnected: false, hasCalendarScope: false };
    }

    // Check if the account has calendar scopes
    const hasCalendarScope = account.scope?.includes("https://www.googleapis.com/auth/calendar.events") ?? false;
    
    // Check if token is still valid (with some buffer)
    const isTokenValid = !account.expires_at || account.expires_at > Math.floor(Date.now() / 1000) + 300;

    return {
      isConnected: hasCalendarScope && isTokenValid,
      hasCalendarScope,
      tokenExpired: !isTokenValid,
    };
  }),

  getTodayEvents: protectedProcedure.query(async ({ ctx }) => {
    const calendarService = new GoogleCalendarService();
    return calendarService.getTodayEvents(ctx.session.user.id);
  }),

  getUpcomingEvents: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(30).default(7) }))
    .query(async ({ input, ctx }) => {
      const calendarService = new GoogleCalendarService();
      return calendarService.getUpcomingEvents(ctx.session.user.id, input.days);
    }),

  getEvents: protectedProcedure
    .input(z.object({
      timeMin: z.date().optional(),
      timeMax: z.date().optional(),
      calendarId: z.string().default('primary'),
      maxResults: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ input, ctx }) => {
      const calendarService = new GoogleCalendarService();
      return calendarService.getEvents(ctx.session.user.id, input);
    }),

  refreshEvents: protectedProcedure
    .input(z.object({
      timeMin: z.date().optional(),
      timeMax: z.date().optional(),
      calendarId: z.string().default('primary'),
      maxResults: z.number().min(1).max(100).default(50),
    }))
    .mutation(async ({ input, ctx }) => {
      const calendarService = new GoogleCalendarService();
      return calendarService.refreshEvents(ctx.session.user.id, input);
    }),

  clearCache: protectedProcedure
    .mutation(async ({ ctx }) => {
      const calendarService = new GoogleCalendarService();
      calendarService.clearUserCache(ctx.session.user.id);
      return { success: true, message: 'Calendar cache cleared' };
    }),

  getCacheStats: protectedProcedure
    .query(async () => {
      const calendarService = new GoogleCalendarService();
      return calendarService.getCacheStats();
    }),
});