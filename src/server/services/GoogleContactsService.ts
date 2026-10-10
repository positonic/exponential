import { GoogleTokenManager } from "./GoogleTokenManager";
import { google } from "googleapis";
import { GOOGLE_SCOPES } from "~/lib/googleAuth";

export interface GoogleContact {
  resourceName: string;
  names?: Array<{
    displayName?: string;
    givenName?: string;
    familyName?: string;
  }>;
  emailAddresses?: Array<{
    value: string;
    type?: string;
  }>;
  phoneNumbers?: Array<{
    value: string;
    type?: string;
  }>;
  organizations?: Array<{
    name?: string;
    title?: string;
  }>;
  biographies?: Array<{
    value: string;
  }>;
  urls?: Array<{
    value: string;
    type?: string;
  }>;
}

export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: {
    dateTime?: string;
    date?: string;
  };
  end?: {
    dateTime?: string;
    date?: string;
  };
  attendees?: Array<{
    /** The Calendar API can omit this (e.g. some resource/organizer rows). */
    email?: string;
    displayName?: string;
    responseStatus?: string;
    organizer?: boolean;
  }>;
  organizer?: {
    email: string;
    displayName?: string;
  };
  created?: string;
  updated?: string;
}

export interface ContactInfo {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  organization?: string;
  jobTitle?: string;
  linkedIn?: string;
  googleContactId?: string;
}

export class GoogleContactsService {
  /**
   * Fetch one page of contacts from the Google People API. Callers paginate
   * with the returned token — imports run one page per request, so there is
   * deliberately no fetch-everything variant.
   */
  static async fetchContacts(
    userId: string,
    pageToken?: string,
    pageSize = 1000
  ): Promise<{ contacts: GoogleContact[]; nextPageToken?: string }> {
    const accessToken = await GoogleTokenManager.getValidAccessToken(
      userId,
      GOOGLE_SCOPES.CONTACTS,
    );

    const people = google.people({ version: "v1" });

    try {
      const response = await people.people.connections.list({
        resourceName: "people/me",
        pageSize,
        pageToken,
        personFields: "names,emailAddresses,phoneNumbers,organizations,biographies,urls",
        access_token: accessToken,
      });

      return {
        contacts: (response.data.connections ?? []) as GoogleContact[],
        nextPageToken: response.data.nextPageToken ?? undefined,
      };
    } catch (error) {
      console.error("Error fetching Google contacts:", error);
      throw new Error(`Failed to fetch contacts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fetch one page of calendar events within a date range. Page tokens are
   * plain cursors into the result set, so re-requesting the same token (e.g.
   * on a retried import step) returns the same page.
   */
  static async fetchCalendarEventsPage(
    userId: string,
    timeMin: Date,
    timeMax: Date,
    pageToken?: string,
    maxResults = 100
  ): Promise<{ events: GoogleCalendarEvent[]; nextPageToken?: string }> {
    const accessToken = await GoogleTokenManager.getValidAccessToken(
      userId,
      GOOGLE_SCOPES.CALENDAR,
    );

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ access_token: accessToken });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    try {
      const response = await calendar.events.list({
        calendarId: "primary",
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults,
        singleEvents: true,
        orderBy: "startTime",
        pageToken,
      });

      return {
        events: (response.data.items ?? []) as GoogleCalendarEvent[],
        nextPageToken: response.data.nextPageToken ?? undefined,
      };
    } catch (error) {
      console.error("Error fetching calendar events:", error);
      throw new Error(`Failed to fetch calendar events: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract unique contacts from calendar events
   */
  static extractContactsFromEvents(
    events: GoogleCalendarEvent[],
    userEmail: string
  ): ContactInfo[] {
    const contactMap = new Map<string, ContactInfo>();

    for (const event of events) {
      const attendees = event.attendees ?? [];

      for (const attendee of attendees) {
        if (!attendee.email) continue;
        const email = attendee.email.toLowerCase().trim();

        // Skip the user's own email
        if (email === userEmail.toLowerCase().trim()) {
          continue;
        }

        // Skip resource calendars (rooms, equipment)
        if (email.includes("resource.calendar.google.com")) {
          continue;
        }

        if (!contactMap.has(email)) {
          // Parse name from displayName if available
          const displayName = attendee.displayName ?? "";
          const nameParts = displayName.split(" ");
          const firstName = nameParts[0];
          const lastName = nameParts.slice(1).join(" ");

          contactMap.set(email, {
            email,
            firstName: firstName || undefined,
            lastName: lastName || undefined,
          });
        }
      }
    }

    return Array.from(contactMap.values());
  }

  /**
   * Get events for a specific contact email
   */
  static getEventsForContact(
    events: GoogleCalendarEvent[],
    contactEmail: string
  ): GoogleCalendarEvent[] {
    const email = contactEmail.toLowerCase().trim();

    return events.filter((event) => {
      const attendees = event.attendees ?? [];
      return attendees.some(
        (attendee) => attendee.email?.toLowerCase().trim() === email
      );
    });
  }

  /**
   * Transform Google contact to ContactInfo format
   */
  static transformContact(googleContact: GoogleContact): ContactInfo | null {
    // Must have at least an email address
    const emailAddresses = googleContact.emailAddresses ?? [];
    if (emailAddresses.length === 0) {
      return null;
    }

    const primaryEmail = emailAddresses[0]!;
    const names = googleContact.names?.[0];
    const organization = googleContact.organizations?.[0];
    const phoneNumbers = googleContact.phoneNumbers ?? [];
    const urls = googleContact.urls ?? [];

    // Extract LinkedIn URL if present
    const linkedInUrl = urls.find((url) =>
      url.value.includes("linkedin.com")
    );

    return {
      email: primaryEmail.value.toLowerCase().trim(),
      firstName: names?.givenName,
      lastName: names?.familyName,
      phone: phoneNumbers[0]?.value,
      organization: organization?.name,
      jobTitle: organization?.title,
      linkedIn: linkedInUrl?.value,
      googleContactId: googleContact.resourceName,
    };
  }

  /**
   * Calculate event duration in minutes
   */
  static calculateEventDuration(event: GoogleCalendarEvent): number {
    if (!event.start?.dateTime || !event.end?.dateTime) {
      return 0; // All-day events have no duration for our purposes
    }

    const startTime = new Date(event.start.dateTime).getTime();
    const endTime = new Date(event.end.dateTime).getTime();
    const durationMs = endTime - startTime;

    return Math.round(durationMs / (1000 * 60)); // Convert to minutes
  }

  /**
   * Get event start time
   */
  static getEventStartTime(event: GoogleCalendarEvent): Date | null {
    if (event.start?.dateTime) {
      return new Date(event.start.dateTime);
    }
    if (event.start?.date) {
      return new Date(event.start.date);
    }
    return null;
  }
}
