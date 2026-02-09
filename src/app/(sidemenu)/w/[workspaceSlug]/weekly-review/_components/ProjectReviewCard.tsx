"use client";

import { useState } from "react";
import {
  Card,
  Text,
  Stack,
  Group,
  Button,
  Select,
  Tooltip,
} from "@mantine/core";
import {
  IconChevronLeft,
  IconChevronRight,
  IconTarget,
  IconActivity,
  IconPlayerPlay,
  IconCalendarCheck,
  IconTrendingUp,
  IconCheck,
  IconPlus,
} from "@tabler/icons-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { notifications } from "@mantine/notifications";
import { NextActionCapture } from "./NextActionCapture";
import { OutcomeMultiSelect } from "~/app/_components/OutcomeMultiSelect";
import { CreateOutcomeModal } from "~/app/_components/CreateOutcomeModal";
import { ProjectDateBadges } from "./ProjectDateBadges";
import { ProjectDriBadge } from "./ProjectDriBadge";
import {
  PROJECT_STATUS_OPTIONS,
  PROJECT_PRIORITY_OPTIONS,
  type ProjectStatus,
  type ProjectPriority,
} from "~/types/project";

type Outcome = RouterOutputs["outcome"]["getMyOutcomes"][number];

// Use the actual type from the query for proper type safety with EditActionModal
type ProjectWithDetails = RouterOutputs["project"]["getActiveWithDetails"][0];

interface ProjectChanges {
  statusChanged: boolean;
  priorityChanged: boolean;
  actionAdded: boolean;
  outcomesChanged: boolean;
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
  allOutcomes?: Outcome[];
}


function calculateHealthIndicators(project: ProjectWithDetails) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weeklyPlanning = project.outcomes.length > 0;
  const recentActivity = project.actions.some(
    (a) => a.completedAt && new Date(a.completedAt) > sevenDaysAgo
  );
  const momentum = project.actions.some((a) => a.status === "ACTIVE");
  const onTrack = !project.actions.some(
    (a) =>
      a.dueDate &&
      new Date(a.dueDate) < today &&
      a.status !== "COMPLETED" &&
      a.status !== "DONE"
  );
  const hasProgress = project.progress > 0;

  return { weeklyPlanning, recentActivity, momentum, onTrack, hasProgress };
}

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
  allOutcomes,
}: ProjectReviewCardProps) {
  const [status, setStatus] = useState(project.status);
  const [priority, setPriority] = useState(project.priority ?? "NONE");
  const [actionAdded, setActionAdded] = useState(false);
  const [outcomesChanged, setOutcomesChanged] = useState(false);
  const [outcomeSearchValue, setOutcomeSearchValue] = useState("");
  // Track local state to handle updates during review (since we use a snapshot)
  const [localOutcomes, setLocalOutcomes] = useState(project.outcomes);
  const [localActions, setLocalActions] = useState(project.actions);

  const utils = api.useUtils();

  const updateProject = api.project.update.useMutation({
    // Note: Don't invalidate here - let the page handle invalidation after review completes
    // This prevents the blank screen bug when changing project status during review
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message,
        color: "red",
      });
    },
  });

  const indicators = calculateHealthIndicators({
    ...project,
    actions: localActions,
    outcomes: localOutcomes,
  });

  // Check if project has at least one active action (existing or newly added)
  const hasExistingActiveAction = localActions.some(
    (a) => a.status === "ACTIVE" || a.status === "TODO"
  );
  const hasNextAction = hasExistingActiveAction || actionAdded;

  const handleMarkReviewed = async () => {
    const statusChanged = status !== project.status;
    const priorityChanged = priority !== (project.priority ?? "NONE");

    // Save changes if any
    if (statusChanged || priorityChanged) {
      await updateProject.mutateAsync({
        id: project.id,
        name: project.name,
        status: status as ProjectStatus,
        priority: priority as ProjectPriority,
      });
    }

    onMarkReviewed({
      statusChanged,
      priorityChanged,
      actionAdded,
      outcomesChanged,
    });
  };

  const handleActionAdded = (newAction: { id: string; name: string; status: string }) => {
    setActionAdded(true);
    // Cast to the full action type - only id/name/status are needed for display
    setLocalActions(prev => [...prev, {
      ...newAction,
      completedAt: null,
      dueDate: null,
    } as typeof prev[0]]);
  };

  const handleActionUpdated = async () => {
    // Refetch fresh project data to update the UI
    const freshData = await utils.project.getActiveWithDetails.fetch({
      workspaceId: workspaceId ?? undefined,
    });

    // Find the current project in fresh data and update localActions
    const freshProject = freshData?.find(p => p.id === project.id);
    if (freshProject) {
      setLocalActions(freshProject.actions);
    }
  };

  const handleDateUpdate = (dates: { startDate?: Date | null; endDate?: Date | null }) => {
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

  return (
    <Card
      withBorder
      radius="md"
      className="border-border-primary bg-surface-secondary"
    >
      {/* Navigation Header */}
      <Group justify="space-between" className="mb-4">
        <Button
          variant="subtle"
          size="sm"
          leftSection={<IconChevronLeft size={16} />}
          onClick={onPrevious}
          disabled={!hasPrevious}
        >
          Previous
        </Button>
        <Button
          variant="subtle"
          size="sm"
          rightSection={<IconChevronRight size={16} />}
          onClick={onNext}
          disabled={!hasNext}
        >
          Next
        </Button>
      </Group>

      {/* Project Header */}
      <Group gap="md" className="mb-6">
        <Stack gap={4} style={{ flex: 1 }}>
          <Text size="lg" fw={600} className="text-text-primary">
            {project.name}
          </Text>

          {/* Date and DRI Section - More Prominent */}
          <Group gap="md" className="mb-3">
            <ProjectDateBadges
              projectId={project.id}
              startDate={project.startDate}
              endDate={project.endDate}
              onUpdate={handleDateUpdate}
            />
            <div style={{ marginLeft: 'auto' }}>
              <ProjectDriBadge
                projectId={project.id}
                dri={project.dri}
                onUpdate={handleDriUpdate}
              />
            </div>
          </Group>

          <Group gap={8}>
            <Tooltip
              label={
                indicators.weeklyPlanning
                  ? "Outcomes linked"
                  : "No outcomes linked"
              }
              withArrow
            >
              <IconTarget
                size={16}
                className={
                  indicators.weeklyPlanning ? "text-green-500" : "text-red-500"
                }
              />
            </Tooltip>
            <Tooltip
              label={
                indicators.recentActivity
                  ? "Recent activity"
                  : "No recent activity"
              }
              withArrow
            >
              <IconActivity
                size={16}
                className={
                  indicators.recentActivity
                    ? "text-green-500"
                    : "text-yellow-500"
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
                size={16}
                className={
                  indicators.momentum ? "text-green-500" : "text-yellow-500"
                }
              />
            </Tooltip>
            <Tooltip
              label={
                indicators.onTrack ? "On track" : "Has overdue actions"
              }
              withArrow
            >
              <IconCalendarCheck
                size={16}
                className={
                  indicators.onTrack ? "text-green-500" : "text-red-500"
                }
              />
            </Tooltip>
            <Tooltip
              label={
                indicators.hasProgress ? "Progress tracked" : "No progress set"
              }
              withArrow
            >
              <IconTrendingUp
                size={16}
                className={
                  indicators.hasProgress ? "text-green-500" : "text-text-muted"
                }
              />
            </Tooltip>
          </Group>
        </Stack>
        {isReviewed && (
          <div className="rounded-full bg-green-500/10 p-2">
            <IconCheck size={20} className="text-green-500" />
          </div>
        )}
      </Group>

      {/* Status & Priority */}
      <Group grow className="mb-6">
        <Select
          label="Status"
          data={[...PROJECT_STATUS_OPTIONS]}
          value={status}
          onChange={(val) => val && setStatus(val)}
        />
        <Select
          label="Priority"
          data={[...PROJECT_PRIORITY_OPTIONS]}
          value={priority}
          onChange={(val) => val && setPriority(val)}
        />
      </Group>

      {/* Next Action */}
      <div className="mb-6">
        <NextActionCapture
          projectId={project.id}
          workspaceId={workspaceId}
          existingActions={localActions}
          onActionAdded={handleActionAdded}
          onActionUpdated={handleActionUpdated}
        />
      </div>

      {/* Outcomes */}
      <div className="mb-6">
        <Text size="sm" fw={500} className="mb-2 text-text-secondary">
          Outcomes
        </Text>
        <OutcomeMultiSelect
          projectId={project.id}
          projectName={project.name}
          projectStatus={project.status as ProjectStatus}
          projectPriority={(project.priority ?? "NONE") as ProjectPriority}
          currentOutcomes={localOutcomes}
          allOutcomes={allOutcomes}
          searchValue={outcomeSearchValue}
          onSearchChange={setOutcomeSearchValue}
          size="sm"
          onOutcomesChanged={(updatedOutcomes) => {
            setOutcomesChanged(true);
            if (updatedOutcomes) {
              // Cast to match the full outcome type from the query
              setLocalOutcomes(updatedOutcomes.map(o => ({
                id: o.id,
                type: o.type ?? null,
                description: o.description ?? '',
              })) as typeof localOutcomes);
            }
          }}
        />
        <CreateOutcomeModal
          projectId={project.id}
          onSuccess={(_id, outcomeData) => {
            setOutcomesChanged(true);
            if (outcomeData) {
              // Cast to match the full outcome type from the query
              setLocalOutcomes(prev => [...prev, {
                id: outcomeData.id,
                type: outcomeData.type,
                description: outcomeData.description,
              } as typeof prev[0]]);
            }
          }}
        >
          <Button
            variant="subtle"
            size="xs"
            leftSection={<IconPlus size={14} />}
            className="mt-2"
          >
            Create New Outcome
          </Button>
        </CreateOutcomeModal>
      </div>

      {/* Actions */}
      <Group justify="flex-end" gap="sm">
        <Button variant="subtle" onClick={onSkip}>
          Skip
        </Button>
        <Tooltip
          label="Add at least one next action before marking as reviewed"
          disabled={hasNextAction}
          withArrow
        >
          <Button
            onClick={handleMarkReviewed}
            loading={updateProject.isPending}
            leftSection={<IconCheck size={16} />}
            disabled={!hasNextAction}
          >
            Mark Reviewed
          </Button>
        </Tooltip>
      </Group>
    </Card>
  );
}
