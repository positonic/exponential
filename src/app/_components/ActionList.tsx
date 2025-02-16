import { Checkbox, Text, Stack, Group, Paper, SegmentedControl } from '@mantine/core';
import { IconCalendar } from '@tabler/icons-react';
import { type RouterOutputs } from "~/trpc/react";
import { api } from "~/trpc/react";
import { useState } from "react";

type Action = RouterOutputs["action"]["getAll"][0];

export function ActionList({ actions }: { actions: Action[] }) {
  const [filter, setFilter] = useState<"ACTIVE" | "COMPLETED">("ACTIVE");
  const utils = api.useUtils();
  const updateAction = api.action.update.useMutation({
    onSuccess: () => {
      void utils.action.getAll.invalidate();
    },
  });

  const handleCheckboxChange = (actionId: string, checked: boolean) => {
    updateAction.mutate({
      id: actionId,
      status: checked ? "COMPLETED" : "ACTIVE",
    });
  };

  const filteredActions = actions.filter((action) => action.status === filter);

  return (
    <>
      <Group justify="space-between" mb="md">
        <h2 className="text-2xl font-bold">Actions</h2>
        <SegmentedControl
          value={filter}
          onChange={(value) => setFilter(value as "ACTIVE" | "COMPLETED")}
          data={[
            { label: 'Active', value: 'ACTIVE' },
            { label: 'Completed', value: 'COMPLETED' },
          ]}
          styles={{
            root: {
              backgroundColor: '#1A1B1E',
              border: '1px solid #2C2E33',
            },
            label: {
              color: '#C1C2C5',  
            },
            indicator: {
              backgroundColor: '#333',
            },
          }}
        />
      </Group>
      {filteredActions.map((action) => (
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
                checked={action.status === "COMPLETED"}
                onChange={(event) => handleCheckboxChange(action.id, event.currentTarget.checked)}
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

            {action.dueDate && (
              <Group gap="xs" c="#909296">
                <IconCalendar size={16} />
                <Text size="sm">
                  {new Date(action.dueDate).toLocaleDateString()}
                </Text>
              </Group>
            )}
          </Group>
        </Paper>
      ))}
    </>
  );
} 