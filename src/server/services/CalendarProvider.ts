/**
 * Shared calendar types and interface for multi-provider calendar support.
 * Both GoogleCalendarService and MicrosoftCalendarService implement this interface.
 */

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

export interface CalendarInfo {
  id: string;
  summary: string;
  description?: string;
  primary: boolean;
  accessRole: string;
  backgroundColor?: string;
  foregroundColor?: string;
}

export interface CalendarEventWithSource extends CalendarEvent {
  calendarId: string;
  calendarName?: string;
  calendarColor?: string;
  provider?: "google" | "microsoft";
}

export interface CreateEventInput {
  summary: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone?: string;
  };
  end: {
    dateTime: string;
    timeZone?: string;
  };
  location?: string;
  attendees?: Array<{ email: string; displayName?: string }>;
  conferenceData?: {
    createRequest: {
      requestId: string;
      conferenceSolutionKey: {
        type: "hangoutsMeet";
      };
    };
  };
  calendarId?: string;
}

export interface CreatedCalendarEvent extends CalendarEvent {
  conferenceData?: {
    entryPoints?: Array<{
      uri: string;
      label?: string;
      entryPointType: string;
    }>;
    conferenceId?: string;
  };
  onlineMeetingUrl?: string;
}

export interface CalendarProvider {
  getEvents(
    userId: string,
    options?: {
      timeMin?: Date;
      timeMax?: Date;
      calendarId?: string;
      maxResults?: number;
      useCache?: boolean;
      // Target a specific connected account. Defaults to the user's first
      // account for this provider when omitted (legacy single-account callers).
      accountId?: string;
    },
  ): Promise<CalendarEvent[]>;

  getTodayEvents(userId: string): Promise<CalendarEvent[]>;

  getUpcomingEvents(userId: string, days?: number): Promise<CalendarEvent[]>;

  listCalendars(userId: string, accountId?: string): Promise<CalendarInfo[]>;

  getEventsFromMultipleCalendars(
    userId: string,
    calendarIds: string[],
    options?: {
      timeMin?: Date;
      timeMax?: Date;
      maxResults?: number;
      useCache?: boolean;
      accountId?: string;
    },
    calendarMetadata?: CalendarInfo[],
  ): Promise<CalendarEventWithSource[]>;

  createEvent(
    userId: string,
    input: CreateEventInput,
  ): Promise<CreatedCalendarEvent>;

  /** Fetch the account's email from the provider and persist it. Used to backfill providerEmail. */
  fetchAndUpdateProviderEmail(
    accountId: string,
    accessToken: string,
  ): Promise<string | null>;

  clearUserCache(userId: string): void;

  refreshEvents(
    userId: string,
    options?: {
      timeMin?: Date;
      timeMax?: Date;
      calendarId?: string;
      maxResults?: number;
    },
  ): Promise<CalendarEvent[]>;
}
