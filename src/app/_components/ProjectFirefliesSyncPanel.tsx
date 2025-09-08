"use client";

import { useState } from "react";
import {
  Button,
  Group,
  Text,
  Badge,
  Alert,
  Collapse,
  Card,
  Stack,
  ThemeIcon,
} from "@mantine/core";
import {
  IconMicrophone,
  IconRefresh,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconAlertCircle,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";

interface ProjectFirefliesSyncPanelProps {
  projectId: string;
  onSyncComplete?: () => void;
}

export function ProjectFirefliesSyncPanel({
  projectId,
  onSyncComplete,
}: ProjectFirefliesSyncPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [syncingIntegrations, setSyncingIntegrations] = useState<Set<string>>(
    new Set(),
  );
  const [successMessages, setSuccessMessages] = useState<
    Record<string, string>
  >({});

  // Fetch Fireflies integrations
  const { data: integrations = [], isLoading } =
    api.transcription.getFirefliesIntegrations.useQuery();
  const utils = api.useUtils();

  // Project-specific sync mutation
  const projectSyncMutation =
    api.transcription.syncFirefliesForProject.useMutation({
      onSuccess: (result, variables) => {
        const integrationId = variables.integrationId;
        setSyncingIntegrations((prev) => {
          const newSet = new Set(prev);
          newSet.delete(integrationId);
          return newSet;
        });

        // Show success message
        const message = `✅ Synced ${result.newTranscripts} new, ${result.updatedTranscripts} updated transcripts. ${result.projectAssociations} associated with project.`;
        setSuccessMessages((prev) => ({ ...prev, [integrationId]: message }));

        notifications.show({
          title: "Fireflies Sync Complete",
          message: `Synced ${result.newTranscripts} new transcriptions to project`,
          color: "green",
          icon: <IconCheck size={16} />,
        });

        // Fade out success message after 5 seconds
        setTimeout(() => {
          setSuccessMessages((prev) => {
            const newMessages = { ...prev };
            delete newMessages[integrationId];
            return newMessages;
          });
        }, 5000);

        // Refresh project transcriptions
        void utils.project.getById.invalidate({ id: projectId });
        onSyncComplete?.();
      },
      onError: (error, variables) => {
        const integrationId = variables.integrationId;
        setSyncingIntegrations((prev) => {
          const newSet = new Set(prev);
          newSet.delete(integrationId);
          return newSet;
        });

        notifications.show({
          title: "Sync Failed",
          message: error.message || "Failed to sync Fireflies transcriptions",
          color: "red",
          icon: <IconAlertCircle size={16} />,
        });
      },
    });

  const handleSync = (integrationId: string) => {
    setSyncingIntegrations((prev) => new Set(prev).add(integrationId));
    projectSyncMutation.mutate({
      integrationId,
      projectId,
      syncSinceDays: 7, // Last 7 days by default
    });
  };

  if (isLoading) {
    return (
      <Button size="sm" variant="outline" loading>
        Loading integrations...
      </Button>
    );
  }

  if (integrations.length === 0) {
    return (
      <Alert icon={<IconAlertCircle size={16} />} color="orange">
        <Text size="sm">
          No Fireflies integrations found. Please connect Fireflies in the
          integrations section.
        </Text>
      </Alert>
    );
  }

  return (
    <div>
      <Group gap="xs">
        <Button
          size="sm"
          variant="outline"
          leftSection={<IconMicrophone size={16} />}
          rightSection={
            expanded ? (
              <IconChevronUp size={16} />
            ) : (
              <IconChevronDown size={16} />
            )
          }
          onClick={() => setExpanded(!expanded)}
          disabled={integrations.length === 0}
        >
          Sync from Fireflies
        </Button>

        {integrations.length === 1 && (
          <Button
            size="sm"
            variant="filled"
            leftSection={<IconRefresh size={16} />}
            onClick={() => handleSync(integrations[0]!.id)}
            loading={syncingIntegrations.has(integrations[0]!.id)}
          >
            Quick Sync
          </Button>
        )}
      </Group>

      <Collapse in={expanded}>
        <Card withBorder mt="sm" p="md">
          <Stack gap="md">
            <Text size="sm" fw={600}>
              Sync Recent Meetings to Project
            </Text>

            {integrations.map((integration) => (
              <Card key={integration.id} withBorder padding="sm" radius="sm">
                <Group justify="space-between" align="center">
                  <Group gap="sm">
                    <ThemeIcon variant="light" color="teal">
                      <IconMicrophone size={16} />
                    </ThemeIcon>
                    <div>
                      <Text size="sm" fw={500}>
                        {integration.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        Fireflies Integration
                      </Text>
                    </div>
                  </Group>

                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconRefresh size={14} />}
                    onClick={() => handleSync(integration.id)}
                    loading={syncingIntegrations.has(integration.id)}
                  >
                    Sync Last 7 Days
                  </Button>
                </Group>

                {successMessages[integration.id] && (
                  <Alert
                    icon={<IconCheck size={16} />}
                    color="green"
                    mt="sm"
                    // size="sm"
                    style={{
                      animation: "fadeInOut 5s ease-in-out",
                    }}
                  >
                    {successMessages[integration.id]}
                  </Alert>
                )}
              </Card>
            ))}

            <Text size="xs" c="dimmed">
              New transcriptions will be automatically associated with this
              project and processed for action items.
            </Text>
          </Stack>
        </Card>
      </Collapse>
    </div>
  );
}
