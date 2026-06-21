'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Title,
  Text,
  Button,
  Card,
  Group,
  Stack,
  Loader,
  Box,
  ThemeIcon,
  MultiSelect,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { IconUsers, IconPlus, IconTrash } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';

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

  const invalidate = () =>
    utils.collection.members.invalidate({
      workspaceId: workspaceId ?? '',
      collectionId,
    });

  const addMembers = api.collection.addMembers.useMutation({
    onSuccess: async () => {
      setToAdd([]);
      await invalidate();
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
