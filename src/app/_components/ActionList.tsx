import { Checkbox, Text, Stack, Group, Paper } from '@mantine/core';
import { IconCalendar } from '@tabler/icons-react';
import { type RouterOutputs } from "~/trpc/react";

type Action = RouterOutputs["action"]["getAll"][0];

export function ActionList({ actions }: { actions: Action[] }) {
  return (
    <Stack gap="md" w="100%">
      {actions.map((action) => (
        <Paper
          key={action.id}
          p="md"
          withBorder
          className="transition-all hover:shadow-md"
          bg="#1A1B1E"
          style={{
            borderColor: '#2C2E33',
          }}
        >
          <Group justify="space-between" align="center">
            <Group gap="md">
              <Checkbox
                size="md"
                radius="xl"
                styles={{
                  input: {
                    borderColor: '#373A40',
                    backgroundColor: 'transparent',
                  },
                }}
              />
              <div>
                <Text size="md" fw={500} c="#C1C2C5">
                  {action.name}
                </Text>
                {action.description && (
                  <Text size="sm" c="#909296">
                    {action.description}
                  </Text>
                )}
              </div>
            </Group>

            {/* {action.reviewDate && (
              <Group gap="xs" c="#909296">
                <IconCalendar size={16} />
                <Text size="sm">
                  {new Date(action.dueDate).toLocaleDateString()}
                </Text>
              </Group>
            )} */}
          </Group>
        </Paper>
      ))}
    </Stack>
  );
} 