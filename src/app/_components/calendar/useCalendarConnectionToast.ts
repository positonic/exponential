"use client";

import { useSearchParams } from "next/navigation";
import { notifications } from "@mantine/notifications";
import { useEffect } from "react";

/**
 * Shows toast notifications for calendar connection/error search params.
 *
 * This hook must run in a component that mounts on the calendar page
 * regardless of connection status — after OAuth the calendar IS connected,
 * so the GoogleCalendarConnect / MicrosoftCalendarConnect components
 * (which only render in the disconnected empty state) never mount, and
 * their identical useEffect never fires.
 */
export function useCalendarConnectionToast() {
  const searchParams = useSearchParams();

  useEffect(() => {
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
  }, [searchParams]);
}
