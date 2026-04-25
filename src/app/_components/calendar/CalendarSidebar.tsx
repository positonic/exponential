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
  connectedAccounts?: Array<{
    provider: 'google' | 'microsoft';
    email: string | null;
    name: string | null;
  }>;
}

export function CalendarSidebar({
  selectedDate,
  onDateSelect,
  googleConnected,
  microsoftConnected,
  connectedAccounts = [],
}: CalendarSidebarProps) {
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
          <Stack gap="xs">
            {/* Show connected calendars with email */}
            {connectedAccounts && connectedAccounts.length > 0 ? (
              connectedAccounts.map((account) => (
                <Group key={account.provider} gap="xs" wrap="nowrap">
                  {/* Provider icon */}
                  {account.provider === 'google' && (
                    <IconBrandGoogle size={16} className="text-text-secondary flex-shrink-0" />
                  )}
                  {account.provider === 'microsoft' && (
                    <IconBrandWindows size={16} className="text-text-secondary flex-shrink-0" />
                  )}

                  {/* Email and name */}
                  <div className="flex-1 min-w-0">
                    <Text size="sm" className="text-text-primary truncate">
                      {account.name ?? account.email}
                    </Text>
                    {account.name && account.email && (
                      <Text size="xs" c="dimmed" className="truncate">
                        {account.email}
                      </Text>
                    )}
                  </div>

                  {/* Connected indicator */}
                  <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                </Group>
              ))
            ) : (
              <Text size="sm" c="dimmed">
                No calendars connected
              </Text>
            )}

            {/* Divider if there are connected accounts */}
            {connectedAccounts && connectedAccounts.length > 0 && (
              <div className="border-t border-border-primary my-2" />
            )}

            {/* Add buttons for disconnected providers */}
            {!googleConnected && (
              <UnstyledButton
                onClick={handleConnectGoogle}
                className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
              >
                <IconPlus size={16} />
                <Text size="sm">Add Google</Text>
              </UnstyledButton>
            )}

            {!microsoftConnected && (
              <UnstyledButton
                onClick={handleConnectMicrosoft}
                className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
              >
                <IconPlus size={16} />
                <Text size="sm">Add Outlook</Text>
              </UnstyledButton>
            )}
          </Stack>
        </div>
      </Stack>
    </div>
  );
}
