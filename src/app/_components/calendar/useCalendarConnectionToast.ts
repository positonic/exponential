"use client";

import { useSearchParams } from "next/navigation";
import { notifications } from "@mantine/notifications";
import { useEffect, useRef } from "react";

/**
 * Shows toast notifications for calendar connection/error search params.
 *
 * This hook must run in a component that mounts on the calendar page
 * regardless of connection status — after OAuth the calendar IS connected,
 * so the GoogleCalendarConnect / MicrosoftCalendarConnect components
 * (which only render in the disconnected empty state) never mount, and
 * their identical useEffect never fires.
 *
 * `enabled` is the other half of that: when the calendar is *not* connected
 * those components do mount and do fire, so running here as well would show
 * every toast twice — which is exactly what a failed OAuth round-trip hits,
 * since it returns to this page still disconnected and with `calendar_error`
 * set. Pass the connection state and the two paths stay mutually exclusive.
 */
export function useCalendarConnectionToast(enabled = true) {
  const searchParams = useSearchParams();
  // The params survive in the URL after the toast, and `enabled` flips once
  // the connection query resolves — so without this the same success toast
  // fires again on the next render that changes either dependency.
  const alreadyShown = useRef(false);

  useEffect(() => {
    if (!enabled || alreadyShown.current) return;

    const googleConnected = searchParams.get("calendar_connected");
    const microsoftConnected = searchParams.get(
      "microsoft_calendar_connected",
    );
    const calendarError = searchParams.get("calendar_error");

    if (googleConnected === "true") {
      notifications.show({
        title: "Calendar Connected!",
        message:
          "Your Google Calendar is now connected and ready to use.",
        color: "green",
      });
    }

    if (microsoftConnected === "true") {
      notifications.show({
        title: "Calendar Connected!",
        message:
          "Your Outlook Calendar is now connected and ready to use.",
        color: "green",
      });
    }

    if (calendarError) {
      let errorMessage = "Failed to connect calendar.";
      switch (calendarError) {
        case "access_denied":
          errorMessage =
            "Calendar access was denied. Please try again and grant permissions.";
          break;
        case "invalid_request":
          errorMessage =
            "Invalid request. Please try connecting again.";
          break;
        case "no_google_account":
          errorMessage =
            "Please sign in with Google first, then connect your calendar.";
          break;
        case "no_refresh_token":
          errorMessage =
            "Failed to get long-term access. Please try connecting again.";
          break;
        case "token_exchange_failed":
          errorMessage =
            "Failed to connect calendar. Please try again.";
          break;
      }
      notifications.show({
        title: "Connection Failed",
        message: errorMessage,
        color: "red",
      });
    }

    // Latch only once something was actually shown: a first render with no
    // params must not suppress a toast that arrives on a later client-side
    // navigation.
    if (googleConnected === "true" || microsoftConnected === "true" || calendarError) {
      alreadyShown.current = true;
    }
  }, [searchParams, enabled]);
}
