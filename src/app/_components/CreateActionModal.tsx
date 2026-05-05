import { Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useViewportSize } from '@mantine/hooks';
import { useState, useRef } from "react";
import { api } from "~/trpc/react";
import { type ActionPriority } from "~/types/action";
import type { EffortUnit } from "~/types/effort";
import { ActionModalForm, type PastedScreenshot } from './ActionModalForm';
import { AssignActionModal } from './AssignActionModal';
import { IconPlus } from '@tabler/icons-react';
import type { ActionStatus } from '@prisma/client';
import { useSession } from 'next-auth/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { notifications } from '@mantine/notifications';

export function CreateActionModal({ viewName, projectId: propProjectId, children }: { viewName: string; projectId?: string; children?: React.ReactNode }) {
  const { data: session } = useSession();
  const { width } = useViewportSize();
  // Use propProjectId if provided, otherwise try to extract from viewName
  const initProjectId = propProjectId || (viewName.includes("project-") ? viewName.split("-").pop() : '');
  const [opened, { open, close }] = useDisclosure(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string | undefined>(initProjectId || undefined);
  const [priority, setPriority] = useState<ActionPriority>("Quick");
  const [dueDate, setDueDate] = useState<Date | null>(() => {
    // If we're on the /today or /workspace page, default to today's date
    const lowerViewName = viewName.toLowerCase();
    if (lowerViewName === 'today' || lowerViewName === 'workspace') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return today;
    }
    return null;
  });
  const [scheduledStart, setScheduledStart] = useState<Date | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [assignModalOpened, setAssignModalOpened] = useState(false);
  const [createdActionId, setCreatedActionId] = useState<string | null>(null);
  // New: Sprint, Epic, Effort, Dependencies
  const [sprintListId, setSprintListId] = useState<string | null>(null);
  const [epicId, setEpicId] = useState<string | null>(null);
  const [effortEstimate, setEffortEstimate] = useState<number | null>(null);
  const [blockedByIds, setBlockedByIds] = useState<string[]>([]);
  // Bounty fields
  const [isBounty, setIsBounty] = useState(false);
  const [bountyAmount, setBountyAmount] = useState<number | null>(null);
  const [bountyToken, setBountyToken] = useState<string | null>(null);
  const [bountyDifficulty, setBountyDifficulty] = useState<string | null>('beginner');
  const [bountySkills, setBountySkills] = useState<string[]>([]);
  const [bountyDeadline, setBountyDeadline] = useState<Date | null>(null);
  const [bountyMaxClaimants, setBountyMaxClaimants] = useState(1);
  const [bountyExternalUrl, setBountyExternalUrl] = useState<string | null>(null);
  // Screenshot paste state
  const [pastedScreenshots, setPastedScreenshots] = useState<PastedScreenshot[]>([]);

  // Workspace context
  const { workspaceId: currentWorkspaceId, workspaceSlug } = useWorkspace();

  // Get workspace effortUnit for the effort estimate input
  const { data: workspaceData } = api.workspace.getBySlug.useQuery(
    { slug: workspaceSlug ?? '' },
    { enabled: !!workspaceSlug }
  );
  const effortUnit = (workspaceData?.effortUnit as EffortUnit | undefined) ?? 'STORY_POINTS';
  const advancedActionsEnabled = workspaceData?.enableAdvancedActions ?? false;

  const utils = api.useUtils();
  
  // Assignment mutation for post-creation assignment
  const assignMutation = api.action.assign.useMutation({
    onError: (error) => {
      console.error('Assignment failed:', error);
    },
  });

  // List mutation for post-creation sprint assignment
  const addToListMutation = api.list.addAction.useMutation({
    onError: (error) => {
      console.error('Sprint assignment failed:', error);
    },
  });

  // Tag mutation for post-creation tagging
  const setTagsMutation = api.tag.setActionTags.useMutation({
    onError: (error) => {
      console.error('Setting tags failed:', error);
    },
  });

  // Screenshot upload mutation
  const uploadImageMutation = api.action.uploadImage.useMutation({
    onError: (error) => {
      console.error('Screenshot upload failed:', error);
    },
  });

  const createAction = api.action.create.useMutation({
    onMutate: async (newAction) => {
      // Cancel all related queries, including the project-tasks page query
      // (the project page subscribes to action.getProjectActions, so without
      // this cancel + setData below the optimistic insert is invisible there).
      const cancelPromises: Promise<void>[] = [
        utils.project.getAll.cancel(),
        utils.action.getAll.cancel(),
        utils.action.getToday.cancel(),
      ];
      if (newAction.projectId) {
        cancelPromises.push(
          utils.action.getProjectActions.cancel({ projectId: newAction.projectId }),
        );
      }
      await Promise.all(cancelPromises);

      // Snapshot all previous states
      const previousState = {
        projects: utils.project.getAll.getData(),
        actions: utils.action.getAll.getData(),
        todayActions: utils.action.getToday.getData(),
        projectActions: newAction.projectId
          ? utils.action.getProjectActions.getData({ projectId: newAction.projectId })
          : undefined,
        projectId: newAction.projectId,
      };

      // Create optimistic action
      const optimisticAction = {
        id: `temp-${Date.now()}`,
        name: newAction.name,
        description: newAction.description ?? null,
        status: "ACTIVE",
        priority: newAction.priority ?? "Quick",
        projectId: newAction.projectId ?? null,
        createdById: session?.user?.id ?? previousState.projects?.[0]?.createdById ?? "",
        dueDate: newAction.dueDate ? new Date(newAction.dueDate) : null,
        scheduledStart: newAction.scheduledStart ? new Date(newAction.scheduledStart) : null,
        scheduledEnd: null,
        duration: newAction.duration ?? null,
        transcriptionSessionId: null,
        teamId: null,
        workspaceId: currentWorkspaceId,
        kanbanStatus: newAction.projectId ? "TODO" as ActionStatus : null, // Set kanban status for project actions
        kanbanOrder: null, // Will be set by the server
        completedAt: null, // New field for completion timestamp
        source: null, // Source of the action (e.g., 'api', 'notion')
        syncs: [], // Initialize empty syncs array for consistency with getAll type
        assignees: [], // Initialize empty assignees array for type consistency
        tags: [], // Initialize empty tags array for type consistency
        lists: [], // Initialize empty lists array for type consistency
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
        blockedByIds: newAction.blockedByIds ?? [],
        blockingIds: [],
        isReminderOnly: false,
        createdAt: new Date(),
        epicId: newAction.epicId ?? null,
        effortEstimate: newAction.effortEstimate ?? null,
        // Bounty fields
        isBounty: newAction.isBounty ?? false,
        bountyAmount: newAction.bountyAmount ?? null,
        bountyToken: newAction.bountyToken ?? null,
        bountyStatus: newAction.isBounty ? "OPEN" : null,
        bountyDifficulty: newAction.bountyDifficulty ?? null,
        bountySkills: newAction.bountySkills ?? [],
        bountyDeadline: newAction.bountyDeadline ? new Date(newAction.bountyDeadline) : null,
        bountyMaxClaimants: newAction.bountyMaxClaimants ?? 1,
        bountyExternalUrl: newAction.bountyExternalUrl ?? null,
        epic: null,
        project: newAction.projectId
          ? previousState.projects?.find(p => p.id === newAction.projectId) ?? null
          : null,
        createdBy: {
          id: session?.user?.id ?? "",
          name: session?.user?.name ?? null,
          email: session?.user?.email ?? null,
          image: session?.user?.image ?? null,
        },
      };

      // Helper function to add action to a list
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- optimistic action uses number for bountyAmount vs Prisma Decimal
      const typedOptimisticAction = optimisticAction as any;
      const addActionToList = (list: typeof previousState.actions) => {
        if (!list) return [typedOptimisticAction];
        return [...list, typedOptimisticAction];
      };

      // Update all action lists
      utils.action.getAll.setData(undefined, addActionToList);

      // Update today's actions - only if we're in the today or workspace view
      const lowerView = viewName.toLowerCase();
      if (lowerView === 'today' || lowerView === 'workspace') {
        void utils.action.getToday.invalidate();
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
                    ? [...project.actions, typedOptimisticAction]
                    : [typedOptimisticAction],
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
              ? [...oldProject.actions, typedOptimisticAction]
              : [typedOptimisticAction],
          };
        });

        // The project tasks page subscribes to action.getProjectActions, so
        // patch it directly to make the new row appear without waiting for
        // the server roundtrip + heavy refetch.
        utils.action.getProjectActions.setData(
          { projectId: newAction.projectId },
          (old) => (old ? [...old, typedOptimisticAction] : [typedOptimisticAction]),
        );
      }

      return previousState;
    },

    onError: (err, variables, context) => {
      if (!context) return;

      // Restore all previous states
      const { projects, actions, todayActions, projectActions, projectId: ctxProjectId } = context;
      utils.project.getAll.setData(undefined, projects);
      utils.action.getAll.setData(undefined, actions);
      utils.action.getToday.setData(undefined, todayActions);
      if (ctxProjectId) {
        utils.action.getProjectActions.setData({ projectId: ctxProjectId }, projectActions);
      }

      // Show error notification
      notifications.show({
        title: "Failed to Create Action",
        message: err.message || "Something went wrong. Please try again.",
        color: "red",
        autoClose: 5000,
      });
    },

    onSettled: async (data, error, variables) => {
      const projectId = variables.projectId;

      // If the create succeeded for a project, swap the optimistic temp row for
      // the real one returned by the server. The create response now includes
      // the same relations getProjectActions selects (project, syncs, assignees,
      // createdBy, tags), so we can hydrate the cache without a refetch.
      if (data && projectId) {
        utils.action.getProjectActions.setData({ projectId }, (old) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- create response shape mirrors getProjectActions includes
          const real = data as any;
          if (!old) return [real];
          const withoutTemp = old.filter((a) => !a.id.startsWith("temp-"));
          return [...withoutTemp, real];
        });
      }

      const invalidatePromises: Promise<unknown>[] = [];

      // Mark project actions stale (for next mount) but don't refetch — we
      // already have authoritative data from the create response above.
      if (projectId) {
        invalidatePromises.push(
          utils.action.getProjectActions.invalidate(
            { projectId },
            { refetchType: "none" },
          ),
        );
      }

      // Invalidate Inbox/All view if it has no project (or if it's the default view)
      if (!projectId || viewName.toLowerCase() === 'inbox') {
        invalidatePromises.push(utils.action.getAll.invalidate());
      }

      // Always invalidate today and scheduled action queries
      invalidatePromises.push(utils.action.getToday.invalidate());
      invalidatePromises.push(utils.action.getScheduledByDate.invalidate());
      invalidatePromises.push(utils.action.getScheduledByDateRange.invalidate());

      await Promise.all(invalidatePromises);
    },

    onSuccess: (data) => {
      // Don't store data.id into createdActionId here. The modal is already
      // closed for this submission, and a stored value would race a new
      // compose cycle: if the user starts a second task before this success
      // fires, AssignActionModal would re-scope to the prior action's id and
      // route the next assignee pick to the wrong task. Assignees for this
      // action are applied below via pendingAssigneesRef.

      // Run all post-create attachments concurrently. Each mutation has its own
      // onError handler that surfaces failures independently, so we don't need
      // to gate the modal flow or a success toast on these completing — the
      // optimistic row is already visible.
      const pendingAssignees = pendingAssigneesRef.current;
      const pendingScreenshots = pendingScreenshotsRef.current;
      pendingAssigneesRef.current = [];
      pendingScreenshotsRef.current = [];

      const postCreatePromises: Promise<unknown>[] = [];

      if (sprintListId) {
        postCreatePromises.push(
          addToListMutation.mutateAsync({ listId: sprintListId, actionId: data.id }),
        );
      }

      if (pendingAssignees.length > 0) {
        postCreatePromises.push(
          assignMutation.mutateAsync({ actionId: data.id, userIds: pendingAssignees }),
        );
      }

      if (selectedTagIds.length > 0) {
        postCreatePromises.push(
          setTagsMutation.mutateAsync({ actionId: data.id, tagIds: selectedTagIds }),
        );
      }

      for (const screenshot of pendingScreenshots) {
        postCreatePromises.push(
          uploadImageMutation.mutateAsync({
            actionId: data.id,
            base64Data: screenshot.base64,
          }),
        );
      }

      // Fire-and-forget; per-mutation onError handlers already log failures.
      void Promise.allSettled(postCreatePromises);
    },
  });

  // Ref to hold screenshots for upload after action creation
  const pendingScreenshotsRef = useRef<PastedScreenshot[]>([]);
  // Ref to hold assignees so the post-create assign call can read them after
  // selectedAssigneeIds state has been reset.
  const pendingAssigneesRef = useRef<string[]>([]);

  const handleSubmit = () => {
    if (!name) return;

    // Close modal immediately for better UX
    close();

    // Capture screenshots and assignees before resetting state. The
    // post-create callbacks read these refs because the corresponding state
    // is reset below before the mutation resolves.
    pendingScreenshotsRef.current = [...pastedScreenshots];
    pendingAssigneesRef.current = [...selectedAssigneeIds];

    // Prepare action data before resetting form
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
      // Bounty fields
      ...(isBounty ? {
        isBounty: true,
        bountyAmount: bountyAmount ?? undefined,
        bountyToken: bountyToken ?? undefined,
        bountyDifficulty: bountyDifficulty as "beginner" | "intermediate" | "advanced" | undefined,
        bountySkills: bountySkills.length > 0 ? bountySkills : undefined,
        bountyDeadline: bountyDeadline ?? undefined,
        bountyMaxClaimants: bountyMaxClaimants,
        bountyExternalUrl: bountyExternalUrl ?? undefined,
      } : {}),
    };

    // Reset form immediately (moved from onSuccess)
    setName("");
    setDescription("");
    // Reset projectId to initial value (current project if on project page)
    setProjectId(initProjectId || undefined);
    setPriority("Quick");
    // Reset dueDate to today if on /today or /workspace page, otherwise null
    setDueDate(() => {
      const lowerView = viewName.toLowerCase();
      if (lowerView === 'today' || lowerView === 'workspace') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return today;
      }
      return null;
    });
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
    // Reset bounty fields
    setIsBounty(false);
    setBountyAmount(null);
    setBountyToken(null);
    setBountyDifficulty('beginner');
    setBountySkills([]);
    setBountyDeadline(null);
    setBountyMaxClaimants(1);
    setBountyExternalUrl(null);
    setPastedScreenshots([]);

    // Trigger mutation in background
    createAction.mutate(actionData);
  };

  const handleAssigneeClick = () => {
    setAssignModalOpened(true);
  };

  // Clear the previously-created action's id when starting a new compose
  // cycle so the assignee picker scopes to the new task, not the prior one.
  const handleOpen = () => {
    setCreatedActionId(null);
    open();
  };

  return (
    <>
      {children ? (
        <div onClick={handleOpen}>{children}</div>
      ) : (
        <button
          onClick={handleOpen}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-gray-400 hover:bg-gray-800 hover:text-gray-300 transition-colors"
        >
          <IconPlus size={16} />
          <span>Add task</span>
        </button>
      )}

      <Modal
        opened={opened}
        onClose={close}
        size="lg"
        radius="md"
        padding="lg"
        fullScreen={width < 640}
        styles={{
          header: { display: 'none' },
          body: { padding: 0, backgroundColor: 'var(--color-bg-elevated)' },
          content: {
            backgroundColor: 'var(--color-bg-elevated)',
            color: 'var(--color-text-primary)',
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
          isSubmitting={createAction.isPending}
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
          isBounty={isBounty}
          setIsBounty={setIsBounty}
          bountyAmount={bountyAmount}
          setBountyAmount={setBountyAmount}
          bountyToken={bountyToken}
          setBountyToken={setBountyToken}
          bountyDifficulty={bountyDifficulty}
          setBountyDifficulty={setBountyDifficulty}
          bountySkills={bountySkills}
          setBountySkills={setBountySkills}
          bountyDeadline={bountyDeadline}
          setBountyDeadline={setBountyDeadline}
          bountyMaxClaimants={bountyMaxClaimants}
          setBountyMaxClaimants={setBountyMaxClaimants}
          bountyExternalUrl={bountyExternalUrl}
          setBountyExternalUrl={setBountyExternalUrl}
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