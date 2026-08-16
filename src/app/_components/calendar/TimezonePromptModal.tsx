"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Group, Modal, Select, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";

/** Browser-detected IANA timezone, e.g. "Europe/Berlin". */
export function detectBrowserTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

interface TimezonePromptModalProps {
  opened: boolean;
  onClose: () => void;
  /**
   * Prefill candidate ahead of browser detection — e.g. a feed's
   * X-WR-TIMEZONE. Ignored when it isn't a recognizable IANA name (Outlook
   * often publishes Windows zone names there).
   */
  suggestedTimezone?: string | null;
}

/**
 * The timezone checkpoint (V1 calendar feeds): connecting any calendar
 * source is the moment we ask for a timezone if the user has none, because
 * scheduling and work-hours interpretation need it. Saved to User.timezone;
 * editable later in Settings → Profile.
 */
export function TimezonePromptModal({
  opened,
  onClose,
  suggestedTimezone,
}: TimezonePromptModalProps) {
  const utils = api.useUtils();

  const timezones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);

  const defaultValue = useMemo(() => {
    if (suggestedTimezone && timezones.includes(suggestedTimezone)) {
      return suggestedTimezone;
    }
    const browser = detectBrowserTimezone();
    return browser && timezones.includes(browser) ? browser : null;
  }, [suggestedTimezone, timezones]);

  const [value, setValue] = useState<string | null>(defaultValue);
  useEffect(() => {
    if (opened) setValue(defaultValue);
  }, [opened, defaultValue]);

  const updateTimezone = api.user.updateTimezone.useMutation({
    onSuccess: async (res) => {
      await utils.user.getTimezone.invalidate();
      notifications.show({
        title: "Timezone saved",
        message: `Your timezone is set to ${res.timezone}.`,
        color: "blue",
      });
      onClose();
    },
    onError: (error) => {
      notifications.show({ title: "Error", message: error.message, color: "red" });
    },
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Set your timezone" centered>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Your calendar is connected — set your timezone so events and
          working hours line up correctly. You can change it any time in
          Settings → Profile.
        </Text>
        <Select
          label="Timezone"
          data={timezones}
          value={value}
          onChange={setValue}
          searchable
          nothingFoundMessage="No matching timezone"
          maxDropdownHeight={240}
        />
        <Group justify="flex-end" mt="xs">
          <Button variant="subtle" onClick={onClose}>
            Not now
          </Button>
          <Button
            onClick={() => value && updateTimezone.mutate({ timezone: value })}
            disabled={!value}
            loading={updateTimezone.isPending}
          >
            Save timezone
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
