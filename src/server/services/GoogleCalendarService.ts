import { google } from 'googleapis';
import { db } from '~/server/db';
import NodeCache from 'node-cache';

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  location?: string;
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus: string;
  }>;
  htmlLink: string;
  status: string;
}

// Create a cache instance with 15 minute TTL
const calendarCache = new NodeCache({ 
  stdTTL: 900, // 15 minutes in seconds
  checkperiod: 120, // Check for expired keys every 2 minutes
  useClones: false // Better performance, but be careful with mutations
});

export class GoogleCalendarService {
  private generateCacheKey(userId: string, options: any): string {
    const { timeMin, timeMax, calendarId, maxResults } = options;
    return `cal:${userId}:${calendarId}:${timeMin?.getTime()}:${timeMax?.getTime()}:${maxResults}`;
  }
  private async getCalendarClient(userId: string) {
    // Get the user's Google OAuth tokens from database
    const account = await db.account.findFirst({
      where: {
        userId: userId,
        provider: 'google',
      },
      select: {
        access_token: true,
        refresh_token: true,
        expires_at: true,
      },
    });

    if (!account?.access_token) {
      throw new Error('No Google Calendar access token found. Please connect your Google Calendar.');
    }

    // Check if token is expired and refresh if needed
    const now = Math.floor(Date.now() / 1000);
    if (account.expires_at && account.expires_at <= now) {
      if (!account.refresh_token) {
        throw new Error('Access token expired and no refresh token available. Please reconnect your Google Calendar.');
      }

      // Refresh the token
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );

      oauth2Client.setCredentials({
        refresh_token: account.refresh_token,
      });

      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        
        // Update the database with new tokens
        const existingAccount = await db.account.findFirst({
          where: {
            userId: userId,
            provider: 'google',
          },
        });
        
        if (existingAccount) {
          await db.account.update({
            where: {
              id: existingAccount.id,
            },
            data: {
              access_token: credentials.access_token,
              expires_at: credentials.expiry_date ? Math.floor(credentials.expiry_date / 1000) : null,
              refresh_token: credentials.refresh_token || account.refresh_token, // Keep existing if not provided
            },
          });
        }

        oauth2Client.setCredentials(credentials);
        return google.calendar({ version: 'v3', auth: oauth2Client });
      } catch (error) {
        console.error('Failed to refresh Google Calendar token:', error);
        throw new Error('Failed to refresh access token. Please reconnect your Google Calendar.');
      }
    } else {
      // Token is still valid
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );

      oauth2Client.setCredentials({
        access_token: account.access_token,
        refresh_token: account.refresh_token,
      });

      return google.calendar({ version: 'v3', auth: oauth2Client });
    }
  }

  async getEvents(
    userId: string,
    options: {
      timeMin?: Date;
      timeMax?: Date;
      calendarId?: string;
      maxResults?: number;
      useCache?: boolean;
    } = {}
  ): Promise<CalendarEvent[]> {
    const {
      timeMin = new Date(), // Default to now
      timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default to 7 days from now
      calendarId = 'primary',
      maxResults = 50,
      useCache = true,
    } = options;

    // Generate cache key
    const cacheKey = this.generateCacheKey(userId, {
      timeMin,
      timeMax,
      calendarId,
      maxResults,
    });

    // Try to get from cache first
    if (useCache) {
      const cachedEvents = calendarCache.get<CalendarEvent[]>(cacheKey);
      if (cachedEvents) {
        console.log(`Calendar cache hit for user ${userId}`);
        return cachedEvents;
      }
    }

    console.log(`Calendar cache miss for user ${userId}, fetching from API`);

    const calendar = await this.getCalendarClient(userId);

    try {
      const response = await calendar.events.list({
        calendarId,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];

      const calendarEvents: CalendarEvent[] = events.map((event): CalendarEvent => ({
        id: event.id!,
        summary: event.summary || 'No title',
        description: event.description || undefined,
        start: {
          dateTime: event.start?.dateTime || undefined,
          date: event.start?.date || undefined,
          timeZone: event.start?.timeZone || undefined,
        },
        end: {
          dateTime: event.end?.dateTime || undefined,
          date: event.end?.date || undefined,
          timeZone: event.end?.timeZone || undefined,
        },
        location: event.location || undefined,
        attendees: event.attendees?.map(attendee => ({
          email: attendee.email!,
          displayName: attendee.displayName || undefined,
          responseStatus: attendee.responseStatus!,
        })),
        htmlLink: event.htmlLink!,
        status: event.status!,
      }));

      // Store in cache
      if (useCache) {
        calendarCache.set(cacheKey, calendarEvents);
        console.log(`Cached calendar events for user ${userId}`);
      }

      return calendarEvents;
    } catch (error) {
      console.error('Failed to fetch calendar events:', error);
      throw new Error('Failed to fetch calendar events. Please try again.');
    }
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

  async getUpcomingEvents(userId: string, days: number = 7): Promise<CalendarEvent[]> {
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + days);

    return this.getEvents(userId, {
      timeMin: now,
      timeMax: future,
    });
  }

  // Cache management methods
  clearUserCache(userId: string): void {
    const keys = calendarCache.keys();
    const userKeys = keys.filter(key => key.startsWith(`cal:${userId}:`));
    calendarCache.del(userKeys);
    console.log(`Cleared ${userKeys.length} cache entries for user ${userId}`);
  }

  clearAllCache(): void {
    calendarCache.flushAll();
    console.log('Cleared all calendar cache');
  }

  getCacheStats(): { keys: number; hits: number; misses: number; ksize: number; vsize: number } {
    return calendarCache.getStats();
  }

  // Force refresh for a specific date range
  async refreshEvents(
    userId: string,
    options: {
      timeMin?: Date;
      timeMax?: Date;
      calendarId?: string;
      maxResults?: number;
    } = {}
  ): Promise<CalendarEvent[]> {
    // Clear cache for this specific request first
    const cacheKey = this.generateCacheKey(userId, options);
    calendarCache.del(cacheKey);
    
    // Fetch fresh data
    return this.getEvents(userId, { ...options, useCache: true });
  }
}