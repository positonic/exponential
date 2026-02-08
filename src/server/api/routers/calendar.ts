import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { GoogleCalendarService } from "~/server/services/GoogleCalendarService";
import { MicrosoftCalendarService } from "~/server/services/MicrosoftCalendarService";
import type { CalendarInfo, CalendarProvider } from "~/server/services/CalendarProvider";

const providerSchema = z.enum(["google", "microsoft"]).default("google");

type ProviderType = z.infer<typeof providerSchema>;

function getCalendarService(provider: ProviderType): CalendarProvider {
  switch (provider) {
    case "google":
      return new GoogleCalendarService();
    case "microsoft":
      return new MicrosoftCalendarService();
  }
}

/** Maps our provider type to the NextAuth account provider name */
function getAccountProvider(provider: ProviderType): string {
  return provider === "microsoft" ? "microsoft-entra-id" : "google";
}

// Helper to convert CalendarInfo array to Prisma JSON-compatible format
function calendarsToJson(calendars: CalendarInfo[]): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(calendars)) as Prisma.InputJsonValue;
}

// Helper to parse cached calendars from Prisma JSON
function parseCalendarsFromJson(json: Prisma.JsonValue | null | undefined): CalendarInfo[] {
  if (!json || !Array.isArray(json)) return [];
  return json as unknown as CalendarInfo[];
}

// Cache duration for calendar list (24 hours in milliseconds)
const CALENDAR_LIST_CACHE_TTL = 24 * 60 * 60 * 1000;

export const calendarRouter = createTRPCRouter({
  // Returns connection status for a single provider (backwards compatible)
  getConnectionStatus: protectedProcedure
    .input(z.object({ provider: providerSchema }).optional())
    .query(async ({ ctx, input }) => {
      const provider = input?.provider ?? "google";
      const accountProvider = getAccountProvider(provider);

      const account = await ctx.db.account.findFirst({
        where: {
          userId: ctx.session.user.id,
          provider: accountProvider,
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

      const hasCalendarScope = provider === "google"
        ? (account.scope?.includes("https://www.googleapis.com/auth/calendar.events") ?? false)
        : (account.scope?.includes("Calendars.Read") ?? false);

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

  // Returns connection status for all providers in one call
  getAllConnectionStatuses: protectedProcedure.query(async ({ ctx }) => {
    const accounts = await ctx.db.account.findMany({
      where: {
        userId: ctx.session.user.id,
        provider: { in: ["google", "microsoft-entra-id"] },
      },
      select: {
        provider: true,
        access_token: true,
        refresh_token: true,
        scope: true,
        expires_at: true,
      },
    });

    const googleAccount = accounts.find((a) => a.provider === "google");
    const microsoftAccount = accounts.find((a) => a.provider === "microsoft-entra-id");

    function checkStatus(account: typeof googleAccount, calendarScopeCheck: string) {
      if (!account?.access_token) {
        return { isConnected: false, hasCalendarScope: false };
      }
      const hasCalendarScope = account.scope?.includes(calendarScopeCheck) ?? false;
      const tokenNotExpired = !account.expires_at || account.expires_at > Math.floor(Date.now() / 1000) + 300;
      const canRefresh = !!account.refresh_token;
      const isTokenValid = tokenNotExpired || canRefresh;
      return {
        isConnected: hasCalendarScope && isTokenValid,
        hasCalendarScope,
        tokenExpired: !tokenNotExpired,
        canRefresh,
      };
    }

    return {
      google: checkStatus(googleAccount, "https://www.googleapis.com/auth/calendar.events"),
      microsoft: checkStatus(microsoftAccount, "Calendars.Read"),
    };
  }),

  // Returns connected calendar accounts with email addresses
  getConnectedCalendarAccounts: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // Fetch Google Calendar account
    const googleAccount = await ctx.db.account.findFirst({
      where: {
        userId,
        provider: "google",
      },
      select: {
        id: true,
        provider: true,
        scope: true,
        expires_at: true,
        providerEmail: true,
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    // Fetch Microsoft Calendar account
    const microsoftAccount = await ctx.db.account.findFirst({
      where: {
        userId,
        provider: "microsoft-entra-id",
      },
      select: {
        id: true,
        provider: true,
        scope: true,
        expires_at: true,
        providerEmail: true,
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    const connectedAccounts: Array<{
      provider: "google" | "microsoft";
      email: string | null;
      name: string | null;
    }> = [];

    // Check Google Calendar
    if (googleAccount) {
      const hasCalendarScope = googleAccount.scope?.includes("calendar.events") ?? false;
      const now = Math.floor(Date.now() / 1000);
      const isValid = (googleAccount.expires_at != null && googleAccount.expires_at > now);

      if (hasCalendarScope && isValid) {
        connectedAccounts.push({
          provider: "google",
          email: googleAccount.providerEmail ?? googleAccount.user.email,
          name: googleAccount.user.name,
        });
      }
    }

    // Check Microsoft Calendar
    if (microsoftAccount) {
      const hasCalendarScope = microsoftAccount.scope?.includes("Calendars.Read") ?? false;
      const now = Math.floor(Date.now() / 1000);
      const isValid = (microsoftAccount.expires_at != null && microsoftAccount.expires_at > now);

      if (hasCalendarScope && isValid) {
        connectedAccounts.push({
          provider: "microsoft",
          email: microsoftAccount.providerEmail ?? microsoftAccount.user.email,
          name: microsoftAccount.user.name,
        });
      }
    }

    return { connectedAccounts };
  }),

  getTodayEvents: protectedProcedure
    .input(z.object({ provider: providerSchema }).optional())
    .query(async ({ ctx, input }) => {
      const service = getCalendarService(input?.provider ?? "google");
      return service.getTodayEvents(ctx.session.user.id);
    }),

  getUpcomingEvents: protectedProcedure
    .input(z.object({
      days: z.number().min(1).max(30).default(7),
      provider: providerSchema,
    }).optional())
    .query(async ({ input, ctx }) => {
      const service = getCalendarService(input?.provider ?? "google");
      return service.getUpcomingEvents(ctx.session.user.id, input?.days ?? 7);
    }),

  getEvents: protectedProcedure
    .input(z.object({
      timeMin: z.date().optional(),
      timeMax: z.date().optional(),
      calendarId: z.string().default("primary"),
      maxResults: z.number().min(1).max(100).default(50),
      provider: providerSchema,
    }))
    .query(async ({ input, ctx }) => {
      const { provider, ...options } = input;
      const service = getCalendarService(provider);
      return service.getEvents(ctx.session.user.id, options);
    }),

  refreshEvents: protectedProcedure
    .input(z.object({
      timeMin: z.date().optional(),
      timeMax: z.date().optional(),
      calendarId: z.string().default("primary"),
      maxResults: z.number().min(1).max(100).default(50),
      provider: providerSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const { provider, ...options } = input;
      const service = getCalendarService(provider);
      return service.refreshEvents(ctx.session.user.id, options);
    }),

  clearCache: protectedProcedure
    .input(z.object({ provider: providerSchema }).optional())
    .mutation(async ({ ctx, input }) => {
      const service = getCalendarService(input?.provider ?? "google");
      service.clearUserCache(ctx.session.user.id);
      return { success: true, message: "Calendar cache cleared" };
    }),

  getCacheStats: protectedProcedure
    .query(async () => {
      const googleService = new GoogleCalendarService();
      return googleService.getCacheStats();
    }),

  disconnect: protectedProcedure
    .input(z.object({ provider: providerSchema }).optional())
    .mutation(async ({ ctx, input }) => {
      const provider = input?.provider ?? "google";
      const accountProvider = getAccountProvider(provider);

      const account = await ctx.db.account.findFirst({
        where: {
          userId: ctx.session.user.id,
          provider: accountProvider,
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
      const service = getCalendarService(provider);
      service.clearUserCache(ctx.session.user.id);

      // Remove calendar preferences for this provider
      const preference = await ctx.db.calendarPreference.findFirst({
        where: { userId: ctx.session.user.id, provider },
      });
      if (preference) {
        await ctx.db.calendarPreference.delete({
          where: { id: preference.id },
        });
      }

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
            type: z.literal("hangoutsMeet"),
          }),
        }),
      }).optional(),
      calendarId: z.string().default("primary"),
      provider: providerSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const { provider, ...eventInput } = input;
      const service = getCalendarService(provider);
      return service.createEvent(ctx.session.user.id, eventInput);
    }),

  // ============================================
  // Multi-Calendar Support
  // ============================================

  listCalendars: protectedProcedure
    .input(z.object({ provider: providerSchema }).optional())
    .query(async ({ ctx, input }) => {
      const service = getCalendarService(input?.provider ?? "google");
      return service.listCalendars(ctx.session.user.id);
    }),

  getCalendarPreferences: protectedProcedure
    .input(z.object({ provider: providerSchema }).optional())
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const provider = input?.provider ?? "google";

      // Get or create calendar preference for this provider
      let preference = await ctx.db.calendarPreference.findFirst({
        where: { userId, provider },
      });

      // Check if cache is stale
      const cacheStale = !preference?.cacheUpdatedAt ||
        (Date.now() - preference.cacheUpdatedAt.getTime()) > CALENDAR_LIST_CACHE_TTL;

      // If no preference or cache is stale, fetch fresh calendar list
      if (!preference || cacheStale) {
        try {
          const service = getCalendarService(provider);
          const calendars = await service.listCalendars(userId);

          if (!preference) {
            const primaryCalendar = calendars.find(c => c.primary);
            preference = await ctx.db.calendarPreference.create({
              data: {
                userId,
                provider,
                selectedCalendarIds: primaryCalendar ? [primaryCalendar.id] : ["primary"],
                cachedCalendars: calendarsToJson(calendars),
                cacheUpdatedAt: new Date(),
              },
            });
          } else {
            preference = await ctx.db.calendarPreference.update({
              where: { id: preference.id },
              data: {
                cachedCalendars: calendarsToJson(calendars),
                cacheUpdatedAt: new Date(),
              },
            });
          }
        } catch (error) {
          console.error(`Failed to fetch ${provider} calendar list:`, error);
          if (!preference) {
            return {
              selectedCalendarIds: ["primary"],
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
      provider: providerSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;
      const { provider } = input;

      // Limit to 10 calendars
      const limitedIds = input.calendarIds.slice(0, 10);

      // Find existing preference for this provider
      const existing = await ctx.db.calendarPreference.findFirst({
        where: { userId, provider },
      });

      let preference;
      if (existing) {
        preference = await ctx.db.calendarPreference.update({
          where: { id: existing.id },
          data: { selectedCalendarIds: limitedIds },
        });
      } else {
        preference = await ctx.db.calendarPreference.create({
          data: {
            userId,
            provider,
            selectedCalendarIds: limitedIds,
          },
        });
      }

      // Clear calendar event cache since selection changed
      const service = getCalendarService(provider);
      service.clearUserCache(userId);

      return {
        success: true,
        selectedCalendarIds: preference.selectedCalendarIds,
      };
    }),

  syncCalendarList: protectedProcedure
    .input(z.object({ provider: providerSchema }).optional())
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const provider = input?.provider ?? "google";
      const service = getCalendarService(provider);

      const calendars = await service.listCalendars(userId);

      const existing = await ctx.db.calendarPreference.findFirst({
        where: { userId, provider },
      });

      if (existing) {
        await ctx.db.calendarPreference.update({
          where: { id: existing.id },
          data: {
            cachedCalendars: calendarsToJson(calendars),
            cacheUpdatedAt: new Date(),
          },
        });
      } else {
        await ctx.db.calendarPreference.create({
          data: {
            userId,
            provider,
            selectedCalendarIds: ["primary"],
            cachedCalendars: calendarsToJson(calendars),
            cacheUpdatedAt: new Date(),
          },
        });
      }

      return {
        success: true,
        calendars,
      };
    }),

  // Merges events from all connected calendar providers
  getEventsMultiCalendar: protectedProcedure
    .input(z.object({
      timeMin: z.date().optional(),
      timeMax: z.date().optional(),
      maxResults: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;

      // Get all calendar preferences for this user
      let preferences = await ctx.db.calendarPreference.findMany({
        where: { userId },
      });

      // Auto-create default preferences for connected providers that are missing one
      const connectedAccounts = await ctx.db.account.findMany({
        where: {
          userId,
          provider: { in: ["google", "microsoft-entra-id"] },
          access_token: { not: null },
        },
        select: { provider: true },
      });

      for (const account of connectedAccounts) {
        const providerKey = account.provider === "microsoft-entra-id" ? "microsoft" : "google";
        const hasPref = preferences.some((p) => p.provider === providerKey);
        if (!hasPref) {
          const newPref = await ctx.db.calendarPreference.create({
            data: {
              userId,
              provider: providerKey,
              selectedCalendarIds: ["primary"],
            },
          });
          preferences = [...preferences, newPref];
        }
      }

      const allEvents: Array<{
        calendarId: string;
        calendarName?: string;
        calendarColor?: string;
        provider: "google" | "microsoft";
        id: string;
        summary: string;
        description?: string;
        start: { dateTime?: string; date?: string; timeZone?: string };
        end: { dateTime?: string; date?: string; timeZone?: string };
        location?: string;
        attendees?: Array<{ email: string; displayName?: string; responseStatus: string }>;
        htmlLink: string;
        status: string;
      }> = [];

      // Fetch from Google if connected
      const googlePref = preferences.find((p) => p.provider === "google");
      if (googlePref) {
        try {
          const googleService = new GoogleCalendarService();
          const googleEvents = await googleService.getEventsFromMultipleCalendars(
            userId,
            googlePref.selectedCalendarIds,
            input,
            parseCalendarsFromJson(googlePref.cachedCalendars),
          );
          allEvents.push(...googleEvents.map((e) => ({ ...e, provider: "google" as const })));
        } catch (error) {
          console.error("Failed to fetch Google calendar events:", error);
        }
      }

      // Fetch from Microsoft if connected
      const msPref = preferences.find((p) => p.provider === "microsoft");
      if (msPref) {
        try {
          const msService = new MicrosoftCalendarService();
          const msEvents = await msService.getEventsFromMultipleCalendars(
            userId,
            msPref.selectedCalendarIds,
            input,
            parseCalendarsFromJson(msPref.cachedCalendars),
          );
          allEvents.push(...msEvents.map((e) => ({ ...e, provider: "microsoft" as const })));
        } catch (error) {
          console.error("Failed to fetch Microsoft calendar events:", error);
        }
      }

      // If no preferences exist, try fetching from Google as fallback (backward compat)
      if (preferences.length === 0) {
        try {
          const googleService = new GoogleCalendarService();
          const events = await googleService.getEventsFromMultipleCalendars(
            userId,
            ["primary"],
            input,
          );
          allEvents.push(...events.map((e) => ({ ...e, provider: "google" as const })));
        } catch {
          // No calendar connected
        }
      }

      // Sort all events by start time
      return allEvents.sort((a, b) => {
        const aTime = a.start.dateTime
          ? new Date(a.start.dateTime)
          : a.start.date
            ? new Date(a.start.date)
            : new Date(0);
        const bTime = b.start.dateTime
          ? new Date(b.start.dateTime)
          : b.start.date
            ? new Date(b.start.date)
            : new Date(0);
        return aTime.getTime() - bTime.getTime();
      });
    }),
});
