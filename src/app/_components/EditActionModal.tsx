import { Modal } from '@mantine/core';
import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { type RouterOutputs } from "~/trpc/react";
import { type ActionPriority } from "~/types/action";
import { ActionModalForm } from './ActionModalForm';

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

  const utils = api.useUtils();

  useEffect(() => {
    if (action) {
      setName(action.name);
      setDescription(action.description ?? "");
      setProjectId(action.projectId ?? "");
      setPriority(action.priority as ActionPriority);
      setDueDate(action.dueDate ? new Date(action.dueDate) : null);
    }
  }, [action]);

  const updateAction = api.action.update.useMutation({
    onSuccess: async () => {
      await utils.action.getAll.invalidate();
      await utils.action.getProjectActions.invalidate();
      onClose();
    },
  });

  const handleSubmit = () => {
    if (!name || !action) return;

    updateAction.mutate({
      id: action.id,
      name,
      description: description || undefined,
      projectId: projectId || undefined,
      priority,
      dueDate: dueDate || undefined,
    });
  };

  return (
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
        onSubmit={handleSubmit}
        onClose={onClose}
        submitLabel="Save changes"
        isSubmitting={updateAction.isPending}
      />
    </Modal>
  );
}