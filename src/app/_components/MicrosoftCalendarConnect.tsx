"use client";

import { Button } from "@mantine/core";
import { IconCalendar, IconCheck } from "@tabler/icons-react";
import { useSearchParams } from "next/navigation";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";

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
      let errorMessage = "Failed to connect Outlook Calendar.";
      switch (calendarError) {
        case "access_denied":
          errorMessage =
            "Calendar access was denied. Please try again and grant permissions.";
          break;
        case "invalid_request":
          errorMessage =
            "Invalid request. Please try connecting again.";
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
