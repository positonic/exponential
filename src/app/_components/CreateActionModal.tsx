import { Modal, TextInput, Textarea, Button, Group, ActionIcon, Select } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconCalendar, IconFlag, IconAlarm, IconDots } from '@tabler/icons-react';
import { useState } from "react";
import { api } from "~/trpc/react";

type ActionPriority = 
  | "1st Priority"
  | "2nd Priority"
  | "3rd Priority"
  | "4th Priority"
  | "5th Priority"
  | "Quick"
  | "Scheduled"
  | "Errand"
  | "Remember"
  | "Watch";

const PRIORITY_OPTIONS: ActionPriority[] = [
  "1st Priority",
  "2nd Priority",
  "3rd Priority",
  "4th Priority",
  "5th Priority",
  "Quick",
  "Scheduled",
  "Errand",
  "Remember",
  "Watch"
];

export function CreateActionModal() {
  const [opened, { open, close }] = useDisclosure(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState<ActionPriority>("Quick");

  const utils = api.useUtils();
  const projects = api.project.getAll.useQuery();

  const createAction = api.action.create.useMutation({
    onSuccess: () => {
      setName("");
      setDescription("");
      setProjectId("");
      setPriority("Quick");
      void utils.action.getAll.invalidate();
      close();
    },
  });

  const handleSubmit = () => {
    if (!name) {
      return;
    }

    createAction.mutate({
      name,
      description: description || undefined,
      projectId: projectId || undefined,
      priority: priority || "Quick",
    });
  };

  return (
    <>
      <Button onClick={open}>Create Action</Button>

      <Modal 
        opened={opened} 
        onClose={close}
        size="lg"
        radius="md"
        padding="lg"
        fullScreen={window.innerWidth < 640}
        styles={{
          header: { display: 'none' },
          body: { padding: 0 },
          content: {
            backgroundColor: '#262626',
            color: '#C1C2C5',
          },
          inner: {
            padding: '16px',
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
              wrapper: {
                width: '100%',
              }
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
              wrapper: {
                width: '100%',
              }
            }}
          />

          <Group gap="xs" mt="md" className="flex-wrap">
            <Select
              placeholder="Priority"
              value={priority}
              onChange={(value) => setPriority(value as ActionPriority)}
              data={PRIORITY_OPTIONS.map(p => ({ value: p, label: p }))}
              className="w-full sm:w-auto"
              styles={{
                input: {
                  backgroundColor: '#262626',
                  color: '#C1C2C5',
                  borderColor: '#373A40',
                },
                dropdown: {
                  backgroundColor: '#262626',
                  borderColor: '#373A40',
                  color: '#C1C2C5',
                },
              }}
            />
            <Group gap="xs" className="w-full sm:w-auto justify-center sm:justify-start">
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
          </Group>
        </div>

        <div className="border-t border-gray-800 p-4 mt-4">
          <Group justify="space-between">
            <Select
              placeholder="Select a project (optional)"
              variant="unstyled"
              value={projectId}
              onChange={(value) => setProjectId(value ?? '')}
              data={projects.data?.map((p) => ({ value: p.id, label: p.name })) ?? []}
              styles={{
                input: {
                  color: '#C1C2C5',
                },
              }}
            />
            <Group>
              <Button variant="subtle" color="gray" onClick={close}>
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit}
                loading={createAction.isPending}
              >
                New action
              </Button>
            </Group>
          </Group>
        </div>
      </Modal>
    </>
  );
} 