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
} from '@mantine/core';
import { IconRobot, IconCheck, IconAlertCircle } from '@tabler/icons-react';
import { useState, useEffect } from 'react';
import { api } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';

const PERSONALITY_PLACEHOLDER = `Example: You're warm, direct, and a little playful. You have opinions and share them honestly. Skip the corporate tone — be real. When something doesn't add up, say so (kindly). You're genuinely helpful, not performatively helpful.`;

const INSTRUCTIONS_PLACEHOLDER = `Example: When asked to create tasks, always confirm the project first. Keep responses concise unless detail is requested. Use bullet points for lists.`;

const USER_CONTEXT_PLACEHOLDER = `Example: I'm a startup founder working on a SaaS product. I manage a small team of 5. I prefer morning focus blocks and async communication.`;

export default function AssistantSettingsPage() {
  const { workspaceId } = useWorkspace();
  const utils = api.useUtils();

  // Fetch the default assistant for this workspace
  const { data: assistant, isLoading } = api.assistant.getDefault.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId, refetchOnWindowFocus: false }
  );

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [personality, setPersonality] = useState('');
  const [instructions, setInstructions] = useState('');
  const [userContext, setUserContext] = useState('');
  const [saved, setSaved] = useState(false);

  // Populate form when data loads
  useEffect(() => {
    if (assistant) {
      setName(assistant.name);
      setEmoji(assistant.emoji ?? '');
      setPersonality(assistant.personality);
      setInstructions(assistant.instructions ?? '');
      setUserContext(assistant.userContext ?? '');
    }
  }, [assistant]);

  const createMutation = api.assistant.create.useMutation({
    onSuccess: () => {
      void utils.assistant.getDefault.invalidate();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const updateMutation = api.assistant.update.useMutation({
    onSuccess: () => {
      void utils.assistant.getDefault.invalidate();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const error = createMutation.error ?? updateMutation.error;

  const handleSave = () => {
    if (!workspaceId || !name.trim() || !personality.trim()) return;

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
            responds to you across the app.
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

        {/* Save */}
        <Group justify="flex-end">
          <Button
            onClick={handleSave}
            loading={isSaving}
            disabled={!name.trim() || !personality.trim()}
          >
            {assistant ? 'Update Assistant' : 'Create Assistant'}
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}
