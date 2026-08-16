"use client";

import { useState } from "react";
import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  Menu,
  Modal,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconDots,
  IconPlus,
  IconRefresh,
  IconRss,
  IconUnlink,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { modals } from "@mantine/modals";
import { api } from "~/trpc/react";
import { getEventHue, EVENT_HUE_DOT } from "./eventHue";
import { markTimezonePromptDismissed, TimezonePromptModal } from "./TimezonePromptModal";

/**
 * ICS calendar feed management: list with enable/disable + remove, sync
 * status/error display, and an add-feed modal. A "Calendar feed" is a
 * per-user ICS subscription URL, deliberately not a connected account
 * (ADR-0057) — so this lives beside, not inside, the account sections.
 *
 * `compact` renders the sidebar variant; the default fits a settings card.
 *
 * When `onTimezoneSuggestion` is provided (the /calendar page, whose
 * CalendarPageContent owns the page-level timezone prompt), this section
 * hands the feed's X-WR-TIMEZONE up instead of opening its own modal —
 * otherwise two prompts stack on adding the first feed.
 */
export function CalendarFeedsSection({
  compact = false,
  onTimezoneSuggestion,
}: {
  compact?: boolean;
  onTimezoneSuggestion?: (suggestedTimezone: string | null) => void;
}) {
  const utils = api.useUtils();
  const { data: feeds, isLoading } = api.calendar.listFeeds.useQuery();

  const [addOpen, setAddOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");

  // Timezone checkpoint: adding a feed is a "connected a calendar source"
  // moment — prompt users without a timezone, prefilled from the feed's
  // X-WR-TIMEZONE when it names a real IANA zone.
  const { data: tzData } = api.user.getTimezone.useQuery();
  const [tzPromptOpen, setTzPromptOpen] = useState(false);
  const [tzSuggestion, setTzSuggestion] = useState<string | null>(null);

  const invalidate = async () => {
    await Promise.all([
      utils.calendar.listFeeds.invalidate(),
      utils.calendar.getEventsMultiCalendar.invalidate(),
    ]);
  };

  const addFeed = api.calendar.addFeed.useMutation({
    onSuccess: async (feed) => {
      await invalidate();
      setAddOpen(false);
      setUrl("");
      setName("");
      if (feed.syncStatus === "error") {
        notifications.show({
          title: "Feed added, but the first sync failed",
          message: feed.lastSyncError ?? "The feed could not be fetched.",
          color: "yellow",
        });
      } else {
        notifications.show({
          title: "Calendar feed added",
          message: `${feed.name} is now syncing into your calendar.`,
          color: "blue",
        });
      }
      if (tzData?.timezone == null) {
        if (onTimezoneSuggestion) {
          onTimezoneSuggestion(feed.timezone);
        } else {
          setTzSuggestion(feed.timezone);
          setTzPromptOpen(true);
        }
      }
    },
    onError: (error) => {
      notifications.show({
        title: "Couldn't add feed",
        message: error.message,
        color: "red",
      });
    },
  });

  const setEnabled = api.calendar.setFeedEnabled.useMutation({
    onSettled: () => void invalidate(),
  });

  const removeFeed = api.calendar.removeFeed.useMutation({
    onSuccess: async () => {
      await invalidate();
      notifications.show({
        title: "Feed removed",
        message: "The feed and its events were removed from your calendar.",
        color: "blue",
      });
    },
    onError: (error) => {
      notifications.show({ title: "Error", message: error.message, color: "red" });
    },
  });

  const refreshFeeds = api.calendar.refreshMyFeeds.useMutation({
    onSuccess: async () => {
      await invalidate();
      notifications.show({
        title: "Feeds refreshed",
        message: "Your calendar feeds were re-synced.",
        color: "blue",
      });
    },
    onError: (error) => {
      notifications.show({
        title: "Not refreshed",
        message: error.message,
        color: "yellow",
      });
    },
  });

  const feedList = feeds ?? [];

  const confirmRemove = (feed: { id: string; name: string }) => {
    modals.openConfirmModal({
      title: "Remove calendar feed?",
      children: (
        <Text size="sm">
          {feed.name} and all its synced events will be removed. The feed URL
          is not recoverable afterwards — you would need to paste it again.
        </Text>
      ),
      labels: { confirm: "Remove feed", cancel: "Keep feed" },
      confirmProps: { color: "red" },
      onConfirm: () => removeFeed.mutate({ feedId: feed.id }),
    });
  };

  const statusFor = (feed: (typeof feedList)[number]) => {
    if (feed.syncStatus === "error") {
      const errorText = feed.lastSyncError ?? "The last sync failed.";
      return (
        <Tooltip label={errorText} multiline maw={280} withinPortal>
          {/* Focusable so keyboard/screen-reader users can reach the error. */}
          <ActionIcon
            variant="transparent"
            size="sm"
            aria-label={`Sync failed: ${errorText}`}
            className="flex-shrink-0 cursor-default"
          >
            <IconAlertTriangle size={14} className="text-brand-warning" />
          </ActionIcon>
        </Tooltip>
      );
    }
    if (feed.syncStatus === "pending") {
      return (
        <Text size="xs" c="dimmed" className="flex-shrink-0">
          syncing…
        </Text>
      );
    }
    return null;
  };

  return (
    <>
      <Stack gap={compact ? 6 : "sm"}>
        {!compact && (
          <Text size="xs" c="dimmed">
            Subscribe to a published calendar by its ICS address (e.g. an
            Outlook published calendar). Events re-sync every 15 minutes.
          </Text>
        )}

        {isLoading ? null : feedList.length === 0 && !compact ? (
          <Text size="sm" c="dimmed">
            No calendar feeds yet
          </Text>
        ) : (
          feedList.map((feed) => (
            <Group key={feed.id} gap="xs" wrap="nowrap">
              <Checkbox
                size="xs"
                checked={feed.isEnabled}
                onChange={(e) =>
                  setEnabled.mutate({ feedId: feed.id, isEnabled: e.currentTarget.checked })
                }
                label={
                  <Group gap={6} wrap="nowrap">
                    <span
                      className={`inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                        EVENT_HUE_DOT[
                          getEventHue({
                            id: feed.id,
                            calendarId: feed.id,
                            calendarName: feed.name,
                          })
                        ]
                      }`}
                    />
                    <Text size="xs" className="truncate" title={feed.name}>
                      {feed.name}
                    </Text>
                  </Group>
                }
                className="min-w-0 flex-1"
              />
              {statusFor(feed)}
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Feed options">
                    <IconDots size={14} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    leftSection={<IconRefresh size={14} />}
                    onClick={() => refreshFeeds.mutate()}
                  >
                    Refresh all feeds
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<IconUnlink size={14} />}
                    color="red"
                    onClick={() => confirmRemove(feed)}
                  >
                    Remove feed
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          ))
        )}

        {compact ? (
          <UnstyledButton
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 text-text-secondary transition-colors hover:text-text-primary"
          >
            <IconPlus size={16} />
            <Text size="sm">Add calendar feed</Text>
          </UnstyledButton>
        ) : (
          <div>
            <Button
              variant="light"
              size="xs"
              leftSection={<IconRss size={14} />}
              onClick={() => setAddOpen(true)}
            >
              Add calendar feed
            </Button>
          </div>
        )}
      </Stack>

      <Modal
        opened={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add calendar feed"
        centered
      >
        <Stack gap="sm">
          <Text size="xs" c="dimmed">
            Paste an ICS subscription address. In Outlook: Settings → Calendar
            → Shared calendars → Publish a calendar, then copy the ICS link.
          </Text>
          <TextInput
            label="Feed URL"
            placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics"
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
            required
            data-autofocus
          />
          <TextInput
            label="Name"
            placeholder="Defaults to the calendar's own name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <Group justify="flex-end" mt="xs">
            <Button variant="subtle" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                addFeed.mutate({ url: url.trim(), name: name.trim() || undefined })
              }
              disabled={url.trim().length === 0}
              loading={addFeed.isPending}
            >
              Add feed
            </Button>
          </Group>
        </Stack>
      </Modal>

      <TimezonePromptModal
        opened={tzPromptOpen}
        onClose={() => {
          // Shared dismissal — "Not now" here must stop the page-level
          // prompt from re-asking immediately.
          markTimezonePromptDismissed();
          setTzPromptOpen(false);
        }}
        suggestedTimezone={tzSuggestion}
      />
    </>
  );
}
