"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { notifications } from "@mantine/notifications";
import { useEffect, useRef } from "react";
import { getCalendarErrorMessage } from "./calendarConnectionMessages";

const OAUTH_RESULT_PARAMS = [
  "calendar_connected",
  "microsoft_calendar_connected",
  "calendar_error",
] as const;

/**
 * Shows toast notifications for calendar connection/error search params.
 *
 * This hook must run in a component that mounts on the calendar page
 * regardless of connection status — after OAuth the calendar IS connected,
 * so the GoogleCalendarConnect / MicrosoftCalendarConnect components
 * (which only render in the disconnected empty state) never mount, and
 * their identical useEffect never fires.
 *
 * The params are stripped from the URL once shown. `useCalendarNavigation`
 * rebuilds the query string from whatever is currently in it, so leaving them
 * behind means every later view/date change re-fires the same toast — and a
 * refresh would replay it too.
 */
export function useCalendarConnectionToast() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Guards the window between showing a toast and the stripped URL arriving,
  // during which this effect can run again with the params still present.
  const shownRef = useRef(false);

  const googleConnected = searchParams.get("calendar_connected");
  const microsoftConnected = searchParams.get("microsoft_calendar_connected");
  const calendarError = searchParams.get("calendar_error");

  useEffect(() => {
    if (!googleConnected && !microsoftConnected && !calendarError) {
      // Nothing to report — re-arm for a subsequent connect attempt.
      shownRef.current = false;
      return;
    }
    if (shownRef.current) return;
    shownRef.current = true;

    if (googleConnected === "true") {
      notifications.show({
        title: "Calendar Connected!",
        message: "Your Google Calendar is now connected and ready to use.",
        color: "green",
      });
    }

    if (microsoftConnected === "true") {
      notifications.show({
        title: "Calendar Connected!",
        message: "Your Outlook Calendar is now connected and ready to use.",
        color: "green",
      });
    }

    if (calendarError) {
      notifications.show({
        title: "Connection Failed",
        message: getCalendarErrorMessage(calendarError),
        color: "red",
      });
    }

    const params = new URLSearchParams(searchParams.toString());
    for (const param of OAUTH_RESULT_PARAMS) {
      params.delete(param);
    }
    const query = params.toString();
    router.replace(query ? `/calendar?${query}` : "/calendar", {
      scroll: false,
    });
  }, [
    googleConnected,
    microsoftConnected,
    calendarError,
    searchParams,
    router,
  ]);
}
