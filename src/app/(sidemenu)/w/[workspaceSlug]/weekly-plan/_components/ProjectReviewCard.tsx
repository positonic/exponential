"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  Group,
  Select,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from "@mantine/core";
import {
  IconActivity,
  IconCalendarCheck,
  IconCheck,
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
import { ProjectDateBadges } from "./ProjectDateBadges";
import { ProjectDriBadge } from "./ProjectDriBadge";
import { KeyResultsSection } from "./KeyResultsSection";
import { ReviewBottomBar } from "./ReviewBottomBar";
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
}: ProjectReviewCardProps) {
  const { workspace } = useWorkspace();
  const [status, setStatus] = useState(project.status);
  const [priority, setPriority] = useState(project.priority ?? "NONE");
  const [actionAdded, setActionAdded] = useState(false);
  const [keyResultsChanged, setKeyResultsChanged] = useState(false);
  const [reflection, setReflection] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [description, setDescription] = useState(project.description ?? "");
  const [localActions, setLocalActions] = useState(project.actions);

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

  // Inline description editing — commits on blur (quiet affordance, no banner).
  const handleDescriptionCommit = () => {
    setEditingDesc(false);
    const trimmed = description.trim();
    if (trimmed !== (project.description ?? "").trim()) {
      updateProject.mutate({
        id: project.id,
        name: project.name,
        status: status as ProjectStatus,
        priority: priority as ProjectPriority,
        description: trimmed,
      });
    }
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

  return (
    <Card
      withBorder
      radius="md"
      className="border-border-primary bg-surface-secondary"
      p="lg"
    >
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

      {/* Inline description — quiet affordance, not a warning banner */}
      <div className="mb-5">
        {editingDesc ? (
          <Textarea
            autoFocus
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            onBlur={handleDescriptionCommit}
            placeholder="Add context to help the team understand this project's purpose and goals…"
            autosize
            minRows={2}
            maxRows={5}
          />
        ) : description.trim() ? (
          <Group gap={6} align="baseline">
            <Text size="sm" className="text-text-secondary">
              {description}
            </Text>
            <Button
              variant="subtle"
              size="compact-xs"
              color="gray"
              onClick={() => setEditingDesc(true)}
            >
              Edit
            </Button>
          </Group>
        ) : (
          <Button
            variant="default"
            size="xs"
            leftSection={<IconPlus size={14} />}
            onClick={() => setEditingDesc(true)}
            styles={{ root: { borderStyle: "dashed" } }}
          >
            Add description
          </Button>
        )}
      </div>

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

      {/* Key Results section (linked-first rows, pill toggle, inline link + create) */}
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
