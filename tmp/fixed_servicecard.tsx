"use client";

import {
  Card,
  Stack,
  Group,
  Text,
  Badge,
  ActionIcon,
  Tooltip,
  ThemeIcon,
} from "@mantine/core";
import {
  IconTestPipe,
  IconRefresh,
  IconSettings,
  IconBrandGithub,
  IconBrandSlack,
  IconBrandNotion,
  IconPlugConnected,
  IconBrandFirebase,
  IconBrandWhatsapp,
  IconCalendar,
} from "@tabler/icons-react";
import type { ReactNode } from "react";

interface ServiceCardProps {
  variant: "connected" | "available";
  serviceName: string;
  provider: string;
  description?: string;
  lastSync?: string;
  status?: string;
  onCardClick: () => void;
  onTestConnection?: () => void;
  onRefresh?: () => void;
  onSettings?: () => void;
  isLoading?: {
    test?: boolean;
    refresh?: boolean;
  };
}

const getServiceIcon = (provider: string): ReactNode => {
  const iconSize = 24;

  switch (provider.toLowerCase()) {
    case "github":
      return <IconBrandGithub size={iconSize} />;
    case "slack":
      return <IconBrandSlack size={iconSize} />;
    case "notion":
      return <IconBrandNotion size={iconSize} />;
    case "fireflies":
      return <IconBrandFirebase size={iconSize} />;
    case "whatsapp":
      return <IconBrandWhatsapp size={iconSize} />;
    case "monday":
      return <IconCalendar size={iconSize} />;
    case "exponential-plugin":
      return <IconPlugConnected size={iconSize} />;
    default:
      return <IconPlugConnected size={iconSize} />;
  }
};

const getServiceColor = (provider: string): string => {
  switch (provider.toLowerCase()) {
    case "github":
      return "dark";
    case "slack":
      return "purple";
    case "notion":
      return "gray";
    case "fireflies":
      return "orange";
    case "whatsapp":
      return "green";
    case "monday":
      return "blue";
    default:
      return "blue";
  }
};

export function ServiceCard({
  variant,
  serviceName,
  provider,
  description,
  lastSync,
  status,
  onCardClick,
  onTestConnection,
  onRefresh,
  onSettings,
  isLoading = {},
}: ServiceCardProps) {
  const serviceIcon = getServiceIcon(provider);
  const serviceColor = getServiceColor(provider);

  if (variant === "connected") {
    return (
      <Card
        withBorder
        radius="md"
        p="sm"
        className="cursor-pointer transition-all duration-200 hover:shadow-md"
        onClick={onCardClick}
        style={{ height: "100px", maxWidth: "200px", margin: "0 auto" }}
      >
        {/* Quick actions in top right corner */}
        {(onTestConnection || onRefresh || onSettings) && (
          <Group
            gap={4}
            className="absolute right-1 top-1 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {onTestConnection && (
              <Tooltip label="Test connection">
                <ActionIcon
                  variant="light"
                  color="blue"
                  size="xs"
                  loading={isLoading.test}
                  onClick={onTestConnection}
                >
                  <IconTestPipe size={10} />
                </ActionIcon>
              </Tooltip>
            )}

            {onRefresh && (
              <Tooltip label="Refresh">
                <ActionIcon
                  variant="light"
                  color="green"
                  size="xs"
                  loading={isLoading.refresh}
                  onClick={onRefresh}
                >
                  <IconRefresh size={10} />
                </ActionIcon>
              </Tooltip>
            )}

            {onSettings && (
              <Tooltip label="Settings">
                <ActionIcon
                  variant="light"
                  color="gray"
                  size="xs"
                  onClick={onSettings}
                >
                  <IconSettings size={10} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        )}

        <Stack gap={4} align="center" justify="center" h="100%">
          <ThemeIcon size="md" variant="light" color={serviceColor} radius="md">
            {serviceIcon}
          </ThemeIcon>

          <div className="text-center">
            <Text fw={500} size="xs" lineClamp={2} mb={4}>
              {serviceName}
            </Text>
            <Badge
              size="xs"
              variant="light"
              color={status === "ACTIVE" ? "green" : "red"}
            >
              {status === "ACTIVE" ? "Connected" : "Disconnected"}
            </Badge>
          </div>

          {(description || lastSync) && (
            <Text size={"10"} c="dimmed" ta="center" lineClamp={1}>
              {description || (lastSync ? `Last sync: ${lastSync}` : "")}
            </Text>
          )}
        </Stack>
      </Card>
    );
  }

  // Available service card - compact square design
  return (
    <Card
      withBorder
      radius="md"
      p="sm"
      className="aspect-square cursor-pointer transition-all duration-200 hover:bg-surface-hover hover:shadow-md"
      onClick={onCardClick}
      style={{ aspectRatio: "1/1", height: "100px" }}
    >
      <Stack gap={4} align="center" justify="center" h="100%">
        <ThemeIcon size="md" variant="light" color={serviceColor} radius="md">
          {serviceIcon}
        </ThemeIcon>

        <Text fw={500} size="xs" ta="center" lineClamp={2}>
          {serviceName}
        </Text>
      </Stack>
    </Card>
  );
}
