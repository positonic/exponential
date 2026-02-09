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
import { useSession } from 'next-auth/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { notifications } from '@mantine/notifications';

export function CreateActionModal({ viewName, projectId: propProjectId, children }: { viewName: string; projectId?: string; children?: React.ReactNode }) {
  const { data: session } = useSession();
  const { width } = useViewportSize();
  // Use propProjectId if provided, otherwise try to extract from viewName
  const initProjectId = propProjectId || (viewName.includes("project-") ? viewName.split("-").pop() : '');
  const [opened, { open, close }] = useDisclosure(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string | undefined>(initProjectId || undefined);
  const [priority, setPriority] = useState<ActionPriority>("Quick");
  const [dueDate, setDueDate] = useState<Date | null>(() => {
    // If we're on the /today or /workspace page, default to today's date
    const lowerViewName = viewName.toLowerCase();
    if (lowerViewName === 'today' || lowerViewName === 'workspace') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return today;
    }
    return null;
  });
  const [scheduledStart, setScheduledStart] = useState<Date | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [assignModalOpened, setAssignModalOpened] = useState(false);
  const [createdActionId, setCreatedActionId] = useState<string | null>(null);

  // Workspace context
  const { workspaceId: currentWorkspaceId } = useWorkspace();

  const utils = api.useUtils();
  
  // Assignment mutation for post-creation assignment
  const assignMutation = api.action.assign.useMutation({
    onError: (error) => {
      console.error('Assignment failed:', error);
    },
  });

  // Tag mutation for post-creation tagging
  const setTagsMutation = api.tag.setActionTags.useMutation({
    onError: (error) => {
      console.error('Setting tags failed:', error);
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
        createdById: session?.user?.id ?? previousState.projects?.[0]?.createdById ?? "",
        dueDate: newAction.dueDate ? new Date(newAction.dueDate) : null,
        scheduledStart: newAction.scheduledStart ? new Date(newAction.scheduledStart) : null,
        scheduledEnd: null,
        duration: newAction.duration ?? null,
        transcriptionSessionId: null,
        teamId: null,
        workspaceId: currentWorkspaceId,
        kanbanStatus: newAction.projectId ? "TODO" as ActionStatus : null, // Set kanban status for project actions
        kanbanOrder: null, // Will be set by the server
        completedAt: null, // New field for completion timestamp
        source: null, // Source of the action (e.g., 'api', 'notion')
        syncs: [], // Initialize empty syncs array for consistency with getAll type
        assignees: [], // Initialize empty assignees array for type consistency
        tags: [], // Initialize empty tags array for type consistency
        // Auto-scheduling fields
        isAutoScheduled: true,
        isHardDeadline: false,
        scheduleId: null,
        idealStartTime: null,
        etaDaysOffset: null,
        etaStatus: null,
        timeSpentMins: 0,
        chunkDurationMins: null,
        parentChunkId: null,
        chunkNumber: null,
        totalChunks: null,
        isRecurring: false,
        recurringParentId: null,
        instanceDate: null,
        blockedByIds: [],
        blockingIds: [],
        isReminderOnly: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        project: newAction.projectId
          ? previousState.projects?.find(p => p.id === newAction.projectId) ?? null
          : null,
        createdBy: {
          id: session?.user?.id ?? "",
          name: session?.user?.name ?? null,
          email: session?.user?.email ?? null,
          image: session?.user?.image ?? null,
        },
      };

      // Helper function to add action to a list
      const addActionToList = (list: typeof previousState.actions) => {
        if (!list) return [optimisticAction];
        return [...list, optimisticAction];
      };

      // Update all action lists
      utils.action.getAll.setData(undefined, addActionToList);

      // Update today's actions - only if we're in the today or workspace view
      const lowerView = viewName.toLowerCase();
      if (lowerView === 'today' || lowerView === 'workspace') {
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

      // Show error notification
      notifications.show({
        title: "Failed to Create Action",
        message: err.message || "Something went wrong. Please try again.",
        color: "red",
        autoClose: 5000,
      });
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

      // Invalidate Inbox/All view if it has no project (or if it's the default view)
      if (!projectId || viewName.toLowerCase() === 'inbox') {
          // Assuming 'inbox' relies on action.getAll or a specific inbox query
         invalidatePromises.push(utils.action.getAll.invalidate());
      }

      // Always invalidate today and scheduled action queries
      invalidatePromises.push(utils.action.getToday.invalidate());
      invalidatePromises.push(utils.action.getScheduledByDate.invalidate());
      invalidatePromises.push(utils.action.getScheduledByDateRange.invalidate());

      // Avoid invalidating project.getAll unless absolutely necessary
      // invalidatePromises.push(utils.project.getAll.invalidate());

      await Promise.all(invalidatePromises);
      console.log(`[CreateActionModal onSettled] Invalidations complete for newActionId: ${data?.id ?? 'optimistic'}`);
    },

    onSuccess: async (data) => {
      // Store the created action ID for assignment
      setCreatedActionId(data.id);

      let hasAssignError = false;
      let hasTagError = false;

      // If there are assignees, assign them
      if (selectedAssigneeIds.length > 0) {
        try {
          await assignMutation.mutateAsync({
            actionId: data.id,
            userIds: selectedAssigneeIds,
          });
        } catch (error) {
          hasAssignError = true;
          console.error('Failed to assign users:', error);
        }
      }

      // If there are tags, set them
      if (selectedTagIds.length > 0) {
        try {
          await setTagsMutation.mutateAsync({
            actionId: data.id,
            tagIds: selectedTagIds,
          });
        } catch (error) {
          hasTagError = true;
          console.error('Failed to set tags:', error);
        }
      }

      // Show success notification with any warnings
      let message = "Action created successfully";
      if (hasAssignError) message += " (assignment failed)";
      if (hasTagError) message += " (tags failed)";

      notifications.show({
        title: hasAssignError || hasTagError ? "Partial Success" : "Success",
        message,
        color: hasAssignError || hasTagError ? "yellow" : "green",
        autoClose: 3000,
      });

      // Form reset already happened in handleSubmit
      // close() already called in handleSubmit
    },
  });

  const handleSubmit = () => {
    if (!name) return;

    // Close modal immediately for better UX
    close();

    // Prepare action data before resetting form
    const actionData = {
      name,
      description: description || undefined,
      projectId: projectId || undefined,
      workspaceId: currentWorkspaceId ?? undefined,
      priority: priority || "Quick",
      dueDate: dueDate || undefined,
      scheduledStart: scheduledStart || undefined,
      duration: duration || undefined,
    };

    // Reset form immediately (moved from onSuccess)
    setName("");
    setDescription("");
    // Reset projectId to initial value (current project if on project page)
    setProjectId(initProjectId || undefined);
    setPriority("Quick");
    // Reset dueDate to today if on /today or /workspace page, otherwise null
    setDueDate(() => {
      const lowerView = viewName.toLowerCase();
      if (lowerView === 'today' || lowerView === 'workspace') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return today;
      }
      return null;
    });
    setScheduledStart(null);
    setDuration(null);
    setSelectedAssigneeIds([]);
    setSelectedTagIds([]);

    // Trigger mutation in background
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
      {children ? (
        <div onClick={open}>{children}</div>
      ) : (
        <button
          onClick={open}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-gray-400 hover:bg-gray-800 hover:text-gray-300 transition-colors"
        >
          <IconPlus size={16} />
          <span>Add task</span>
        </button>
      )}

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
          scheduledStart={scheduledStart}
          setScheduledStart={setScheduledStart}
          duration={duration}
          setDuration={setDuration}
          selectedAssigneeIds={selectedAssigneeIds}
          selectedTagIds={selectedTagIds}
          onTagChange={setSelectedTagIds}
          actionId={createdActionId || undefined}
          workspaceId={currentWorkspaceId ?? undefined}
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