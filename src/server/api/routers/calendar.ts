import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
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

/** Maps a NextAuth account provider name back to our provider type */
function toProviderType(accountProvider: string): ProviderType {
  return accountProvider === "microsoft-entra-id" ? "microsoft" : "google";
}

/** The OAuth scope that grants calendar access for each provider */
function calendarScopeFor(accountProvider: string): string {
  return accountProvider === "microsoft-entra-id"
    ? "Calendars.Read"
    : "https://www.googleapis.com/auth/calendar.events";
}

/** Whether an account currently has a usable (scoped + non-expired-or-refreshable) calendar connection */
function isCalendarConnected(account: {
  access_token: string | null;
  refresh_token: string | null;
  scope: string | null;
  expires_at: number | null;
  provider: string;
}): boolean {
  if (!account.access_token) return false;
  const hasScope = account.scope?.includes(calendarScopeFor(account.provider)) ?? false;
  const tokenNotExpired =
    !account.expires_at || account.expires_at > Math.floor(Date.now() / 1000) + 300;
  const isTokenValid = tokenNotExpired || !!account.refresh_token;
  return hasScope && isTokenValid;
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

type DbClient = PrismaClient;

/**
 * Get-or-create the CalendarPreference for a specific account, refreshing the
 * cached calendar list from the provider when it's missing or stale. Returns
 * the account's selected calendar ids and the full calendar list (for the UI).
 */
async function loadAccountCalendars(
  db: DbClient,
  userId: string,
  account: { id: string; provider: string },
) {
  const provider = toProviderType(account.provider);

  let preference = await db.calendarPreference.findUnique({
    where: { connectedAccountId: account.id },
  });

  const cacheStale =
    !preference?.cacheUpdatedAt ||
    Date.now() - preference.cacheUpdatedAt.getTime() > CALENDAR_LIST_CACHE_TTL;

  if (!preference || cacheStale) {
    try {
      const service = getCalendarService(provider);
      const calendars = await service.listCalendars(userId, account.id);

      if (!preference) {
        const primaryCalendar = calendars.find((c) => c.primary);
        // upsert (not create) because getCalendarAccounts and
        // getEventsMultiCalendar both call this concurrently on page load and
        // would otherwise race on the unique connectedAccountId.
        preference = await db.calendarPreference.upsert({
          where: { connectedAccountId: account.id },
          create: {
            userId,
            connectedAccountId: account.id,
            provider,
            selectedCalendarIds: primaryCalendar ? [primaryCalendar.id] : ["primary"],
            cachedCalendars: calendarsToJson(calendars),
            cacheUpdatedAt: new Date(),
          },
          update: {
            cachedCalendars: calendarsToJson(calendars),
            cacheUpdatedAt: new Date(),
          },
        });
      } else {
        preference = await db.calendarPreference.update({
          where: { id: preference.id },
          data: {
            cachedCalendars: calendarsToJson(calendars),
            cacheUpdatedAt: new Date(),
          },
        });
      }
    } catch (error) {
      console.error(`Failed to refresh ${provider} calendar list for account ${account.id}:`, error);
      if (!preference) {
        return { selectedCalendarIds: ["primary"], calendars: [], cacheUpdatedAt: null };
      }
    }
  }

  const calendars = parseCalendarsFromJson(preference.cachedCalendars);

  // Normalize a legacy `"primary"` selection (the old default) to the real
  // primary calendar id, so the per-calendar checkbox in the sidebar matches.
  // Google/Microsoft both still accept the real id when fetching events.
  const primaryId = calendars.find((c) => c.primary)?.id;
  const selectedCalendarIds = primaryId
    ? preference.selectedCalendarIds.map((id) => (id === "primary" ? primaryId : id))
    : preference.selectedCalendarIds;

  return {
    selectedCalendarIds,
    calendars,
    cacheUpdatedAt: preference.cacheUpdatedAt,
  };
}

/**
 * Resolve a concrete ConnectedAccount from either an explicit accountId
 * (multi-account callers) or a provider (legacy callers → the user's primary,
 * i.e. earliest-created, connection for that provider).
 */
async function resolveAccount(
  db: DbClient,
  userId: string,
  input: { accountId?: string; provider?: ProviderType } | undefined,
) {
  if (input?.accountId) {
    return db.connectedAccount.findFirst({
      where: { id: input.accountId, userId },
      select: { id: true, provider: true },
    });
  }
  const accountProvider = getAccountProvider(input?.provider ?? "google");
  return db.connectedAccount.findFirst({
    where: { userId, provider: accountProvider },
    select: { id: true, provider: true },
    orderBy: { createdAt: "asc" },
  });
}

export const calendarRouter = createTRPCRouter({
  // Returns connection status for a single provider (backwards compatible)
  getConnectionStatus: protectedProcedure
    .input(z.object({ provider: providerSchema }).optional())
    .query(async ({ ctx, input }) => {
      const provider = input?.provider ?? "google";
      const accountProvider = getAccountProvider(provider);

      const account = await ctx.db.connectedAccount.findFirst({
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
    const accounts = await ctx.db.connectedAccount.findMany({
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

    // A provider counts as connected if ANY of its accounts is connected, so a
    // disconnected first Google account doesn't hide a connected second one.
    function checkStatus(accountProvider: string) {
      const providerAccounts = accounts.filter((a) => a.provider === accountProvider);
      const connectedCount = providerAccounts.filter((a) => isCalendarConnected(a)).length;
      const anyHasScope = providerAccounts.some(
        (a) => a.scope?.includes(calendarScopeFor(accountProvider)) ?? false,
      );
      return {
        isConnected: connectedCount > 0,
        hasCalendarScope: anyHasScope,
        connectedCount,
      };
    }

    return {
      google: checkStatus("google"),
      microsoft: checkStatus("microsoft-entra-id"),
    };
  }),

  // Returns every connected calendar account (Google + Microsoft) with its own
  // calendar list and selected-calendar preferences. Backs the multi-account
  // sidebar (Apple-Calendar-style: one section per account, checkbox per calendar).
  getCalendarAccounts: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const accounts = await ctx.db.connectedAccount.findMany({
      where: {
        userId,
        provider: { in: ["google", "microsoft-entra-id"] },
      },
      select: {
        id: true,
        provider: true,
        scope: true,
        expires_at: true,
        access_token: true,
        refresh_token: true,
        providerEmail: true,
        user: { select: { email: true, name: true } },
      },
      orderBy: { id: "asc" },
    });

    const connected = accounts.filter((a) => isCalendarConnected(a));

    const result = await Promise.all(
      connected.map(async (account) => {
        // Backfill provider email if missing
        let providerEmail = account.providerEmail;
        if (!providerEmail && account.access_token) {
          const service = getCalendarService(toProviderType(account.provider));
          providerEmail = await service.fetchAndUpdateProviderEmail(
            account.id,
            account.access_token,
          );
        }

        const { selectedCalendarIds, calendars } = await loadAccountCalendars(
          ctx.db as DbClient,
          userId,
          account,
        );

        return {
          id: account.id,
          provider: toProviderType(account.provider),
          email: providerEmail ?? account.user.email,
          name: account.user.name,
          selectedCalendarIds,
          calendars,
        };
      }),
    );

    return { accounts: result };
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
    .input(
      z
        .object({
          provider: providerSchema.optional(),
          accountId: z.string().optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const account = await resolveAccount(ctx.db as DbClient, userId, input);

      if (!account) {
        return { success: true, message: "No calendar account to disconnect" };
      }

      const provider = toProviderType(account.provider);

      // Clear calendar cache for this user before removing the connection
      const service = getCalendarService(provider);
      service.clearUserCache(userId);

      // Hard-delete the ConnectedAccount row — it is purely a calendar
      // connection (never a sign-in identity), so removal is the honest model
      // of "remove this calendar". Its CalendarPreference cascades.
      await ctx.db.connectedAccount.delete({
        where: { id: account.id },
      });

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
    .input(
      z
        .object({ provider: providerSchema.optional(), accountId: z.string().optional() })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const account = await resolveAccount(ctx.db as DbClient, userId, input);
      if (!account) return [];
      const service = getCalendarService(toProviderType(account.provider));
      return service.listCalendars(userId, account.id);
    }),

  getCalendarPreferences: protectedProcedure
    .input(
      z
        .object({ provider: providerSchema.optional(), accountId: z.string().optional() })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const account = await resolveAccount(ctx.db as DbClient, userId, input);

      if (!account) {
        return { selectedCalendarIds: ["primary"], allCalendars: [], cacheUpdatedAt: null };
      }

      const { selectedCalendarIds, calendars, cacheUpdatedAt } =
        await loadAccountCalendars(ctx.db as DbClient, userId, account);

      return {
        selectedCalendarIds,
        allCalendars: calendars,
        cacheUpdatedAt: cacheUpdatedAt ?? null,
      };
    }),

  updateSelectedCalendars: protectedProcedure
    .input(z.object({
      calendarIds: z.array(z.string()).min(1, "Select at least one calendar"),
      provider: providerSchema.optional(),
      accountId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;
      const account = await resolveAccount(ctx.db as DbClient, userId, input);
      if (!account) {
        throw new Error("No connected calendar account to update");
      }
      const provider = toProviderType(account.provider);

      // Limit to 10 calendars
      const limitedIds = input.calendarIds.slice(0, 10);

      // Upsert the preference for this specific connected account
      const preference = await ctx.db.calendarPreference.upsert({
        where: { connectedAccountId: account.id },
        update: { selectedCalendarIds: limitedIds },
        create: {
          userId,
          connectedAccountId: account.id,
          provider,
          selectedCalendarIds: limitedIds,
        },
      });

      // Clear calendar event cache since selection changed
      const service = getCalendarService(provider);
      service.clearUserCache(userId);

      return {
        success: true,
        selectedCalendarIds: preference.selectedCalendarIds,
      };
    }),

  syncCalendarList: protectedProcedure
    .input(
      z
        .object({ provider: providerSchema.optional(), accountId: z.string().optional() })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const account = await resolveAccount(ctx.db as DbClient, userId, input);
      if (!account) {
        return { success: true, calendars: [] };
      }
      const provider = toProviderType(account.provider);
      const service = getCalendarService(provider);

      const calendars = await service.listCalendars(userId, account.id);

      await ctx.db.calendarPreference.upsert({
        where: { connectedAccountId: account.id },
        update: {
          cachedCalendars: calendarsToJson(calendars),
          cacheUpdatedAt: new Date(),
        },
        create: {
          userId,
          connectedAccountId: account.id,
          provider,
          selectedCalendarIds: ["primary"],
          cachedCalendars: calendarsToJson(calendars),
          cacheUpdatedAt: new Date(),
        },
      });

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

      // Fetch events from every connected calendar account, keyed by the
      // specific Account row so multiple Google accounts each contribute their
      // own selected calendars.
      const accounts = await ctx.db.connectedAccount.findMany({
        where: {
          userId,
          provider: { in: ["google", "microsoft-entra-id"] },
        },
        select: {
          id: true,
          provider: true,
          scope: true,
          expires_at: true,
          access_token: true,
          refresh_token: true,
          providerEmail: true,
        },
      });

      const connectedAccounts = accounts.filter((a) => isCalendarConnected(a));

      const allEvents: Array<{
        accountId: string;
        accountEmail: string | null;
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

      const perAccountEvents = await Promise.all(
        connectedAccounts.map(async (account) => {
          const provider = toProviderType(account.provider);
          try {
            const { selectedCalendarIds, calendars } = await loadAccountCalendars(
              ctx.db as DbClient,
              userId,
              account,
            );
            const service = getCalendarService(provider);
            const events = await service.getEventsFromMultipleCalendars(
              userId,
              selectedCalendarIds,
              { ...input, accountId: account.id },
              calendars,
            );
            return events.map((e) => ({
              ...e,
              provider,
              accountId: account.id,
              accountEmail: account.providerEmail,
            }));
          } catch (error) {
            console.error(`Failed to fetch ${provider} calendar events for account ${account.id}:`, error);
            return [];
          }
        }),
      );

      for (const events of perAccountEvents) {
        allEvents.push(...events);
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
