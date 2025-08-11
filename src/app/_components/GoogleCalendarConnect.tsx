"use client";

import { Button } from "@mantine/core";
import { IconCalendar, IconCheck } from "@tabler/icons-react";
import { useSearchParams } from "next/navigation";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";

interface GoogleCalendarConnectProps {
  isConnected?: boolean;
}

export function GoogleCalendarConnect({ isConnected = false }: GoogleCalendarConnectProps) {
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
      let errorMessage = "Failed to connect Google Calendar.";
      switch (calendarError) {
        case "access_denied":
          errorMessage = "Calendar access was denied. Please try again and grant permissions.";
          break;
        case "invalid_request":
          errorMessage = "Invalid request. Please try connecting again.";
          break;
        case "no_google_account":
          errorMessage = "Please sign in with Google first, then connect your calendar.";
          break;
        case "token_exchange_failed":
          errorMessage = "Failed to connect calendar. Please try again.";
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
    window.location.href = "/api/auth/google-calendar";
  };

  if (isConnected) {
    return (
      <Button
        variant="subtle"
        color="gray"
        leftSection={<IconCheck size={16} />}
        disabled
        styles={{
          root: {
            color: 'rgba(134, 239, 172, 0.8)',
            backgroundColor: 'rgba(134, 239, 172, 0.1)',
            border: '1px solid rgba(134, 239, 172, 0.2)',
            '&:disabled': {
              backgroundColor: 'rgba(134, 239, 172, 0.1)',
              border: '1px solid rgba(134, 239, 172, 0.2)',
              color: 'rgba(134, 239, 172, 0.8)',
              opacity: 1,
            }
          }
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
      variant="subtle"
      styles={{
        root: {
          color: 'rgba(147, 197, 253, 0.9)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          '&:hover': {
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
          }
        }
      }}
    >
      Connect Google Calendar
    </Button>
  );
}