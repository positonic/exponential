"use client";

import { Modal, ActionIcon, Tooltip } from "@mantine/core";
import { useDisclosure, useViewportSize, useHotkeys } from "@mantine/hooks";
import { useState } from "react";
import { api } from "~/trpc/react";
import type { ActionPriority } from "~/types/action";
import { ActionModalForm, type PastedScreenshot } from "../ActionModalForm";
import { AssignActionModal } from "../AssignActionModal";
import { IconPlus } from "@tabler/icons-react";
import type { ActionStatus } from "@prisma/client";
import { useSession } from "next-auth/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import type { EffortUnit } from "~/types/effort";
import { notifications } from "@mantine/notifications";
import { useActionAttachments } from "~/hooks/useActionAttachments";

export function GlobalAddTaskButton({ variant = "icon" }: { variant?: "icon" | "sidebar" } = {}) {
  const { data: session } = useSession();
  const { width } = useViewportSize();
  const [opened, { open, close }] = useDisclosure(false);
  useHotkeys([["mod+N", () => open()]]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [priority, setPriority] = useState<ActionPriority>("Quick");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [scheduledStart, setScheduledStart] = useState<Date | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [assignModalOpened, setAssignModalOpened] = useState(false);
  const [createdActionId, setCreatedActionId] = useState<string | null>(null);
  // Advanced action fields
  const [sprintListId, setSprintListId] = useState<string | null>(null);
  const [epicId, setEpicId] = useState<string | null>(null);
  const [effortEstimate, setEffortEstimate] = useState<number | null>(null);
  const [blockedByIds, setBlockedByIds] = useState<string[]>([]);
  // Screenshot paste state
  const [pastedScreenshots, setPastedScreenshots] = useState<PastedScreenshot[]>([]);

  // Workspace context for advanced features
  const { workspaceId: currentWorkspaceId, workspaceSlug } = useWorkspace();
  const { data: workspaceData } = api.workspace.getBySlug.useQuery(
    { slug: workspaceSlug ?? "" },
    { enabled: !!workspaceSlug }
  );
  const advancedActionsEnabled = workspaceData?.enableAdvancedActions ?? false;
  const effortUnit = (workspaceData?.effortUnit as EffortUnit | undefined) ?? "STORY_POINTS";

  const utils = api.useUtils();

  // Sprint / assignees / tags / screenshots, carried per submission.
  const attachments = useActionAttachments();

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
        scheduledStart: null,
        scheduledEnd: null,
        duration: null,
        transcriptionSessionId: null,
        teamId: null,
        workspaceId: currentWorkspaceId ?? null,
        kanbanStatus: newAction.projectId ? ("TODO" as ActionStatus) : null,
        kanbanOrder: null,
        completedAt: null,
        source: null,
        sourceType: null,
        sourceId: null,
        lastUpdatedBy: null,
        lastUpdatedSource: null,
        syncs: [],
        assignees: [],
        tags: [],
        lists: [],
        // Auto-scheduling fields
        isAutoScheduled: true,
        isHardDeadline: false,
        scheduleId: null,
        idealStartTime: null,
        etaDaysOffset: null,
        etaStatus: null,
        timeSpentMins: 0,
        chunkDurationMins: null,
        parentChunkId: null,
        chunkNumber: null,
        totalChunks: null,
        isRecurring: false,
        recurringParentId: null,
        instanceDate: null,
        blockedByIds: newAction.blockedByIds ?? ([] as string[]),
        blockingIds: [] as string[],
        isReminderOnly: false,
        createdAt: new Date(),
        epicId: newAction.epicId ?? null,
        effortEstimate: newAction.effortEstimate ?? null,
        // Bounty fields (defaults for non-bounty actions)
        isBounty: false,
        bountyAmount: null,
        bountyToken: null,
        bountyStatus: null,
        bountyDifficulty: null,
        bountySkills: [],
        bountyDeadline: null,
        bountyMaxClaimants: 1,
        bountyExternalUrl: null,
        ticketId: null,
        epic: null,
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

        // The project tasks page renders from action.getProjectActions, so
        // patch that cache directly for an instant appearance there too.
        // Only when it's already populated — seeding an unfetched key would
        // make the tasks list render just this one row until a refetch.
        utils.action.getProjectActions.setData(
          { projectId: newAction.projectId },
          (old) => (old ? [...old, optimisticAction] : old),
        );
      }

      return previousState;
    },

    onError: (err, variables, context) => {
      if (context) {
        // Restore all previous states
        const { projects, actions, todayActions } = context;
        utils.project.getAll.setData(undefined, projects);
        utils.action.getAll.setData(undefined, actions);
        utils.action.getToday.setData(undefined, todayActions);
      }

      // This submission will never reach onSuccess; drop its attachments.
      attachments.discard(variables);

      // The modal closed the instant the user submitted, so a failure is
      // otherwise invisible - the optimistic row just disappears again.
      notifications.show({
        title: "Failed to Create Action",
        message: err.message || "Something went wrong. Please try again.",
        color: "red",
        autoClose: 5000,
      });
    },

    onSettled: async (data, error, variables) => {
      const projectId = variables.projectId;
      const invalidatePromises: Promise<unknown>[] = [];

      if (projectId) {
        invalidatePromises.push(
          utils.action.getProjectActions.invalidate({ projectId })
        );
      }

      if (!projectId) {
        invalidatePromises.push(utils.action.getAll.invalidate());
      }

      // Always invalidate today and scheduled action queries
      invalidatePromises.push(utils.action.getToday.invalidate());
      invalidatePromises.push(utils.action.getScheduledByDate.invalidate());
      invalidatePromises.push(utils.action.getScheduledByDateRange.invalidate());

      await Promise.all(invalidatePromises);
    },

    onSuccess: (data, variables) => {
      // Deliberately don't store data.id into createdActionId: the modal is
      // already closed for this submission, and a stored value would race a
      // new compose cycle - if the user starts a second task before this
      // success fires, AssignActionModal would re-scope to the prior action's
      // id and route the next assignee pick to the wrong task.

      // This submission's own selections. See useActionAttachments.
      attachments.apply(variables, data.id);
    },
  });

  const handleSubmit = () => {
    if (!name) return;

    // Close the modal immediately. Creation is optimistic and every
    // post-create step reports its own failure, so there is nothing for the
    // user to wait on here - previously the modal stayed open, spinner and
    // all, for the whole server round-trip plus the sequential sprint /
    // assignee / screenshot chain.
    close();

    const actionData = {
      name,
      description: description || undefined,
      projectId: projectId || undefined,
      workspaceId: currentWorkspaceId ?? undefined,
      priority: priority || "Quick",
      dueDate: dueDate || undefined,
      scheduledStart: scheduledStart || undefined,
      duration: duration || undefined,
      epicId: epicId || undefined,
      effortEstimate: effortEstimate || undefined,
      blockedByIds: blockedByIds.length > 0 ? blockedByIds : undefined,
    };

    // Reset the form now rather than in onSuccess, so reopening the modal
    // during an in-flight create starts from a clean compose.
    setName("");
    setDescription("");
    setProjectId(undefined);
    setPriority("Quick");
    setDueDate(null);
    setScheduledStart(null);
    setDuration(null);
    setSelectedAssigneeIds([]);
    setSelectedTagIds([]);
    // Clear the previously-created action's id; otherwise the next assignee
    // pick would target the prior task instead of the one being composed now.
    setCreatedActionId(null);
    setSprintListId(null);
    setEpicId(null);
    setEffortEstimate(null);
    setBlockedByIds([]);
    setPastedScreenshots([]);

    // Filed against this exact object, which onSuccess gets back as its
    // `variables` argument. See useActionAttachments.
    attachments.record(actionData, {
      sprintListId,
      assigneeIds: [...selectedAssigneeIds],
      tagIds: [...selectedTagIds],
      screenshots: [...pastedScreenshots],
    });

    createAction.mutate(actionData);
  };

  const handleAssigneeClick = () => {
    setAssignModalOpened(true);
  };

  return (
    <>
      {variant === "sidebar" ? (
        <button
          onClick={open}
          aria-label="Create action"
          className="sb-create"
        >
          <span className="sb-create__icon">
            <IconPlus size={14} />
          </span>
          <span className="sb-create__label">Create Action</span>
          <span className="sb-create__shortcut">⌘N</span>
        </button>
      ) : (
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
      )}

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
          scheduledStart={scheduledStart}
          setScheduledStart={setScheduledStart}
          duration={duration}
          setDuration={setDuration}
          selectedAssigneeIds={selectedAssigneeIds}
          selectedTagIds={selectedTagIds}
          onTagChange={setSelectedTagIds}
          actionId={createdActionId || undefined}
          workspaceId={currentWorkspaceId ?? undefined}
          onAssigneeClick={handleAssigneeClick}
          onSubmit={handleSubmit}
          onClose={close}
          submitLabel="New action"
          // The modal dismisses on submit and creation is optimistic, so there
          // is nothing to spin for. Passing isPending here would also disable
          // the submit button of a *reopened* modal while the previous create
          // is still in flight (Mantine's Button sets disabled={disabled ||
          // loading}), blocking back-to-back task entry.
          isSubmitting={false}
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
          pastedScreenshots={pastedScreenshots}
          onScreenshotPaste={(screenshot) => setPastedScreenshots(prev => [...prev, screenshot])}
          onScreenshotRemove={(id) => setPastedScreenshots(prev => prev.filter(s => s.id !== id))}
        />
      </Modal>

      <AssignActionModal
        opened={assignModalOpened}
        onClose={() => setAssignModalOpened(false)}
        actionId={createdActionId ?? undefined}
        actionName={name || "New action"}
        projectId={projectId}
        workspaceId={currentWorkspaceId ?? undefined}
        currentAssignees={selectedAssigneeIds.map((id) => ({
          user: { id, name: null, email: null, image: null },
        }))}
        onSelectionChange={setSelectedAssigneeIds}
      />
    </>
  );
}
