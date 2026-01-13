import { Button, Chip, Group, Popover, Text, ScrollArea, Loader, Stack } from '@mantine/core';
import { IconTag } from '@tabler/icons-react';
import { useState } from 'react';
import { api } from '~/trpc/react';
import { getTagMantineColor } from '~/utils/tagColors';
import { TagBadge } from './TagBadge';

interface TagSelectorProps {
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
  workspaceId?: string;
}

export function TagSelector({ selectedTagIds = [], onChange, workspaceId }: TagSelectorProps) {
  const [opened, setOpened] = useState(false);

  const { data: tags, isLoading } = api.tag.list.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: true }
  );

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
            <ScrollArea.Autosize mah={250}>
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
