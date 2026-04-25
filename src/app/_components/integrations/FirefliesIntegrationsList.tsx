"use client";

import { useState } from "react";
import {
  Stack,
  Group,
  Text,
  Button,
  ActionIcon,
  Badge,
  Card,
  Loader,
  Modal,
} from "@mantine/core";
import {
  IconSettings,
  IconTrash,
  IconMicrophone,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";
import { FirefliesWizardModal } from "./FirefliesWizardModal";

interface FirefliesIntegrationsListProps {
  onIntegrationChange?: () => void;
}

export function FirefliesIntegrationsList({ onIntegrationChange }: FirefliesIntegrationsListProps) {
  const [editingIntegrationId, setEditingIntegrationId] = useState<string | null>(null);
  const [deletingIntegrationId, setDeletingIntegrationId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: integrations, isLoading, refetch } = api.transcription.getFirefliesIntegrations.useQuery();

  const deleteIntegration = api.integration.deleteIntegration.useMutation({
    onSuccess: () => {
      notifications.show({
        title: "Integration Deleted",
        message: "The Fireflies integration has been removed",
        color: "green",
      });
      setConfirmDeleteId(null);
      void refetch();
      onIntegrationChange?.();
    },
    onError: (error) => {
      notifications.show({
        title: "Delete Failed",
        message: error.message || "Failed to delete integration",
        color: "red",
      });
      setDeletingIntegrationId(null);
    },
  });

  const handleDelete = (integrationId: string) => {
    setDeletingIntegrationId(integrationId);
    deleteIntegration.mutate({ integrationId });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader size="sm" />
      </div>
    );
  }

  if (!integrations || integrations.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="md">
        No Fireflies integrations configured
      </Text>
    );
  }

  return (
    <>
      <Stack gap="sm">
        {integrations.map((integration) => {
          const emailCredential = integration.credentials?.find(
            (c: { keyType: string }) => c.keyType === "EMAIL"
          );
          const email = emailCredential?.key;

          return (
            <Card
              key={integration.id}
              padding="sm"
              withBorder
              className="bg-surface-primary"
            >
              <Group justify="space-between" wrap="nowrap">
                <Group gap="md">
                  <IconMicrophone size={20} className="text-orange-500" />
                  <div>
                    <Group gap="xs">
                      <Text size="sm" fw={500}>
                        {integration.name}
                      </Text>
                      <Badge size="xs" variant="light" color="green">
                        Active
                      </Badge>
                    </Group>
                    {email && (
                      <Text size="xs" c="dimmed">
                        {email}
                      </Text>
                    )}
                  </div>
                </Group>

                <Group gap="xs">
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    onClick={() => setEditingIntegrationId(integration.id)}
                    title="Edit integration"
                  >
                    <IconSettings size={16} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    size="sm"
                    onClick={() => setConfirmDeleteId(integration.id)}
                    title="Delete integration"
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Group>
            </Card>
          );
        })}
      </Stack>

      {/* Edit Modal */}
      <FirefliesWizardModal
        opened={!!editingIntegrationId}
        onClose={() => setEditingIntegrationId(null)}
        editIntegrationId={editingIntegrationId ?? undefined}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        opened={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        title="Delete Integration"
        centered
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            Are you sure you want to delete this Fireflies integration? This action cannot be undone.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button
              variant="default"
              onClick={() => setConfirmDeleteId(null)}
            >
              Cancel
            </Button>
            <Button
              color="red"
              loading={deletingIntegrationId === confirmDeleteId}
              onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
