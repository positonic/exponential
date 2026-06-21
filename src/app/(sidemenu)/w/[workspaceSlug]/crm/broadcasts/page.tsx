'use client';

import { useState } from 'react';
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
  Select,
  NumberInput,
  Switch,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconBroadcast, IconPlus, IconSend } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';

export default function CrmBroadcastsPage() {
  const { workspaceId, isLoading: wsLoading } = useWorkspace();
  const utils = api.useUtils();

  const broadcastsQuery = api.broadcast.list.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId },
  );
  const listsQuery = api.collection.list.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId },
  );

  const [createOpened, { open: openCreate, close: closeCreate }] =
    useDisclosure(false);
  const [name, setName] = useState('What Shipped Today');
  const [subject, setSubject] = useState('What Shipped Today');
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [hour, setHour] = useState<number>(8);

  const invalidate = () =>
    utils.broadcast.list.invalidate({ workspaceId: workspaceId ?? '' });

  const create = api.broadcast.create.useMutation({
    onSuccess: async () => {
      closeCreate();
      setCollectionId(null);
      await invalidate();
    },
    onError: (e) =>
      notifications.show({ title: 'Could not create', message: e.message, color: 'red' }),
  });

  const setActive = api.broadcast.setActive.useMutation({
    onSuccess: invalidate,
    onError: (e) =>
      notifications.show({ title: 'Could not update', message: e.message, color: 'red' }),
  });

  const testSend = api.broadcast.testSend.useMutation({
    onSuccess: (res) =>
      notifications.show({
        title: res.skipped ? 'Nothing to send' : 'Test sent',
        message: res.skipped
          ? (res.reason ?? 'No user-facing changes in the window.')
          : 'A test digest was emailed to you.',
        color: res.skipped ? 'yellow' : 'green',
      }),
    onError: (e) =>
      notifications.show({ title: 'Test send failed', message: e.message, color: 'red' }),
  });

  if (wsLoading || !workspaceId) return <Loader />;

  const broadcasts = broadcastsQuery.data ?? [];
  const lists = listsQuery.data ?? [];
  const listOptions = lists.map((l) => ({ value: l.id, label: l.name }));

  return (
    <Stack gap="lg" p="md">
      <Group justify="space-between" align="flex-start">
        <Box>
          <Title order={2}>Broadcasts</Title>
          <Text c="dimmed" size="sm">
            Scheduled emails to a List — e.g. a daily “What Shipped Today” digest
            from your repos. Draft until you activate.
          </Text>
        </Box>
        <Group>
          <Button
            variant="default"
            leftSection={<IconSend size={16} />}
            loading={testSend.isPending}
            onClick={() => testSend.mutate({ workspaceId })}
          >
            Send test to me
          </Button>
          <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
            Create broadcast
          </Button>
        </Group>
      </Group>

      {broadcastsQuery.isLoading ? (
        <Loader />
      ) : broadcasts.length === 0 ? (
        <Card withBorder padding="xl">
          <Stack align="center" gap="sm">
            <ThemeIcon size="xl" variant="light">
              <IconBroadcast />
            </ThemeIcon>
            <Text fw={600}>No broadcasts yet</Text>
            <Text c="dimmed" size="sm" ta="center">
              Create a broadcast, point it at a List, and activate it to start the
              daily send.
            </Text>
          </Stack>
        </Card>
      ) : (
        <Stack gap="sm">
          {broadcasts.map((b) => (
            <Card key={b.id} withBorder padding="md">
              <Group justify="space-between" align="center">
                <Box>
                  <Group gap="xs">
                    <Text fw={600}>{b.name}</Text>
                    <Badge color={b.isActive ? 'green' : 'gray'} variant="light">
                      {b.isActive ? 'active' : 'draft'}
                    </Badge>
                  </Group>
                  {b.lastRunAt && (
                    <Text c="dimmed" size="sm" mt={4}>
                      Last run {new Date(b.lastRunAt).toLocaleString()}
                    </Text>
                  )}
                </Box>
                <Switch
                  checked={b.isActive}
                  label={b.isActive ? 'Active' : 'Draft'}
                  onChange={(e) =>
                    setActive.mutate({
                      workspaceId,
                      id: b.id,
                      isActive: e.currentTarget.checked,
                    })
                  }
                />
              </Group>
            </Card>
          ))}
        </Stack>
      )}

      <Modal
        opened={createOpened}
        onClose={closeCreate}
        title="Create broadcast"
      >
        <Stack gap="sm">
          <TextInput
            label="Name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <TextInput
            label="Email subject"
            value={subject}
            onChange={(e) => setSubject(e.currentTarget.value)}
          />
          <Select
            label="Send to list"
            placeholder={lists.length ? 'Pick a list' : 'Create a list first'}
            data={listOptions}
            value={collectionId}
            onChange={setCollectionId}
            searchable
          />
          <NumberInput
            label="Daily send hour (UTC)"
            min={0}
            max={23}
            value={hour}
            onChange={(v) => setHour(typeof v === 'number' ? v : 8)}
          />
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={closeCreate}>
              Cancel
            </Button>
            <Button
              loading={create.isPending}
              disabled={!name.trim() || !collectionId}
              onClick={() =>
                create.mutate({
                  workspaceId,
                  name: name.trim(),
                  subject: subject.trim() || undefined,
                  collectionId: collectionId!,
                  cadence: { kind: 'daily', hour },
                })
              }
            >
              Create draft
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
