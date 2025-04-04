import { Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useViewportSize } from '@mantine/hooks';
import { useState } from "react";
import { api } from "~/trpc/react";
import { type ActionPriority } from "~/types/action";
import { ActionModalForm } from './ActionModalForm';
import { IconPlus } from '@tabler/icons-react';

export function CreateActionModal({ viewName }: { viewName: string }) {
  
  const { width } = useViewportSize();
  const initProjectId = viewName.includes("project-") ? viewName.split("-")[2] : '';
  const [opened, { open, close }] = useDisclosure(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string | undefined>(initProjectId || undefined);
  const [priority, setPriority] = useState<ActionPriority>("Quick");
  const [dueDate, setDueDate] = useState<Date | null>(null);

  const utils = api.useUtils();
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
        utils.action.getToday.setData(undefined, addActionToList);
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

    onError: (err, newAction, context) => {
      if (!context) return;

      // Restore all previous states
      const { projects, actions, todayActions } = context;
      utils.project.getAll.setData(undefined, projects);
      utils.action.getAll.setData(undefined, actions);
      utils.action.getToday.setData(undefined, todayActions);
    },

    onSettled: async (data, error, newAction) => {
      // Invalidate queries smartly based on the new action and view context
      const projectId = newAction.projectId;
      const isTodayAction = newAction.dueDate && 
                            new Date(newAction.dueDate).toDateString() === new Date().toDateString();

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

    onSuccess: () => {
      // Reset form state
      setName("");
      setDescription("");
      setProjectId(undefined);
      setPriority("Quick");
      setDueDate(null);
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
            backgroundColor: '#262626',
            color: '#C1C2C5',
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
          onSubmit={handleSubmit}
          onClose={close}
          submitLabel="New action"
          isSubmitting={createAction.isPending}
        />
      </Modal>
    </>
  );
} 