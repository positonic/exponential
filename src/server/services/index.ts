import { GoogleCalendarService } from './GoogleCalendarService';
import { MicrosoftCalendarService } from './MicrosoftCalendarService';
import { listIcsCalendarEvents } from './calendar/icsEventRead';
import { listMeetingCalendarEvents } from './calendar/meetingEventRead';
import type { CalendarProvider } from './CalendarProvider';
import type { PrismaClient } from '@prisma/client';
import { db } from '~/server/db';
import { GOOGLE_SCOPES } from '~/lib/googleAuth';

const googleService = new GoogleCalendarService();
const microsoftService = new MicrosoftCalendarService();

export function getCalendarService(provider: 'google' | 'microsoft'): CalendarProvider {
  return provider === 'google' ? googleService : microsoftService;
}

export async function getEventsMultiCalendar(
  userId: string,
  timeMin: string,
  timeMax: string,
  maxResults = 250
) {
  const timeMinDate = new Date(timeMin);
  const timeMaxDate = new Date(timeMax);
  const [googleEvents, microsoftEvents, icsEvents, meetingEvents] = await Promise.allSettled([
    googleService.getEvents(userId, { timeMin: timeMinDate, timeMax: timeMaxDate, maxResults }),
    microsoftService.getEvents(userId, { timeMin: timeMinDate, timeMax: timeMaxDate, maxResults }),
    listIcsCalendarEvents(db, userId, timeMinDate, timeMaxDate),
    listMeetingCalendarEvents(db, userId, timeMinDate, timeMaxDate),
  ]);

  const allEvents = [];

  if (googleEvents.status === 'fulfilled') {
    allEvents.push(...googleEvents.value.map(e => ({ ...e, provider: 'google' as const })));
  }

  if (microsoftEvents.status === 'fulfilled') {
    allEvents.push(...microsoftEvents.value.map(e => ({ ...e, provider: 'microsoft' as const })));
  }

  if (icsEvents.status === 'fulfilled') {
    // Already carries provider: 'ics'.
    allEvents.push(...icsEvents.value);
  }

  if (meetingEvents.status === 'fulfilled') {
    // Already carries provider: 'meeting'.
    allEvents.push(...meetingEvents.value);
  }

  // Sort by start time
  return allEvents.sort((a, b) => {
    const aTime = a.start?.dateTime ?? a.start?.date ?? '';
    const bTime = b.start?.dateTime ?? b.start?.date ?? '';
    return aTime.localeCompare(bTime);
  });
}

export async function checkProviderConnection(
  db: PrismaClient,
  userId: string,
  provider: 'google' | 'microsoft'
): Promise<{ isConnected: boolean; hasCalendarScope: boolean }> {
  const providerName = provider === 'google' ? 'google' : 'microsoft-entra-id';
  const requiredScope = provider === 'google'
    ? GOOGLE_SCOPES.CALENDAR
    : 'Calendars.Read';

  const account = await db.account.findFirst({
    where: { userId, provider: providerName },
    select: { access_token: true, refresh_token: true, scope: true, expires_at: true },
  });

  if (!account?.access_token) {
    return { isConnected: false, hasCalendarScope: false };
  }

  const hasScope = account.scope?.includes(requiredScope) ?? false;
  const now = Math.floor(Date.now() / 1000);
  const isValid = (account.expires_at != null && account.expires_at > now) || !!account.refresh_token;

  return {
    isConnected: isValid,
    hasCalendarScope: hasScope,
  };
}
