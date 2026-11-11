'use client';

import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  Code,
  CopyButton,
  Drawer,
  Group,
  Input,
  MultiSelect,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconCheck, IconCopy } from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { MarkdownInput } from '~/app/_components/shared/MarkdownInput';
import { canDelegateFromRole } from '~/lib/agentDelegation';

/**
 * The description is the agent's fallback Remit (ADR-0068 §3): Zoe routes
 * work to it by this text when the agent holds no Position.
 */
const DESCRIPTION_LABEL = 'What work should be assigned to this agent?';
const DESCRIPTION_HELP = 'Zoe uses this to route tasks when the agent holds no Position.';
const DESCRIPTION_MAX = 5000;

const DEFAULT_KEY_LABEL = 'default';

export interface EditableAgent {
  id: string;
  name: string;
  description: string | null;
}

interface AgentDrawerProps {
  opened: boolean;
  onClose: () => void;
  /** Present → edit name and description; absent → create with workspaces and a key. */
  editing: EditableAgent | null;
}

/**
 * Create or edit an External agent. Creating is one step: name, workspaces and
 * first key go to the server together, and the key is shown once on success.
 */
export function AgentDrawer({ opened, onClose, editing }: AgentDrawerProps) {
  const utils = api.useUtils();
  const { data: workspaces = [] } = api.workspace.list.useQuery(undefined, {
    enabled: opened && !editing,
  });
  const [secret, setSecret] = useState<string | null>(null);

  const form = useForm({
    initialValues: {
      name: '',
      description: '',
      workspaceIds: [] as string[],
      keyName: DEFAULT_KEY_LABEL,
    },
    validate: {
      name: (value) => (value.trim().length === 0 ? 'Name is required' : null),
    },
  });

  // Load the agent being edited; a fresh create starts from the defaults.
  useEffect(() => {
    if (!opened) return;
    form.setValues(
      editing
        ? { name: editing.name, description: editing.description ?? '' }
        : { name: '', description: '', workspaceIds: [], keyName: DEFAULT_KEY_LABEL },
    );
    form.resetDirty();
    // `form` is a new object every render; only reopening should reload it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, editing?.id]);

  const createAgent = api.externalAgent.create.useMutation({
    onSuccess: async (data) => {
      await utils.externalAgent.list.invalidate();
      if (data.secret) {
        setSecret(data.secret);
        return;
      }
      notifications.show({
        title: 'Agent created',
        message: 'Add a key from its card when you are ready to connect it.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      onClose();
    },
    onError: (error) =>
      notifications.show({ title: 'Could not create agent', message: error.message, color: 'red' }),
  });

  const updateAgent = api.externalAgent.update.useMutation({
    onSuccess: async () => {
      await utils.externalAgent.list.invalidate();
      onClose();
    },
    onError: (error) =>
      notifications.show({ title: 'Could not update agent', message: error.message, color: 'red' }),
  });

  // Workspaces the server would refuse (viewer, project guest) are left out.
  const grantable = workspaces.filter((ws) => canDelegateFromRole(ws.currentUserRole));
  const selected = new Set(form.values.workspaceIds);
  const allSelected = grantable.length > 0 && grantable.every((ws) => selected.has(ws.id));

  const title = secret ? 'Copy your key now' : editing ? 'Edit external agent' : 'New external agent';

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      onExitTransitionEnd={() => setSecret(null)}
      position="right"
      size="md"
      title={<Text fw={600}>{title}</Text>}
    >
      {secret ? (
        <Stack>
          <Alert icon={<IconAlertCircle size={16} />} color="yellow">
            This is the only time the key is shown. Store it in your agent&apos;s
            configuration — if you lose it, revoke it and create a new one.
          </Alert>
          <Group wrap="nowrap" align="flex-start" gap="xs">
            {/* The key is a single unbroken token: without pre-wrap the <pre>
                keeps it on one line and grows its own scrollbar. */}
            <Code
              block
              style={{
                flex: 1,
                minWidth: 0,
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                overflowX: 'hidden',
              }}
            >
              {secret}
            </Code>
            <CopyButton value={secret}>
              {({ copied, copy }) => (
                <ActionIcon variant="light" onClick={copy} aria-label="Copy key">
                  {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                </ActionIcon>
              )}
            </CopyButton>
          </Group>
          <Text size="sm" c="dimmed">
            Setting up the MCP server? Paste this key when{' '}
            <Code style={{ whiteSpace: 'nowrap' }}>npx exponential-mcp init</Code> asks for it.
          </Text>
          <Button onClick={onClose}>Done</Button>
        </Stack>
      ) : (
        <form
          onSubmit={form.onSubmit((values) =>
            editing
              ? updateAgent.mutate({
                  agentId: editing.id,
                  name: values.name,
                  description: values.description,
                })
              : createAgent.mutate(values),
          )}
        >
          <Stack>
            <TextInput
              label="Name"
              placeholder="Claude Code"
              required
              data-autofocus
              {...form.getInputProps('name')}
            />
            <Input.Wrapper label={DESCRIPTION_LABEL} description={DESCRIPTION_HELP}>
              <MarkdownInput
                value={form.values.description}
                onChange={(next) =>
                  form.setFieldValue('description', next.slice(0, DESCRIPTION_MAX))
                }
                placeholder="Triages inbound bug reports and drafts the first reply."
                minRows={3}
              />
            </Input.Wrapper>

            {!editing && (
              <>
                <Input.Wrapper
                  label={
                    <Group justify="space-between" wrap="nowrap" w="100%">
                      <span>Workspaces</span>
                      {grantable.length > 0 && (
                        <Anchor
                          component="button"
                          type="button"
                          size="xs"
                          onClick={() =>
                            form.setFieldValue(
                              'workspaceIds',
                              allSelected ? [] : grantable.map((ws) => ws.id),
                            )
                          }
                        >
                          {allSelected ? 'Clear all' : `Select all (${grantable.length})`}
                        </Anchor>
                      )}
                    </Group>
                  }
                  labelProps={{ style: { display: 'flex', width: '100%' } }}
                  description="The agent joins each one as a member. Without a workspace it can't do anything."
                >
                  <MultiSelect
                    mt={4}
                    aria-label="Workspaces"
                    placeholder={
                      form.values.workspaceIds.length > 0 ? undefined : 'Pick one or more workspaces'
                    }
                    data={grantable.map((ws) => ({ value: ws.id, label: ws.name }))}
                    searchable
                    clearable
                    hidePickedOptions
                    {...form.getInputProps('workspaceIds')}
                  />
                </Input.Wrapper>
                <TextInput
                  label="Key label"
                  description="A key is created with the agent and shown once. Leave blank to add one later."
                  placeholder="laptop"
                  {...form.getInputProps('keyName')}
                />
              </>
            )}

            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={createAgent.isPending || updateAgent.isPending}>
                {editing ? 'Save' : 'Create agent'}
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Drawer>
  );
}
