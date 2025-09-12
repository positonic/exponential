import { Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useViewportSize } from '@mantine/hooks';
import { useState } from "react";
import { api } from "~/trpc/react";
import { type ActionPriority } from "~/types/action";
import { ActionModalForm } from './ActionModalForm';
import { AssignActionModal } from './AssignActionModal';
import { IconPlus } from '@tabler/icons-react';
import type { ActionStatus } from '@prisma/client';

export function CreateActionModal({ viewName, projectId: propProjectId }: { viewName: string; projectId?: string }) {
  
  const { width } = useViewportSize();
  // Use propProjectId if provided, otherwise try to extract from viewName
  const initProjectId = propProjectId || (viewName.includes("project-") ? viewName.split("-").pop() : '');
  const [opened, { open, close }] = useDisclosure(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string | undefined>(initProjectId || undefined);
  const [priority, setPriority] = useState<ActionPriority>("Quick");
  const [dueDate, setDueDate] = useState<Date | null>(() => {
    // If we're on the /today page, default to today's date
    if (viewName.toLowerCase() === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return today;
    }
    return null;
  });
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [assignModalOpened, setAssignModalOpened] = useState(false);
  const [createdActionId, setCreatedActionId] = useState<string | null>(null);

  const utils = api.useUtils();
  
  // Assignment mutation for post-creation assignment
  const assignMutation = api.action.assign.useMutation({
    onError: (error) => {
      console.error('Assignment failed:', error);
    },
  });
  
  const createAction = api.action.create.useMutation({
    onMutate: async (newAction) => {
      // Cancel all related queries
      const queriesToCancel = [
        utils.project.getAll,
        utils.action.getAll,
        utils.action.getToday,
      ];
      await Promise.all(queriesToCancel.map(query => query.cancel()));

      // Snapshot all previous states
      const previousState = {
        projects: utils.project.getAll.getData(),
        actions: utils.action.getAll.getData(),
        todayActions: utils.action.getToday.getData(),
      };

      // Create optimistic action
      const optimisticAction = {
        id: `temp-${Date.now()}`,
        name: newAction.name,
        description: newAction.description ?? null,
        status: "ACTIVE",
        priority: newAction.priority ?? "Quick",
        projectId: newAction.projectId ?? null,
        createdById: previousState.projects?.[0]?.createdById ?? "",
        dueDate: newAction.dueDate ? new Date(newAction.dueDate) : null,
        transcriptionSessionId: null,
        teamId: null,
        assignedToId: null,
        kanbanStatus: newAction.projectId ? "TODO" as ActionStatus : null, // Set kanban status for project actions
        kanbanOrder: null, // Will be set by the server
        completedAt: null, // New field for completion timestamp
        syncs: [], // Initialize empty syncs array for consistency with getAll type
        assignees: [], // Initialize empty assignees array for type consistency
        project: newAction.projectId 
          ? previousState.projects?.find(p => p.id === newAction.projectId) ?? null
          : null,
      };

      // Helper function to add action to a list
      const addActionToList = (list: typeof previousState.actions) => {
        if (!list) return [optimisticAction];
        return [...list, optimisticAction];
      };

      // Update all action lists
      utils.action.getAll.setData(undefined, addActionToList);

      // Update today's actions - only if we're in the today view
      if (viewName.toLowerCase() === 'today') {
        void utils.action.getToday.invalidate();
      }

      // Update project if action belongs to one
      if (newAction.projectId) {
        // Optimistically update the project.getAll list
        utils.project.getAll.setData(undefined, (old) => {
          if (!old) return previousState.projects;
          
          return old.map(project => 
            project.id === newAction.projectId
              ? {
                  ...project,
                  actions: Array.isArray(project.actions)
                    ? [...project.actions, optimisticAction]
                    : [optimisticAction],
                }
              : project
          );
        });

        // ---> ADDED: Optimistically update the specific project.getById data <--- 
        utils.project.getById.setData({ id: newAction.projectId }, (oldProject) => {
          if (!oldProject) return undefined; // Or handle appropriately if cache might not exist
          return {
            ...oldProject,
            actions: Array.isArray(oldProject.actions)
              ? [...oldProject.actions, optimisticAction]
              : [optimisticAction],
          };
        });
      }

      return previousState;
    },

    onError: (err, variables, context) => {
      if (!context) return;

      // Restore all previous states
      const { projects, actions, todayActions } = context;
      utils.project.getAll.setData(undefined, projects);
      utils.action.getAll.setData(undefined, actions);
      utils.action.getToday.setData(undefined, todayActions);
    },

    onSettled: async (data, error, variables) => {
      // Invalidate queries smartly based on the new action and view context
      const projectId = variables.projectId;
      const isTodayAction = variables.dueDate && 
                            new Date(variables.dueDate).toDateString() === new Date().toDateString();

      console.log(`[CreateActionModal onSettled] Invalidating for view: ${viewName}, newActionId: ${data?.id ?? 'optimistic'}, projectId: ${projectId}, isToday: ${isTodayAction}`);

      const invalidatePromises: Promise<unknown>[] = [];

      // If action belongs to a project, invalidate the actions for that project
      if (projectId) {
        invalidatePromises.push(utils.action.getProjectActions.invalidate({ projectId }));
      }

      // Invalidate Today view if relevant
      if (isTodayAction || viewName.toLowerCase() === 'today') {
        invalidatePromises.push(utils.action.getToday.invalidate());
      }

      // Invalidate Inbox/All view if it has no project (or if it's the default view)
      if (!projectId || viewName.toLowerCase() === 'inbox') {
          // Assuming 'inbox' relies on action.getAll or a specific inbox query
         invalidatePromises.push(utils.action.getAll.invalidate());
      }

      // Avoid invalidating project.getAll unless absolutely necessary
      // invalidatePromises.push(utils.project.getAll.invalidate()); 

      await Promise.all(invalidatePromises);
      console.log(`[CreateActionModal onSettled] Invalidations complete for newActionId: ${data?.id ?? 'optimistic'}`);
    },

    onSuccess: async (data) => {
      // Store the created action ID for assignment
      setCreatedActionId(data.id);
      
      // If there are assignees, assign them
      if (selectedAssigneeIds.length > 0) {
        try {
          await assignMutation.mutateAsync({
            actionId: data.id,
            userIds: selectedAssigneeIds,
          });
        } catch (error) {
          console.error('Failed to assign users:', error);
          // Continue with success flow even if assignment fails
        }
      }
      
      // Reset form state
      setName("");
      setDescription("");
      // Reset projectId to initial value (current project if on project page)
      setProjectId(initProjectId || undefined);
      setPriority("Quick");
      // Reset dueDate to today if on /today page, otherwise null
      setDueDate(() => {
        if (viewName.toLowerCase() === 'today') {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return today;
        }
        return null;
      });
      setSelectedAssigneeIds([]);
      close();
    },
  });

  const handleSubmit = () => {
    if (!name) return;

    const actionData = {
      name,
      description: description || undefined,
      projectId: projectId || undefined,
      priority: priority || "Quick",
      dueDate: dueDate || undefined,
    };

    createAction.mutate(actionData);
  };

  const handleAssigneeClick = () => {
    if (createdActionId) {
      // If action is already created, open assignment modal
      setAssignModalOpened(true);
    } else {
      // For creation flow, we can't open assignment modal yet
      // This could be expanded to show a preview modal or inline selection
      console.log('Assignment during creation not yet implemented');
    }
  };

  return (
    <>
      <button
        onClick={open}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-gray-400 hover:bg-gray-800 hover:text-gray-300 transition-colors"
      >
        <IconPlus size={16} />
        <span>Add task</span>
      </button>

      <Modal 
        opened={opened} 
        onClose={close}
        size="lg"
        radius="md"
        padding="lg"
        fullScreen={width < 640}
        styles={{
          header: { display: 'none' },
          body: { padding: 0 },
          content: {
            backgroundColor: 'var(--color-bg-elevated)',
            color: 'var(--color-text-primary)',
          },
          inner: {
            padding: '16px',
          }
        }}
      >
        <ActionModalForm
          name={name}
          setName={setName}
          description={description}
          setDescription={setDescription}
          priority={priority}
          setPriority={setPriority}
          projectId={projectId}
          setProjectId={setProjectId}
          dueDate={dueDate}
          setDueDate={setDueDate}
          selectedAssigneeIds={selectedAssigneeIds}
          actionId={createdActionId || undefined}
          onAssigneeClick={handleAssigneeClick}
          onSubmit={handleSubmit}
          onClose={close}
          submitLabel="New action"
          isSubmitting={createAction.isPending}
        />
      </Modal>
      
      {createdActionId && (
        <AssignActionModal
          opened={assignModalOpened}
          onClose={() => setAssignModalOpened(false)}
          actionId={createdActionId}
          actionName={name}
          projectId={projectId}
          currentAssignees={[]} // For simplicity, start with empty - could be enhanced
        />
      )}
    </>
  );
} 