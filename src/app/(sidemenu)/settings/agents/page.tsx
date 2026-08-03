'use client';

import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Code,
  CopyButton,
  Group,
  Modal,
  Paper,
  Select,
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
  IconKey,
  IconPlus,
  IconRobotFace,
  IconTrash,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';

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
  const [grantWorkspaceId, setGrantWorkspaceId] = useState<string | null>(null);

  const invalidate = () => utils.externalAgent.list.invalidate();

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

  const grantWorkspace = api.externalAgent.grantWorkspace.useMutation({
    onSuccess: async () => {
      setGrantAgentId(null);
      setGrantWorkspaceId(null);
      await invalidate();
    },
    onError: (error) =>
      notifications.show({ title: 'Could not add to workspace', message: error.message, color: 'red' }),
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

  const closeKeyModal = () => {
    setKeyModalAgentId(null);
    setGeneratedSecret(null);
    keyForm.reset();
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
                <IconRobotFace size={20} />
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
        title={generatedSecret ? 'Copy your key now' : 'New agent key'}
      >
        {generatedSecret ? (
          <Stack>
            <Alert icon={<IconAlertCircle size={16} />} color="yellow">
              This is the only time the key is shown. Store it in your agent&apos;s
              configuration — if you lose it, revoke it and create a new one.
            </Alert>
            <Group wrap="nowrap" gap="xs">
              <Code block style={{ flex: 1, wordBreak: 'break-all' }}>
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

      {/* Grant workspace */}
      <Modal
        opened={grantAgentId !== null}
        onClose={() => {
          setGrantAgentId(null);
          setGrantWorkspaceId(null);
        }}
        title="Add agent to workspace"
      >
        <Stack>
          <Text size="sm" c="dimmed">
            The agent joins as a member. You can only add it to workspaces where you have
            at least member access, and it loses access if you do.
          </Text>
          <Select
            label="Workspace"
            placeholder="Pick a workspace"
            data={workspaces.map((ws) => ({ value: ws.id, label: ws.name }))}
            value={grantWorkspaceId}
            onChange={setGrantWorkspaceId}
          />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setGrantAgentId(null);
                setGrantWorkspaceId(null);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!grantWorkspaceId}
              loading={grantWorkspace.isPending}
              onClick={() => {
                if (grantAgentId && grantWorkspaceId) {
                  grantWorkspace.mutate({ agentId: grantAgentId, workspaceId: grantWorkspaceId });
                }
              }}
            >
              Add
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
