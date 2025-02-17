import { Modal, TextInput, Textarea, Button, Group, ActionIcon, Select } from '@mantine/core';
import { IconCalendar, IconFlag, IconAlarm, IconDots } from '@tabler/icons-react';
import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { type RouterOutputs } from "~/trpc/react";

type Action = RouterOutputs["action"]["getAll"][0];
type ActionPriority = "Quick" | "Scheduled" | "1st Priority" | "2nd Priority" | "3rd Priority" | "4th Priority" | "5th Priority" | "Errand" | "Remember" | "Watch" | "Someday Maybe";

interface EditActionModalProps {
  action: Action | null;
  opened: boolean;
  onClose: () => void;
}

const PRIORITY_OPTIONS = [
  "Quick",
  "Scheduled",
  "1st Priority",
  "2nd Priority",
  "3rd Priority",
  "4th Priority",
  "5th Priority",
  "Errand",
  "Remember",
  "Watch",
  "Someday Maybe"
] as const;

export function EditActionModal({ action, opened, onClose }: EditActionModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState<ActionPriority>("Quick");

  const utils = api.useUtils();
  const projects = api.project.getAll.useQuery();

  useEffect(() => {
    if (action) {
      setName(action.name);
      setDescription(action.description ?? "");
      setProjectId(action.projectId ?? "");
      setPriority(action.priority as ActionPriority);
    }
  }, [action]);

  const updateAction = api.action.update.useMutation({
    onSuccess: () => {
      void utils.action.getAll.invalidate();
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
          backgroundColor: '#1A1B1E',
          color: '#C1C2C5',
        }
      }}
    >
      <div className="p-4">
        <TextInput
          placeholder="Task name"
          variant="unstyled"
          size="xl"
          value={name}
          onChange={(e) => setName(e.target.value)}
          styles={{
            input: {
              fontSize: '24px',
              color: '#C1C2C5',
              '&::placeholder': {
                color: '#C1C2C5',
              },
            },
          }}
        />
        
        <Textarea
          placeholder="Description"
          variant="unstyled"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          styles={{
            input: {
              color: '#909296',
              '&::placeholder': {
                color: '#909296',
              },
            },
          }}
        />

        <Group gap="xs" mt="md">
          <Select
            placeholder="Priority"
            value={priority}
            onChange={(value) => setPriority(value as ActionPriority)}
            data={PRIORITY_OPTIONS.map(p => ({ value: p, label: p }))}
            styles={{
                input: {
                  backgroundColor: '#1A1B1E',
                  color: '#C1C2C5',
                  borderColor: '#373A40',
                },
                dropdown: {
                  backgroundColor: '#1A1B1E',
                  borderColor: '#373A40',
                  color: '#C1C2C5',
                },
              }}
          />
          <ActionIcon variant="subtle" color="gray" radius="xl">
            <IconCalendar size={20} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="gray" radius="xl">
            <IconAlarm size={20} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="gray" radius="xl">
            <IconDots size={20} />
          </ActionIcon>
        </Group>
      </div>

      <div className="border-t border-gray-800 p-4 mt-4">
        <Group justify="space-between">
          <Select
            placeholder="Select a project"
            variant="unstyled"
            value={projectId}
            onChange={(value) => setProjectId(value ?? '')}
            data={projects.data?.map((p) => ({ value: p.id, label: p.name })) ?? []}
            styles={{
                input: {
                  backgroundColor: '#1A1B1E',
                  color: '#C1C2C5',
                  borderColor: '#373A40',
                  paddingLeft: '13px',
                },
                dropdown: {
                  backgroundColor: '#1A1B1E',
                  borderColor: '#373A40',
                  color: '#C1C2C5',
                },
              }}
          />
          <Group>
            <Button variant="subtle" color="gray" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              loading={updateAction.isPending}
            >
              Save changes
            </Button>
          </Group>
        </Group>
      </div>
    </Modal>
  );
} 