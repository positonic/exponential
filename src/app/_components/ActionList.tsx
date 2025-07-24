import { Checkbox, Text, Group, Paper, Accordion } from '@mantine/core';
import { IconCalendar } from '@tabler/icons-react';
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

// Helper function to format date like "22 Feb"
const formatDate = (date: Date | null | undefined): string => {
  if (!date) return '';
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
};

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
    
    onSettled: async (data) => {
      // Invalidate queries after mutation finishes
      const projectId = data?.projectId;
      if(viewName.toLowerCase() === 'today') {
        await utils.action.getToday.invalidate();
      } else if(projectId) {
        await utils.action.getProjectActions.invalidate(); // Assuming this exists based on previous context
      } else {
        await utils.action.getAll.invalidate();
      }

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

  // --- Filtering Logic --- 
  console.log("[ActionList] Initial Actions Prop:", actions);
  console.log("[ActionList] ViewName Prop:", viewName);
  console.log("[ActionList] Filter State:", filter);

  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalize today to the start of the day

  // Find overdue actions (due before today, status ACTIVE)
  const overdueActions = actions.filter(action => 
    action.dueDate && action.dueDate < today && action.status === 'ACTIVE'
  ).sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0)); // Sort by oldest first
  console.log("[ActionList] Calculated Overdue Actions:", overdueActions);

  // Create a Set of overdue action IDs for quick lookup
  const overdueActionIds = new Set(overdueActions.map(a => a.id));

  // Filter the main list actions
  const filteredActions = (() => {
    
    // Initial filter based on viewName (excluding items already in the overdue list)
    const viewFilteredPreStatus = actions.filter(action => 
      !overdueActionIds.has(action.id) // Exclude actions already marked as overdue
    ).filter(action => {
      // Normalize action due date for comparison if it exists
      let normalizedActionDueDate: Date | null = null;
      if (action.dueDate) {
        normalizedActionDueDate = new Date(action.dueDate);
        normalizedActionDueDate.setHours(0, 0, 0, 0);
      }

      switch (viewName.toLowerCase()) {
        case 'inbox':
          return !action.projectId;
        case 'today':
          // Check if the normalized action due date matches normalized today
          return normalizedActionDueDate?.getTime() === today.getTime();
        case 'upcoming':
          // Check if the action due date is today or later
          return action.dueDate && action.dueDate >= today;
        default:
          if (viewName.startsWith('project-')) {
            // Extract project ID by splitting from the last hyphen (more robust)
            // This handles both old format (name-1-id) and new format (name_1-id)
            const parts = viewName.split('-');
            const projectId = parts[parts.length - 1]; // Get the last part (the actual project ID)
            return action.projectId === projectId;
          }
          return true; // Show all non-overdue if viewName doesn't match known types
      }
    });
    console.log("[ActionList] View Filtered (Pre-Status):", viewFilteredPreStatus);

    // Then filter by status (ACTIVE/COMPLETED) and sort by priority
    const finalFiltered = viewFilteredPreStatus
      .filter((action) => action.status === filter)
      .sort((a, b) => {
        const priorityOrder: Record<Priority, number> = {
          '1st Priority': 1, '2nd Priority': 2, '3rd Priority': 3, '4th Priority': 4,
          '5th Priority': 5, 'Quick': 6, 'Scheduled': 7, 'Errand': 8,
          'Remember': 9, 'Watch': 10
        };
        return (priorityOrder[a.priority as Priority] || 999) - (priorityOrder[b.priority as Priority] || 999);
      });
    console.log("[ActionList] Final Filtered Actions:", finalFiltered);
    return finalFiltered;
  })();
  // --- End Filtering Logic ---

  // Helper to render a single action item (used for both lists)
  const renderActionItem = (action: Action, isOverdue: boolean) => (
    <Paper
      key={action.id}
      py="sm"
      style={{
        background: 'transparent',
        borderColor: '#373A40', 
        borderWidth: '0 0 1px 0', 
        borderRadius: 0, 
        marginBottom: '0',
      }}
      className="transition-all hover:shadow-md cursor-pointer mb-3"
      onClick={(e) => {
        // Only open modal if we didn't click the checkbox
        if (!(e.target as HTMLElement).closest('.checkbox-wrapper')) {
          handleActionClick(action);
        }
      }}
    >
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group gap="md" wrap="nowrap" className="min-w-0 flex-1">
          <div className="checkbox-wrapper pl-1"> {/* Added padding for alignment */}
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
                    '#4A4A4A', // Slightly lighter gray for default checkbox border
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  flexShrink: 0,
                },
              }}
            />
          </div>
          <div className="truncate flex-grow">
            <HTMLContent html={action.name} />
            {action.dueDate && (
               <Group gap={4} align="center" className={`text-xs ${isOverdue ? 'text-red-500' : 'text-gray-500'} mt-1`}>
                 <IconCalendar size={12} />
                 <span>{formatDate(action.dueDate)}</span>
               </Group>
            )}
          </div>
        </Group>
        {/* Optional: Add Project/Context Info Here if needed, similar to screenshot */}
        {/* <Text size="sm" c="dimmed" className="hidden sm:block pr-2">
            {action.projectId ? `Project #${action.projectId}` : 'Inbox'}
        </Text> */}        
      </Group>
    </Paper>
  );

  return (
    <>
      {/* Overdue Section */} 
      {overdueActions.length > 0 && (
        <Accordion 
          defaultValue="overdue" 
          variant="filled" 
          radius="md" 
          className="mb-4 bg-[#1E1E1E]"
          chevronPosition="left"
        >
          <Accordion.Item value="overdue" className="border-none">
            <Accordion.Control className="hover:bg-[#252525]">
                <Group justify="space-between">
                    <Text fw={500}>Overdue</Text>
                    {/* Optional: Add Reschedule button logic here */}
                    <Text size="sm" c="red">Reschedule</Text> 
                </Group>
            </Accordion.Control>
            <Accordion.Panel p={0}>
              {overdueActions.map(action => renderActionItem(action, true))}
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      )}

      {/* Main Action List (Today/Upcoming/Inbox/Project) */} 
      <Group justify="space-between" mb="md" className="flex-col sm:flex-row gap-4">
        {/* Consider making the title dynamic based on viewName */}
        <h2 className="text-xl font-semibold capitalize">{viewName.startsWith('project-') ? viewName.split('-')[1] : viewName} View</h2> 
        <button
          onClick={() => setFilter(filter === "ACTIVE" ? "COMPLETED" : "ACTIVE")}
          className="text-sm text-gray-400 hover:text-gray-300 transition-colors"
        >
          Show: {filter === "ACTIVE" ? "Active" : "Completed"}
        </button>
      </Group>

      {filteredActions.length > 0 
        ? filteredActions.map(action => renderActionItem(action, false))
        : <Text c="dimmed" ta="center" mt="lg">No {filter.toLowerCase()} actions in this view.</Text>
      }

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