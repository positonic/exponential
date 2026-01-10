"use client";

import {
  Container,
  Stack,
  Title,
  Text,
  Card,
  Group,
  Switch,
  Badge,
  Skeleton,
  Button,
} from "@mantine/core";
import { IconPlug, IconArrowLeft } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import Link from "next/link";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";

export default function PluginSettingsPage() {
  const { workspaceId, workspaceSlug } = useWorkspace();
  const utils = api.useUtils();

  // Query available plugins with enabled status
  const { data: plugins, isLoading } = api.pluginConfig.getAvailable.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId }
  );

  // Toggle mutation
  const togglePlugin = api.pluginConfig.toggle.useMutation({
    onSuccess: (_, variables) => {
      void utils.pluginConfig.getAvailable.invalidate();
      void utils.pluginConfig.getEnabled.invalidate();
      notifications.show({
        title: variables.enabled ? "Plugin Enabled" : "Plugin Disabled",
        message: "Plugin settings saved",
        color: "green",
      });
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message ?? "Failed to update plugin",
        color: "red",
      });
    },
  });

  const backPath = workspaceSlug
    ? `/w/${workspaceSlug}/settings`
    : "/settings";

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between">
          <Button
            variant="subtle"
            leftSection={<IconArrowLeft size={16} />}
            component={Link}
            href={backPath}
          >
            Back to Settings
          </Button>
        </Group>

        <div>
          <Group gap="sm" mb="xs">
            <IconPlug size={28} className="text-text-primary" />
            <Title order={1} className="text-text-primary">
              Plugins
            </Title>
          </Group>
          <Text className="text-text-muted">
            Enable or disable plugins for this workspace
          </Text>
        </div>

        {/* Plugin List */}
        {isLoading ? (
          <Stack gap="md">
            <Skeleton height={100} />
            <Skeleton height={100} />
          </Stack>
        ) : plugins?.length === 0 ? (
          <Card className="border border-border-primary bg-surface-secondary text-center py-8">
            <Text className="text-text-muted">No plugins available</Text>
          </Card>
        ) : (
          <Stack gap="md">
            {plugins?.map((plugin) => (
              <Card
                key={plugin.id}
                className="border border-border-primary bg-surface-secondary"
              >
                <Group justify="space-between" wrap="nowrap">
                  <div className="flex-1">
                    <Group gap="sm" mb="xs">
                      <Text fw={600} className="text-text-primary">
                        {plugin.name}
                      </Text>
                      <Badge size="xs" variant="outline">
                        v{plugin.version}
                      </Badge>
                    </Group>
                    <Text size="sm" className="text-text-muted mb-2">
                      {plugin.description}
                    </Text>
                    <Group gap="xs">
                      {plugin.capabilities.map((cap) => (
                        <Badge key={cap} size="xs" variant="light">
                          {cap}
                        </Badge>
                      ))}
                    </Group>
                  </div>
                  <Switch
                    checked={plugin.enabled}
                    onChange={() =>
                      togglePlugin.mutate({
                        pluginId: plugin.id,
                        enabled: !plugin.enabled,
                        workspaceId: workspaceId ?? undefined,
                      })
                    }
                    disabled={togglePlugin.isPending}
                  />
                </Group>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
