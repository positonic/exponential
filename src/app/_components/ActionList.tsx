import { Checkbox, Text, Stack, Group, Paper } from '@mantine/core';
import { IconCalendar } from '@tabler/icons-react';

export function ActionList({ actions }: { actions: Action[] }) {
  return (
    <Stack gap="xs">
      {actions.map((action) => (
        <Paper
          key={action.id}
          p="md"
          withBorder
          className="transition-all hover:shadow-md"
        >
          <Group justify="space-between" align="center">
            <Group gap="md">
              <Checkbox
                size="md"
                radius="xl"
                // Add your toggle completion logic here
              />
              <div>
                <Text size="md" fw={500}>
                  {action.name}
                </Text>
                {action.description && (
                  <Text size="sm" c="dimmed">
                    {action.description}
                  </Text>
                )}
              </div>
            </Group>
            
            {action.dueDate && (
              <Group gap="xs" c="dimmed">
                <IconCalendar size={16} />
                <Text size="sm">
                  {new Date(action.dueDate).toLocaleDateString()}
                </Text>
              </Group>
            )}
          </Group>
        </Paper>
      ))}
    </Stack>
  );
} 