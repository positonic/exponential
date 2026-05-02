"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Group,
  Popover,
  Select,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from "@mantine/core";
import {
  IconActivity,
  IconAlertCircle,
  IconCalendarCheck,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconMessage,
  IconPlayerPlay,
  IconPlus,
  IconTarget,
  IconTrendingUp,
} from "@tabler/icons-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { notifications } from "@mantine/notifications";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { NextActionCapture } from "./NextActionCapture";
import { CreateProjectModal } from "~/app/_components/CreateProjectModal";
import { ProjectDateBadges } from "./ProjectDateBadges";
import { ProjectDriBadge } from "./ProjectDriBadge";
import { KeyResultsSection } from "./KeyResultsSection";
import { ReviewBottomBar } from "./ReviewBottomBar";
import { EditKeyResultModal } from "~/plugins/okr/client/components/EditKeyResultModal";
import {
  PROJECT_PRIORITY_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  type ProjectPriority,
  type ProjectStatus,
} from "~/types/project";

type ProjectWithDetails = RouterOutputs["project"]["getActiveWithDetails"][number];

interface ProjectChanges {
  statusChanged: boolean;
  priorityChanged: boolean;
  actionAdded: boolean;
  keyResultsChanged: boolean;
  reflection?: string;
}

interface ProjectReviewCardProps {
  project: ProjectWithDetails;
  isReviewed: boolean;
  onMarkReviewed: (changes: ProjectChanges) => void;
  onSkip: () => void;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  workspaceId: string | null;
  /** 1-based index of this project in the review session, used for "01 / 05". */
  currentIndex: number;
  /** Total number of projects in this review session. */
  totalCount: number;
}

// Period strings used by KRs are quarterly (e.g. "Q2-2026").
function getCurrentQuarterPeriod(now: Date = new Date()): string {
  const month = now.getUTCMonth();
  const quarter = Math.floor(month / 3) + 1;
  return `Q${quarter}-${now.getUTCFullYear()}`;
}

function calculateHealthIndicators(project: ProjectWithDetails) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weeklyPlanning = project.keyResults.length > 0;
  const recentActivity = project.actions.some(
    (a) => a.completedAt && new Date(a.completedAt) > sevenDaysAgo,
  );
  const momentum = project.actions.some((a) => a.status === "ACTIVE");
  const onTrack = !project.actions.some(
    (a) =>
      a.dueDate &&
      new Date(a.dueDate) < today &&
      a.status !== "COMPLETED" &&
      a.status !== "DONE",
  );
  const hasProgress = project.progress > 0;

  return { weeklyPlanning, recentActivity, momentum, onTrack, hasProgress };
}

type DerivedHealth = "ON_TRACK" | "AT_RISK" | "OFF_TRACK";

function deriveHealth(
  indicators: ReturnType<typeof calculateHealthIndicators>,
): DerivedHealth {
  if (!indicators.onTrack) return "OFF_TRACK";
  if (!indicators.momentum && !indicators.recentActivity) return "OFF_TRACK";
  if (!indicators.momentum || !indicators.recentActivity) return "AT_RISK";
  return "ON_TRACK";
}

const HEALTH_OPTIONS = [
  { value: "ON_TRACK", label: "On track" },
  { value: "AT_RISK", label: "At risk" },
  { value: "OFF_TRACK", label: "Off track" },
];

export function ProjectReviewCard({
  project,
  isReviewed,
  onMarkReviewed,
  onSkip,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  workspaceId,
  currentIndex,
  totalCount,
}: ProjectReviewCardProps) {
  const { workspace } = useWorkspace();
  const [status, setStatus] = useState(project.status);
  const [priority, setPriority] = useState(project.priority ?? "NONE");
  const [actionAdded, setActionAdded] = useState(false);
  const [keyResultsChanged, setKeyResultsChanged] = useState(false);
  const [reflection, setReflection] = useState("");
  const [descriptionDismissed, setDescriptionDismissed] = useState(false);
  const [localActions, setLocalActions] = useState(project.actions);

  // Goal picker → KR create modal state (preserved from prior implementation)
  const [createPopoverOpen, setCreatePopoverOpen] = useState(false);
  const [createGoalId, setCreateGoalId] = useState<number | null>(null);
  const [krModalOpen, setKrModalOpen] = useState(false);

  const goalsQuery = api.okr.getAvailableGoals.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId },
  );
  const goalOptions = useMemo(
    () =>
      (goalsQuery.data ?? []).map((g) => ({
        value: String(g.id),
        label: g.title,
      })),
    [goalsQuery.data],
  );
  const currentQuarterPeriod = useMemo(() => getCurrentQuarterPeriod(), []);

  const utils = api.useUtils();

  const updateProject = api.project.update.useMutation({
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message,
        color: "red",
      });
    },
  });

  const autoSaveProject = useCallback(
    (newStatus: string, newPriority: string) => {
      const statusChanged = newStatus !== project.status;
      const priorityChanged = newPriority !== (project.priority ?? "NONE");
      if (statusChanged || priorityChanged) {
        updateProject.mutate({
          id: project.id,
          name: project.name,
          status: newStatus as ProjectStatus,
          priority: newPriority as ProjectPriority,
        });
      }
    },
    [project.id, project.name, project.status, project.priority, updateProject],
  );

  const handleStatusChange = (val: string) => {
    setStatus(val);
    autoSaveProject(val, priority);
  };

  const handlePriorityChange = (val: string) => {
    setPriority(val);
    autoSaveProject(status, val);
  };

  const indicators = calculateHealthIndicators({
    ...project,
    status,
    actions: localActions,
  });
  const derivedHealth = deriveHealth(indicators);

  const hasExistingActiveAction = localActions.some(
    (a) => a.status === "ACTIVE" || a.status === "TODO",
  );
  const hasNextAction = hasExistingActiveAction || actionAdded;

  const handleMarkReviewed = useCallback(() => {
    const statusChanged = status !== project.status;
    const priorityChanged = priority !== (project.priority ?? "NONE");

    onMarkReviewed({
      statusChanged,
      priorityChanged,
      actionAdded,
      keyResultsChanged,
      ...(reflection.trim() ? { reflection: reflection.trim() } : {}),
    });
  }, [
    status,
    priority,
    project.status,
    project.priority,
    actionAdded,
    keyResultsChanged,
    reflection,
    onMarkReviewed,
  ]);

  const handleActionAdded = (newAction: {
    id: string;
    name: string;
    status: string;
  }) => {
    setActionAdded(true);
    setLocalActions((prev) => [
      ...prev,
      {
        ...newAction,
        completedAt: null,
        dueDate: null,
      } as (typeof prev)[0],
    ]);
  };

  const handleActionUpdated = async () => {
    const freshData = await utils.project.getActiveWithDetails.fetch({
      workspaceId: workspaceId ?? undefined,
    });
    const freshProject = freshData?.find((p) => p.id === project.id);
    if (freshProject) {
      setLocalActions(freshProject.actions);
    }
  };

  const handleDateUpdate = (dates: {
    startDate?: Date | null;
    endDate?: Date | null;
  }) => {
    updateProject.mutate({
      id: project.id,
      name: project.name,
      status: status as ProjectStatus,
      priority: priority as ProjectPriority,
      ...dates,
    });
    notifications.show({
      title: "Dates updated",
      message: "Project dates have been saved",
      color: "green",
    });
  };

  const handleDriUpdate = (driId: string | null) => {
    updateProject.mutate({
      id: project.id,
      name: project.name,
      status: status as ProjectStatus,
      priority: priority as ProjectPriority,
      driId,
    });
    notifications.show({
      title: "DRI updated",
      message: "Project DRI has been saved",
      color: "green",
    });
  };

  // Keyboard shortcuts: ↩ mark reviewed, S skip, ← previous, → next.
  // Disabled while focus is in an input/textarea/select to avoid stealing
  // typing-time keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        const isEditable =
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable;
        if (isEditable) return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "Enter") {
        if (hasNextAction) {
          e.preventDefault();
          handleMarkReviewed();
        }
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        onSkip();
      } else if (e.key === "ArrowLeft") {
        if (hasPrevious) {
          e.preventDefault();
          onPrevious();
        }
      } else if (e.key === "ArrowRight") {
        if (hasNext) {
          e.preventDefault();
          onNext();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    hasNextAction,
    hasPrevious,
    hasNext,
    handleMarkReviewed,
    onSkip,
    onPrevious,
    onNext,
  ]);

  const totalLabel = String(totalCount).padStart(2, "0");
  const currentLabel = String(currentIndex).padStart(2, "0");

  return (
    <Card
      withBorder
      radius="md"
      className="border-border-primary bg-surface-secondary"
      p="lg"
    >
      {/* Top nav row */}
      <Group justify="space-between" className="mb-4">
        <Button
          variant="subtle"
          size="sm"
          color="gray"
          leftSection={<IconChevronLeft size={16} />}
          onClick={onPrevious}
          disabled={!hasPrevious}
        >
          Previous
        </Button>
        <Text size="xs" className="font-mono text-text-muted">
          {currentLabel} / {totalLabel}
        </Text>
        <Button
          variant="subtle"
          size="sm"
          color="gray"
          rightSection={<IconChevronRight size={16} />}
          onClick={onNext}
          disabled={!hasNext}
        >
          Next
        </Button>
      </Group>

      {/* No-description warning (preserved) */}
      {(!project.description || project.description.trim() === "") &&
        !descriptionDismissed && (
          <Alert
            variant="light"
            color="yellow"
            title="No description"
            icon={<IconAlertCircle size={16} />}
            className="mb-4"
            classNames={{ root: "border-yellow-500/20" }}
            withCloseButton
            onClose={() => setDescriptionDismissed(true)}
          >
            <Group justify="space-between" align="center">
              <Text size="sm" className="text-text-secondary">
                Add context to help understand this project&apos;s purpose and
                goals
              </Text>
              <CreateProjectModal project={project}>
                <Button size="xs" variant="light" color="yellow">
                  Add Description
                </Button>
              </CreateProjectModal>
            </Group>
          </Alert>
        )}

      {/* Identity row: workspace tag + title + DRI + reviewed checkmark */}
      <Group justify="space-between" align="flex-start" className="mb-2">
        <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
          {workspace?.name && (
            <span
              className="inline-flex w-fit items-center gap-1.5 rounded px-2 py-0.5 text-xs"
              style={{
                background: "var(--color-brand-subtle)",
                color: "var(--brand-400)",
              }}
            >
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ background: "var(--brand-400)" }}
              />
              {workspace.name}
            </span>
          )}
          <Text size="xl" fw={700} className="text-text-primary">
            {project.name}
          </Text>
        </Stack>
        <Group gap="sm" align="center">
          {isReviewed && (
            <Tooltip label="Already reviewed" withArrow>
              <div className="rounded-full bg-green-500/10 p-1.5">
                <IconCheck size={16} className="text-green-500" />
              </div>
            </Tooltip>
          )}
          <ProjectDriBadge
            projectId={project.id}
            dri={project.dri}
            onUpdate={handleDriUpdate}
          />
        </Group>
      </Group>

      {/* Meta row: dates + progress */}
      <Group gap="md" className="mb-5" wrap="wrap">
        <ProjectDateBadges
          projectId={project.id}
          startDate={project.startDate}
          endDate={project.endDate}
          onUpdate={handleDateUpdate}
        />
        <Group gap={4} className="ml-auto">
          <IconTrendingUp size={14} className="text-text-muted" />
          <Text size="xs" className="text-text-muted">
            Progress
          </Text>
          <Text size="xs" fw={600} className="text-text-primary">
            {project.progress}%
          </Text>
        </Group>
      </Group>

      {/* Three-up controls */}
      <Group grow className="mb-4" align="flex-start">
        <Select
          label="Status"
          data={[...PROJECT_STATUS_OPTIONS]}
          value={status}
          onChange={(val) => val && handleStatusChange(val)}
          allowDeselect={false}
        />
        <Select
          label="Priority"
          data={[...PROJECT_PRIORITY_OPTIONS]}
          value={priority}
          onChange={(val) => val && handlePriorityChange(val)}
          allowDeselect={false}
        />
        <Tooltip
          label="Health is derived from project signals — soon you'll be able to set it manually."
          withArrow
        >
          <div>
            <Select
              label="Health"
              data={HEALTH_OPTIONS}
              value={derivedHealth}
              readOnly
              rightSectionPointerEvents="none"
            />
          </div>
        </Tooltip>
      </Group>

      {/* Health indicator strip — preserved */}
      <Group gap={10} className="mb-5">
        <Tooltip
          label={
            indicators.weeklyPlanning
              ? "Key results linked"
              : "No key results linked"
          }
          withArrow
        >
          <IconTarget
            size={14}
            className={
              indicators.weeklyPlanning ? "text-green-500" : "text-red-500"
            }
          />
        </Tooltip>
        <Tooltip
          label={
            indicators.recentActivity ? "Recent activity" : "No recent activity"
          }
          withArrow
        >
          <IconActivity
            size={14}
            className={
              indicators.recentActivity ? "text-green-500" : "text-yellow-500"
            }
          />
        </Tooltip>
        <Tooltip
          label={
            indicators.momentum
              ? "Active actions in progress"
              : "No active actions"
          }
          withArrow
        >
          <IconPlayerPlay
            size={14}
            className={
              indicators.momentum ? "text-green-500" : "text-yellow-500"
            }
          />
        </Tooltip>
        <Tooltip
          label={indicators.onTrack ? "On track" : "Has overdue actions"}
          withArrow
        >
          <IconCalendarCheck
            size={14}
            className={indicators.onTrack ? "text-green-500" : "text-red-500"}
          />
        </Tooltip>
        <Tooltip
          label={
            indicators.hasProgress ? "Progress tracked" : "No progress set"
          }
          withArrow
        >
          <IconTrendingUp
            size={14}
            className={
              indicators.hasProgress ? "text-green-500" : "text-text-muted"
            }
          />
        </Tooltip>
      </Group>

      {/* Key Results section (rail with link picker + create flow) */}
      <div className="mb-5">
        <KeyResultsSection
          project={project}
          workspaceId={workspaceId}
          workspaceName={workspace?.name ?? null}
          onLinksChanged={() => {
            setKeyResultsChanged(true);
            void utils.project.getActiveWithDetails.invalidate();
            void utils.okr.getAll.invalidate();
          }}
        />

        {/* Create-new-KR popover (preserved from prior implementation) */}
        <Popover
          opened={createPopoverOpen}
          onChange={setCreatePopoverOpen}
          position="bottom-start"
          withArrow
          shadow="md"
        >
          <Popover.Target>
            <Button
              variant="subtle"
              size="xs"
              leftSection={<IconPlus size={14} />}
              className="mt-2"
              onClick={() => setCreatePopoverOpen((o) => !o)}
              disabled={!workspaceId}
            >
              Create new key result
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap="xs" style={{ minWidth: 260 }}>
              <Text size="xs" className="text-text-secondary">
                Pick a goal for this Key Result
              </Text>
              <Select
                placeholder={
                  goalsQuery.isLoading ? "Loading goals…" : "Select a goal"
                }
                data={goalOptions}
                value={createGoalId != null ? String(createGoalId) : null}
                onChange={(val) => {
                  if (!val) return;
                  const id = Number(val);
                  setCreateGoalId(id);
                  setCreatePopoverOpen(false);
                  setKrModalOpen(true);
                }}
                searchable
                nothingFoundMessage="No goals in this workspace"
              />
            </Stack>
          </Popover.Dropdown>
        </Popover>

        {createGoalId != null && workspaceId && (
          <EditKeyResultModal
            mode="create"
            opened={krModalOpen}
            onClose={() => {
              setKrModalOpen(false);
              setCreateGoalId(null);
            }}
            goalId={createGoalId}
            period={currentQuarterPeriod}
            workspaceId={workspaceId}
            initialProjectIds={[project.id]}
            onSuccess={() => {
              setKeyResultsChanged(true);
              void utils.project.getActiveWithDetails.invalidate();
            }}
          />
        )}
      </div>

      {/* Actions section */}
      <div className="mb-5">
        <NextActionCapture
          projectId={project.id}
          workspaceId={workspaceId}
          existingActions={localActions}
          onActionAdded={handleActionAdded}
          onActionUpdated={handleActionUpdated}
        />
      </div>

      {/* Reflection */}
      <div className="mb-2">
        <Group gap={6} className="mb-2">
          <IconMessage size={14} className="text-text-muted" />
          <Text
            size="xs"
            className="font-semibold uppercase tracking-wider text-text-muted"
          >
            Reflection · Optional
          </Text>
          <Text size="xs" className="ml-auto text-text-muted">
            One sentence is enough
          </Text>
        </Group>
        <Textarea
          placeholder="What changed since last week? What's the unlock?"
          value={reflection}
          onChange={(e) => setReflection(e.currentTarget.value)}
          autosize
          minRows={2}
          maxRows={4}
        />
      </div>

      {/* Bottom action bar */}
      <ReviewBottomBar
        onSkip={onSkip}
        onMarkReviewed={handleMarkReviewed}
        canMarkReviewed={hasNextAction}
        isPending={updateProject.isPending}
      />
    </Card>
  );
}
