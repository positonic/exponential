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
  CopyButton,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconForms,
  IconPlus,
  IconCopy,
  IconCheck,
  IconExternalLink,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';

export default function CrmFormsPage() {
  const { workspaceId, isLoading: wsLoading } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();

  const formsQuery = api.form.list.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId },
  );

  const [createOpened, { open: openCreate, close: closeCreate }] =
    useDisclosure(false);
  const [newName, setNewName] = useState('');

  const create = api.form.create.useMutation({
    onSuccess: ({ id }) => {
      closeCreate();
      setNewName('');
      router.push(`${pathname}/${id}`);
    },
    onError: (error) =>
      notifications.show({
        title: 'Could not create form',
        message: error.message,
        color: 'red',
      }),
  });

  if (wsLoading || !workspaceId) return <Loader />;

  const forms = formsQuery.data ?? [];
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <Stack gap="lg" p="md">
      <Group justify="space-between" align="flex-start">
        <Box>
          <Title order={2}>Forms</Title>
          <Text c="dimmed" size="sm">
            Public forms whose submissions can create CRM contacts and fire
            automations.
          </Text>
        </Box>
        <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
          Create new form
        </Button>
      </Group>

      {formsQuery.isLoading ? (
        <Loader />
      ) : forms.length === 0 ? (
        <Card withBorder padding="xl">
          <Stack align="center" gap="sm">
            <ThemeIcon size="xl" variant="light">
              <IconForms />
            </ThemeIcon>
            <Text fw={600}>No forms yet</Text>
            <Text c="dimmed" size="sm" ta="center">
              Create a form, add fields, wire a “Create CRM contact” destination,
              and share its public link.
            </Text>
          </Stack>
        </Card>
      ) : (
        <Stack gap="sm">
          {forms.map((form) => {
            const publicUrl = `${origin}/f/${form.slug}`;
            return (
              <Card
                key={form.id}
                withBorder
                padding="md"
                style={{ cursor: 'pointer' }}
                onClick={() => router.push(`${pathname}/${form.id}`)}
              >
                <Group justify="space-between" align="flex-start">
                  <Box>
                    <Group gap="xs">
                      <Text fw={600}>{form.name}</Text>
                      <Badge
                        color={form.isActive ? 'green' : 'gray'}
                        variant="light"
                      >
                        {form.isActive ? 'active' : 'inactive'}
                      </Badge>
                    </Group>
                    <Text c="dimmed" size="sm" mt={4}>
                      /f/{form.slug}
                    </Text>
                  </Box>
                  <Group
                    gap="xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Badge variant="outline">
                      {form._count.submissions}{' '}
                      {form._count.submissions === 1
                        ? 'submission'
                        : 'submissions'}
                    </Badge>
                    <CopyButton value={publicUrl}>
                      {({ copied, copy }) => (
                        <Tooltip label={copied ? 'Copied' : 'Copy public link'}>
                          <ActionIcon variant="subtle" onClick={copy}>
                            {copied ? (
                              <IconCheck size={16} />
                            ) : (
                              <IconCopy size={16} />
                            )}
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </CopyButton>
                    <Tooltip label="Open public form">
                      <ActionIcon
                        variant="subtle"
                        component="a"
                        href={publicUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <IconExternalLink size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>
              </Card>
            );
          })}
        </Stack>
      )}

      <Modal opened={createOpened} onClose={closeCreate} title="Create new form">
        <Stack gap="sm">
          <TextInput
            label="Form name"
            placeholder="e.g. Job Application"
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
