"use client";

import { Button, Group, Text, Loader } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { usePushNotifications } from "~/hooks/usePushNotifications";

export function PushNotificationToggle() {
  const {
    permission,
    isSubscribed,
    isSupported,
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

  const handleSubscribe = async () => {
    const success = await subscribe();
    if (success) {
      notifications.show({
        title: "Notifications Enabled",
        message: "You will now receive push notifications on this device.",
        color: "green",
        autoClose: 3000,
      });
    } else {
      notifications.show({
        title: "Could not enable notifications",
        message: "Please allow notifications when prompted and try again.",
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
    >
      Enable Notifications
    </Button>
  );
}
