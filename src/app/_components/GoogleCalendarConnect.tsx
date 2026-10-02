"use client";

import { Button, Tooltip } from "@mantine/core";
import { IconCalendar, IconCheck, IconLock } from "@tabler/icons-react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { getCalendarErrorMessage } from "./calendar/calendarConnectionMessages";

interface GoogleCalendarConnectProps {
  isConnected?: boolean;
  /**
   * True when Google Calendar is closed to this user because our calendar
   * scopes are still awaiting Google verification. Callers read it from
   * `calendar.getConnectionStatus().gated` or `user.isGoogleOAuthTester`.
   * Passed in (rather than queried here) so this stays a presentational
   * button; `/api/auth/google-calendar` re-checks server-side regardless.
   */
  gated?: boolean;
}

export function GoogleCalendarConnect({
  isConnected = false,
  gated = false,
}: GoogleCalendarConnectProps) {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const calendarConnected = searchParams.get("calendar_connected");
    const calendarError = searchParams.get("calendar_error");

    if (calendarConnected === "true") {
      notifications.show({
        title: "Calendar Connected!",
        message: "Your Google Calendar is now connected and ready to use.",
        color: "green",
        icon: <IconCheck />,
      });
    }

    if (calendarError) {
      notifications.show({
        title: "Connection Failed",
        message: getCalendarErrorMessage(
          calendarError,
          "Failed to connect Google Calendar.",
        ),
        color: "red",
      });
    }
  }, [searchParams]);

  const handleConnect = () => {
    setLoading(true);
    // Pass current URL as return URL so user comes back to same page after OAuth
    const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/api/auth/google-calendar?returnUrl=${returnUrl}`;
  };

  if (gated) {
    return (
      <Tooltip
        multiline
        w={260}
        label="Google Calendar integration is currently available to select users during our verification process."
      >
        <Button
          component={Link}
          href="/google-access?feature=calendar"
          variant="light"
          color="gray"
          leftSection={<IconLock size={16} />}
        >
          Premium Feature
        </Button>
      </Tooltip>
    );
  }

  if (isConnected) {
    return (
      <Button
        variant="light"
        color="green"
        leftSection={<IconCheck size={16} />}
        disabled
        styles={{
          root: {
            opacity: 1,
            '&:disabled': {
              opacity: 1,
            },
          },
        }}
      >
        Calendar Connected
      </Button>
    );
  }

  return (
    <Button
      onClick={handleConnect}
      loading={loading}
      leftSection={<IconCalendar size={16} />}
      variant="light"
      color="blue"
    >
      Connect Google Calendar
    </Button>
  );
}