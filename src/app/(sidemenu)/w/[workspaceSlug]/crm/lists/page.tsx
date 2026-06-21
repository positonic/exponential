'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
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
  Modal,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconListDetails, IconPlus } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';

export default function CrmListsPage() {
  const { workspaceId, isLoading: wsLoading } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();

  const listsQuery = api.collection.list.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId },
  );

  const [createOpened, { open: openCreate, close: closeCreate }] =
    useDisclosure(false);
  const [newName, setNewName] = useState('');

  const create = api.collection.create.useMutation({
    onSuccess: ({ id }) => {
      closeCreate();
      setNewName('');
      router.push(`${pathname}/${id}`);
    },
    onError: (error) =>
      notifications.show({
        title: 'Could not create list',
        message: error.message,
        color: 'red',
      }),
  });

  if (wsLoading || !workspaceId) return <Loader />;

  const lists = listsQuery.data ?? [];

  return (
    <Stack gap="lg" p="md">
      <Group justify="space-between" align="flex-start">
        <Box>
          <Title order={2}>Lists</Title>
          <Text c="dimmed" size="sm">
            Curated lists of contacts — the audience a Broadcast sends to.
          </Text>
        </Box>
        <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
          Create list
        </Button>
      </Group>

      {listsQuery.isLoading ? (
        <Loader />
      ) : lists.length === 0 ? (
        <Card withBorder padding="xl">
          <Stack align="center" gap="sm">
            <ThemeIcon size="xl" variant="light">
              <IconListDetails />
            </ThemeIcon>
            <Text fw={600}>No lists yet</Text>
            <Text c="dimmed" size="sm" ta="center">
              Create a list, add contacts to it, then point a Broadcast at it.
            </Text>
          </Stack>
        </Card>
      ) : (
        <Stack gap="sm">
          {lists.map((list) => (
            <Card
              key={list.id}
              withBorder
              padding="md"
              style={{ cursor: 'pointer' }}
              onClick={() => router.push(`${pathname}/${list.id}`)}
            >
              <Group justify="space-between" align="center">
                <Text fw={600}>{list.name}</Text>
                <Badge variant="light">{list.memberType}</Badge>
              </Group>
            </Card>
          ))}
        </Stack>
      )}

      <Modal opened={createOpened} onClose={closeCreate} title="Create list">
        <Stack gap="sm">
          <TextInput
            label="List name"
            placeholder="e.g. Product update subscribers"
            value={newName}
            onChange={(e) => setNewName(e.currentTarget.value)}
          />
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={closeCreate}>
              Cancel
            </Button>
            <Button
              loading={create.isPending}
              disabled={!newName.trim()}
              onClick={() =>
                create.mutate({ workspaceId, name: newName.trim() })
              }
            >
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
