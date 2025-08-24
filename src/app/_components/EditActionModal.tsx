import { Modal } from '@mantine/core';
import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { type RouterOutputs } from "~/trpc/react";
import { type ActionPriority } from "~/types/action";
import { ActionModalForm } from './ActionModalForm';
import { AssignActionModal } from './AssignActionModal';

type ActionWithSyncs = RouterOutputs["action"]["getAll"][0];
type ActionWithoutSyncs = RouterOutputs["action"]["getToday"][0];
type Action = ActionWithSyncs | ActionWithoutSyncs;

interface EditActionModalProps {
  action: Action | null;
  opened: boolean;
  onClose: () => void;
}

export function EditActionModal({ action, opened, onClose }: EditActionModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState<ActionPriority>("Quick");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [assignModalOpened, setAssignModalOpened] = useState(false);

  const utils = api.useUtils();

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
    }
  }, [currentAction]);

  const updateAction = api.action.update.useMutation({
    onSuccess: async () => {
      await utils.action.getAll.invalidate();
      await utils.action.getProjectActions.invalidate();
      onClose();
    },
  });

  const handleSubmit = () => {
    if (!name || !currentAction) return;

    updateAction.mutate({
      id: currentAction.id,
      name,
      description: description || undefined,
      projectId: projectId || undefined,
      priority,
      dueDate: dueDate || undefined,
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
        selectedAssigneeIds={selectedAssigneeIds}
        actionId={currentAction?.id}
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