import { Modal } from '@mantine/core';
import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { type RouterOutputs } from "~/trpc/react";
import { type ActionPriority } from "~/types/action";
import { ActionModalForm } from './ActionModalForm';
import { AssignActionModal } from './AssignActionModal';
import { notifications } from '@mantine/notifications';

type ActionWithSyncs = RouterOutputs["action"]["getAll"][0];
// Make createdBy optional to support actions from various sources
type Action = Omit<ActionWithSyncs, 'createdBy'> & {
  createdBy?: ActionWithSyncs['createdBy'] | null;
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

  const utils = api.useUtils();

  // Tag mutation for saving tags
  const setTagsMutation = api.tag.setActionTags.useMutation({
    onError: (error) => {
      console.error('Setting tags failed:', error);
    },
  });

  // Query to get fresh action data including assignees
  const { data: freshAction } = api.action.getAll.useQuery(undefined, {
    select: (actions) => actions?.find(a => a.id === action?.id),
    enabled: !!action?.id && opened, // Only query when modal is open and we have an action
  });

  // Use fresh action data if available, fallback to prop
  const currentAction = freshAction || action;

  useEffect(() => {
    if (currentAction) {
      setName(currentAction.name);
      setDescription(currentAction.description ?? "");
      setProjectId(currentAction.projectId ?? "");
      setPriority(currentAction.priority as ActionPriority);
      setDueDate(currentAction.dueDate ? new Date(currentAction.dueDate) : null);
      // Load scheduling fields - cast to access new fields
      const actionWithSchedule = currentAction as typeof currentAction & {
        scheduledStart?: Date | null;
        duration?: number | null;
      };
      setScheduledStart(actionWithSchedule.scheduledStart ? new Date(actionWithSchedule.scheduledStart) : null);
      setDuration(actionWithSchedule.duration ?? null);
      // Load tags - cast to access tags field
      const actionWithTags = currentAction as typeof currentAction & {
        tags?: Array<{ tag: { id: string } }>;
      };
      if (actionWithTags.tags) {
        setSelectedTagIds(actionWithTags.tags.map(t => t.tag.id));
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
      // Update tags in background if there are any
      if (currentAction && selectedTagIds) {
        try {
          await setTagsMutation.mutateAsync({
            actionId: currentAction.id,
            tagIds: selectedTagIds,
          });

          notifications.show({
            title: "Action Updated",
            message: "All changes saved successfully",
            color: "green",
            autoClose: 3000,
          });
        } catch (error) {
          console.error('Failed to update tags:', error);
          notifications.show({
            title: "Partial Update",
            message: "Action updated but tags failed to save",
            color: "yellow",
            autoClose: 4000,
          });
        }
      } else {
        notifications.show({
          title: "Action Updated",
          message: "Changes saved successfully",
          color: "green",
          autoClose: 3000,
        });
      }

      // Invalidate queries to refresh data
      await utils.action.getAll.invalidate();
      await utils.action.getProjectActions.invalidate();
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
    },
  });

  const handleSubmit = () => {
    if (!name || !currentAction) return;

    // Close modal immediately for better UX
    onClose();

    // Trigger mutation in background (tags will be handled in onSuccess)
    updateAction.mutate({
      id: currentAction.id,
      name,
      description: description || undefined,
      projectId: projectId || undefined,
      priority,
      dueDate: dueDate, // Pass null explicitly to clear the date
      scheduledStart: scheduledStart,
      duration: duration,
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
        setProjectId={(value: string | undefined) => setProjectId(value || "")}
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
        workspaceId={currentAction?.workspaceId ?? undefined}
        onAssigneeClick={handleAssigneeClick}
        onSubmit={handleSubmit}
        onClose={onClose}
        submitLabel="Save changes"
        isSubmitting={updateAction.isPending}
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