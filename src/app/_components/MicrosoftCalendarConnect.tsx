"use client";

import { Button } from "@mantine/core";
import { IconCalendar, IconCheck } from "@tabler/icons-react";
import { useSearchParams } from "next/navigation";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { getCalendarErrorMessage } from "./calendar/calendarConnectionMessages";

interface MicrosoftCalendarConnectProps {
  isConnected?: boolean;
}

export function MicrosoftCalendarConnect({
  isConnected = false,
}: MicrosoftCalendarConnectProps) {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const calendarConnected = searchParams.get(
      "microsoft_calendar_connected",
    );
    const calendarError = searchParams.get("calendar_error");

    if (calendarConnected === "true") {
      notifications.show({
        title: "Calendar Connected!",
        message:
          "Your Outlook Calendar is now connected and ready to use.",
        color: "green",
        icon: <IconCheck />,
      });
    }

    if (calendarError) {
      notifications.show({
        title: "Connection Failed",
        message: getCalendarErrorMessage(
          calendarError,
          "Failed to connect Outlook Calendar.",
        ),
        color: "red",
      });
    }
  }, [searchParams]);

  const handleConnect = () => {
    setLoading(true);
    const returnUrl = encodeURIComponent(
      window.location.pathname + window.location.search,
    );
    window.location.href = `/api/auth/microsoft-calendar?returnUrl=${returnUrl}`;
  };

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
            "&:disabled": {
              opacity: 1,
            },
          },
        }}
      >
        Outlook Calendar Connected
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
      Connect Outlook Calendar
    </Button>
  );
}
