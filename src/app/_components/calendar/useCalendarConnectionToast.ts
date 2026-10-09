"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { notifications } from "@mantine/notifications";
import { useEffect, useRef } from "react";
import { getCalendarErrorMessage } from "./calendarConnectionMessages";

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
export function useCalendarConnectionToast(enabled: boolean) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // Guards the window between showing a toast and the URL rewrite below
  // committing, during which this effect can re-run with the params still
  // present.
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
      // No provider-specific fallback: both callbacks redirect with a bare
      // `calendar_error`, so unlike the connect buttons this hook can't tell
      // which provider failed. Only success is provider-tagged.
      notifications.show({
        title: "Connection Failed",
        message: getCalendarErrorMessage(calendarError),
        color: "red",
      });
    }

    // Latch only once something was actually shown: a first render with no
    // params must not suppress a toast that arrives on a later client-side
    // navigation.
    if (googleConnected === "true" || microsoftConnected === "true" || calendarError) {
      alreadyShown.current = true;

      // Strip the params so the toast is a one-off. They are consumed here
      // and nowhere else, and leaving them in place replays the toast on
      // every reload or remount — a ref only lives as long as the mount.
      const remaining = new URLSearchParams(searchParams);
      remaining.delete("calendar_connected");
      remaining.delete("microsoft_calendar_connected");
      remaining.delete("calendar_error");
      const query = remaining.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    }
  }, [searchParams, enabled, router, pathname]);
}
