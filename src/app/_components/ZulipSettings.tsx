"use client";

import {
  Button,
  Group,
  Stack,
  Text,
  TextInput,
  PasswordInput,
  Select,
  Badge,
  Table,
  Avatar,
  ActionIcon,
  Tooltip,
  Modal,
  Alert,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconCheck, IconX, IconTrash, IconLink } from "@tabler/icons-react";
import { useState } from "react";
import { api } from "~/trpc/react";
import { PRODUCT_NAME } from "~/lib/brand";

interface ZulipSettingsProps {
  workspace: { id: string; name: string };
  workspaceSlug: string;
}

export function ZulipSettings({ workspace, workspaceSlug }: ZulipSettingsProps) {
  const [setupOpened, { open: openSetup, close: closeSetup }] =
    useDisclosure(false);

  // Form state
  const [serverUrl, setServerUrl] = useState("");
  const [botEmail, setBotEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [defaultStream, setDefaultStream] = useState<string | null>(null);
  const [defaultTopic, setDefaultTopic] = useState("");
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  // User mapping state
  const [mappingUserId, setMappingUserId] = useState<string | null>(null);
  const [mappingZulipEmail, setMappingZulipEmail] = useState<string | null>(
    null,
  );

  const utils = api.useUtils();

  // Queries
  const statusQuery = api.integration.getWorkspaceZulipStatus.useQuery({
    workspaceId: workspace.id,
  });

  const zulipUsersQuery = api.integration.getZulipUsers.useQuery(
    { integrationId: statusQuery.data?.integrationId ?? "" },
    { enabled: statusQuery.data?.configured === true && !!statusQuery.data?.integrationId },
  );

  const mappingsQuery = api.integration.getZulipUserMappings.useQuery(
    { integrationId: statusQuery.data?.integrationId ?? "" },
    { enabled: statusQuery.data?.configured === true && !!statusQuery.data?.integrationId },
  );

  const workspaceQuery = api.workspace.getBySlug.useQuery(
    { slug: workspaceSlug },
    { enabled: statusQuery.data?.configured === true },
  );

  // Mutations
  const createMutation = api.integration.createZulipIntegration.useMutation({
    onSuccess: () => {
      void utils.integration.getWorkspaceZulipStatus.invalidate();
      closeSetup();
      resetForm();
    },
  });

  const removeMutation = api.integration.removeWorkspaceZulip.useMutation({
    onSuccess: () => {
      void utils.integration.getWorkspaceZulipStatus.invalidate();
    },
  });

  const mapUserMutation = api.integration.mapZulipUser.useMutation({
    onSuccess: () => {
      void utils.integration.getZulipUserMappings.invalidate();
      setMappingUserId(null);
      setMappingZulipEmail(null);
    },
  });

  const unmapUserMutation = api.integration.unmapZulipUser.useMutation({
    onSuccess: () => {
      void utils.integration.getZulipUserMappings.invalidate();
    },
  });

  function resetForm() {
    setServerUrl("");
    setBotEmail("");
    setApiToken("");
    setDefaultStream(null);
    setDefaultTopic("");
    setTestResult(null);
  }

  async function handleTestConnection() {
    setIsTesting(true);
    setTestResult(null);
    try {
      // We test by attempting to create — the server tests connection first
      // For a lightweight test, we just validate the fields are present
      if (!serverUrl || !botEmail || !apiToken) {
        setTestResult({
          success: false,
          message: "Please fill in all required fields",
        });
        return;
      }
      // Use the create mutation with a test — but we actually need a separate test endpoint
      // For now, we validate client-side and let createZulipIntegration handle the server test
      setTestResult({
        success: true,
        message: "Fields look good — click Save to test connection and create the integration.",
      });
    } finally {
      setIsTesting(false);
    }
  }

  function handleSave() {
    createMutation.mutate({
      serverUrl,
      botEmail,
      apiToken,
      defaultStream: defaultStream ?? undefined,
      defaultTopic: defaultTopic || undefined,
      workspaceId: workspace.id,
    });
  }

  const status = statusQuery.data;

  // Configured state
  if (status?.configured) {
    const mappedUserIds = new Set(mappingsQuery.data?.map((m) => m.userId) ?? []);

    return (
      <Stack gap="md">
        {/* Connection Info */}
        <Group
          gap="sm"
          className="rounded-md border border-border-primary bg-surface-primary p-3"
        >
          <Badge color="green" variant="dot">
            Connected
          </Badge>
          <Text size="sm" className="text-text-secondary">
            {status.serverUrl}
          </Text>
          <Text size="sm" className="text-text-muted">
            ({status.botEmail})
          </Text>
          {status.defaultStream && (
            <Badge variant="light" size="sm">
              #{status.defaultStream}
            </Badge>
          )}
          {status.defaultTopic && (
            <Badge variant="light" size="sm" color="gray">
              {status.defaultTopic}
            </Badge>
          )}
          <Button
            variant="subtle"
            color="red"
            size="xs"
            ml="auto"
            loading={removeMutation.isPending}
            onClick={() =>
              removeMutation.mutate({ workspaceId: workspace.id })
            }
          >
            Remove
          </Button>
        </Group>

        {/* User Mapping Section */}
        <Text size="sm" fw={600} className="text-text-primary">
          User Mapping
        </Text>
        <Text size="xs" className="text-text-muted">
          Link workspace members to their Zulip accounts to enable direct
          message notifications.
        </Text>

        {/* Existing Mappings */}
        {mappingsQuery.data && mappingsQuery.data.length > 0 && (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{PRODUCT_NAME} User</Table.Th>
                <Table.Th>Zulip Email</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {mappingsQuery.data.map((mapping) => (
                <Table.Tr key={mapping.id}>
                  <Table.Td>
                    <Group gap="xs">
                      <Avatar
                        src={mapping.user.image}
                        size="sm"
                        radius="xl"
                      />
                      <Text size="sm">
                        {mapping.user.name ?? mapping.user.email}
                      </Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" className="text-text-secondary">
                      {mapping.externalUserId}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Tooltip label="Unlink">
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        size="sm"
                        loading={unmapUserMutation.isPending}
                        onClick={() =>
                          unmapUserMutation.mutate({
                            integrationId: status.integrationId,
                            userId: mapping.userId,
                          })
                        }
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}

        {/* Add Mapping */}
        {(() => {
          const unmappedMembers =
            workspaceQuery.data?.members?.filter(
              (m) => !mappedUserIds.has(m.userId),
            ) ?? [];

          if (unmappedMembers.length === 0 && mappingsQuery.data && mappingsQuery.data.length > 0) {
            return (
              <Text size="sm" className="text-text-muted">
                All workspace members have been mapped.
              </Text>
            );
          }

          return (
            <Group gap="sm" align="end">
              <Select
                label="Workspace Member"
                placeholder="Select a member"
                size="sm"
                value={mappingUserId}
                onChange={setMappingUserId}
                nothingFoundMessage="No unmapped members"
                data={unmappedMembers.map((m) => ({
                  value: m.userId,
                  label: m.user.name ?? m.user.email ?? m.userId,
                }))}
                style={{ flex: 1 }}
              />
              <Select
                label="Zulip Account"
                placeholder="Select Zulip user"
                size="sm"
                value={mappingZulipEmail}
                onChange={setMappingZulipEmail}
                nothingFoundMessage="No Zulip users found"
                data={
                  zulipUsersQuery.data?.map((u) => ({
                    value: u.email,
                    label: `${u.full_name} (${u.email})`,
                  })) ?? []
                }
                searchable
                style={{ flex: 1 }}
              />
              <Button
                size="sm"
                variant="light"
                leftSection={<IconLink size={14} />}
                disabled={!mappingUserId || !mappingZulipEmail}
                loading={mapUserMutation.isPending}
                onClick={() => {
                  if (mappingUserId && mappingZulipEmail) {
                    mapUserMutation.mutate({
                      integrationId: status.integrationId,
                      userId: mappingUserId,
                      zulipEmail: mappingZulipEmail,
                    });
                  }
                }}
              >
                Link
              </Button>
            </Group>
          );
        })()}
      </Stack>
    );
  }

  // Not configured state
  return (
    <>
      <Button variant="light" onClick={openSetup}>
        Connect Zulip
      </Button>

      <Modal
        opened={setupOpened}
        onClose={() => {
          closeSetup();
          resetForm();
        }}
        title="Connect Zulip"
        size="md"
      >
        <Stack gap="md">
          <Text size="sm" className="text-text-muted">
            Create a bot in your Zulip organization settings and enter its
            credentials below.
          </Text>

          <TextInput
            label="Server URL"
            placeholder="https://your-org.zulipchat.com"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.currentTarget.value)}
            required
          />
          <TextInput
            label="Bot Email"
            placeholder="bot@your-org.zulipchat.com"
            value={botEmail}
            onChange={(e) => setBotEmail(e.currentTarget.value)}
            required
          />
          <PasswordInput
            label="API Token"
            placeholder="Enter bot API key"
            value={apiToken}
            onChange={(e) => setApiToken(e.currentTarget.value)}
            required
          />

          <TextInput
            label="Default Stream (optional)"
            placeholder="general"
            value={defaultStream ?? ""}
            onChange={(e) => setDefaultStream(e.currentTarget.value || null)}
          />
          <TextInput
            label="Default Topic (optional)"
            placeholder="Notifications"
            value={defaultTopic}
            onChange={(e) => setDefaultTopic(e.currentTarget.value)}
          />

          {testResult && (
            <Alert
              color={testResult.success ? "green" : "red"}
              icon={testResult.success ? <IconCheck size={16} /> : <IconX size={16} />}
            >
              {testResult.message}
            </Alert>
          )}

          {createMutation.error && (
            <Alert color="red" icon={<IconX size={16} />}>
              {createMutation.error.message}
            </Alert>
          )}

          <Group justify="flex-end" gap="sm">
            <Button
              variant="subtle"
              onClick={handleTestConnection}
              loading={isTesting}
            >
              Test Connection
            </Button>
            <Button
              onClick={handleSave}
              loading={createMutation.isPending}
              disabled={!serverUrl || !botEmail || !apiToken}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
