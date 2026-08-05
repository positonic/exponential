'use client';

import { useState } from 'react';
import {
  Alert,
  Anchor,
  Avatar,
  Badge,
  Button,
  Code,
  CopyButton,
  FileButton,
  Group,
  Modal,
  MultiSelect,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
  ActionIcon,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import {
  IconAlertCircle,
  IconCheck,
  IconCopy,
  IconCamera,
  IconKey,
  IconPlus,
  IconRobotFace,
  IconTrash,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ACCEPTED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * External agents (ADR-0049): user-owned principals for third-party autonomous
 * software (Hermes etc.). Owners create agents, mint display-once keys, and
 * grant workspace access at role `member` — capped by their own membership.
 */
export default function ExternalAgentsPage() {
  const utils = api.useUtils();
  const { data: agents = [], isLoading } = api.externalAgent.list.useQuery();
  const { data: workspaces = [] } = api.workspace.list.useQuery();

  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [keyModalAgentId, setKeyModalAgentId] = useState<string | null>(null);
  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null);
  const [grantAgentId, setGrantAgentId] = useState<string | null>(null);
  const [grantWorkspaceIds, setGrantWorkspaceIds] = useState<string[]>([]);

  const invalidate = () => utils.externalAgent.list.invalidate();

  const closeGrantModal = () => {
    setGrantAgentId(null);
    setGrantWorkspaceIds([]);
  };

  const createAgent = api.externalAgent.create.useMutation({
    onSuccess: async () => {
      closeCreate();
      createForm.reset();
      await invalidate();
    },
    onError: (error) =>
      notifications.show({ title: 'Could not create agent', message: error.message, color: 'red' }),
  });

  const deleteAgent = api.externalAgent.delete.useMutation({
    onSuccess: async () => invalidate(),
    onError: (error) =>
      notifications.show({ title: 'Could not delete agent', message: error.message, color: 'red' }),
  });

  const uploadAvatar = api.externalAgent.uploadAvatar.useMutation({
    onSuccess: async () => {
      await invalidate();
      notifications.show({
        title: 'Avatar uploaded',
        message: 'The agent avatar is now used across Exponential.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    },
    onError: (error) =>
      notifications.show({
        title: 'Could not upload avatar',
        message: error.message,
        color: 'red',
      }),
  });

  const createKey = api.externalAgent.createKey.useMutation({
    onSuccess: async (data) => {
      setGeneratedSecret(data.secret);
      keyForm.reset();
      await invalidate();
    },
    onError: (error) =>
      notifications.show({ title: 'Could not create key', message: error.message, color: 'red' }),
  });

  const revokeKey = api.externalAgent.revokeKey.useMutation({
    onSuccess: async () => invalidate(),
    onError: (error) =>
      notifications.show({ title: 'Could not revoke key', message: error.message, color: 'red' }),
  });

  const grantWorkspaces = api.externalAgent.grantWorkspaces.useMutation({
    onSuccess: async () => {
      closeGrantModal();
      await invalidate();
    },
    onError: (error) =>
      notifications.show({ title: 'Could not add to workspaces', message: error.message, color: 'red' }),
  });

  const revokeWorkspace = api.externalAgent.revokeWorkspace.useMutation({
    onSuccess: async () => invalidate(),
    onError: (error) =>
      notifications.show({ title: 'Could not remove from workspace', message: error.message, color: 'red' }),
  });

  const createForm = useForm({
    initialValues: { name: '', description: '' },
    validate: {
      name: (value) => (value.trim().length === 0 ? 'Name is required' : null),
    },
  });

  const keyForm = useForm({
    initialValues: { name: '' },
    validate: {
      name: (value) => (value.trim().length === 0 ? 'Key label is required' : null),
    },
  });

  // Only offer workspaces the agent isn't already in — re-granting is a no-op
  // server-side, but listing them reads as if the agent lacked access.
  const grantAgent = agents.find((agent) => agent.id === grantAgentId);
  const grantedWorkspaceIds = new Set(grantAgent?.workspaces.map((ws) => ws.id) ?? []);
  const grantableWorkspaces = workspaces.filter((ws) => !grantedWorkspaceIds.has(ws.id));
  // Membership, not a length match: the agent list can refetch while the modal is
  // open, shrinking `grantableWorkspaces` while a now-ungrantable id lingers in the
  // selection — the counts would agree without every workspace actually being picked.
  const selectedWorkspaceIds = new Set(grantWorkspaceIds);
  const allGrantableSelected =
    grantableWorkspaces.length > 0 &&
    grantableWorkspaces.every((ws) => selectedWorkspaceIds.has(ws.id));

  const closeKeyModal = () => {
    setKeyModalAgentId(null);
    setGeneratedSecret(null);
    keyForm.reset();
  };

  const handleAvatarSelect = (agentId: string, file: File | null) => {
    if (!file) return;

    if (!ACCEPTED_AVATAR_TYPES.some((type) => type === file.type)) {
      notifications.show({
        title: 'Unsupported image',
        message: 'Please choose a PNG, JPG, or WebP image.',
        color: 'red',
      });
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      notifications.show({
        title: 'File too large',
        message: 'Please choose an image no larger than 5MB.',
        color: 'red',
      });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = typeof reader.result === 'string' ? reader.result.split(',')[1] : null;
      if (!base64Data) {
        notifications.show({
          title: 'Could not read image',
          message: 'Please try another image.',
          color: 'red',
        });
        return;
      }
      uploadAvatar.mutate({
        agentId,
        base64Data,
        contentType: file.type as (typeof ACCEPTED_AVATAR_TYPES)[number],
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={3}>External agents</Title>
          <Text size="sm" c="dimmed">
            Third-party agent software (Hermes, MCP clients, scripts) acting in your workspaces
            as its own principal — its work is attributed to the agent, not to you.
          </Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
          New agent
        </Button>
      </Group>

      {!isLoading && agents.length === 0 && (
        <Paper p="xl" withBorder>
          <Stack align="center" gap="xs">
            <IconRobotFace size={32} />
            <Text fw={500}>No agents yet</Text>
            <Text size="sm" c="dimmed" ta="center">
              Create an agent, give it a key, and point your agent software at Exponential.
              It joins workspaces you choose, as a member, and everything it does is
              attributed to it.
            </Text>
          </Stack>
        </Paper>
      )}

      {agents.map((agent) => (
        <Paper key={agent.id} p="md" withBorder>
          <Stack gap="sm">
            <Group justify="space-between">
              <Group gap="xs">
                <div className="relative">
                  <Avatar src={agent.avatarUrl} size={40} radius="xl" color="brand">
                    <IconRobotFace size={20} />
                  </Avatar>
                  <FileButton
                    onChange={(file) => handleAvatarSelect(agent.id, file)}
                    accept={ACCEPTED_AVATAR_TYPES.join(',')}
                  >
                    {(props) => (
                      <Tooltip label={agent.avatarUrl ? 'Change avatar' : 'Add avatar'}>
                        <ActionIcon
                          {...props}
                          variant="filled"
                          color="brand"
                          size="xs"
                          radius="xl"
                          className="absolute -bottom-1 -right-1"
                          disabled={uploadAvatar.isPending}
                          aria-label={`Upload avatar for ${agent.name}`}
                        >
                          {uploadAvatar.isPending &&
                          uploadAvatar.variables?.agentId === agent.id ? (
                            <Loader size={10} color="white" />
                          ) : (
                            <IconCamera size={11} />
                          )}
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </FileButton>
                </div>
                <Text fw={600}>{agent.name}</Text>
                <Badge variant="light" size="sm">
                  agent
                </Badge>
              </Group>
              <Tooltip label="Delete agent (keys and workspace access are removed)">
                <ActionIcon
                  variant="subtle"
                  color="red"
                  onClick={() => deleteAgent.mutate({ agentId: agent.id })}
                  loading={deleteAgent.isPending}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
            {agent.description && (
              <Text size="sm" c="dimmed">
                {agent.description}
              </Text>
            )}

            <Group gap="xs">
              <Text size="sm" fw={500}>
                Workspaces:
              </Text>
              {agent.workspaces.length === 0 && (
                <Text size="sm" c="dimmed">
                  none — grant one so the agent can do anything
                </Text>
              )}
              {agent.workspaces.map((ws) => (
                <Badge
                  key={ws.id}
                  variant="light"
                  rightSection={
                    <ActionIcon
                      size="xs"
                      variant="transparent"
                      onClick={() =>
                        revokeWorkspace.mutate({ agentId: agent.id, workspaceId: ws.id })
                      }
                    >
                      <IconTrash size={10} />
                    </ActionIcon>
                  }
                >
                  {ws.name}
                </Badge>
              ))}
              <Button
                size="compact-xs"
                variant="light"
                leftSection={<IconPlus size={12} />}
                onClick={() => setGrantAgentId(agent.id)}
              >
                Add
              </Button>
            </Group>

            <Group justify="space-between">
              <Text size="sm" fw={500}>
                Keys
              </Text>
              <Button
                size="compact-sm"
                variant="light"
                leftSection={<IconKey size={14} />}
                onClick={() => setKeyModalAgentId(agent.id)}
              >
                New key
              </Button>
            </Group>
            {agent.keys.length > 0 && (
              /* Without a scroll container the table overflows the page on narrow
                 viewports, which inflates 100vw and pushes modals off-screen. */
              <Table.ScrollContainer minWidth={480}>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Label</Table.Th>
                      <Table.Th>Key</Table.Th>
                      <Table.Th>Last used</Table.Th>
                      <Table.Th>Expires</Table.Th>
                      <Table.Th />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {agent.keys.map((key) => (
                      <Table.Tr key={key.id}>
                        <Table.Td>{key.name}</Table.Td>
                        <Table.Td>
                          <Code>{key.keyPrefix}</Code>
                        </Table.Td>
                        <Table.Td>
                          {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'never'}
                        </Table.Td>
                        <Table.Td>
                          {key.expiresAt ? new Date(key.expiresAt).toLocaleDateString() : '—'}
                        </Table.Td>
                        <Table.Td>
                          <Tooltip label="Revoke — takes effect on the agent's next request">
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              onClick={() => revokeKey.mutate({ agentId: agent.id, keyId: key.id })}
                            >
                              <IconTrash size={14} />
                            </ActionIcon>
                          </Tooltip>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Stack>
        </Paper>
      ))}

      {/* Create agent */}
      <Modal opened={createOpened} onClose={closeCreate} title="New external agent">
        <form onSubmit={createForm.onSubmit((values) => createAgent.mutate(values))}>
          <Stack>
            <TextInput
              label="Name"
              placeholder="Hermes"
              required
              {...createForm.getInputProps('name')}
            />
            <Textarea
              label="Description"
              placeholder="What does this agent do?"
              {...createForm.getInputProps('description')}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={closeCreate}>
                Cancel
              </Button>
              <Button type="submit" loading={createAgent.isPending}>
                Create
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Create key + display-once secret */}
      <Modal
        opened={keyModalAgentId !== null}
        onClose={closeKeyModal}
        size={generatedSecret ? 'lg' : 'md'}
        title={generatedSecret ? 'Copy your key now' : 'New agent key'}
      >
        {generatedSecret ? (
          <Stack>
            <Alert icon={<IconAlertCircle size={16} />} color="yellow">
              This is the only time the key is shown. Store it in your agent&apos;s
              configuration — if you lose it, revoke it and create a new one.
            </Alert>
            <Group wrap="nowrap" align="flex-start" gap="xs">
              {/* The key is a single unbroken token: without pre-wrap the <pre>
                  keeps it on one line and grows its own scrollbar. */}
              <Code
                block
                style={{
                  flex: 1,
                  minWidth: 0,
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                  overflowX: 'hidden',
                }}
              >
                {generatedSecret}
              </Code>
              <CopyButton value={generatedSecret}>
                {({ copied, copy }) => (
                  <ActionIcon variant="light" onClick={copy}>
                    {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  </ActionIcon>
                )}
              </CopyButton>
            </Group>
            <Button onClick={closeKeyModal}>Done</Button>
          </Stack>
        ) : (
          <form
            onSubmit={keyForm.onSubmit((values) => {
              if (keyModalAgentId) {
                createKey.mutate({ agentId: keyModalAgentId, name: values.name });
              }
            })}
          >
            <Stack>
              <TextInput
                label="Label"
                placeholder="laptop"
                required
                {...keyForm.getInputProps('name')}
              />
              <Group justify="flex-end">
                <Button variant="default" onClick={closeKeyModal}>
                  Cancel
                </Button>
                <Button type="submit" loading={createKey.isPending}>
                  Create key
                </Button>
              </Group>
            </Stack>
          </form>
        )}
      </Modal>

      {/* Grant workspaces */}
      <Modal
        opened={grantAgentId !== null}
        onClose={closeGrantModal}
        title="Add agent to workspaces"
      >
        <Stack>
          <Text size="sm" c="dimmed">
            The agent joins as a member. You can only add it to workspaces where you have
            at least member access, and it loses access if you do.
          </Text>
          {grantableWorkspaces.length === 0 ? (
            <Text size="sm" c="dimmed">
              This agent is already in every workspace you can add it to.
            </Text>
          ) : (
            <Stack gap={4}>
              <Group justify="space-between" align="center" wrap="nowrap">
                <Text size="sm" fw={500}>
                  Workspaces
                </Text>
                <Anchor
                  component="button"
                  type="button"
                  size="xs"
                  onClick={() =>
                    setGrantWorkspaceIds(
                      allGrantableSelected ? [] : grantableWorkspaces.map((ws) => ws.id),
                    )
                  }
                >
                  {allGrantableSelected
                    ? 'Clear all'
                    : `Select all (${grantableWorkspaces.length})`}
                </Anchor>
              </Group>
              <MultiSelect
                aria-label="Workspaces"
                placeholder={grantWorkspaceIds.length > 0 ? undefined : 'Pick one or more workspaces'}
                data={grantableWorkspaces.map((ws) => ({ value: ws.id, label: ws.name }))}
                value={grantWorkspaceIds}
                onChange={setGrantWorkspaceIds}
                searchable
                clearable
                hidePickedOptions
              />
            </Stack>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={closeGrantModal}>
              Cancel
            </Button>
            <Button
              disabled={grantWorkspaceIds.length === 0}
              loading={grantWorkspaces.isPending}
              onClick={() => {
                if (grantAgentId && grantWorkspaceIds.length > 0) {
                  grantWorkspaces.mutate({
                    agentId: grantAgentId,
                    workspaceIds: grantWorkspaceIds,
                  });
                }
              }}
            >
              {grantWorkspaceIds.length > 1 ? `Add to ${grantWorkspaceIds.length}` : 'Add'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
