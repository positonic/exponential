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
  Select,
  Modal,
  TextInput,
  ActionIcon,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconBolt, IconPlus, IconTrash } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';
import { CRM_CUSTOMER_TYPE_OPTIONS } from '~/lib/crm/automationCatalog';

function statusColor(status: string): string {
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

function targetTypeOf(config: unknown): string {
  if (config && typeof config === 'object' && 'targetCustomerType' in config) {
    const value = (config as Record<string, unknown>).targetCustomerType;
    if (typeof value === 'string') return value;
  }
  return '—';
}

export default function CrmAutomationsPage() {
  const { workspaceId, isLoading: wsLoading } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const utils = api.useUtils();

  const enabled = !!workspaceId;
  const automationsQuery = api.crmAutomation.list.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled },
  );
  const runsQuery = api.crmAutomation.listRuns.useQuery(
    { workspaceId: workspaceId ?? '', limit: 20 },
    { enabled },
  );

  const remove = api.crmAutomation.remove.useMutation({
    onSuccess: () => void utils.crmAutomation.list.invalidate(),
    onError: (error) =>
      notifications.show({
        title: 'Could not delete automation',
        message: error.message,
        color: 'red',
      }),
  });

  const confirmDelete = (id: string, name: string) =>
    modals.openConfirmModal({
      title: 'Delete automation',
      children: (
        <Text size="sm">
          Delete <strong>{name}</strong>? This removes the automation and its run
          history and can&apos;t be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate({ id }),
    });

  const [createOpened, { open: openCreate, close: closeCreate }] =
    useDisclosure(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<string | null>(null);

  const create = api.crmAutomation.create.useMutation({
    onSuccess: ({ id }) => {
      closeCreate();
      setNewName('');
      setNewType(null);
      router.push(`${pathname}/${id}`);
    },
    onError: (error) =>
      notifications.show({
        title: 'Could not create automation',
        message: error.message,
        color: 'red',
      }),
  });

  if (wsLoading || !workspaceId) {
    return <Loader />;
  }

  const automations = automationsQuery.data ?? [];
  const runs = runsQuery.data ?? [];

  return (
    <div className="-m-6 flex h-full flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-border-primary bg-background-primary px-4 py-3">
        <div>
          <Title order={3} className="text-text-primary">
            Automations
          </Title>
          <Text size="sm" className="text-text-muted">
            Onboarding automations run when a contact&apos;s Customer type is set.
          </Text>
        </div>
        <Group gap="sm">
          <Select
            placeholder="Open an automation…"
            searchable
            w={240}
            data={automations.map((a) => ({ value: a.id, label: a.name }))}
            value={null}
            onChange={(id) => {
              if (id) router.push(`${pathname}/${id}`);
            }}
          />
          <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
            Create new automation
          </Button>
        </Group>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {automationsQuery.isLoading ? (
          <div className="p-6">
            <Loader />
          </div>
        ) : automations.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
            <ThemeIcon size="xl" variant="light">
              <IconBolt />
            </ThemeIcon>
            <Text fw={600} className="text-text-primary">
              No automations yet
            </Text>
            <Text size="sm" className="max-w-sm text-text-muted">
              Create an automation, then add a contact with that Customer type to
              trigger one.
            </Text>
          </div>
        ) : (
          <div>
            {automations.map((automation) => (
              <div
                key={automation.id}
                role="button"
                tabIndex={0}
                className="flex cursor-pointer items-center justify-between gap-4 border-b border-border-primary px-4 py-3 transition-colors hover:bg-surface-hover"
                onClick={() => router.push(`${pathname}/${automation.id}`)}
              >
                <div className="min-w-0">
                  <Group gap="xs">
                    <Text fw={600} className="text-text-primary">
                      {automation.name}
                    </Text>
                    <Badge variant="light">
                      {targetTypeOf(automation.config)}
                    </Badge>
                    <Badge
                      color={automation.isActive ? 'green' : 'gray'}
                      variant="light"
                    >
                      {automation.isActive ? 'active' : 'inactive'}
                    </Badge>
                  </Group>
                  <Text size="sm" mt={4} className="truncate text-text-muted">
                    {automation.steps.length > 0
                      ? automation.steps.map((step) => step.label).join('  →  ')
                      : 'No steps yet'}
                  </Text>
                </div>
                <Group gap="sm" wrap="nowrap">
                  <Badge variant="outline">
                    {automation._count.runs}{' '}
                    {automation._count.runs === 1 ? 'run' : 'runs'}
                  </Badge>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label={`Delete ${automation.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      confirmDelete(automation.id, automation.name);
                    }}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </div>
            ))}
          </div>
        )}

        {/* Recent runs */}
        <div className="border-b border-border-primary bg-background-primary px-4 py-2">
          <Text
            size="xs"
            fw={600}
            className="uppercase tracking-wider text-text-muted"
          >
            Recent runs
          </Text>
        </div>
        {runsQuery.isLoading ? (
          <div className="p-4">
            <Loader />
          </div>
        ) : runs.length === 0 ? (
          <Text size="sm" className="px-4 py-3 text-text-muted">
            No runs yet. Add a contact with a matching Customer type to trigger
            one.
          </Text>
        ) : (
          <div>
            {runs.map((run) => (
              <div
                key={run.id}
                className="border-b border-border-primary px-4 py-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Group gap="xs">
                      <Text fw={500} size="sm" className="text-text-primary">
                        {run.definition.name}
                      </Text>
                      <Badge
                        size="sm"
                        color={statusColor(run.status)}
                        variant="light"
                      >
                        {run.status}
                      </Badge>
                    </Group>
                    <Text size="xs" mt={2} className="text-text-muted">
                      {new Date(run.startedAt).toLocaleString()}
                    </Text>
                  </div>
                  <Group gap={6} wrap="nowrap">
                    {run.stepRuns.map((step) => (
                      <Badge
                        key={step.id}
                        size="xs"
                        color={statusColor(step.status)}
                        variant="dot"
                      >
                        {step.status}
                      </Badge>
                    ))}
                  </Group>
                </div>
                {run.errorMessage ? (
                  <Text size="xs" mt={4} c="red">
                    {run.errorMessage}
                  </Text>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        opened={createOpened}
        onClose={closeCreate}
        title="Create new automation"
      >
        <Stack gap="sm">
          <TextInput
            label="Name"
            placeholder="e.g. Investor onboarding"
            value={newName}
            onChange={(e) => setNewName(e.currentTarget.value)}
          />
          <Select
            label="Trigger — when Customer type is set to"
            placeholder="Select a Customer type"
            searchable
            data={CRM_CUSTOMER_TYPE_OPTIONS}
            value={newType}
            onChange={setNewType}
          />
          <Text c="dimmed" size="xs">
            The automation opens in the builder and starts inactive until you add
            steps and activate it.
          </Text>
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={closeCreate}>
              Cancel
            </Button>
            <Button
              loading={create.isPending}
              disabled={!newName.trim() || !newType}
              onClick={() =>
                create.mutate({
                  workspaceId,
                  name: newName.trim(),
                  targetCustomerType: newType ?? '',
                })
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
