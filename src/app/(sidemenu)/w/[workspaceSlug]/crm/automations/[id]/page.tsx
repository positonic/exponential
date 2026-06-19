'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Title,
  Text,
  Button,
  Group,
  Stack,
  Loader,
  Box,
  Badge,
  Select,
  TextInput,
  Switch,
  Menu,
  ActionIcon,
  Paper,
  Anchor,
  Drawer,
  Textarea,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconPlus,
  IconTrash,
  IconArrowUp,
  IconArrowDown,
  IconBolt,
  IconSettings,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { api } from '~/trpc/react';
import {
  CRM_AUTOMATION_STEP_CATALOG,
  CRM_AUTOMATION_TRIGGER_LABEL,
  CRM_CUSTOMER_TYPE_OPTIONS,
  stepLabelForType,
} from '~/lib/crm/automationCatalog';

interface BuilderStep {
  key: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
}

interface TriggerNodeData {
  targetType: string | null;
}

interface StepNodeData {
  label: string;
  index: number;
  count: number;
  customized: boolean;
  onConfigure: (index: number) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
}

function asConfig(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cfgString(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  return typeof value === 'string' ? value : '';
}

function isStepCustomized(config: Record<string, unknown>): boolean {
  return (
    cfgString(config, 'body').trim().length > 0 ||
    cfgString(config, 'subject').trim().length > 0 ||
    cfgString(config, 'title').trim().length > 0
  );
}

function TriggerNodeComponent({ data }: NodeProps) {
  const d = data as unknown as TriggerNodeData;
  return (
    <Paper withBorder p="sm" radius="md" style={{ width: 280 }}>
      <Group gap={6} mb={4}>
        <IconBolt size={16} />
        <Text size="xs" c="dimmed" fw={600} tt="uppercase">
          Trigger
        </Text>
      </Group>
      <Text fw={600} size="sm">
        {CRM_AUTOMATION_TRIGGER_LABEL}
      </Text>
      <Badge mt={6} variant="light">
        {d.targetType ?? 'no type set'}
      </Badge>
      <Handle type="source" position={Position.Bottom} />
    </Paper>
  );
}

function StepNodeComponent({ data }: NodeProps) {
  const d = data as unknown as StepNodeData;
  return (
    <Paper withBorder p="sm" radius="md" style={{ width: 280 }}>
      <Handle type="target" position={Position.Top} />
      <Group justify="space-between" wrap="nowrap">
        <Group gap={6} wrap="nowrap">
          <Text fw={600} size="sm">
            {d.label}
          </Text>
          {d.customized && (
            <Badge size="xs" variant="light" color="blue">
              edited
            </Badge>
          )}
        </Group>
        <Group gap={2} wrap="nowrap">
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={() => d.onConfigure(d.index)}
            aria-label="Edit step content"
          >
            <IconSettings size={14} />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            size="sm"
            disabled={d.index === 0}
            onClick={() => d.onMove(d.index, -1)}
            aria-label="Move step up"
          >
            <IconArrowUp size={14} />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            size="sm"
            disabled={d.index === d.count - 1}
            onClick={() => d.onMove(d.index, 1)}
            aria-label="Move step down"
          >
            <IconArrowDown size={14} />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="red"
            size="sm"
            onClick={() => d.onRemove(d.index)}
            aria-label="Remove step"
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Group>
      </Group>
      <Handle type="source" position={Position.Bottom} />
    </Paper>
  );
}

export default function CrmAutomationBuilderPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const pathname = usePathname();
  const overviewHref = pathname.split('/').slice(0, -1).join('/');
  const utils = api.useUtils();

  const query = api.crmAutomation.get.useQuery({ id }, { enabled: !!id });

  const [name, setName] = useState('');
  const [targetType, setTargetType] = useState<string | null>(null);
  const [steps, setSteps] = useState<BuilderStep[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [configuringIndex, setConfiguringIndex] = useState<number | null>(null);

  useEffect(() => {
    const data = query.data;
    if (!data) return;
    setName(data.name);
    setTargetType(data.targetCustomerType);
    setIsActive(data.isActive);
    setIsDefault(data.isDefault);
    setSteps(
      data.steps.map((s, i) => ({
        key: `${s.id ?? 'step'}-${i}`,
        type: s.type,
        label: s.label,
        config: asConfig(s.config),
      })),
    );
    setDirty(false);
  }, [query.data]);

  const save = api.crmAutomation.saveDefinition.useMutation({
    onSuccess: () => {
      setDirty(false);
      notifications.show({ title: 'Saved', message: 'Automation saved.', color: 'green' });
      void utils.crmAutomation.get.invalidate({ id });
      void utils.crmAutomation.list.invalidate();
    },
    onError: (error) =>
      notifications.show({ title: 'Save failed', message: error.message, color: 'red' }),
  });

  const toggleActive = api.crmAutomation.setActive.useMutation({
    onSuccess: ({ isActive: next }) => {
      setIsActive(next);
      void utils.crmAutomation.get.invalidate({ id });
      void utils.crmAutomation.list.invalidate();
    },
    onError: (error) =>
      notifications.show({ title: 'Could not change status', message: error.message, color: 'red' }),
  });

  const remove = api.crmAutomation.remove.useMutation({
    onSuccess: () => {
      void utils.crmAutomation.list.invalidate();
      router.push(overviewHref);
    },
    onError: (error) =>
      notifications.show({ title: 'Could not delete', message: error.message, color: 'red' }),
  });

  const addStep = (type: string) => {
    setSteps((prev) => [
      ...prev,
      {
        key: `new-${type}-${prev.length}-${Date.now()}`,
        type,
        label: stepLabelForType(type),
        config: {},
      },
    ]);
    setDirty(true);
  };

  const updateStepConfig = (index: number, patch: Record<string, unknown>) => {
    setSteps((prev) =>
      prev.map((s, i) =>
        i === index ? { ...s, config: { ...s.config, ...patch } } : s,
      ),
    );
    setDirty(true);
  };

  const removeStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved!);
      return next;
    });
    setDirty(true);
  };

  const nodeTypes = useMemo<NodeTypes>(
    () => ({ trigger: TriggerNodeComponent, step: StepNodeComponent }),
    [],
  );

  const nodes = useMemo<Node[]>(() => {
    const triggerNode: Node = {
      id: 'trigger',
      type: 'trigger',
      position: { x: 0, y: 0 },
      data: { targetType } as unknown as Record<string, unknown>,
      draggable: false,
    };
    const stepNodes: Node[] = steps.map((step, i) => ({
      id: step.key,
      type: 'step',
      position: { x: 0, y: (i + 1) * 130 },
      data: {
        label: step.label,
        index: i,
        count: steps.length,
        customized: isStepCustomized(step.config),
        onConfigure: setConfiguringIndex,
        onRemove: removeStep,
        onMove: moveStep,
      } as unknown as Record<string, unknown>,
      draggable: false,
    }));
    return [triggerNode, ...stepNodes];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, targetType]);

  const edges = useMemo<Edge[]>(() => {
    const order = ['trigger', ...steps.map((s) => s.key)];
    const result: Edge[] = [];
    for (let i = 0; i < order.length - 1; i++) {
      result.push({
        id: `e-${order[i]}-${order[i + 1]}`,
        source: order[i]!,
        target: order[i + 1]!,
        type: 'smoothstep',
      });
    }
    return result;
  }, [steps]);

  if (query.isLoading || !query.data) {
    return <Loader />;
  }

  const editing =
    configuringIndex !== null ? (steps[configuringIndex] ?? null) : null;
  const editingIndex = configuringIndex;

  return (
    <Stack gap="md" p="md" h="calc(100vh - 120px)">
      <Group justify="space-between" align="flex-start">
        <Box>
          <Anchor href={overviewHref} c="dimmed" size="sm">
            <Group gap={4}>
              <IconArrowLeft size={14} />
              All automations
            </Group>
          </Anchor>
          <Group gap="xs" mt={4} align="center">
            <Title order={3}>{name || 'Untitled automation'}</Title>
            <Badge color={isActive ? 'green' : 'gray'} variant="light">
              {isActive ? 'active' : 'inactive'}
            </Badge>
            {isDefault && <Badge variant="outline">starter</Badge>}
          </Group>
        </Box>
        <Group gap="sm">
          <Switch
            label="Active"
            checked={isActive}
            disabled={dirty || toggleActive.isPending}
            onChange={(e) =>
              toggleActive.mutate({ id, isActive: e.currentTarget.checked })
            }
          />
          {!isDefault && (
            <Button
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={16} />}
              loading={remove.isPending}
              onClick={() => remove.mutate({ id })}
            >
              Delete
            </Button>
          )}
          <Button
            loading={save.isPending}
            disabled={!dirty}
            onClick={() =>
              save.mutate({
                id,
                name: name.trim() || 'Untitled automation',
                targetCustomerType: targetType ?? '',
                steps: steps.map((s) => ({
                  type: s.type,
                  label: s.label,
                  config: s.config,
                })),
              })
            }
          >
            Save
          </Button>
        </Group>
      </Group>

      {isActive && (
        <Text size="xs" c="dimmed">
          This automation is active — saved changes apply to the next trigger.
          Deactivate the Active toggle to edit safely.
        </Text>
      )}

      <Group align="flex-end" gap="sm">
        <TextInput
          label="Name"
          value={name}
          onChange={(e) => {
            setName(e.currentTarget.value);
            setDirty(true);
          }}
          w={260}
        />
        <Select
          label="Trigger — when Customer type is set to"
          data={CRM_CUSTOMER_TYPE_OPTIONS}
          value={targetType}
          onChange={(value) => {
            setTargetType(value);
            setDirty(true);
          }}
          w={260}
        />
        <Menu>
          <Menu.Target>
            <Button variant="light" leftSection={<IconPlus size={16} />}>
              Add step
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {CRM_AUTOMATION_STEP_CATALOG.map((step) => (
              <Menu.Item key={step.type} onClick={() => addStep(step.type)}>
                {step.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      </Group>

      <Box style={{ flex: 1, minHeight: 360 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </Box>

      <Drawer
        opened={editing !== null}
        onClose={() => setConfiguringIndex(null)}
        position="right"
        size="md"
        title={editing ? stepLabelForType(editing.type) : ''}
      >
        {editing && editingIndex !== null && (
          <Stack gap="sm">
            <Text size="xs" c="dimmed">
              Leave a field blank to use the built-in default. Variables:{' '}
              {'{{firstName}} {{fullName}} {{customerType}} {{companyName}} {{date}}'}
            </Text>

            {editing.type === 'send_email' && (
              <>
                <TextInput
                  label="Subject"
                  placeholder="Welcome — you're signed up as a {{customerType}}"
                  value={cfgString(editing.config, 'subject')}
                  onChange={(e) =>
                    updateStepConfig(editingIndex, {
                      subject: e.currentTarget.value,
                    })
                  }
                />
                <Textarea
                  label="Email body"
                  placeholder="Hi {{firstName}},&#10;&#10;Welcome aboard as a {{customerType}}…"
                  autosize
                  minRows={8}
                  value={cfgString(editing.config, 'body')}
                  onChange={(e) =>
                    updateStepConfig(editingIndex, {
                      body: e.currentTarget.value,
                    })
                  }
                />
              </>
            )}

            {editing.type === 'generate_document' && (
              <>
                <TextInput
                  label="Agreement title"
                  placeholder="{{customerType}} Agreement"
                  value={cfgString(editing.config, 'title')}
                  onChange={(e) =>
                    updateStepConfig(editingIndex, {
                      title: e.currentTarget.value,
                    })
                  }
                />
                <Textarea
                  label="Agreement body"
                  placeholder="This agreement is entered into between the Company and {{fullName}}…"
                  autosize
                  minRows={10}
                  value={cfgString(editing.config, 'body')}
                  onChange={(e) =>
                    updateStepConfig(editingIndex, {
                      body: e.currentTarget.value,
                    })
                  }
                />
              </>
            )}

            <Group justify="flex-end">
              <Button onClick={() => setConfiguringIndex(null)}>Done</Button>
            </Group>
          </Stack>
        )}
      </Drawer>
    </Stack>
  );
}
