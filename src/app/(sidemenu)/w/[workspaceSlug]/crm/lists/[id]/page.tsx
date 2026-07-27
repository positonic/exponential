'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Title,
  Text,
  Button,
  Card,
  Badge,
  Group,
  Stack,
  Loader,
  Box,
  ThemeIcon,
  MultiSelect,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { IconUsers, IconPlus, IconTrash, IconBolt } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';

function runStatusColor(status: string): string {
  switch (status) {
    case 'SUCCESS':
      return 'green';
    case 'FAILED':
      return 'red';
    case 'RUNNING':
      return 'blue';
    default:
      return 'gray';
  }
}

export default function CrmListDetailPage() {
  const { workspaceId, isLoading: wsLoading } = useWorkspace();
  const params = useParams<{ id: string }>();
  const collectionId = params.id;
  const utils = api.useUtils();

  const [toAdd, setToAdd] = useState<string[]>([]);

  const membersQuery = api.collection.members.useQuery(
    { workspaceId: workspaceId ?? '', collectionId },
    { enabled: !!workspaceId },
  );

  const contactsQuery = api.crmContact.getAll.useQuery(
    { workspaceId: workspaceId ?? '', limit: 100 },
    { enabled: !!workspaceId },
  );

  const automationsQuery = api.listAutomation.list.useQuery(
    { workspaceId: workspaceId ?? '', collectionId },
    { enabled: !!workspaceId },
  );

  const runsQuery = api.listAutomation.runs.useQuery(
    { workspaceId: workspaceId ?? '', collectionId, limit: 10 },
    { enabled: !!workspaceId },
  );

  const invalidate = () =>
    utils.collection.members.invalidate({
      workspaceId: workspaceId ?? '',
      collectionId,
    });

  const addMembers = api.collection.addMembers.useMutation({
    onSuccess: async () => {
      setToAdd([]);
      await invalidate();
      // Adding a member may have fired a list_member_added Automation — refresh
      // the runs so the user sees it land.
      await utils.listAutomation.runs.invalidate({
        workspaceId: workspaceId ?? '',
        collectionId,
      });
    },
    onError: (e) =>
      notifications.show({ title: 'Could not add', message: e.message, color: 'red' }),
  });

  const removeMember = api.collection.removeMember.useMutation({
    onSuccess: invalidate,
    onError: (e) =>
      notifications.show({ title: 'Could not remove', message: e.message, color: 'red' }),
  });

  if (wsLoading || !workspaceId) return <Loader />;

  const members = membersQuery.data ?? [];
  const memberIds = new Set(members.map((m) => m.memberId));
  const contacts = contactsQuery.data?.contacts ?? [];
  const options = contacts
    .filter((c) => !memberIds.has(c.id))
    .map((c) => ({
      value: c.id,
      label:
        [c.firstName, c.lastName].filter(Boolean).join(' ').trim() ||
        'Unnamed contact',
    }));

  const automations = automationsQuery.data ?? [];
  const runs = runsQuery.data ?? [];

  return (
    <Stack gap="lg" p="md">
      <Box>
        <Title order={2}>List members</Title>
        <Text c="dimmed" size="sm">
          Contacts on this list. Opted-out contacts are still listed here but are
          skipped when a Broadcast sends.
        </Text>
      </Box>

      <Card withBorder padding="md">
        <Group gap="xs" mb="xs">
          <ThemeIcon size="sm" variant="light" color="yellow">
            <IconBolt size={14} />
          </ThemeIcon>
          <Text fw={600}>Automations</Text>
          <Text c="dimmed" size="sm">
            run when a contact is added to this list
          </Text>
        </Group>

        {automationsQuery.isLoading ? (
          <Loader size="sm" />
        ) : automations.length === 0 ? (
          <Text c="dimmed" size="sm">
            No automations are wired to this list yet.
          </Text>
        ) : (
          <Stack gap="xs">
            {automations.map((a) => (
              <Group key={a.id} justify="space-between" align="center" wrap="nowrap">
                <Box>
                  <Group gap="xs">
                    <Text fw={500}>{a.name}</Text>
                    <Badge
                      size="sm"
                      variant="light"
                      color={a.isActive ? 'green' : 'gray'}
                    >
                      {a.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </Group>
                  <Text c="dimmed" size="sm">
                    {a.steps.length > 0
                      ? a.steps.map((s) => s.label).join(' → ')
                      : 'No steps yet'}
                  </Text>
                </Box>
                <Text c="dimmed" size="sm" style={{ whiteSpace: 'nowrap' }}>
                  {a._count.runs} {a._count.runs === 1 ? 'run' : 'runs'}
                </Text>
              </Group>
            ))}

            {runs.length > 0 && (
              <Box mt="xs">
                <Text c="dimmed" size="xs" tt="uppercase" fw={600} mb={4}>
                  Recent runs
                </Text>
                <Stack gap={4}>
                  {runs.map((r) => (
                    <Group key={r.id} gap="xs" wrap="nowrap">
                      <Badge size="xs" variant="light" color={runStatusColor(r.status)}>
                        {r.status}
                      </Badge>
                      <Text size="sm">{r.definition.name}</Text>
                      <Text c="dimmed" size="xs">
                        {new Date(r.startedAt).toLocaleString()}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        )}
      </Card>

      <Card withBorder padding="md">
        <Group align="flex-end" gap="sm">
          <MultiSelect
            label="Add contacts"
            placeholder="Search contacts…"
            data={options}
            value={toAdd}
            onChange={setToAdd}
            searchable
            style={{ flex: 1 }}
            nothingFoundMessage="No matching contacts"
          />
          <Button
            leftSection={<IconPlus size={16} />}
            loading={addMembers.isPending}
            disabled={toAdd.length === 0}
            onClick={() =>
              addMembers.mutate({
                workspaceId,
                collectionId,
                memberIds: toAdd,
              })
            }
          >
            Add
          </Button>
        </Group>
      </Card>

      {membersQuery.isLoading ? (
        <Loader />
      ) : members.length === 0 ? (
        <Card withBorder padding="xl">
          <Stack align="center" gap="sm">
            <ThemeIcon size="xl" variant="light">
              <IconUsers />
            </ThemeIcon>
            <Text fw={600}>No members yet</Text>
            <Text c="dimmed" size="sm">
              Add contacts above to build this list.
            </Text>
          </Stack>
        </Card>
      ) : (
        <Stack gap="xs">
          {members.map((m) => (
            <Card key={m.memberId} withBorder padding="sm">
              <Group justify="space-between" align="center">
                <Box>
                  <Text fw={500}>{m.label}</Text>
                  {m.email && (
                    <Text c="dimmed" size="sm">
                      {m.email}
                    </Text>
                  )}
                </Box>
                <Tooltip label="Remove from list">
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    loading={removeMember.isPending}
                    onClick={() =>
                      removeMember.mutate({
                        workspaceId,
                        collectionId,
                        memberId: m.memberId,
                      })
                    }
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
