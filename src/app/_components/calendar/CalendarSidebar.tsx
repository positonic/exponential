"use client";

import { Text, Stack, Group, UnstyledButton } from "@mantine/core";
import {
  IconBrandGoogle,
  IconBrandWindows,
  IconPlus,
} from "@tabler/icons-react";
import { CalendarMiniWidget } from "./CalendarMiniWidget";

interface CalendarSidebarProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  googleConnected?: boolean;
  microsoftConnected?: boolean;
}

export function CalendarSidebar({
  selectedDate,
  onDateSelect,
  googleConnected,
  microsoftConnected,
}: CalendarSidebarProps) {
  const hasDisconnectedProvider = !googleConnected || !microsoftConnected;

  const handleConnectGoogle = () => {
    const returnUrl = encodeURIComponent(
      window.location.pathname + window.location.search,
    );
    window.location.href = `/api/auth/google-calendar?returnUrl=${returnUrl}`;
  };

  const handleConnectMicrosoft = () => {
    const returnUrl = encodeURIComponent(
      window.location.pathname + window.location.search,
    );
    window.location.href = `/api/auth/microsoft-calendar?returnUrl=${returnUrl}`;
  };

  return (
    <div className="hidden w-64 flex-shrink-0 border-l border-border-primary bg-background-primary p-4 lg:block">
      <Stack gap="lg">
        {/* Mini Calendar */}
        <div>
          <CalendarMiniWidget
            selectedDate={selectedDate}
            onDateSelect={onDateSelect}
          />
        </div>

        {/* Calendars Section */}
        <div>
          <Text size="sm" fw={600} mb="sm" className="text-text-primary">
            Calendars
          </Text>
          <Stack gap={6}>
            {googleConnected && (
              <Group gap={8} wrap="nowrap">
                <IconBrandGoogle size={16} className="text-text-muted" />
                <Text size="sm" className="text-text-secondary">
                  Google Calendar
                </Text>
              </Group>
            )}
            {microsoftConnected && (
              <Group gap={8} wrap="nowrap">
                <IconBrandWindows size={16} className="text-text-muted" />
                <Text size="sm" className="text-text-secondary">
                  Outlook Calendar
                </Text>
              </Group>
            )}

            {/* Connect additional calendar */}
            {hasDisconnectedProvider && (
              <>
                {!googleConnected && (
                  <UnstyledButton
                    onClick={handleConnectGoogle}
                    className="rounded py-0.5 text-text-muted transition-colors hover:text-text-secondary"
                  >
                    <Group gap={8} wrap="nowrap">
                      <IconPlus size={16} />
                      <Text size="sm">Add Google</Text>
                    </Group>
                  </UnstyledButton>
                )}
                {!microsoftConnected && (
                  <UnstyledButton
                    onClick={handleConnectMicrosoft}
                    className="rounded py-0.5 text-text-muted transition-colors hover:text-text-secondary"
                  >
                    <Group gap={8} wrap="nowrap">
                      <IconPlus size={16} />
                      <Text size="sm">Add Outlook</Text>
                    </Group>
                  </UnstyledButton>
                )}
              </>
            )}
          </Stack>
        </div>
      </Stack>
    </div>
  );
}
