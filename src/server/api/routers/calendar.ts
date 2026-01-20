import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { GoogleCalendarService } from "~/server/services/GoogleCalendarService";
import type { GoogleCalendarInfo } from "~/server/services/GoogleCalendarService";

// Helper to convert GoogleCalendarInfo array to Prisma JSON-compatible format
function calendarsToJson(calendars: GoogleCalendarInfo[]): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(calendars)) as Prisma.InputJsonValue;
}

// Helper to parse cached calendars from Prisma JSON
function parseCalendarsFromJson(json: Prisma.JsonValue | null | undefined): GoogleCalendarInfo[] {
  if (!json || !Array.isArray(json)) return [];
  return json as unknown as GoogleCalendarInfo[];
}

// Cache duration for calendar list (24 hours in milliseconds)
const CALENDAR_LIST_CACHE_TTL = 24 * 60 * 60 * 1000;

export const calendarRouter = createTRPCRouter({
  getConnectionStatus: protectedProcedure.query(async ({ ctx }) => {
    const account = await ctx.db.account.findFirst({
      where: {
        userId: ctx.session.user.id,
        provider: "google",
      },
      select: {
        access_token: true,
        refresh_token: true,
        scope: true,
        expires_at: true,
      },
    });

    if (!account?.access_token) {
      return { isConnected: false, hasCalendarScope: false };
    }

    // Check if the account has calendar scopes
    const hasCalendarScope = account.scope?.includes("https://www.googleapis.com/auth/calendar.events") ?? false;

    // Token is valid if not expired, OR if we have a refresh token (can auto-refresh)
    const tokenNotExpired = !account.expires_at || account.expires_at > Math.floor(Date.now() / 1000) + 300;
    const canRefresh = !!account.refresh_token;
    const isTokenValid = tokenNotExpired || canRefresh;

    return {
      isConnected: hasCalendarScope && isTokenValid,
      hasCalendarScope,
      tokenExpired: !tokenNotExpired,
      canRefresh,
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

  disconnect: protectedProcedure
    .mutation(async ({ ctx }) => {
      // Remove Google OAuth tokens to disconnect calendar
      const account = await ctx.db.account.findFirst({
        where: {
          userId: ctx.session.user.id,
          provider: "google",
        },
      });

      if (account) {
        await ctx.db.account.update({
          where: { id: account.id },
          data: {
            access_token: null,
            refresh_token: null,
            expires_at: null,
            scope: null,
          },
        });
      }

      // Clear calendar cache for this user
      const calendarService = new GoogleCalendarService();
      calendarService.clearUserCache(ctx.session.user.id);

      return { success: true, message: "Calendar disconnected successfully" };
    }),

  createEvent: protectedProcedure
    .input(z.object({
      summary: z.string().min(1, "Title is required"),
      description: z.string().optional(),
      start: z.object({
        dateTime: z.string(),
        timeZone: z.string().optional(),
      }),
      end: z.object({
        dateTime: z.string(),
        timeZone: z.string().optional(),
      }),
      attendees: z.array(z.object({
        email: z.string().email(),
      })).optional(),
      conferenceData: z.object({
        createRequest: z.object({
          requestId: z.string(),
          conferenceSolutionKey: z.object({
            type: z.literal('hangoutsMeet'),
          }),
        }),
      }).optional(),
      calendarId: z.string().default('primary'),
    }))
    .mutation(async ({ input, ctx }) => {
      const calendarService = new GoogleCalendarService();
      return calendarService.createEvent(ctx.session.user.id, input);
    }),

  // ============================================
  // Multi-Calendar Support
  // ============================================

  listCalendars: protectedProcedure.query(async ({ ctx }) => {
    const calendarService = new GoogleCalendarService();
    return calendarService.listCalendars(ctx.session.user.id);
  }),

  getCalendarPreferences: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // Get or create calendar preference
    let preference = await ctx.db.calendarPreference.findUnique({
      where: { userId },
    });

    // Check if cache is stale
    const cacheStale = !preference?.cacheUpdatedAt ||
      (Date.now() - preference.cacheUpdatedAt.getTime()) > CALENDAR_LIST_CACHE_TTL;

    // If no preference or cache is stale, fetch fresh calendar list
    if (!preference || cacheStale) {
      try {
        const calendarService = new GoogleCalendarService();
        const calendars = await calendarService.listCalendars(userId);

        if (!preference) {
          // Create with primary calendar selected by default
          const primaryCalendar = calendars.find(c => c.primary);
          preference = await ctx.db.calendarPreference.create({
            data: {
              userId,
              selectedCalendarIds: primaryCalendar ? [primaryCalendar.id] : ['primary'],
              cachedCalendars: calendarsToJson(calendars),
              cacheUpdatedAt: new Date(),
            },
          });
        } else {
          // Update cache
          preference = await ctx.db.calendarPreference.update({
            where: { userId },
            data: {
              cachedCalendars: calendarsToJson(calendars),
              cacheUpdatedAt: new Date(),
            },
          });
        }
      } catch (error) {
        // If we can't fetch calendars, return existing data or defaults
        console.error('Failed to fetch calendar list:', error);
        if (!preference) {
          return {
            selectedCalendarIds: ['primary'],
            allCalendars: [],
            cacheUpdatedAt: null,
          };
        }
      }
    }

    return {
      selectedCalendarIds: preference.selectedCalendarIds,
      allCalendars: parseCalendarsFromJson(preference.cachedCalendars),
      cacheUpdatedAt: preference.cacheUpdatedAt,
    };
  }),

  updateSelectedCalendars: protectedProcedure
    .input(z.object({
      calendarIds: z.array(z.string()).min(1, "Select at least one calendar"),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;

      // Limit to 10 calendars
      const limitedIds = input.calendarIds.slice(0, 10);

      const preference = await ctx.db.calendarPreference.upsert({
        where: { userId },
        update: {
          selectedCalendarIds: limitedIds,
        },
        create: {
          userId,
          selectedCalendarIds: limitedIds,
        },
      });

      // Clear calendar event cache since selection changed
      const calendarService = new GoogleCalendarService();
      calendarService.clearUserCache(userId);

      return {
        success: true,
        selectedCalendarIds: preference.selectedCalendarIds,
      };
    }),

  syncCalendarList: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const calendarService = new GoogleCalendarService();

    const calendars = await calendarService.listCalendars(userId);

    await ctx.db.calendarPreference.upsert({
      where: { userId },
      update: {
        cachedCalendars: calendarsToJson(calendars),
        cacheUpdatedAt: new Date(),
      },
      create: {
        userId,
        selectedCalendarIds: ['primary'],
        cachedCalendars: calendarsToJson(calendars),
        cacheUpdatedAt: new Date(),
      },
    });

    return {
      success: true,
      calendars,
    };
  }),

  getEventsMultiCalendar: protectedProcedure
    .input(z.object({
      timeMin: z.date().optional(),
      timeMax: z.date().optional(),
      maxResults: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;

      // Get user's calendar preferences
      const preference = await ctx.db.calendarPreference.findUnique({
        where: { userId },
      });

      const selectedCalendarIds = preference?.selectedCalendarIds ?? ['primary'];
      const calendarMetadata = parseCalendarsFromJson(preference?.cachedCalendars);

      const calendarService = new GoogleCalendarService();
      return calendarService.getEventsFromMultipleCalendars(
        userId,
        selectedCalendarIds,
        input,
        calendarMetadata
      );
    }),
});