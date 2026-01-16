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
import {
  PROJECT_STATUS_OPTIONS,
  PROJECT_PRIORITY_OPTIONS,
  type ProjectStatus,
  type ProjectPriority,
} from "~/types/project";

type Outcome = RouterOutputs["outcome"]["getMyOutcomes"][number];

interface ProjectChanges {
  statusChanged: boolean;
  priorityChanged: boolean;
  actionAdded: boolean;
  outcomesChanged: boolean;
}

interface ProjectWithDetails {
  id: string;
  name: string;
  slug: string;
  status: string;
  priority: string | null;
  progress: number;
  actions: Array<{
    id: string;
    status: string;
    completedAt: Date | null;
    dueDate: Date | null;
  }>;
  outcomes: Array<{
    id: string;
    type: string | null;
    description: string;
  }>;
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

  const weeklyPlanning = project.outcomes.some((o) => o.type === "weekly");
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

  const indicators = calculateHealthIndicators(project);

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

  const handleActionAdded = () => {
    setActionAdded(true);
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
          <Group gap={8}>
            <Tooltip
              label={
                indicators.weeklyPlanning
                  ? "Weekly outcomes set"
                  : "No weekly outcomes"
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
          onActionAdded={handleActionAdded}
        />
      </div>

      {/* Outcomes */}
      <div className="mb-6">
        <Group justify="space-between" className="mb-2">
          <Text size="sm" fw={500} className="text-text-secondary">
            Outcomes
          </Text>
          <CreateOutcomeModal
            projectId={project.id}
            onSuccess={() => setOutcomesChanged(true)}
          >
            <Button
              variant="subtle"
              size="xs"
              leftSection={<IconPlus size={14} />}
            >
              Create New
            </Button>
          </CreateOutcomeModal>
        </Group>
        <OutcomeMultiSelect
          projectId={project.id}
          projectName={project.name}
          projectStatus={project.status as ProjectStatus}
          projectPriority={(project.priority ?? "NONE") as ProjectPriority}
          currentOutcomes={project.outcomes}
          allOutcomes={allOutcomes}
          searchValue={outcomeSearchValue}
          onSearchChange={setOutcomeSearchValue}
          size="sm"
          onOutcomesChanged={() => setOutcomesChanged(true)}
        />
      </div>

      {/* Actions */}
      <Group justify="flex-end" gap="sm">
        <Button variant="subtle" onClick={onSkip}>
          Skip
        </Button>
        <Button
          onClick={handleMarkReviewed}
          loading={updateProject.isPending}
          leftSection={<IconCheck size={16} />}
        >
          Mark Reviewed
        </Button>
      </Group>
    </Card>
  );
}
