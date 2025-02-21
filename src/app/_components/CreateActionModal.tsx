import { Modal, TextInput, Textarea, Button, Group, ActionIcon, Select } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconCalendar, IconAlarm, IconDots } from '@tabler/icons-react';
import { useState } from "react";
import { api } from "~/trpc/react";
import { type RouterOutputs } from "~/trpc/react";

type Action = RouterOutputs["action"]["getAll"][0];

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
  | "Watch"
  | "Someday Maybe";

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

export function CreateActionModal({ viewName }: { viewName: string }) {
  
  const initProjectId = (viewName.includes("project-")) ? viewName.split("-")[2] : '';
  const [opened, { open, close }] = useDisclosure(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState(initProjectId);
  const [priority, setPriority] = useState<ActionPriority>("Quick");

  const utils = api.useUtils();
  const projects = api.project.getAll.useQuery();

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
        dueDate: newAction.dueDate ?? null,
        project: newAction.projectId 
          ? previousState.projects?.find(p => p.id === newAction.projectId) ?? null
          : null,
      } satisfies Action;

      // Helper function to add action to a list
      const addActionToList = (list: Action[] | undefined) => {
        if (!list) return [optimisticAction];
        return [...list, optimisticAction];
      };

      // Update all action lists
      utils.action.getAll.setData(undefined, addActionToList);

      // Update today's actions - only if we're in the today view
      if (viewName.toLowerCase() === 'today') {
        utils.action.getToday.setData(undefined, addActionToList);
      }

      // Update project if action belongs to one
      if (newAction.projectId) {
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
      }

      return previousState;
    },

    onError: (err, newAction, context) => {
      if (!context) return;

      // Restore all previous states
      const { projects, actions, todayActions } = context;
      utils.project.getAll.setData(undefined, projects);
      utils.action.getAll.setData(undefined, actions);
      utils.action.getToday.setData(undefined, todayActions);
    },

    onSettled: async () => {
      // Invalidate all related queries
      const queriesToInvalidate = [
        utils.project.getAll,
        utils.action.getAll,
        utils.action.getToday,
      ];
      await Promise.all(queriesToInvalidate.map(query => query.invalidate()));
    },

    onSuccess: () => {
      // Reset form state
      setName("");
      setDescription("");
      setProjectId("");
      setPriority("Quick");
      close();
    },
  });

  const handleSubmit = () => {
    if (!name) return;

    const getDueDate = () => {
      const viewNameLower = viewName.toLowerCase();
      if (viewNameLower === 'today') {
        return new Date();
      }
      if (viewNameLower === 'upcoming') {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow;
      }
      return undefined;
    };

    const actionData = {
      name,
      description: description || undefined,
      projectId: projectId || undefined,
      priority: priority || "Quick",
      dueDate: getDueDate(),
    };

    createAction.mutate(actionData);
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="p-4"
        >
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
                  type="submit"
                  loading={createAction.isPending}
                >
                  New action
                </Button>
              </Group>
            </Group>
          </div>
        </form>
      </Modal>
    </>
  );
} 