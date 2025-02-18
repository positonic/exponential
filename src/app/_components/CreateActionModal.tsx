import { Modal, TextInput, Textarea, Button, Group, ActionIcon, Select } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconCalendar, IconAlarm, IconDots } from '@tabler/icons-react';
import { useState } from "react";
import { api } from "~/trpc/react";
import { type RouterOutputs } from "~/trpc/react";

type Action = RouterOutputs["action"]["getAll"][0];
type Project = RouterOutputs["project"]["getAll"][0];

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
  console.log("initProjectId is ", initProjectId)
  const [opened, { open, close }] = useDisclosure(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState(initProjectId);
  const [priority, setPriority] = useState<ActionPriority>("Quick");

  const utils = api.useUtils();
  const projects = api.project.getAll.useQuery();

  const createAction = api.action.create.useMutation({
    onMutate: async (newAction) => {
      console.log("1. onMutate started with:", newAction);
      // Cancel any outgoing refetches
      await utils.project.getAll.cancel();
      await utils.action.getAll.cancel();
      console.log("2. Cancelled outgoing refetches");

      // Snapshot previous values
      const previousProjects = utils.project.getAll.getData();
      const previousActions = utils.action.getAll.getData();
      console.log("3. Previous projects:", previousProjects);
      console.log("3a. Previous actions:", previousActions);

      // Create optimistic action
      const optimisticAction = {
        id: `temp-${Date.now()}`,
        name: newAction.name,
        description: newAction.description ?? null,
        status: "ACTIVE",
        priority: newAction.priority ?? "Quick",
        projectId: newAction.projectId ?? null,
        createdById: previousProjects?.[0]?.createdById ?? "",
        dueDate: null,
        project: newAction.projectId 
          ? previousProjects?.find(p => p.id === newAction.projectId) ?? null
          : null,
      } satisfies Action;

      // Optimistically update actions
      utils.action.getAll.setData(undefined, (old) => {
        console.log("4. Updating actions list");
        if (!old) return [optimisticAction];
        return [...old, optimisticAction];
      });

      // Optimistically update projects if this action belongs to a project
      if (newAction.projectId) {
        console.log("5. Updating project:", newAction.projectId);
        utils.project.getAll.setData(undefined, (old) => {
          if (!old) {
            console.log("5a. No existing projects, returning previous");
            return previousProjects;
          }
          const updatedProjects = old.map(project => {
            if (project.id === newAction.projectId) {
              console.log("5b. Found matching project:", project.id);
              console.log("5b-1. Project actions:", project.actions);
              const updatedProject = {
                ...project,
                actions: Array.isArray(project.actions) 
                  ? [...project.actions, optimisticAction]
                  : [optimisticAction],
              };
              console.log("5c. Updated project actions:", updatedProject.actions.length);
              return updatedProject;
            }
            return project;
          });
          console.log("5d. Returning updated projects");
          return updatedProjects;
        });
      } else {
        console.log("5. No projectId, skipping project update");
      }

      return { previousProjects, previousActions };
    },
    onError: (err, newAction, context) => {
      console.log("Error in mutation:", err);
      // If mutation fails, restore previous values
      if (context?.previousProjects) {
        console.log("Restoring previous projects");
        utils.project.getAll.setData(undefined, context.previousProjects);
      }
      if (context?.previousActions) {
        console.log("Restoring previous actions");
        utils.action.getAll.setData(undefined, context.previousActions);
      }
    },
    onSettled: async () => {
      console.log("Mutation settled, invalidating queries");
      // Sync with server
      await utils.project.getAll.invalidate();
      await utils.action.getAll.invalidate();
      console.log("Queries invalidated");
    },
    onSuccess: (data) => {
      console.log("Mutation succeeded with data:", data);
      setName("");
      setDescription("");
      setProjectId("");
      setPriority("Quick");
      close();
      console.log("Form reset and modal closed");
    },
  });

  const handleSubmit = () => {
    console.log("Submit clicked with:", { name, description, projectId, priority });
    if (!name) {
      console.log("No name provided, returning");
      return;
    }

    console.log("Creating action with:", {
      name,
      description: description || undefined,
      projectId: projectId || undefined,
      priority: priority || "Quick",
    });

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