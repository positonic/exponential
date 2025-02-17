import { Checkbox, Text, Group, Paper, SegmentedControl, Badge } from '@mantine/core';
import { IconCalendar } from '@tabler/icons-react';
import { type RouterOutputs } from "~/trpc/react";
import { api } from "~/trpc/react";
import { useState } from "react";
import React from "react";

type Action = RouterOutputs["action"]["getAll"][0];

export function ActionList({ viewName, actions }: { viewName: string, actions: Action[] }) {
  const [filter, setFilter] = useState<"ACTIVE" | "COMPLETED">("ACTIVE");
  const utils = api.useUtils();
  
  const updateAction = api.action.update.useMutation({
    // Optimistically update the UI
    onMutate: async ({ id, status }) => {
      // Cancel outgoing refetches
      await utils.action.getAll.cancel();
      
      // Snapshot the previous value
      const previousActions = utils.action.getAll.getData();
      
      // Optimistically update the cache
      utils.action.getAll.setData(undefined, (old) => {
        if (!old) return previousActions;
        return old.map((action) =>
          action.id === id ? { ...action, status } : action
        );
      });
      
      return { previousActions };
    },
    
    // If error, roll back
    onError: (err, variables, context) => {
      if (context?.previousActions) {
        utils.action.getAll.setData(undefined, context.previousActions);
      }
    },
    
    // After success, sync with server
    onSettled: () => {
      void utils.action.getAll.invalidate();
    },
  });

  const handleCheckboxChange = (actionId: string, checked: boolean) => {
    const newStatus = checked ? "COMPLETED" : "ACTIVE";
    updateAction.mutate({
      id: actionId,
      status: newStatus,
    });
  };

  // Memoize the filtered actions to prevent unnecessary recalculations
  const filteredActions = React.useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    console.log('viewName', viewName);
    // First filter by date
    const dateFiltered = (() => {
      switch (viewName) {
        case 'inbox':
          return actions.filter(action => !action.projectId);
        case 'today':
          return actions.filter(action => 
            action.dueDate && action.dueDate.toISOString().split('T')[0] === today
          );
        case 'upcoming':
          return actions.filter(action => 
            action.dueDate && action.dueDate.toISOString() > new Date().toISOString()
          );
        default:
          return actions;
      }
    })();

    // Then filter by status
    return dateFiltered.filter((action) => action.status === filter);
  }, [actions, viewName, filter]);

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
          className="transition-all hover:shadow-md cursor-pointer"
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
                disabled={updateAction.isPending}
                styles={{
                  input: {
                    borderColor: action.priority === '1st Priority' ? 'var(--mantine-color-red-filled)' :
                      action.priority === '2nd Priority' ? 'var(--mantine-color-orange-filled)' :
                      action.priority === '3rd Priority' ? 'var(--mantine-color-yellow-filled)' :
                      action.priority === '4th Priority' ? 'var(--mantine-color-green-filled)' :
                      action.priority === '5th Priority' ? 'var(--mantine-color-blue-filled)' :
                      action.priority === 'Quick' ? 'var(--mantine-color-violet-filled)' :
                      action.priority === 'Scheduled' ? 'var(--mantine-color-pink-filled)' :
                      action.priority === 'Errand' ? 'var(--mantine-color-cyan-filled)' :
                      action.priority === 'Remember' ? 'var(--mantine-color-indigo-filled)' :
                      action.priority === 'Watch' ? 'var(--mantine-color-grape-filled)' :
                      '#373A40', // default color for 'Someday Maybe' or unknown priorities
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    '&::before': {
                      content: '""',
                      display: 'block',
                      position: 'absolute',
                      top: '2px',
                      left: '2px',
                      right: '2px',
                      bottom: '2px',
                      borderRadius: '50%',
                      background: 'currentColor',
                      transition: 'opacity 0.2s ease-in-out',
                      opacity: '0',
                    },
                    '&:hover::before': {
                      opacity: '0.3',
                    }
                  },
                  body: {
                    cursor: 'pointer',
                  },
                  inner: {
                    cursor: 'pointer',
                  }
                }}
              />
              <div>
                <Group gap="xs">
                  <Text size="md" fw={500} c="#C1C2C5">
                    {action.name}
                  </Text>
                  <Badge 
                    variant="filled"
                    color={
                      action.priority === '1st Priority' ? 'red' :
                      action.priority === '2nd Priority' ? 'orange' :
                      action.priority === '3rd Priority' ? 'yellow' :
                      action.priority === '4th Priority' ? 'green' :
                      action.priority === '5th Priority' ? 'blue' :
                      action.priority === 'Quick' ? 'violet' :
                      action.priority === 'Scheduled' ? 'pink' :
                      action.priority === 'Errand' ? 'cyan' :
                      action.priority === 'Remember' ? 'indigo' :
                      action.priority === 'Watch' ? 'grape' :
                      'gray' // for Someday Maybe
                    }
                  >
                    {action.priority.split(' ')[0]}
                  </Badge>
                </Group>
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