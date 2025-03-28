import { Checkbox, Text, Group, Paper } from '@mantine/core';
import { type RouterOutputs } from "~/trpc/react";
import { api } from "~/trpc/react";
import { useState } from "react";
import React from "react";
import { EditActionModal } from "./EditActionModal";
import type { Priority } from "~/types/action";

type Action = RouterOutputs["action"]["getAll"][0];

// Helper component to render HTML content safely
const HTMLContent = ({ html, className }: { html: string, className?: string }) => (
  <div 
    className={className}
    dangerouslySetInnerHTML={{ __html: html }}
    style={{ display: 'inline' }}
  />
);

export function ActionList({ viewName, actions }: { viewName: string, actions: Action[] }) {
  const [filter, setFilter] = useState<"ACTIVE" | "COMPLETED">("ACTIVE");
  const [selectedAction, setSelectedAction] = useState<Action | null>(null);
  const [editModalOpened, setEditModalOpened] = useState(false);
  const utils = api.useUtils();
  
  const updateAction = api.action.update.useMutation({
    onMutate: async ({ id, status }) => {
      // Cancel outgoing refetches
      await Promise.all([
        utils.action.getAll.cancel(),
        utils.action.getToday.cancel()
      ]);
      
      // Snapshot the previous values
      const previousState = {
        actions: utils.action.getAll.getData(),
        todayActions: utils.action.getToday.getData()
      };
      
      // Helper function to update action in a list
      const updateActionInList = (old: Action[] | undefined) => {
        if (!old) return [];
        return old.map((action) =>
          action.id === id 
            ? { ...action, status: status as string } 
            : action
        );
      };

      // Optimistically update both caches
      utils.action.getAll.setData(undefined, updateActionInList);
      utils.action.getToday.setData(undefined, updateActionInList);
      
      return previousState;
    },
    
    onError: (err, variables, context) => {
      if (!context) return;
      // Restore both caches on error
      utils.action.getAll.setData(undefined, context.actions);
      utils.action.getToday.setData(undefined, context.todayActions);
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

  // Filter the actions directly without memoization
  const filteredActions = (() => {
    // First filter by view
    const dateFiltered = (() => {
      const today = new Date().toISOString().split('T')[0];
      
      switch (viewName.toLowerCase()) {
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
          if (viewName.startsWith('project-')) {
            const projectId = viewName.split('-')[2];
            return actions.filter(action => action.projectId === projectId);
          }
          return actions;
      }
    })();

    // Then filter by status and sort by priority
    return dateFiltered
      .filter((action) => action.status === filter)
      .sort((a, b) => {
        const priorityOrder: Record<Priority, number> = {
          '1st Priority': 1,
          '2nd Priority': 2,
          '3rd Priority': 3,
          '4th Priority': 4,
          '5th Priority': 5,
          'Quick': 6,
          'Scheduled': 7,
          'Errand': 8,
          'Remember': 9,
          'Watch': 10
        };
        
        return (priorityOrder[a.priority as Priority] || 999) - (priorityOrder[b.priority as Priority] || 999);
      });
  })();

  return (
    <>
      <Group justify="space-between" mb="md" className="flex-col sm:flex-row gap-4">
        <h2 className="text-2xl font-bold">Actions</h2>
        <button
          onClick={() => setFilter(filter === "ACTIVE" ? "COMPLETED" : "ACTIVE")}
          className="text-gray-400 hover:text-gray-300 transition-colors"
        >
          {filter === "ACTIVE" ? "Completed" : "Active"}
        </button>
      </Group>

      {filteredActions.map((action) => (
        <Paper
          key={action.id}
          py="sm"
          withBorder
          className="transition-all hover:shadow-md cursor-pointer mb-3"
          bg="#1E1E1E"
          style={{
            borderColor: '#1E1E1E',
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
              <div className="truncate">
                <HTMLContent html={action.name} />
              </div>
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