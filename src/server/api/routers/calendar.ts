import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

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
    const hasCalendarScope = account.scope?.includes("https://www.googleapis.com/auth/calendar") ?? false;
    
    // Check if token is still valid (with some buffer)
    const isTokenValid = !account.expires_at || account.expires_at > Math.floor(Date.now() / 1000) + 300;

    return {
      isConnected: hasCalendarScope && isTokenValid,
      hasCalendarScope,
      tokenExpired: !isTokenValid,
    };
  }),
});