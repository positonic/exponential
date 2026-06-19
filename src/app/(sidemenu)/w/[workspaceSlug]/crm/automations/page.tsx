'use client';

import { useEffect, useRef, useState } from 'react';
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
  Divider,
  Select,
  Modal,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconBolt, IconPlus } from '@tabler/icons-react';
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

  // Seed the two starter automations once if the workspace has none yet.
  const ensureDefaults = api.crmAutomation.ensureDefaults.useMutation({
    onSuccess: () => void utils.crmAutomation.list.invalidate(),
  });
  const ensuredRef = useRef(false);
  useEffect(() => {
    if (!workspaceId || ensuredRef.current) return;
    ensuredRef.current = true;
    ensureDefaults.mutate({ workspaceId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

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
    <Stack gap="lg" p="md">
      <Group justify="space-between" align="flex-start">
        <Box>
          <Title order={2}>Automations</Title>
          <Text c="dimmed" size="sm">
            Onboarding automations run when a contact&apos;s Customer type is set.
          </Text>
        </Box>
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
      </Group>

      {automationsQuery.isLoading ? (
        <Loader />
      ) : automations.length === 0 ? (
        <Card withBorder padding="xl">
          <Stack align="center" gap="sm">
            <ThemeIcon size="xl" variant="light">
              <IconBolt />
            </ThemeIcon>
            <Text fw={600}>No automations yet</Text>
            <Text c="dimmed" size="sm" ta="center">
              Create an automation, then add a contact with that Customer type to
              trigger one.
            </Text>
          </Stack>
        </Card>
      ) : (
        <Stack gap="sm">
          {automations.map((automation) => (
            <Card
              key={automation.id}
              withBorder
              padding="md"
              style={{ cursor: 'pointer' }}
              onClick={() => router.push(`${pathname}/${automation.id}`)}
            >
              <Group justify="space-between" align="flex-start">
                <Box>
                  <Group gap="xs">
                    <Text fw={600}>{automation.name}</Text>
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
                  <Text c="dimmed" size="sm" mt={4}>
                    {automation.steps.length > 0
                      ? automation.steps.map((step) => step.label).join('  →  ')
                      : 'No steps yet'}
                  </Text>
                </Box>
                <Badge variant="outline">
                  {automation._count.runs}{' '}
                  {automation._count.runs === 1 ? 'run' : 'runs'}
                </Badge>
              </Group>
            </Card>
          ))}
        </Stack>
      )}

      <Divider label="Recent runs" labelPosition="left" />

      {runsQuery.isLoading ? (
        <Loader />
      ) : runs.length === 0 ? (
        <Text c="dimmed" size="sm">
          No runs yet. Add a contact with a matching Customer type to trigger one.
        </Text>
      ) : (
        <Stack gap="xs">
          {runs.map((run) => (
            <Card key={run.id} withBorder padding="sm">
              <Group justify="space-between" align="flex-start">
                <Box>
                  <Group gap="xs">
                    <Text fw={500} size="sm">
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
                  <Text c="dimmed" size="xs" mt={2}>
                    {new Date(run.startedAt).toLocaleString()}
                  </Text>
                </Box>
                <Group gap={6}>
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
              </Group>
              {run.errorMessage ? (
                <Text c="red" size="xs" mt={4}>
                  {run.errorMessage}
                </Text>
              ) : null}
            </Card>
          ))}
        </Stack>
      )}

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
    </Stack>
  );
}
