import { db } from "~/server/db";
import NodeCache from "node-cache";
import type {
  CalendarEvent,
  CalendarInfo,
  CalendarEventWithSource,
  CreateEventInput,
  CreatedCalendarEvent,
  CalendarProvider,
} from "./CalendarProvider";

// Cache with 15 minute TTL (same as Google)
const calendarCache = new NodeCache({
  stdTTL: 900,
  checkperiod: 120,
  useClones: false,
});

interface GraphCalendarViewEvent {
  id: string;
  subject: string;
  bodyPreview?: string;
  isAllDay?: boolean;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location?: { displayName?: string };
  attendees?: Array<{
    emailAddress: { address: string; name?: string };
    status: { response: string };
  }>;
  webLink: string;
  showAs: string;
  isCancelled: boolean;
  isOnlineMeeting?: boolean;
  onlineMeetingUrl?: string;
}

interface GraphCalendar {
  id: string;
  name: string;
  color: string;
  isDefaultCalendar?: boolean;
  canEdit: boolean;
}

interface GraphCreatedEvent extends GraphCalendarViewEvent {
  onlineMeeting?: {
    joinUrl?: string;
  };
}

export class MicrosoftCalendarService implements CalendarProvider {
  private generateCacheKey(
    userId: string,
    options: {
      timeMin?: Date;
      timeMax?: Date;
      calendarId?: string;
      maxResults?: number;
    },
  ): string {
    const { timeMin, timeMax, calendarId, maxResults } = options;
    return `mscal:${userId}:${calendarId ?? "default"}:${timeMin?.getTime()}:${timeMax?.getTime()}:${maxResults}`;
  }

  private async getAccessToken(userId: string): Promise<string> {
    const account = await db.account.findFirst({
      where: { userId, provider: "microsoft-entra-id" },
      select: {
        id: true,
        access_token: true,
        refresh_token: true,
        expires_at: true,
      },
    });

    if (!account?.access_token) {
      throw new Error(
        "No Microsoft Calendar access token found. Please connect your Outlook Calendar.",
      );
    }

    const now = Math.floor(Date.now() / 1000);
    if (account.expires_at && account.expires_at <= now) {
      if (!account.refresh_token) {
        throw new Error(
          "Access token expired and no refresh token available. Please reconnect your Outlook Calendar.",
        );
      }

      const tenantId =
        process.env.MICROSOFT_ENTRA_ID_TENANT_ID ?? "common";
      const response = await fetch(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: process.env.MICROSOFT_ENTRA_ID_CLIENT_ID!,
            client_secret: process.env.MICROSOFT_ENTRA_ID_CLIENT_SECRET!,
            refresh_token: account.refresh_token,
            grant_type: "refresh_token",
            scope: "Calendars.Read Calendars.ReadWrite offline_access",
          }),
        },
      );

      if (!response.ok) {
        console.error(
          "Failed to refresh Microsoft token:",
          await response.text(),
        );
        throw new Error(
          "Failed to refresh access token. Please reconnect your Outlook Calendar.",
        );
      }

      const tokens = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
      };

      await db.account.update({
        where: { id: account.id },
        data: {
          access_token: tokens.access_token,
          expires_at: tokens.expires_in
            ? Math.floor(Date.now() / 1000) + tokens.expires_in
            : null,
          refresh_token: tokens.refresh_token ?? account.refresh_token,
        },
      });

      return tokens.access_token;
    }

    return account.access_token;
  }

  private async graphFetch<T>(userId: string, url: string): Promise<T> {
    const accessToken = await this.getAccessToken(userId);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Microsoft Graph API error: ${response.status} ${text}`,
      );
    }
    return response.json() as Promise<T>;
  }

  private async graphPost<T>(
    userId: string,
    url: string,
    body: unknown,
  ): Promise<T> {
    const accessToken = await this.getAccessToken(userId);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Microsoft Graph API error: ${response.status} ${text}`,
      );
    }
    return response.json() as Promise<T>;
  }

  private mapGraphEventToCalendarEvent(
    event: GraphCalendarViewEvent,
  ): CalendarEvent {
    // Microsoft Graph returns dateTime as local time string without offset
    // For all-day events, use the date field instead
    const isAllDay = event.isAllDay ?? false;

    return {
      id: event.id,
      summary: event.subject ?? "No title",
      description: event.bodyPreview ?? undefined,
      start: {
        dateTime: isAllDay ? undefined : event.start.dateTime,
        date: isAllDay ? event.start.dateTime.split("T")[0] : undefined,
        timeZone: event.start.timeZone ?? undefined,
      },
      end: {
        dateTime: isAllDay ? undefined : event.end.dateTime,
        date: isAllDay ? event.end.dateTime.split("T")[0] : undefined,
        timeZone: event.end.timeZone ?? undefined,
      },
      location: event.location?.displayName ?? undefined,
      attendees: event.attendees?.map((a) => ({
        email: a.emailAddress.address,
        displayName: a.emailAddress.name ?? undefined,
        responseStatus: a.status.response,
      })),
      htmlLink: event.webLink,
      status: event.isCancelled
        ? "cancelled"
        : event.showAs === "tentative"
          ? "tentative"
          : "confirmed",
    };
  }

  async getEvents(
    userId: string,
    options: {
      timeMin?: Date;
      timeMax?: Date;
      calendarId?: string;
      maxResults?: number;
      useCache?: boolean;
    } = {},
  ): Promise<CalendarEvent[]> {
    const {
      timeMin = new Date(),
      timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      calendarId,
      maxResults = 50,
      useCache = true,
    } = options;

    const cacheKey = this.generateCacheKey(userId, {
      timeMin,
      timeMax,
      calendarId,
      maxResults,
    });

    if (useCache) {
      const cached = calendarCache.get<CalendarEvent[]>(cacheKey);
      if (cached) {
        console.log(`Microsoft calendar cache hit for user ${userId}`);
        return cached;
      }
    }

    console.log(
      `Microsoft calendar cache miss for user ${userId}, fetching from Graph API`,
    );

    const calendarPath =
      calendarId && calendarId !== "primary"
        ? `me/calendars/${calendarId}/calendarView`
        : "me/calendarView";

    const params = new URLSearchParams({
      startDateTime: timeMin.toISOString(),
      endDateTime: timeMax.toISOString(),
      $top: String(maxResults),
      $orderby: "start/dateTime",
      $select:
        "id,subject,bodyPreview,start,end,location,attendees,webLink,showAs,isCancelled,isAllDay,isOnlineMeeting,onlineMeetingUrl",
    });

    const url = `https://graph.microsoft.com/v1.0/${calendarPath}?${params.toString()}`;
    const data = await this.graphFetch<{
      value: GraphCalendarViewEvent[];
    }>(userId, url);

    const events = data.value.map((event) =>
      this.mapGraphEventToCalendarEvent(event),
    );

    if (useCache) {
      calendarCache.set(cacheKey, events);
      console.log(`Cached Microsoft calendar events for user ${userId}`);
    }

    return events;
  }

  async getTodayEvents(userId: string): Promise<CalendarEvent[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.getEvents(userId, {
      timeMin: today,
      timeMax: tomorrow,
    });
  }

  async getUpcomingEvents(
    userId: string,
    days = 7,
  ): Promise<CalendarEvent[]> {
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + days);

    return this.getEvents(userId, {
      timeMin: now,
      timeMax: future,
    });
  }

  async listCalendars(userId: string): Promise<CalendarInfo[]> {
    const data = await this.graphFetch<{ value: GraphCalendar[] }>(
      userId,
      "https://graph.microsoft.com/v1.0/me/calendars",
    );

    return data.value.map(
      (cal): CalendarInfo => ({
        id: cal.id,
        summary: cal.name ?? "Unnamed Calendar",
        description: undefined,
        primary: cal.isDefaultCalendar ?? false,
        accessRole: cal.canEdit ? "writer" : "reader",
        backgroundColor: undefined,
        foregroundColor: undefined,
      }),
    );
  }

  async getEventsFromMultipleCalendars(
    userId: string,
    calendarIds: string[],
    options: {
      timeMin?: Date;
      timeMax?: Date;
      maxResults?: number;
      useCache?: boolean;
    } = {},
    calendarMetadata?: CalendarInfo[],
  ): Promise<CalendarEventWithSource[]> {
    if (calendarIds.length === 0) {
      calendarIds = ["primary"];
    }

    const limitedCalendarIds = calendarIds.slice(0, 10);

    const calendarMap = new Map<string, CalendarInfo>();
    if (calendarMetadata) {
      calendarMetadata.forEach((cal) => calendarMap.set(cal.id, cal));
    }

    const eventPromises = limitedCalendarIds.map(async (calendarId) => {
      try {
        const events = await this.getEvents(userId, {
          ...options,
          calendarId,
        });

        const calInfo = calendarMap.get(calendarId);

        return events.map(
          (event): CalendarEventWithSource => ({
            ...event,
            calendarId,
            calendarName:
              calInfo?.summary ??
              (calendarId === "primary" ? "Primary" : calendarId),
            calendarColor: undefined,
            provider: "microsoft",
          }),
        );
      } catch (error) {
        console.error(
          `Failed to fetch events from Microsoft calendar ${calendarId}:`,
          error,
        );
        return [];
      }
    });

    const allEventsArrays = await Promise.all(eventPromises);
    const allEvents = allEventsArrays.flat();

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
  }

  async createEvent(
    userId: string,
    input: CreateEventInput,
  ): Promise<CreatedCalendarEvent> {
    const { calendarId, conferenceData: _conferenceData, ...eventData } = input;

    const calendarPath =
      calendarId && calendarId !== "primary"
        ? `me/calendars/${calendarId}/events`
        : "me/events";

    const graphEvent = {
      subject: eventData.summary,
      body: eventData.description
        ? { contentType: "text", content: eventData.description }
        : undefined,
      start: {
        dateTime: eventData.start.dateTime,
        timeZone: eventData.start.timeZone ?? "UTC",
      },
      end: {
        dateTime: eventData.end.dateTime,
        timeZone: eventData.end.timeZone ?? "UTC",
      },
      attendees: eventData.attendees?.map((a) => ({
        emailAddress: { address: a.email },
        type: "required" as const,
      })),
      isOnlineMeeting: !!_conferenceData,
      onlineMeetingProvider: _conferenceData
        ? ("teamsForBusiness" as const)
        : undefined,
    };

    const url = `https://graph.microsoft.com/v1.0/${calendarPath}`;
    const created = await this.graphPost<GraphCreatedEvent>(
      userId,
      url,
      graphEvent,
    );

    // Clear cache since we created a new event
    this.clearUserCache(userId);

    return {
      id: created.id,
      summary: created.subject ?? "No title",
      description: created.bodyPreview ?? undefined,
      start: {
        dateTime: created.start.dateTime,
        timeZone: created.start.timeZone ?? undefined,
      },
      end: {
        dateTime: created.end.dateTime,
        timeZone: created.end.timeZone ?? undefined,
      },
      location: created.location?.displayName ?? undefined,
      attendees: created.attendees?.map((a) => ({
        email: a.emailAddress.address,
        displayName: a.emailAddress.name ?? undefined,
        responseStatus: a.status.response,
      })),
      htmlLink: created.webLink,
      status: "confirmed",
      onlineMeetingUrl:
        created.onlineMeetingUrl ??
        created.onlineMeeting?.joinUrl ??
        undefined,
    };
  }

  clearUserCache(userId: string): void {
    const keys = calendarCache.keys();
    const userKeys = keys.filter((key) =>
      key.startsWith(`mscal:${userId}:`),
    );
    calendarCache.del(userKeys);
    console.log(
      `Cleared ${userKeys.length} Microsoft cache entries for user ${userId}`,
    );
  }

  clearAllCache(): void {
    calendarCache.flushAll();
    console.log("Cleared all Microsoft calendar cache");
  }

  getCacheStats(): {
    keys: number;
    hits: number;
    misses: number;
    ksize: number;
    vsize: number;
  } {
    return calendarCache.getStats();
  }

  async refreshEvents(
    userId: string,
    options: {
      timeMin?: Date;
      timeMax?: Date;
      calendarId?: string;
      maxResults?: number;
    } = {},
  ): Promise<CalendarEvent[]> {
    const cacheKey = this.generateCacheKey(userId, options);
    calendarCache.del(cacheKey);
    return this.getEvents(userId, { ...options, useCache: true });
  }
}
