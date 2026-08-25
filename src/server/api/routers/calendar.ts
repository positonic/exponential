import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { GoogleCalendarService } from "~/server/services/GoogleCalendarService";
import { MicrosoftCalendarService } from "~/server/services/MicrosoftCalendarService";
import type { CalendarInfo, CalendarProvider } from "~/server/services/CalendarProvider";
import { GOOGLE_SCOPES, isGoogleOAuthTester } from "~/lib/googleAuth";
import { encryptToBase64 } from "~/server/utils/encryption";
import { syncFeed } from "~/server/services/calendar/CalendarSyncService";
import { assertSafeFeedUrl, UnsafeFeedUrlError } from "~/server/services/calendar/feedUrlGuard";
import { listIcsCalendarEvents } from "~/server/services/calendar/icsEventRead";
import { listMeetingCalendarEvents } from "~/server/services/calendar/meetingEventRead";
import { todayWindow } from "~/server/services/calendar/todayWindow";
import { reportHandledErrorServer } from "~/server/utils/reportHandledErrorServer";

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

/**
 * Whether Google calendar features are closed to this user.
 *
 * Google has not finished verifying our calendar scopes, so only allowlisted
 * testers can complete the consent screen (see `isGoogleOAuthTester`). For
 * everyone else we behave as though no Google calendar exists rather than
 * calling the API and surfacing an OAuth error. Microsoft is a separate,
 * approved OAuth app and is never gated.
 */
function isGoogleCalendarGated(
  email: string | null | undefined,
  provider: ProviderType,
): boolean {
  return provider === "google" && !isGoogleOAuthTester(email);
}

/** The OAuth scope that grants calendar access for each provider */
function calendarScopeFor(accountProvider: string): string {
  return accountProvider === "microsoft-entra-id"
    ? "Calendars.Read"
    : GOOGLE_SCOPES.CALENDAR;
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

const MAX_FEEDS_PER_USER = 20;
/** Feeds re-synced per Refresh-now click — bounded against the route budget. */
const REFRESH_BATCH_SIZE = 10;

export const calendarRouter = createTRPCRouter({
  // ============================================
  // Calendar feeds (ICS subscription URLs)
  //
  // Deliberately NOT threaded through providerSchema or the OAuth-shaped
  // procedures above — a feed has no account or token behind it. ICS enters
  // the system here (CRUD + sync) and at the read-path merges only.
  // ============================================

  addFeed: protectedProcedure
    .input(
      z.object({
        url: z.string().min(1, "Feed URL is required").max(2048, "Feed URL is too long"),
        name: z.string().trim().min(1).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Per-user cap: the cron batch is finite, so one user with hundreds of
      // feeds would quietly break the freshness guarantee for everyone else.
      const feedCount = await ctx.db.calendarFeed.count({ where: { userId } });
      if (feedCount >= MAX_FEEDS_PER_USER) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `You can connect at most ${MAX_FEEDS_PER_USER} calendar feeds. Remove one first.`,
        });
      }

      try {
        await assertSafeFeedUrl(input.url);
      } catch (error) {
        if (error instanceof UnsafeFeedUrlError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw error;
      }

      const feed = await ctx.db.calendarFeed.create({
        data: {
          userId,
          name: input.name ?? new URL(input.url).hostname,
          urlEncrypted: encryptToBase64(input.url),
        },
      });

      // Inline first sync so the pasted feed is visible immediately. A
      // failure is recorded on the feed rather than thrown — the feed row
      // exists either way, with syncStatus telling the UI what happened.
      const result = await syncFeed(ctx.db as PrismaClient, feed.id);

      if (result.ok && !input.name && result.calendarName) {
        await ctx.db.calendarFeed.update({
          where: { id: feed.id },
          data: { name: result.calendarName },
        });
      }

      return ctx.db.calendarFeed.findUniqueOrThrow({
        where: { id: feed.id },
        select: {
          id: true,
          name: true,
          timezone: true,
          isEnabled: true,
          syncStatus: true,
          lastSyncedAt: true,
          lastSyncError: true,
        },
      });
    }),

  listFeeds: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.calendarFeed.findMany({
      where: { userId: ctx.session.user.id },
      select: {
        id: true,
        name: true,
        timezone: true,
        isEnabled: true,
        syncStatus: true,
        lastSyncedAt: true,
        lastSyncError: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }),

  setFeedEnabled: protectedProcedure
    .input(z.object({ feedId: z.string(), isEnabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { count } = await ctx.db.calendarFeed.updateMany({
        where: { id: input.feedId, userId: ctx.session.user.id },
        data: { isEnabled: input.isEnabled },
      });
      if (count === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Feed not found" });
      }
      return { success: true };
    }),

  // "Refresh now" — re-sync the caller's enabled feeds inline. Rate-limited
  // to roughly one refresh a minute via lastSyncAttemptAt (attempt, not
  // success — a permanently failing feed must not disable the limit), which
  // survives serverless instance churn where in-memory counters don't.
  refreshMyFeeds: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const feeds = await ctx.db.calendarFeed.findMany({
      where: { userId, isEnabled: true },
      select: { id: true, lastSyncedAt: true, lastSyncAttemptAt: true },
      // Longest-unattempted first, so the capped batch is spent where it helps.
      orderBy: { lastSyncAttemptAt: { sort: "asc", nulls: "first" } },
    });

    if (feeds.length === 0) return { refreshed: 0 };

    const oneMinuteAgo = Date.now() - 60 * 1000;
    const allAttemptedRecently = feeds.every(
      (feed) => feed.lastSyncAttemptAt && feed.lastSyncAttemptAt.getTime() > oneMinuteAgo,
    );
    if (allAttemptedRecently) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Feeds were just refreshed — try again in a minute.",
      });
    }

    // Skip feeds that synced successfully within the last minute, and bound
    // the loop — each sync can spend real seconds on a third-party host and
    // the route budget is finite.
    const stale = feeds
      .filter((feed) => !feed.lastSyncedAt || feed.lastSyncedAt.getTime() <= oneMinuteAgo)
      .slice(0, REFRESH_BATCH_SIZE);

    let refreshed = 0;
    for (const feed of stale) {
      const result = await syncFeed(ctx.db as PrismaClient, feed.id);
      if (result.ok) refreshed += 1;
    }
    return { refreshed };
  }),

  removeFeed: protectedProcedure
    .input(z.object({ feedId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // deleteMany so the userId scoping is part of the delete itself —
      // someone else's feed id deletes zero rows. Events cascade.
      const { count } = await ctx.db.calendarFeed.deleteMany({
        where: { id: input.feedId, userId: ctx.session.user.id },
      });
      if (count === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Feed not found" });
      }
      return { success: true };
    }),

  // Returns connection status for a single provider (backwards compatible)
  getConnectionStatus: protectedProcedure
    .input(z.object({ provider: providerSchema }).optional())
    .query(async ({ ctx, input }) => {
      const provider = input?.provider ?? "google";
      const accountProvider = getAccountProvider(provider);

      if (isGoogleCalendarGated(ctx.session.user.email, provider)) {
        // A user gated *after* connecting still has stored tokens. Report that
        // separately from `isConnected` so the UI can keep offering Disconnect
        // — revoking access must never become unreachable just because the
        // feature closed behind them.
        const storedCount = await ctx.db.connectedAccount.count({
          where: { userId: ctx.session.user.id, provider: accountProvider },
        });
        return {
          isConnected: false,
          hasCalendarScope: false,
          tokenExpired: false,
          canRefresh: false,
          gated: true,
          hasStoredConnection: storedCount > 0,
        };
      }

      // Aggregate across ALL of the user's connected accounts for this
      // provider — a user can connect several, so a single findFirst could
      // report the wrong one as (dis)connected.
      const accounts = await ctx.db.connectedAccount.findMany({
        where: {
          userId: ctx.session.user.id,
          provider: accountProvider,
        },
        select: {
          access_token: true,
          refresh_token: true,
          scope: true,
          expires_at: true,
          provider: true,
        },
      });

      const calendarScope = calendarScopeFor(accountProvider);
      const hasCalendarScope = accounts.some((a) => a.scope?.includes(calendarScope) ?? false);
      const anyTokenNotExpired = accounts.some(
        (a) => !a.expires_at || a.expires_at > Math.floor(Date.now() / 1000) + 300,
      );
      const canRefresh = accounts.some((a) => !!a.refresh_token);
      const isConnected = accounts.some((a) => isCalendarConnected(a));

      return {
        isConnected,
        hasCalendarScope,
        tokenExpired: hasCalendarScope && !anyTokenNotExpired,
        canRefresh,
        gated: false,
        hasStoredConnection: accounts.length > 0,
      };
    }),

  // Returns connection status for all providers in one call
  getAllConnectionStatuses: protectedProcedure.query(async ({ ctx }) => {
    const googleGated = isGoogleCalendarGated(ctx.session.user.email, "google");

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
      google: googleGated
        ? { isConnected: false, hasCalendarScope: false, connectedCount: 0, gated: true }
        : { ...checkStatus("google"), gated: false },
      microsoft: { ...checkStatus("microsoft-entra-id"), gated: false },
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
        calendarSyncStatus: true,
        calendarLastSyncedAt: true,
        calendarLastSyncError: true,
        user: { select: { email: true, name: true } },
      },
      orderBy: { id: "asc" },
    });

    // Drop Google accounts entirely while the scopes are unverified — every
    // entry here triggers a live listCalendars call.
    const googleGated = isGoogleCalendarGated(ctx.session.user.email, "google");
    const connected = accounts
      .filter((a) => isCalendarConnected(a))
      .filter((a) => !(googleGated && a.provider === "google"));

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
          // Server-side busy-time sync bookkeeping (V2) for the sidebar's
          // per-account status display.
          syncStatus: account.calendarSyncStatus,
          lastSyncedAt: account.calendarLastSyncedAt,
          lastSyncError: account.calendarLastSyncError,
        };
      }),
    );

    return { accounts: result };
  }),

  getTodayEvents: protectedProcedure
    .input(z.object({ provider: providerSchema }).optional())
    .query(async ({ ctx, input }) => {
      const provider = input?.provider ?? "google";
      const userId = ctx.session.user.id;

      // ICS feed events merge in regardless of provider or Google gating —
      // every consumer calls this once with the default provider, so this is
      // the single place today's DB-backed events enter the Today surfaces.
      // "Today" is the user's day when they've set a timezone; the provider
      // path keeps its server-local convention for now.
      const userRow = await ctx.db.user.findUnique({
        where: { id: userId },
        select: { timezone: true },
      });
      const { start: todayStart, end: todayEnd } = todayWindow(userRow?.timezone ?? null);
      const icsEvents = await listIcsCalendarEvents(
        ctx.db as PrismaClient,
        userId,
        todayStart,
        todayEnd,
      ).catch((error) => {
        reportHandledErrorServer(error, { area: "calendar.getTodayEvents.icsMerge" });
        return [];
      });
      const meetingEvents = await listMeetingCalendarEvents(
        ctx.db as PrismaClient,
        userId,
        todayStart,
        todayEnd,
      ).catch((error) => {
        reportHandledErrorServer(error, { area: "calendar.getTodayEvents.meetingMerge" });
        return [];
      });
      const dbEvents = [...icsEvents, ...meetingEvents];

      if (isGoogleCalendarGated(ctx.session.user.email, provider)) return dbEvents;

      const service = getCalendarService(provider);
      const providerEvents = await service.getTodayEvents(userId);
      return [...providerEvents, ...dbEvents].sort((a, b) => {
        const aTime = a.start?.dateTime ?? a.start?.date ?? "";
        const bTime = b.start?.dateTime ?? b.start?.date ?? "";
        return aTime.localeCompare(bTime);
      });
    }),

  getUpcomingEvents: protectedProcedure
    .input(z.object({
      days: z.number().min(1).max(30).default(7),
      provider: providerSchema,
    }).optional())
    .query(async ({ input, ctx }) => {
      const provider = input?.provider ?? "google";
      if (isGoogleCalendarGated(ctx.session.user.email, provider)) return [];
      const service = getCalendarService(provider);
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
      if (isGoogleCalendarGated(ctx.session.user.email, provider)) return [];
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
      if (isGoogleCalendarGated(ctx.session.user.email, provider)) return [];
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
      if (isGoogleCalendarGated(ctx.session.user.email, provider)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Google Calendar is a premium feature that is currently available to " +
            "select users during our verification process. Contact " +
            "support@exponential.im to request early access.",
        });
      }
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
      const provider = toProviderType(account.provider);
      if (isGoogleCalendarGated(ctx.session.user.email, provider)) return [];
      const service = getCalendarService(provider);
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

      if (
        !account ||
        isGoogleCalendarGated(ctx.session.user.email, toProviderType(account.provider))
      ) {
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
        return { success: true, calendars: [], gated: false };
      }
      const provider = toProviderType(account.provider);
      if (isGoogleCalendarGated(ctx.session.user.email, provider)) {
        return { success: true, calendars: [], gated: true };
      }
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
        gated: false,
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

      // Non-testers contribute no Google events — see isGoogleCalendarGated.
      const googleGated = isGoogleCalendarGated(ctx.session.user.email, "google");
      const connectedAccounts = accounts
        .filter((a) => isCalendarConnected(a))
        .filter((a) => !(googleGated && a.provider === "google"));

      const allEvents: Array<{
        accountId: string;
        accountEmail: string | null;
        calendarId: string;
        calendarName?: string;
        calendarColor?: string;
        provider: "google" | "microsoft" | "ics" | "meeting";
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

      // DB-backed ICS feed events merge in alongside the live provider
      // fetches. Defaults mirror the UI's typical range when unset.
      const icsTimeMin = input.timeMin ?? new Date();
      const icsTimeMax =
        input.timeMax ?? new Date(icsTimeMin.getTime() + 30 * 24 * 60 * 60 * 1000);
      const icsEventsPromise = listIcsCalendarEvents(
        ctx.db as PrismaClient,
        userId,
        icsTimeMin,
        icsTimeMax,
      ).catch((error) => {
        reportHandledErrorServer(error, { area: "calendar.getEventsMultiCalendar.icsMerge" });
        return [];
      });
      const meetingEventsPromise = listMeetingCalendarEvents(
        ctx.db as PrismaClient,
        userId,
        icsTimeMin,
        icsTimeMax,
      ).catch((error) => {
        reportHandledErrorServer(error, { area: "calendar.getEventsMultiCalendar.meetingMerge" });
        return [];
      });

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

      allEvents.push(...(await icsEventsPromise));
      allEvents.push(...(await meetingEventsPromise));

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
