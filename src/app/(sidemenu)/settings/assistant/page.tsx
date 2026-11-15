'use client';

import {
  Container,
  Title,
  Text,
  Stack,
  Paper,
  TextInput,
  Textarea,
  Button,
  Group,
  Loader,
  Alert,
  Select,
  Code,
  CopyButton,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { IconRobot, IconCheck, IconAlertCircle, IconCopy, IconTrash } from '@tabler/icons-react';
import { useState, useEffect } from 'react';
import { api } from '~/trpc/react';
import { useAiCapabilities } from '~/providers/AiCapabilitiesProvider';
import { AiNotConfiguredNote } from '~/app/_components/ai/AiNotConfiguredNote';
import { TelegramGatewayCard } from '~/app/_components/TelegramGatewayCard';
import { MatrixGatewayCard } from '~/app/_components/MatrixGatewayCard';
import { MarkdownInput } from '~/app/_components/shared/MarkdownInput';

const PERSONALITY_PLACEHOLDER = `Example: You're warm, direct, and a little playful. You have opinions and share them honestly. Skip the corporate tone — be real. When something doesn't add up, say so (kindly). You're genuinely helpful, not performatively helpful.`;

const INSTRUCTIONS_PLACEHOLDER = `Example: When asked to create tasks, always confirm the project first. Keep responses concise unless detail is requested. Use bullet points for lists.`;

const USER_CONTEXT_PLACEHOLDER = `Example: I'm a startup founder working on a SaaS product. I manage a small team of 5. I prefer morning focus blocks and async communication.`;

/** The Assistant's fallback Remit when it holds no Position (ADR-0068 §3). */
const DESCRIPTION_PLACEHOLDER = `Example: Research and shortlist options — venues, travel, suppliers — and post them as a comment with a recommendation. Does not book or pay.`;
const DESCRIPTION_MAX = 5000;

/** Which engine runs Agent runs assigned to the Assistant (ADR-0067 §4, Agent PRD V2). */
const EXECUTOR_OPTIONS = [
  { value: 'MASTRA', label: 'Hosted' },
  { value: 'LOCAL_CLI', label: 'My machine (local runner)' },
];

export default function AssistantSettingsPage() {
  const { assistant: hasAssistant } = useAiCapabilities();
  const utils = api.useUtils();

  // One Assistant per person (ADR-0072): the same one in every workspace, so
  // this page needs no workspace. Null until the person first saves it.
  const { data: assistant, isLoading } = api.assistant.getMine.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [personality, setPersonality] = useState('');
  const [instructions, setInstructions] = useState('');
  const [userContext, setUserContext] = useState('');
  const [description, setDescription] = useState('');
  const [saved, setSaved] = useState(false);

  // Populate the form when the Assistant loads.
  useEffect(() => {
    setName(assistant?.name ?? '');
    setEmoji(assistant?.emoji ?? '');
    setPersonality(assistant?.personality ?? '');
    setInstructions(assistant?.instructions ?? '');
    setUserContext(assistant?.userContext ?? '');
    setDescription(assistant?.externalAgent.description ?? '');
  }, [assistant]);

  const createMutation = api.assistant.create.useMutation({
    onSuccess: () => {
      console.log('[AssistantSettings] Create succeeded');
      void utils.assistant.getMine.invalidate();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err) => {
      console.error('[AssistantSettings] Create failed:', err.message, err);
    },
  });

  const updateMutation = api.assistant.update.useMutation({
    onSuccess: () => {
      console.log('[AssistantSettings] Update succeeded');
      void utils.assistant.getMine.invalidate();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err) => {
      console.error('[AssistantSettings] Update failed:', err.message, err);
    },
  });

  // The executor saves on change — it is a property of the principal, not of
  // the persona form, and a stale "Hosted" while the owner's runner polls
  // would start runs nobody claims.
  const executorMutation = api.assistant.update.useMutation({
    onSuccess: () => {
      void utils.assistant.getMine.invalidate();
    },
  });
  const [runnerSecret, setRunnerSecret] = useState<string | null>(null);
  const createKeyMutation = api.assistant.createRunnerKey.useMutation({
    onSuccess: (result) => {
      setRunnerSecret(result.secret);
      void utils.assistant.getMine.invalidate();
    },
  });
  const revokeKeyMutation = api.assistant.revokeRunnerKey.useMutation({
    onSuccess: () => {
      void utils.assistant.getMine.invalidate();
    },
  });

  // Where it works (ADR-0072, Agent PRD V2): the Assistant joins a workspace
  // only when its person adds it, and only where they are at least a member.
  const { data: myWorkspaces } = api.assistant.myWorkspaces.useQuery(undefined, {
    enabled: !!assistant,
  });
  const [workspaceToAdd, setWorkspaceToAdd] = useState<string | null>(null);
  const invalidateWorkspaces = () => {
    void utils.assistant.myWorkspaces.invalidate();
    void utils.assistant.list.invalidate();
  };
  const addToWorkspaceMutation = api.assistant.addToWorkspace.useMutation({
    onSuccess: () => {
      setWorkspaceToAdd(null);
      invalidateWorkspaces();
    },
  });
  const removeFromWorkspaceMutation = api.assistant.removeFromWorkspace.useMutation({
    onSuccess: invalidateWorkspaces,
  });
  const joinedWorkspaces = (myWorkspaces ?? []).filter((w) => w.assistantIsMember);
  const addableWorkspaces = (myWorkspaces ?? []).filter((w) => w.canAdd && !w.assistantIsMember);

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const error =
    createMutation.error ??
    updateMutation.error ??
    executorMutation.error ??
    createKeyMutation.error ??
    revokeKeyMutation.error ??
    addToWorkspaceMutation.error ??
    removeFromWorkspaceMutation.error;

  const handleSave = () => {
    console.log('[AssistantSettings] handleSave called', {
      name: name.trim(),
      personality: personality.trim().substring(0, 50),
      hasAssistant: !!assistant,
      assistantId: assistant?.id,
    });

    if (!name.trim() || !personality.trim()) {
      console.log('[AssistantSettings] Early return - missing required fields', {
        name: !!name.trim(),
        personality: !!personality.trim(),
      });
      return;
    }

    const trimmedDescription = description.trim();
    if (assistant) {
      updateMutation.mutate({
        id: assistant.id,
        name: name.trim(),
        emoji: emoji.trim() || null,
        personality: personality.trim(),
        instructions: instructions.trim() || null,
        userContext: userContext.trim() || null,
        description: trimmedDescription === '' ? null : trimmedDescription,
      });
    } else {
      createMutation.mutate({
        name: name.trim(),
        emoji: emoji.trim() || undefined,
        personality: personality.trim(),
        instructions: instructions.trim() || undefined,
        userContext: userContext.trim() || undefined,
      });
    }
  };

  if (isLoading) {
    return (
      <Container size="md" py="xl">
        <Group justify="center" py="xl">
          <Loader size="sm" />
        </Group>
      </Container>
    );
  }

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        <div>
          <Group gap="xs">
            <IconRobot size={24} className="text-brand-primary" />
            <Title order={2} className="text-text-primary">
              AI Assistant
            </Title>
          </Group>
          <Text size="sm" c="dimmed" mt="xs">
            Give your AI assistant a name and personality. This defines how it
            responds to you across the app, and it can be assigned work like a
            teammate.
          </Text>
          <Alert
            icon={<IconAlertCircle size={16} />}
            variant="light"
            mt="md"
            data-testid="assistant-persona-warning"
          >
            You have one assistant, the same in every workspace it works in. Its
            name, personality, instructions and what you write about yourself go
            with it into shared workspaces too, including work assigned to it
            there. Don&apos;t write anything here you wouldn&apos;t want a teammate&apos;s
            task to draw on.
          </Alert>
          {!hasAssistant && (
            <AiNotConfiguredNote requirement="assistant" feature="The Assistant" className="mt-3" />
          )}
        </div>

        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
            {error.message}
          </Alert>
        )}

        {saved && (
          <Alert icon={<IconCheck size={16} />} color="green" variant="light">
            Assistant saved successfully!
          </Alert>
        )}

        {/* Identity */}
        <Paper p="lg" withBorder className="bg-surface-secondary">
          <Text fw={500} className="text-text-primary mb-3">
            Identity
          </Text>
          <Stack gap="md">
            <Group grow align="start">
              <TextInput
                label="Name"
                placeholder="e.g. Aria, Max, Atlas"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                required
              />
              <TextInput
                label="Emoji"
                placeholder="e.g. a single emoji"
                value={emoji}
                onChange={(e) => setEmoji(e.currentTarget.value)}
                styles={{ input: { width: 120 } }}
              />
            </Group>
          </Stack>
        </Paper>

        {/* Personality */}
        <Paper p="lg" withBorder className="bg-surface-secondary">
          <Text fw={500} className="text-text-primary mb-1">
            Personality & Soul
          </Text>
          <Text size="xs" c="dimmed" mb="md">
            Describe who your assistant is. Its tone, vibe, values, and
            boundaries. This is the heart of your assistant.
          </Text>
          <Textarea
            placeholder={PERSONALITY_PLACEHOLDER}
            value={personality}
            onChange={(e) => setPersonality(e.currentTarget.value)}
            minRows={5}
            maxRows={12}
            autosize
            required
          />
        </Paper>

        {/* Instructions */}
        <Paper p="lg" withBorder className="bg-surface-secondary">
          <Text fw={500} className="text-text-primary mb-1">
            Instructions
          </Text>
          <Text size="xs" c="dimmed" mb="md">
            Optional operating guidelines. How should your assistant behave in
            specific situations?
          </Text>
          <Textarea
            placeholder={INSTRUCTIONS_PLACEHOLDER}
            value={instructions}
            onChange={(e) => setInstructions(e.currentTarget.value)}
            minRows={3}
            maxRows={8}
            autosize
          />
        </Paper>

        {/* User Context */}
        <Paper p="lg" withBorder className="bg-surface-secondary">
          <Text fw={500} className="text-text-primary mb-1">
            About You / Your Team
          </Text>
          <Text size="xs" c="dimmed" mb="md">
            Optional context about you and your work. Helps the assistant tailor
            its responses.
          </Text>
          <Textarea
            placeholder={USER_CONTEXT_PLACEHOLDER}
            value={userContext}
            onChange={(e) => setUserContext(e.currentTarget.value)}
            minRows={3}
            maxRows={6}
            autosize
          />
        </Paper>

        {/* Routing (ADR-0068): the Assistant's fallback Remit */}
        {assistant && (
          <Paper p="lg" withBorder className="bg-surface-secondary">
            <Text fw={500} className="text-text-primary mb-1">
              What work should be assigned to this assistant?
            </Text>
            <Text size="xs" c="dimmed" mb="md">
              Zoe uses this to route tasks when {assistant.name} holds no Position. Give it a
              Position on the workspace&apos;s Members settings to say the same thing for a whole
              function.
            </Text>
            <MarkdownInput
              value={description}
              onChange={(next) => setDescription(next.slice(0, DESCRIPTION_MAX))}
              placeholder={DESCRIPTION_PLACEHOLDER}
              minRows={3}
              maxRows={8}
            />
          </Paper>
        )}

        {/* Where it works (ADR-0072, Agent PRD V2) */}
        {assistant && (
          <Paper p="lg" withBorder className="bg-surface-secondary" data-testid="assistant-workspaces">
            <Text fw={500} className="text-text-primary mb-1">
              Where it works
            </Text>
            <Text size="xs" c="dimmed" mb="md">
              {assistant.name} can be assigned work only in these workspaces. It is in your
              Personal workspace from the start; add it anywhere else you are at least a member.
            </Text>
            <Stack gap="xs">
              {joinedWorkspaces.map((workspace) => (
                <Group
                  key={workspace.id}
                  justify="space-between"
                  wrap="nowrap"
                  data-testid="assistant-workspace-row"
                >
                  <Text size="sm" className="text-text-primary" truncate>
                    {workspace.name}
                  </Text>
                  <Tooltip label={`Remove from ${workspace.name}`}>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label={`Remove ${assistant.name} from ${workspace.name}`}
                      loading={
                        removeFromWorkspaceMutation.isPending &&
                        removeFromWorkspaceMutation.variables?.workspaceId === workspace.id
                      }
                      onClick={() => removeFromWorkspaceMutation.mutate({ workspaceId: workspace.id })}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              ))}
              {myWorkspaces && joinedWorkspaces.length === 0 && (
                <Text size="sm" c="dimmed">
                  Not in any workspace yet, so nobody can assign it work. Add it to one below.
                </Text>
              )}
            </Stack>
            {addableWorkspaces.length > 0 && (
              <Group mt="md" align="flex-end" wrap="nowrap">
                <Select
                  className="flex-1"
                  label="Add to a workspace"
                  placeholder="Pick a workspace"
                  data={addableWorkspaces.map((w) => ({ value: w.id, label: w.name }))}
                  value={workspaceToAdd}
                  onChange={setWorkspaceToAdd}
                  data-testid="assistant-add-workspace"
                />
                <Button
                  variant="default"
                  disabled={!workspaceToAdd}
                  loading={addToWorkspaceMutation.isPending}
                  onClick={() => workspaceToAdd && addToWorkspaceMutation.mutate({ workspaceId: workspaceToAdd })}
                >
                  Add
                </Button>
              </Group>
            )}
          </Paper>
        )}

        {/* Delegation (ADR-0067) */}
        {assistant && (
          <Paper p="lg" withBorder className="bg-surface-secondary">
            <Text fw={500} className="text-text-primary mb-1">
              Delegation
            </Text>
            <Text size="sm" c="dimmed">
              <b>{assistant.name}</b> can be assigned work. Pick it from the Assign
              modal on any action in a workspace it works in and it will research,
              delegate, or do the work inside Exponential, asking you when it gets stuck.
              Everything it writes is attributed to it, never to you.
            </Text>
            <Select
              mt="md"
              label="Runs on"
              description="Hosted runs in Exponential's cloud. A local runner is a process on your own machine that claims runs with a runner key."
              data={EXECUTOR_OPTIONS}
              value={assistant.externalAgent.executor}
              onChange={(value) => {
                if (value === 'MASTRA' || value === 'LOCAL_CLI') {
                  executorMutation.mutate({ id: assistant.id, executor: value });
                }
              }}
              disabled={executorMutation.isPending}
              allowDeselect={false}
              data-testid="assistant-executor"
            />

            {assistant.externalAgent.executor === 'LOCAL_CLI' && (
              <Stack gap="sm" mt="md">
                <Group justify="space-between" align="center">
                  <div>
                    <Text size="sm" fw={500} className="text-text-primary">
                      Runner keys
                    </Text>
                    <Text size="xs" c="dimmed">
                      The runner authenticates with one of these. The secret is shown once.
                    </Text>
                  </div>
                  <Button
                    size="xs"
                    variant="light"
                    loading={createKeyMutation.isPending}
                    onClick={() => createKeyMutation.mutate({ id: assistant.id, name: 'runner' })}
                    data-testid="assistant-create-runner-key"
                  >
                    New runner key
                  </Button>
                </Group>

                {runnerSecret && (
                  <Alert color="yellow" variant="light" title="Copy this key now — it will not be shown again">
                    <Group gap="xs" wrap="nowrap">
                      <Code block className="flex-1 break-all" data-testid="assistant-runner-secret">
                        {runnerSecret}
                      </Code>
                      <CopyButton value={runnerSecret}>
                        {({ copied, copy }) => (
                          <Tooltip label={copied ? 'Copied' : 'Copy'}>
                            <ActionIcon variant="subtle" color={copied ? 'green' : 'gray'} onClick={copy}>
                              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </CopyButton>
                    </Group>
                  </Alert>
                )}

                {assistant.externalAgent.keys.length === 0 ? (
                  <Text size="xs" c="dimmed">
                    No runner keys yet. Runs assigned to {assistant.name} will wait for a runner until one claims them.
                  </Text>
                ) : (
                  <Stack gap={4}>
                    {assistant.externalAgent.keys.map((key) => (
                      <Group key={key.id} justify="space-between" wrap="nowrap">
                        <Group gap="xs" wrap="nowrap">
                          <Code>{key.keyPrefix}</Code>
                          <Text size="xs" c="dimmed">
                            {key.name}
                            {key.lastUsedAt
                              ? ` · last used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                              : ' · never used'}
                          </Text>
                        </Group>
                        <Tooltip label="Revoke">
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            size="sm"
                            loading={revokeKeyMutation.isPending}
                            onClick={() => revokeKeyMutation.mutate({ id: assistant.id, keyId: key.id })}
                            aria-label={`Revoke key ${key.keyPrefix}`}
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    ))}
                  </Stack>
                )}
              </Stack>
            )}
          </Paper>
        )}

        {assistant && (
          <Text size="sm" c="dimmed">
            Telegram and Matrix chat with <b>{assistant.name}</b>, your assistant.
          </Text>
        )}

        {/* Telegram Integration */}
        <TelegramGatewayCard />

        {/* Matrix Integration */}
        <MatrixGatewayCard />

        {/* Save */}
        <Stack gap="sm">
          {error && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
              {error.message}
            </Alert>
          )}

          {saved && (
            <Alert icon={<IconCheck size={16} />} color="green" variant="light">
              Assistant saved successfully!
            </Alert>
          )}

          <Group justify="flex-end">
            <Button
              onClick={handleSave}
              loading={isSaving}
              disabled={isLoading || !name.trim() || !personality.trim()}
            >
              {assistant ? 'Update Assistant' : 'Create Assistant'}
            </Button>
          </Group>
        </Stack>
      </Stack>
    </Container>
  );
}
