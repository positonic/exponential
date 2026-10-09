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
} from '@mantine/core';
import { IconRobot, IconCheck, IconAlertCircle } from '@tabler/icons-react';
import { useState, useEffect } from 'react';
import { api } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { TelegramGatewayCard } from '~/app/_components/TelegramGatewayCard';
import { MatrixGatewayCard } from '~/app/_components/MatrixGatewayCard';

const PERSONALITY_PLACEHOLDER = `Example: You're warm, direct, and a little playful. You have opinions and share them honestly. Skip the corporate tone — be real. When something doesn't add up, say so (kindly). You're genuinely helpful, not performatively helpful.`;

const INSTRUCTIONS_PLACEHOLDER = `Example: When asked to create tasks, always confirm the project first. Keep responses concise unless detail is requested. Use bullet points for lists.`;

// Roles that pass `requireWorkspaceMembership("edit")` on assistant.create
const EDITABLE_ROLES = new Set(['owner', 'admin', 'member']);

const USER_CONTEXT_PLACEHOLDER = `Example: I'm a startup founder working on a SaaS product. I manage a small team of 5. I prefer morning focus blocks and async communication.`;

export default function AssistantSettingsPage() {
  const { workspaceId: currentWorkspaceId } = useWorkspace();
  const utils = api.useUtils();

  // Assistants are per workspace, but this page has no workspace in its URL.
  // Open on the one the Telegram/Matrix gateways use, so the page and the
  // gateways agree; fall back to the current workspace for a first assistant.
  const { data: gatewayAssistant, isLoading: gatewayLoading } =
    api.assistant.getGatewayDefault.useQuery(undefined, {
      refetchOnWindowFocus: false,
    });
  const { data: workspaces } = api.workspace.list.useQuery();
  const editableWorkspaces = (workspaces ?? []).filter((ws) =>
    EDITABLE_ROLES.has(ws.currentUserRole ?? '')
  );

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const workspaceId = gatewayLoading
    ? null
    : (selectedWorkspaceId ?? gatewayAssistant?.workspaceId ?? currentWorkspaceId);

  const { data: assistant, isLoading: assistantLoading } = api.assistant.getDefault.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId, refetchOnWindowFocus: false }
  );
  // Full-page loader only on first load; switching workspace keeps the picker mounted
  const isLoading = gatewayLoading || (assistantLoading && !selectedWorkspaceId);

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [personality, setPersonality] = useState('');
  const [instructions, setInstructions] = useState('');
  const [userContext, setUserContext] = useState('');
  const [saved, setSaved] = useState(false);

  // Populate form when data loads — and clear it when switching to a
  // workspace with no assistant, so its fields aren't saved into the wrong one
  useEffect(() => {
    setName(assistant?.name ?? '');
    setEmoji(assistant?.emoji ?? '');
    setPersonality(assistant?.personality ?? '');
    setInstructions(assistant?.instructions ?? '');
    setUserContext(assistant?.userContext ?? '');
  }, [assistant]);

  const createMutation = api.assistant.create.useMutation({
    onSuccess: () => {
      console.log('[AssistantSettings] Create succeeded');
      void utils.assistant.getDefault.invalidate();
      void utils.assistant.getGatewayDefault.invalidate();
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
      void utils.assistant.getDefault.invalidate();
      void utils.assistant.getGatewayDefault.invalidate();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err) => {
      console.error('[AssistantSettings] Update failed:', err.message, err);
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const error = createMutation.error ?? updateMutation.error;

  const handleSave = () => {
    console.log('[AssistantSettings] handleSave called', {
      workspaceId,
      name: name.trim(),
      personality: personality.trim().substring(0, 50),
      hasAssistant: !!assistant,
      assistantId: assistant?.id,
    });

    if (!workspaceId || !name.trim() || !personality.trim()) {
      console.log('[AssistantSettings] Early return - missing required fields', {
        workspaceId: !!workspaceId,
        name: !!name.trim(),
        personality: !!personality.trim(),
      });
      return;
    }

    if (assistant) {
      updateMutation.mutate({
        id: assistant.id,
        name: name.trim(),
        emoji: emoji.trim() || null,
        personality: personality.trim(),
        instructions: instructions.trim() || null,
        userContext: userContext.trim() || null,
      });
    } else {
      createMutation.mutate({
        workspaceId,
        name: name.trim(),
        emoji: emoji.trim() || undefined,
        personality: personality.trim(),
        instructions: instructions.trim() || undefined,
        userContext: userContext.trim() || undefined,
        isDefault: true,
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

        {editableWorkspaces.length > 1 && (
          <Select
            label="Workspace"
            description="Each workspace has its own assistant."
            data={editableWorkspaces.map((ws) => ({ value: ws.id, label: ws.name }))}
            value={workspaceId}
            onChange={(value) => {
              if (value) setSelectedWorkspaceId(value);
            }}
            allowDeselect={false}
          />
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

        {/* Delegation (ADR-0067) */}
        {assistant && (
          <Paper p="lg" withBorder className="bg-surface-secondary">
            <Text fw={500} className="text-text-primary mb-1">
              Delegation
            </Text>
            <Text size="sm" c="dimmed">
              <b>{assistant.name}</b> can be assigned work. Pick it from the Assign
              modal on any action in this workspace and it will research, delegate,
              or do the work inside Exponential, asking you when it gets stuck.
              Everything it writes is attributed to it, never to you.
            </Text>
            <Text size="xs" c="dimmed" mt="sm">
              Runs on: {assistant.externalAgent?.executor === 'LOCAL_CLI' ? 'your machine (local runner)' : 'Hosted'}
            </Text>
          </Paper>
        )}

        {gatewayAssistant && (
          <Text size="sm" c="dimmed">
            Telegram and Matrix chat with <b>{gatewayAssistant.name}</b>, your
            assistant in {gatewayAssistant.workspace.name}.
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
              disabled={assistantLoading || !name.trim() || !personality.trim()}
            >
              {assistant ? 'Update Assistant' : 'Create Assistant'}
            </Button>
          </Group>
        </Stack>
      </Stack>
    </Container>
  );
}
