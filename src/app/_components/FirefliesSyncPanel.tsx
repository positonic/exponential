"use client";

import { useState } from "react";
import {
  Paper,
  Title,
  Text,
  Card,
  Group,
  Stack,
  Button,
  ThemeIcon,
  Badge,
  Collapse,
  ActionIcon,
  Alert,
} from "@mantine/core";
import {
  IconMicrophone,
  IconChevronDown,
  IconChevronUp,
  IconRefresh,
  IconCheck,
  // IconAlertTriangle,
  IconSettings,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";

interface IntegrationCardProps {
  integration: {
    id: string;
    name: string;
    credentials: Array<{ key: string; keyType: string }>;
  };
  isSyncing: boolean;
  successMessage?: string;
  onSync: (integrationId: string) => void;
}

function IntegrationCard({ integration, isSyncing, successMessage, onSync }: IntegrationCardProps) {
  // Individual hook call for this specific integration
  const { data: syncStatus, isLoading } = api.transcription.getFirefliesSyncStatus.useQuery(
    { integrationId: integration.id },
    { enabled: !!integration.id }
  );

  return (
    <Card key={integration.id} withBorder padding="md" radius="sm">
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Group gap="md" align="center">
            <ThemeIcon size="lg" variant="light" color="orange" radius="md">
              <IconMicrophone size={20} />
            </ThemeIcon>
            <div>
              <Group gap="xs" align="center">
                <Text fw={600} size="sm">
                  {integration.name}
                </Text>
                <Badge variant="dot" color="teal" size="xs">
                  Fireflies
                </Badge>
              </Group>
              
              {isLoading ? (
                <Text size="xs" c="dimmed">Loading status...</Text>
              ) : syncStatus ? (
                <Group gap="md" mt={2}>
                  {syncStatus.lastSyncAt ? (
                    <Text size="xs" c="dimmed">
                      Last sync: {new Date(syncStatus.lastSyncAt).toLocaleDateString()}
                    </Text>
                  ) : (
                    <Text size="xs" c="dimmed">Never synced</Text>
                  )}
                  {syncStatus.estimatedNewCount > 0 && (
                    <Text size="xs" c="blue" fw={500}>
                      ~{syncStatus.estimatedNewCount} new available
                    </Text>
                  )}
                </Group>
              ) : null}
            </div>
          </Group>

          <Group gap="xs">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              title="Integration settings"
            >
              <IconSettings size={14} />
            </ActionIcon>
            
            <Button
              size="xs"
              variant={syncStatus?.estimatedNewCount ? "filled" : "light"}
              color={syncStatus?.estimatedNewCount ? "blue" : "gray"}
              loading={isSyncing}
              disabled={isLoading || isSyncing || (syncStatus?.estimatedNewCount === 0 && !!syncStatus?.lastSyncAt)}
              onClick={() => onSync(integration.id)}
              leftSection={
                syncStatus?.estimatedNewCount === 0 && syncStatus?.lastSyncAt ? (
                  <IconCheck size={12} />
                ) : (
                  <IconRefresh size={12} />
                )
              }
            >
              {isSyncing
                ? 'Syncing...'
                : syncStatus?.estimatedNewCount
                ? `Sync ${syncStatus.estimatedNewCount}`
                : syncStatus?.lastSyncAt
                ? 'Up to date'
                : 'Sync Now'
              }
            </Button>
          </Group>
        </Group>

        {/* Success message */}
        {successMessage && (
          <Alert 
            icon={<IconCheck size={16} />}
            color="green"
            variant="light"
            styles={{
              root: {
                animation: 'fadeInOut 3s ease-in-out forwards',
              }
            }}
          >
            <Text size="sm">{successMessage}</Text>
          </Alert>
        )}

      </Stack>
    </Card>
  );
}

interface FirefliesSyncPanelProps {
  onSyncComplete?: () => void;
}

export function FirefliesSyncPanel({ onSyncComplete }: FirefliesSyncPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [syncingIntegrations, setSyncingIntegrations] = useState<Set<string>>(new Set());
  const [successMessages, setSuccessMessages] = useState<Record<string, string>>({});

  // Fetch Fireflies integrations
  const { data: integrations = [], isLoading } = api.transcription.getFirefliesIntegrations.useQuery();
  const utils = api.useUtils();

  // Bulk sync mutation
  const bulkSyncMutation = api.transcription.bulkSyncFromFireflies.useMutation({
    onSuccess: (result, variables) => {
      const integrationId = variables.integrationId;
      setSyncingIntegrations(prev => {
        const newSet = new Set(prev);
        newSet.delete(integrationId);
        return newSet;
      });

      // Show success message
      const message = `✅ Synced ${result.newTranscripts} new, ${result.updatedTranscripts} updated transcripts`;
      setSuccessMessages(prev => ({ ...prev, [integrationId]: message }));
      
      // Fade out success message after 3 seconds
      setTimeout(() => {
        setSuccessMessages(prev => {
          const newMessages = { ...prev };
          delete newMessages[integrationId];
          return newMessages;
        });
      }, 3000);

      // Refresh transcriptions list and sync status
      void utils.transcription.getAllTranscriptions.invalidate();
      void utils.transcription.getFirefliesSyncStatus.invalidate({ integrationId });
      
      // Call callback if provided
      onSyncComplete?.();

      notifications.show({
        title: 'Sync Complete',
        message: `Successfully synced ${result.newTranscripts + result.updatedTranscripts} transcripts`,
        color: 'green',
      });
    },
    onError: (error, variables) => {
      const integrationId = variables.integrationId;
      setSyncingIntegrations(prev => {
        const newSet = new Set(prev);
        newSet.delete(integrationId);
        return newSet;
      });

      notifications.show({
        title: 'Sync Failed',
        message: error.message || 'Failed to sync from Fireflies',
        color: 'red',
      });
    },
  });

  // We'll fetch sync status individually in the component render
  // to avoid the Rules of Hooks violation with dynamic arrays

  const handleSync = async (integrationId: string) => {
    setSyncingIntegrations(prev => new Set(prev).add(integrationId));
    await bulkSyncMutation.mutateAsync({ integrationId });
  };

  // Don't show panel if no Fireflies integrations
  if (isLoading || integrations.length === 0) {
    return null;
  }

  return (
    <Paper withBorder radius="md" className="mb-6">
      <div className="p-4">
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <ThemeIcon size="md" variant="light" color="orange" radius="md">
              <IconMicrophone size={18} />
            </ThemeIcon>
            <div>
              <Title order={5}>Sync from Fireflies</Title>
              <Text size="sm" c="dimmed">
                {integrations.length} integration{integrations.length === 1 ? '' : 's'} available
              </Text>
            </div>
          </Group>
          
          <ActionIcon
            variant="subtle"
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? 'Collapse sync panel' : 'Expand sync panel'}
          >
            {expanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
          </ActionIcon>
        </Group>

        <Collapse in={expanded}>
          <Stack gap="sm" mt="md">
            {integrations.map((integration) => (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                isSyncing={syncingIntegrations.has(integration.id)}
                successMessage={successMessages[integration.id]}
                onSync={handleSync}
              />
            ))}

            {/* Help text */}
            <Text size="xs" c="dimmed" ta="center" mt="xs">
              Sync will fetch recent meeting transcripts and create action items automatically
            </Text>
          </Stack>
        </Collapse>
      </div>

      <style jsx>{`
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translateY(-10px); }
          10% { opacity: 1; transform: translateY(0); }
          90% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-10px); }
        }
      `}</style>
    </Paper>
  );
}