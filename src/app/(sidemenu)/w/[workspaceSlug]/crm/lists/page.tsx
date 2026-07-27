'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Title,
  Text,
  Button,
  Badge,
  Group,
  Stack,
  Loader,
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
    <div className="-m-6 flex h-full flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-border-primary bg-background-primary px-4 py-3">
        <div>
          <Title order={3} className="text-text-primary">
            Lists
          </Title>
          <Text size="sm" className="text-text-muted">
            Curated lists of contacts — the audience a Broadcast sends to.
          </Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
          Create list
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {listsQuery.isLoading ? (
          <div className="p-6">
            <Loader />
          </div>
        ) : lists.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
            <ThemeIcon size="xl" variant="light">
              <IconListDetails />
            </ThemeIcon>
            <Text fw={600} className="text-text-primary">
              No lists yet
            </Text>
            <Text size="sm" className="max-w-sm text-text-muted">
              Create a list, add contacts to it, then point a Broadcast at it.
            </Text>
          </div>
        ) : (
          <div>
            {lists.map((list) => (
              <div
                key={list.id}
                role="button"
                tabIndex={0}
                className="flex cursor-pointer items-center justify-between gap-4 border-b border-border-primary px-4 py-3 transition-colors hover:bg-surface-hover"
                onClick={() => router.push(`${pathname}/${list.id}`)}
              >
                <Text fw={600} className="text-text-primary">
                  {list.name}
                </Text>
                <Badge variant="light">{list.memberType}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>

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
    </div>
  );
}
