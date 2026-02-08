import { GoogleCalendarService } from './GoogleCalendarService';
import { MicrosoftCalendarService } from './MicrosoftCalendarService';
import type { CalendarProvider } from './CalendarProvider';
import type { PrismaClient } from '@prisma/client';

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
  const [googleEvents, microsoftEvents] = await Promise.allSettled([
    googleService.getEvents(userId, { timeMin, timeMax, maxResults }),
    microsoftService.getEvents(userId, { timeMin, timeMax, maxResults }),
  ]);

  const allEvents = [];

  if (googleEvents.status === 'fulfilled') {
    allEvents.push(...googleEvents.value.map(e => ({ ...e, provider: 'google' as const })));
  }

  if (microsoftEvents.status === 'fulfilled') {
    allEvents.push(...microsoftEvents.value.map(e => ({ ...e, provider: 'microsoft' as const })));
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
    ? 'https://www.googleapis.com/auth/calendar.events'
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
