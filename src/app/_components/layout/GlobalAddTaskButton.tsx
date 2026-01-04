"use client";

import { Modal, ActionIcon, Tooltip } from "@mantine/core";
import { useDisclosure, useViewportSize } from "@mantine/hooks";
import { useState } from "react";
import { api } from "~/trpc/react";
import type { ActionPriority } from "~/types/action";
import { ActionModalForm } from "../ActionModalForm";
import { AssignActionModal } from "../AssignActionModal";
import { IconPlus } from "@tabler/icons-react";
import type { ActionStatus } from "@prisma/client";
import { useSession } from "next-auth/react";

export function GlobalAddTaskButton() {
  const { data: session } = useSession();
  const { width } = useViewportSize();
  const [opened, { open, close }] = useDisclosure(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [priority, setPriority] = useState<ActionPriority>("Quick");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [assignModalOpened, setAssignModalOpened] = useState(false);
  const [createdActionId, setCreatedActionId] = useState<string | null>(null);

  const utils = api.useUtils();

  // Assignment mutation for post-creation assignment
  const assignMutation = api.action.assign.useMutation({
    onError: (error) => {
      console.error("Assignment failed:", error);
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
      await Promise.all(queriesToCancel.map((query) => query.cancel()));

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
        createdById:
          session?.user?.id ?? previousState.projects?.[0]?.createdById ?? "",
        dueDate: newAction.dueDate ? new Date(newAction.dueDate) : null,
        transcriptionSessionId: null,
        teamId: null,
        workspaceId: null,
        kanbanStatus: newAction.projectId ? ("TODO" as ActionStatus) : null,
        kanbanOrder: null,
        completedAt: null,
        source: null,
        syncs: [],
        assignees: [],
        project: newAction.projectId
          ? (previousState.projects?.find((p) => p.id === newAction.projectId) ??
            null)
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

      // Update project if action belongs to one
      if (newAction.projectId) {
        utils.project.getAll.setData(undefined, (old) => {
          if (!old) return previousState.projects;

          return old.map((project) =>
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

        utils.project.getById.setData(
          { id: newAction.projectId },
          (oldProject) => {
            if (!oldProject) return undefined;
            return {
              ...oldProject,
              actions: Array.isArray(oldProject.actions)
                ? [...oldProject.actions, optimisticAction]
                : [optimisticAction],
            };
          }
        );
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
    },

    onSettled: async (data, error, variables) => {
      const projectId = variables.projectId;
      const isTodayAction =
        variables.dueDate &&
        new Date(variables.dueDate).toDateString() === new Date().toDateString();

      const invalidatePromises: Promise<unknown>[] = [];

      if (projectId) {
        invalidatePromises.push(
          utils.action.getProjectActions.invalidate({ projectId })
        );
      }

      if (isTodayAction) {
        invalidatePromises.push(utils.action.getToday.invalidate());
      }

      if (!projectId) {
        invalidatePromises.push(utils.action.getAll.invalidate());
      }

      await Promise.all(invalidatePromises);
    },

    onSuccess: async (data) => {
      setCreatedActionId(data.id);

      if (selectedAssigneeIds.length > 0) {
        try {
          await assignMutation.mutateAsync({
            actionId: data.id,
            userIds: selectedAssigneeIds,
          });
        } catch (error) {
          console.error("Failed to assign users:", error);
        }
      }

      // Reset form state
      setName("");
      setDescription("");
      setProjectId(undefined);
      setPriority("Quick");
      setDueDate(null);
      setSelectedAssigneeIds([]);
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

  const handleAssigneeClick = () => {
    if (createdActionId) {
      setAssignModalOpened(true);
    }
  };

  return (
    <>
      <Tooltip label="Add task" position="bottom" withArrow>
        <ActionIcon
          onClick={open}
          variant="subtle"
          size="lg"
          radius="md"
          className="text-text-secondary hover:text-text-primary hover:bg-surface-hover"
          aria-label="Add task"
        >
          <IconPlus size={20} />
        </ActionIcon>
      </Tooltip>

      <Modal
        opened={opened}
        onClose={close}
        size="lg"
        radius="md"
        padding="lg"
        fullScreen={width < 640}
        styles={{
          header: { display: "none" },
          body: { padding: 0 },
          content: {
            backgroundColor: "var(--color-bg-elevated)",
            color: "var(--color-text-primary)",
          },
          inner: {
            padding: "16px",
          },
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
          selectedAssigneeIds={selectedAssigneeIds}
          actionId={createdActionId || undefined}
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
          currentAssignees={[]}
        />
      )}
    </>
  );
}
