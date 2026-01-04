'use client';

import {
  Container,
  Title,
  Card,
  TextInput,
  Textarea,
  Button,
  Stack,
  Group,
  Text,
  SegmentedControl,
} from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '~/trpc/react';

export default function NewWorkspacePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'team' | 'organization'>('team');
  const [slugTouched, setSlugTouched] = useState(false);

  const utils = api.useUtils();

  const createMutation = api.workspace.create.useMutation({
    onSuccess: (workspace) => {
      void utils.workspace.list.invalidate();
      router.push(`/w/${workspace.slug}/projects`);
    },
  });

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugTouched) {
      // Auto-generate slug from name
      const generatedSlug = value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 50);
      setSlug(generatedSlug);
    }
  };

  const handleSlugChange = (value: string) => {
    setSlugTouched(true);
    // Only allow valid slug characters
    const sanitized = value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 50);
    setSlug(sanitized);
  };

  const handleSubmit = () => {
    if (!name.trim() || !slug.trim()) return;

    createMutation.mutate({
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || undefined,
      type,
    });
  };

  return (
    <Container size="sm" className="py-8">
      <Group gap="md" mb="xl">
        <Button
          component={Link}
          href="/workspaces"
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          className="text-text-secondary"
        >
          Back
        </Button>
      </Group>

      <Title order={1} className="text-3xl font-bold text-text-primary mb-8">
        Create Workspace
      </Title>

      <Card className="bg-surface-secondary border-border-primary" withBorder padding="xl">
        <Stack gap="lg">
          <TextInput
            label="Workspace Name"
            placeholder="My Company"
            value={name}
            onChange={(e) => handleNameChange(e.currentTarget.value)}
            required
            classNames={{
              input: 'bg-surface-primary border-border-primary text-text-primary',
              label: 'text-text-secondary mb-1',
            }}
          />

          <TextInput
            label="Slug"
            placeholder="my-company"
            value={slug}
            onChange={(e) => handleSlugChange(e.currentTarget.value)}
            description="Used in URLs: /w/my-company/projects"
            required
            error={createMutation.error?.message}
            classNames={{
              input: 'bg-surface-primary border-border-primary text-text-primary font-mono',
              label: 'text-text-secondary mb-1',
              description: 'text-text-muted',
            }}
          />

          <Textarea
            label="Description"
            placeholder="What is this workspace for?"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            minRows={3}
            classNames={{
              input: 'bg-surface-primary border-border-primary text-text-primary',
              label: 'text-text-secondary mb-1',
            }}
          />

          <div>
            <Text size="sm" className="text-text-secondary mb-2">
              Workspace Type
            </Text>
            <SegmentedControl
              value={type}
              onChange={(value) => setType(value as 'team' | 'organization')}
              data={[
                { value: 'team', label: 'Team' },
                { value: 'organization', label: 'Organization' },
              ]}
              fullWidth
              classNames={{
                root: 'bg-surface-primary',
              }}
            />
            <Text size="xs" className="text-text-muted mt-2">
              Teams are for small groups. Organizations are for larger companies with multiple teams.
            </Text>
          </div>

          <Group justify="flex-end" mt="md">
            <Button
              variant="subtle"
              component={Link}
              href="/workspaces"
              className="text-text-secondary"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              loading={createMutation.isPending}
              disabled={!name.trim() || !slug.trim()}
              color="brand"
            >
              Create Workspace
            </Button>
          </Group>
        </Stack>
      </Card>
    </Container>
  );
}
