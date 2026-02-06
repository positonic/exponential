import {
  ActionIcon,
  Button,
  Chip,
  Group,
  Loader,
  Popover,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconPlus, IconTag } from '@tabler/icons-react';
import { useState } from 'react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import type { TagColor } from '~/types/tag';
import { api } from '~/trpc/react';
import { getTagMantineColor } from '~/utils/tagColors';
import { TagBadge } from './TagBadge';

const COLOR_OPTIONS: { key: TagColor; mantine: string }[] = [
  { key: 'avatar-red', mantine: 'red' },
  { key: 'avatar-teal', mantine: 'teal' },
  { key: 'avatar-blue', mantine: 'blue' },
  { key: 'avatar-green', mantine: 'green' },
  { key: 'avatar-yellow', mantine: 'yellow' },
  { key: 'avatar-plum', mantine: 'grape' },
  { key: 'avatar-orange', mantine: 'orange' },
  { key: 'avatar-lightBlue', mantine: 'cyan' },
  { key: 'avatar-lavender', mantine: 'violet' },
  { key: 'avatar-lightPink', mantine: 'pink' },
];

interface TagSelectorProps {
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
  workspaceId?: string;
}

export function TagSelector({ selectedTagIds = [], onChange, workspaceId }: TagSelectorProps) {
  const [opened, setOpened] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState<TagColor>('avatar-blue');

  const { workspaceId: contextWorkspaceId } = useWorkspace();
  const effectiveWorkspaceId = workspaceId ?? contextWorkspaceId ?? undefined;

  const utils = api.useUtils();

  const { data: tags, isLoading } = api.tag.list.useQuery(
    { workspaceId: effectiveWorkspaceId },
    { enabled: true }
  );

  const createTagMutation = api.tag.create.useMutation({
    onSuccess: async (newTag) => {
      await utils.tag.list.invalidate();
      onChange([...selectedTagIds, newTag.id]);
      resetCreateForm();
    },
  });

  const resetCreateForm = () => {
    setIsCreating(false);
    setNewTagName('');
    setNewTagColor('avatar-blue');
  };

  const handleCreateTag = () => {
    if (!newTagName.trim() || !effectiveWorkspaceId) return;
    createTagMutation.mutate({
      name: newTagName.trim(),
      color: newTagColor,
      workspaceId: effectiveWorkspaceId,
    });
  };

  const handleTagToggle = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onChange(selectedTagIds.filter(id => id !== tagId));
    } else {
      onChange([...selectedTagIds, tagId]);
    }
  };

  const allTags = tags?.allTags ?? [];
  const selectedTags = allTags.filter(tag => selectedTagIds.includes(tag.id));

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      width={320}
      shadow="md"
    >
      <Popover.Target>
        <Button
          variant={selectedTagIds.length > 0 ? "light" : "subtle"}
          color={selectedTagIds.length > 0 ? "blue" : "gray"}
          size="sm"
          leftSection={<IconTag size={16} />}
          onClick={() => setOpened(true)}
        >
          {selectedTagIds.length > 0 ? (
            <Group gap={4}>
              {selectedTags.slice(0, 2).map(tag => (
                <TagBadge key={tag.id} tag={tag} size="xs" />
              ))}
              {selectedTagIds.length > 2 && (
                <Text size="xs" c="dimmed">+{selectedTagIds.length - 2}</Text>
              )}
            </Group>
          ) : (
            'Tags'
          )}
        </Button>
      </Popover.Target>

      <Popover.Dropdown>
        <Stack gap="sm">
          <Text size="sm" fw={500}>Select tags</Text>

          {isLoading ? (
            <Group justify="center" p="md">
              <Loader size="sm" />
            </Group>
          ) : allTags.length > 0 ? (
            <ScrollArea.Autosize mah={200}>
              <Chip.Group multiple value={selectedTagIds} onChange={onChange}>
                <Group gap="xs">
                  {allTags.map(tag => (
                    <Chip
                      key={tag.id}
                      value={tag.id}
                      size="sm"
                      color={getTagMantineColor(tag.color)}
                      variant="light"
                      onClick={() => handleTagToggle(tag.id)}
                    >
                      {tag.name}
                    </Chip>
                  ))}
                </Group>
              </Chip.Group>
            </ScrollArea.Autosize>
          ) : (
            <Text size="sm" c="dimmed" ta="center">
              No tags available
            </Text>
          )}

          {isCreating ? (
            <Stack gap="xs" className="border-t border-border-primary pt-2">
              <TextInput
                placeholder="Tag name"
                size="xs"
                value={newTagName}
                onChange={(e) => setNewTagName(e.currentTarget.value)}
                maxLength={50}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateTag();
                  if (e.key === 'Escape') resetCreateForm();
                }}
                autoFocus
              />
              <Group gap={4}>
                {COLOR_OPTIONS.map(({ key, mantine }) => (
                  <ActionIcon
                    key={key}
                    size="xs"
                    radius="xl"
                    variant={newTagColor === key ? 'filled' : 'light'}
                    color={mantine}
                    onClick={() => setNewTagColor(key)}
                    style={newTagColor === key ? { outline: '2px solid var(--border-focus)', outlineOffset: 1 } : undefined}
                  >
                    <span />
                  </ActionIcon>
                ))}
              </Group>
              <Group justify="flex-end" gap="xs">
                <Button size="xs" variant="subtle" color="gray" onClick={resetCreateForm}>
                  Cancel
                </Button>
                <Button
                  size="xs"
                  onClick={handleCreateTag}
                  loading={createTagMutation.isPending}
                  disabled={!newTagName.trim() || !effectiveWorkspaceId}
                >
                  Create
                </Button>
              </Group>
            </Stack>
          ) : effectiveWorkspaceId ? (
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              leftSection={<IconPlus size={14} />}
              onClick={() => setIsCreating(true)}
              fullWidth
            >
              New Tag
            </Button>
          ) : null}

          <Group justify="flex-end" pt="xs">
            <Button
              size="xs"
              variant="light"
              onClick={() => onChange([])}
              disabled={selectedTagIds.length === 0}
            >
              Clear
            </Button>
            <Button
              size="xs"
              onClick={() => setOpened(false)}
            >
              Done
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
