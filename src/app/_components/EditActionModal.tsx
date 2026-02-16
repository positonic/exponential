import { Modal } from '@mantine/core';
import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { type ActionPriority } from "~/types/action";
import type { EffortUnit } from "~/types/effort";
import { ActionModalForm } from './ActionModalForm';
import { AssignActionModal } from './AssignActionModal';
import { notifications } from '@mantine/notifications';
import { useWorkspace } from '~/providers/WorkspaceProvider';

// Minimal action type needed for the edit modal - supports actions from various query sources
// Only requires fields that the modal actually reads for initialization
type Action = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: Date | null;
  projectId: string | null;
  workspaceId?: string | null;
  project?: { workspaceId?: string | null } | null;
  scheduledStart?: Date | null;
  duration?: number | null;
  epicId?: string | null;
  effortEstimate?: number | null;
  blockedByIds?: string[];
  tags?: Array<{ tag: { id: string; name: string; color: string } }>;
  assignees?: Array<{ user: { id: string; name: string | null; email: string | null; image: string | null } }>;
  lists?: Array<{ list: { id: string; name: string; listType: string } }>;
  [key: string]: unknown;
};

interface EditActionModalProps {
  action: Action | null;
  opened: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function EditActionModal({ action, opened, onClose, onSuccess }: EditActionModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState<ActionPriority>("Quick");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [scheduledStart, setScheduledStart] = useState<Date | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [assignModalOpened, setAssignModalOpened] = useState(false);
  // New: Sprint, Epic, Effort, Dependencies
  const [sprintListId, setSprintListId] = useState<string | null>(null);
  const [originalSprintListId, setOriginalSprintListId] = useState<string | null>(null);
  const [epicId, setEpicId] = useState<string | null>(null);
  const [effortEstimate, setEffortEstimate] = useState<number | null>(null);
  const [blockedByIds, setBlockedByIds] = useState<string[]>([]);

  const { workspaceSlug, workspaceId: contextWorkspaceId } = useWorkspace();
  const utils = api.useUtils();

  // Get workspace effortUnit
  const { data: workspaceData } = api.workspace.getBySlug.useQuery(
    { slug: workspaceSlug ?? '' },
    { enabled: !!workspaceSlug && opened }
  );
  const effortUnit = (workspaceData?.effortUnit as EffortUnit | undefined) ?? 'STORY_POINTS';
  const advancedActionsEnabled = workspaceData?.enableAdvancedActions ?? false;

  // Tag mutation for saving tags
  const setTagsMutation = api.tag.setActionTags.useMutation({
    onError: (error) => {
      console.error('Setting tags failed:', error);
    },
  });

  // List mutations for sprint assignment changes
  const addToListMutation = api.list.addAction.useMutation({
    onError: (error) => {
      console.error('Sprint assignment failed:', error);
    },
  });

  const removeFromListMutation = api.list.removeAction.useMutation({
    onError: (error) => {
      console.error('Sprint removal failed:', error);
    },
  });

  // Query to get fresh action data including assignees
  const { data: freshAction } = api.action.getAll.useQuery(undefined, {
    select: (actions) => actions?.find(a => a.id === action?.id),
    enabled: !!action?.id && opened, // Only query when modal is open and we have an action
  });

  // Use fresh action data if available, fallback to prop
  const currentAction = freshAction ?? action;

  useEffect(() => {
    if (currentAction) {
      setName(currentAction.name);
      setDescription(currentAction.description ?? "");
      setProjectId(currentAction.projectId ?? "");
      setPriority(currentAction.priority as ActionPriority);
      setDueDate(currentAction.dueDate ? new Date(currentAction.dueDate) : null);
      // Load scheduling fields
      const actionData = currentAction as typeof currentAction & {
        scheduledStart?: Date | null;
        duration?: number | null;
        epicId?: string | null;
        effortEstimate?: number | null;
        blockedByIds?: string[];
        lists?: Array<{ list: { id: string; listType: string } }>;
        tags?: Array<{ tag: { id: string } }>;
      };
      setScheduledStart(actionData.scheduledStart ? new Date(actionData.scheduledStart) : null);
      setDuration(actionData.duration ?? null);
      // Load epic & effort
      setEpicId(actionData.epicId ?? null);
      setEffortEstimate(actionData.effortEstimate ?? null);
      setBlockedByIds(actionData.blockedByIds ?? []);
      // Load sprint (first SPRINT-type list)
      const sprintList = actionData.lists?.find(l => l.list.listType === 'SPRINT');
      const sprintId = sprintList?.list.id ?? null;
      setSprintListId(sprintId);
      setOriginalSprintListId(sprintId);
      // Load tags
      if (actionData.tags) {
        setSelectedTagIds(actionData.tags.map(t => t.tag.id));
      } else {
        setSelectedTagIds([]);
      }
    }
  }, [currentAction]);

  const updateAction = api.action.update.useMutation({
    onMutate: async (updatedAction) => {
      // Cancel in-flight queries to prevent race conditions
      await utils.action.getAll.cancel();
      await utils.action.getProjectActions.cancel();

      // Snapshot previous state for rollback
      const previousActions = utils.action.getAll.getData();

      // Optimistically update the action in cache
      utils.action.getAll.setData(undefined, (old) => {
        if (!old) return old;
        return old.map(action =>
          action.id === updatedAction.id
            ? { ...action, ...updatedAction }
            : action
        );
      });

      return { previousActions };
    },

    onSuccess: async () => {
      let hasTagError = false;
      let hasSprintError = false;

      // Update tags
      if (currentAction && selectedTagIds) {
        try {
          await setTagsMutation.mutateAsync({
            actionId: currentAction.id,
            tagIds: selectedTagIds,
          });
        } catch (error) {
          hasTagError = true;
          console.error('Failed to update tags:', error);
        }
      }

      // Handle sprint list changes
      if (currentAction && sprintListId !== originalSprintListId) {
        try {
          // Remove from old sprint if it was set
          if (originalSprintListId) {
            await removeFromListMutation.mutateAsync({
              listId: originalSprintListId,
              actionId: currentAction.id,
            });
          }
          // Add to new sprint if set
          if (sprintListId) {
            await addToListMutation.mutateAsync({
              listId: sprintListId,
              actionId: currentAction.id,
            });
          }
        } catch (error) {
          hasSprintError = true;
          console.error('Failed to update sprint:', error);
        }
      }

      const hasAnyError = hasTagError || hasSprintError;
      notifications.show({
        title: hasAnyError ? "Partial Update" : "Action Updated",
        message: hasAnyError
          ? "Action updated but some changes failed to save"
          : "All changes saved successfully",
        color: hasAnyError ? "yellow" : "green",
        autoClose: 3000,
      });

      // Invalidate queries to refresh data
      await utils.action.getAll.invalidate();
      await utils.action.getProjectActions.invalidate();
      await utils.view.getViewActions.invalidate();
      await utils.action.getToday.invalidate();
      await utils.action.getScheduledByDate.invalidate();
      await utils.action.getScheduledByDateRange.invalidate();

      onSuccess?.();
      // onClose() already called in handleSubmit
    },

    onError: (error, variables, context) => {
      // Rollback optimistic updates
      if (context?.previousActions) {
        utils.action.getAll.setData(undefined, context.previousActions);
      }

      // Show error notification
      notifications.show({
        title: "Update Failed",
        message: error.message || "Failed to update action. Please try again.",
        color: "red",
        autoClose: 5000,
      });
    },

    onSettled: () => {
      // Ensure consistency regardless of success/failure
      void utils.action.getAll.invalidate();
      void utils.action.getProjectActions.invalidate();
      void utils.view.getViewActions.invalidate();
    },
  });

  const handleSubmit = () => {
    if (!name || !currentAction) return;

    // Close modal immediately for better UX
    onClose();

    // Trigger mutation in background (tags and sprint changes handled in onSuccess)
    updateAction.mutate({
      id: currentAction.id,
      name,
      description: description || undefined,
      projectId: projectId || undefined,
      priority,
      dueDate: dueDate, // Pass null explicitly to clear the date
      scheduledStart: scheduledStart,
      duration: duration,
      epicId: epicId,
      effortEstimate: effortEstimate,
      blockedByIds: blockedByIds,
    });
  };

  const handleAssigneeClick = () => {
    if (currentAction) {
      setAssignModalOpened(true);
    }
  };

  // Get current assignees for edit mode
  const currentAssignees = currentAction && 'assignees' in currentAction && currentAction.assignees ? currentAction.assignees : [];
  const selectedAssigneeIds = currentAssignees.map(a => a.user.id);

  return (
    <>
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      radius="md"
      padding="lg"
      styles={{
        header: { display: 'none' },
        body: { padding: 0 },
        content: {
          backgroundColor: 'var(--color-bg-elevated)',
          color: 'var(--color-text-primary)',
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
        setProjectId={(value: string | undefined) => setProjectId(value ?? "")}
        dueDate={dueDate}
        setDueDate={setDueDate}
        scheduledStart={scheduledStart}
        setScheduledStart={setScheduledStart}
        duration={duration}
        setDuration={setDuration}
        selectedAssigneeIds={selectedAssigneeIds}
        selectedTagIds={selectedTagIds}
        onTagChange={setSelectedTagIds}
        actionId={currentAction?.id}
        workspaceId={(currentAction?.workspaceId ?? currentAction?.project?.workspaceId ?? contextWorkspaceId) as string | undefined}
        onAssigneeClick={handleAssigneeClick}
        onSubmit={handleSubmit}
        onClose={onClose}
        submitLabel="Save changes"
        isSubmitting={updateAction.isPending}
        {...(advancedActionsEnabled ? {
          sprintListId,
          setSprintListId,
          epicId,
          setEpicId,
          effortEstimate,
          setEffortEstimate,
          effortUnit,
          blockedByIds,
          setBlockedByIds,
        } : {})}
      />
    </Modal>

    {currentAction && (
      <AssignActionModal
        opened={assignModalOpened}
        onClose={() => setAssignModalOpened(false)}
        actionId={currentAction.id}
        actionName={currentAction.name}
        projectId={currentAction.projectId}
        currentAssignees={currentAssignees}
      />
    )}
  </>
  );
}
