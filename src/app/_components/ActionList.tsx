import { Checkbox, Text, Group, Paper, SegmentedControl } from '@mantine/core';
import { type RouterOutputs } from "~/trpc/react";
import { api } from "~/trpc/react";
import { useState } from "react";
import React from "react";
import { EditActionModal } from "./EditActionModal";

type Action = RouterOutputs["action"]["getAll"][0];

export function ActionList({ viewName, actions }: { viewName: string, actions: Action[] }) {
  const [filter, setFilter] = useState<"ACTIVE" | "COMPLETED">("ACTIVE");
  const [selectedAction, setSelectedAction] = useState<Action | null>(null);
  const [editModalOpened, setEditModalOpened] = useState(false);
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
          action.id === id 
            ? { ...action, status: status as string } 
            : action
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

  const handleActionClick = (action: Action) => {
    setSelectedAction(action);
    setEditModalOpened(true);
  };

  console.log('viewName is:', viewName);
  console.log('viewName ProjectID[2] is', viewName.split('-')[2]);
  console.log('viewName ProjectID[2] actions is',  actions.filter(action => 
    action.projectId === viewName.split('-')[2]
  ))
          
  // Filter the actions directly without memoization
  const filteredActions = (() => {
    const today = new Date().toISOString().split('T')[0];
    
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
          // Handle project views - check if viewName starts with 'project-'
          if (viewName.startsWith('project-')) {
            return actions.filter(action => 
              action.projectId === viewName.split('-')[2]
            );
          }
          return actions;
      }
    })();

    // Then filter by status
    return dateFiltered.filter((action) => action.status === filter);
  })();

  return (
    <>
      <Group justify="space-between" mb="md" className="flex-col sm:flex-row gap-4">
        <h2 className="text-2xl font-bold">Actions</h2>
        <div className="w-full sm:w-auto">
          <SegmentedControl
            value={filter}
            onChange={(value) => setFilter(value as "ACTIVE" | "COMPLETED")}
            data={[
              { label: 'Active', value: 'ACTIVE' },
              { label: 'Completed', value: 'COMPLETED' },
            ]}
            styles={{
              root: {
                backgroundColor: '#262626',
                border: '1px solid #2C2E33',
              },
              label: {
                color: '#C1C2C5',
                padding: '8px 16px',
              },
              indicator: {
                backgroundColor: '#333',
              },
            }}
          />
        </div>
      </Group>

      {filteredActions.map((action) => (
        <Paper
          key={action.id}
          p="md"
          withBorder
          className="transition-all hover:shadow-md cursor-pointer mb-3"
          bg="#262626"
          style={{
            borderColor: '#2C2E33',
          }}
          onClick={(e) => {
            // Only open modal if we didn't click the checkbox
            if (!(e.target as HTMLElement).closest('.checkbox-wrapper')) {
              handleActionClick(action);
            }
          }}
        >
          <Group justify="space-between" align="center" wrap="nowrap">
            <Group gap="md" wrap="nowrap" className="min-w-0">
              <div className="checkbox-wrapper">
                <Checkbox
                  size="md"
                  radius="xl"
                  checked={action.status === "COMPLETED"}
                  onChange={(event) => {
                    handleCheckboxChange(action.id, event.currentTarget.checked);
                  }}
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
                        '#373A40',
                      backgroundColor: 'transparent',
                      cursor: 'pointer',
                      flexShrink: 0,
                    },
                  }}
                />
              </div>
              <Text className="truncate">{action.name}</Text>
            </Group>
            {action.dueDate && (
              <Text size="sm" c="dimmed" className="hidden sm:block">
                {action.dueDate.toLocaleDateString()}
              </Text>
            )}
          </Group>
        </Paper>
      ))}

      <EditActionModal
        action={selectedAction}
        opened={editModalOpened}
        onClose={() => {
          setEditModalOpened(false);
          setSelectedAction(null);
        }}
      />
    </>
  );
} 