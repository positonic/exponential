"use client";

import { useMemo, useState } from "react";
import { Container, Title, Text, Group, Badge, Stack, ActionIcon } from "@mantine/core";
import { IconPlus, IconTarget } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { CreateGoalModal } from "~/app/_components/CreateGoalModal";
import { useTerminology } from "~/hooks/useTerminology";
import { GoalsTableBody, type GoalRow } from "./GoalsTableBody";

const STATUS_CHIPS = ["active", "planned", "completed"] as const;
type StatusChip = (typeof STATUS_CHIPS)[number];

interface ProjectGoalsPanelProps {
  projectId: string;
}

/**
 * The project detail page's Goals tab: the goals attached to this project as
 * the same nested table the Goals page renders, one status at a time, with
 * no period scope and no control line — a project's goals are a short list
 * that reads better without them (D-0043).
 */
export function ProjectGoalsPanel({ projectId }: ProjectGoalsPanelProps) {
  const [statusFilter, setStatusFilter] = useState<StatusChip>("active");
  const { workspaceSlug } = useWorkspace();
  const terminology = useTerminology();

  const { data: projectGoals, isLoading } = api.goal.getProjectGoals.useQuery({
    projectId,
  });

  const goals = useMemo(
    () =>
      ((projectGoals ?? []) as unknown as GoalRow[]).filter(
        (g) => g.status === statusFilter,
      ),
    [projectGoals, statusFilter],
  );

  return (
    <Container size="xl" className="py-6">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={3} className="text-text-primary">
            {terminology.goals}
          </Title>
          <CreateGoalModal projectId={projectId}>
            <ActionIcon variant="subtle" size="lg" aria-label={`New ${terminology.goal.toLowerCase()}`}>
              <IconPlus size={18} />
            </ActionIcon>
          </CreateGoalModal>
        </Group>

        <Group gap="xs">
          {STATUS_CHIPS.map((status) => (
            <Badge
              key={status}
              variant={statusFilter === status ? "filled" : "light"}
              color={statusFilter === status ? "dark" : "gray"}
              size="lg"
              className="cursor-pointer"
              onClick={() => setStatusFilter(status)}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>
          ))}
        </Group>

        <GoalsTableBody
          goals={goals}
          isLoading={isLoading}
          workspaceSlug={workspaceSlug ?? ""}
          goalLabel={terminology.goal}
          emptyState={
            <div className="py-16 text-center">
              <IconTarget size={48} className="text-text-muted mx-auto mb-4" />
              <Text size="lg" fw={500} className="text-text-primary">
                No {statusFilter} {terminology.goals.toLowerCase()}
              </Text>
              <Text size="sm" c="dimmed" mt={4}>
                Attach {terminology.goals.toLowerCase()} to this project to
                track what it is for.
              </Text>
            </div>
          }
        />
      </Stack>
    </Container>
  );
}
