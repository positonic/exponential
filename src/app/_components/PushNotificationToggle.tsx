"use client";

import { Button, Group, Text, Loader } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { usePushNotifications } from "~/hooks/usePushNotifications";

export function PushNotificationToggle() {
  const {
    permission,
    isSubscribed,
    isSupported,
    isVapidLoading,
    isVapidError,
    subscribe,
    unsubscribe,
    sendTest,
    isLoading,
  } = usePushNotifications();

  if (!isSupported) {
    return (
      <Text size="sm" className="text-text-muted">
        Push notifications are not supported on this device.
      </Text>
    );
  }

  if (permission === "denied") {
    return (
      <Text size="sm" className="text-text-muted">
        Notifications blocked. Enable them in your browser/device settings.
      </Text>
    );
  }

  if (isVapidError) {
    return (
      <Text size="sm" className="text-text-muted">
        Notification setup unavailable. Please try again later.
      </Text>
    );
  }

  const errorMessages: Record<string, { title: string; message: string }> = {
    "vapid-not-ready": {
      title: "Not ready yet",
      message: "Notification setup is still loading. Please try again in a moment.",
    },
    "permission-denied": {
      title: "Permission denied",
      message: "You need to allow notifications in your browser when prompted.",
    },
    "sw-failed": {
      title: "Service worker error",
      message: "Could not register the notification service. Try refreshing the page.",
    },
    "subscription-failed": {
      title: "Subscription failed",
      message: "Your browser could not create a push subscription. Try refreshing the page.",
    },
    "server-error": {
      title: "Server error",
      message: "Could not save your subscription. Please try again later.",
    },
  };

  const handleSubscribe = async () => {
    const result = await subscribe();
    if (result.success) {
      notifications.show({
        title: "Notifications Enabled",
        message: "You will now receive push notifications on this device.",
        color: "green",
        autoClose: 3000,
      });
    } else {
      const error = errorMessages[result.reason] ?? {
        title: "Could not enable notifications",
        message: "An unexpected error occurred. Please try again.",
      };
      notifications.show({
        title: error.title,
        message: error.message,
        color: "red",
        autoClose: 5000,
      });
    }
  };

  const handleUnsubscribe = async () => {
    const success = await unsubscribe();
    if (success) {
      notifications.show({
        title: "Notifications Disabled",
        message: "You will no longer receive push notifications on this device.",
        color: "gray",
        autoClose: 3000,
      });
    }
  };

  const handleTest = async () => {
    try {
      const result = await sendTest();
      notifications.show({
        title: "Test Sent",
        message: `Sent to ${result.sent} device(s). Check your notification shade.`,
        color: "green",
        autoClose: 3000,
      });
    } catch {
      notifications.show({
        title: "Test Failed",
        message: "Could not send test notification.",
        color: "red",
        autoClose: 5000,
      });
    }
  };

  if (isLoading) {
    return <Loader size="sm" />;
  }

  if (isSubscribed) {
    return (
      <Group gap="sm">
        <Button
          variant="light"
          size="xs"
          onClick={() => void handleTest()}
        >
          Test
        </Button>
        <Button
          variant="subtle"
          color="red"
          size="xs"
          onClick={() => void handleUnsubscribe()}
        >
          Disable
        </Button>
      </Group>
    );
  }

  return (
    <Button
      variant="filled"
      size="sm"
      onClick={() => void handleSubscribe()}
      loading={isVapidLoading}
      disabled={isVapidLoading}
    >
      Enable Notifications
    </Button>
  );
}
