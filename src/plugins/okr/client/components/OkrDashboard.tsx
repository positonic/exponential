"use client";

import { useState, useEffect } from "react";
import {
  Container,
  Title,
  Text,
  Stack,
  Card,
  Group,
  Button,
  Select,
  Progress,
  Badge,
  Modal,
  SimpleGrid,
  Skeleton,
  TextInput,
  NumberInput,
  Textarea,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconTargetArrow, IconPlus } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import Link from "next/link";
import { CreateGoalModal } from "~/app/_components/CreateGoalModal";

// Helper to get current annual period string
function getCurrentAnnualPeriod(): string {
  const year = new Date().getFullYear();
  return `Annual-${year}`;
}

// Status badge colors
const statusColors: Record<string, string> = {
  "on-track": "green",
  "at-risk": "yellow",
  "off-track": "red",
  achieved: "blue",
};

// Unit options
const unitOptions = [
  { value: "percent", label: "Percentage (%)" },
  { value: "count", label: "Count (#)" },
  { value: "currency", label: "Currency ($)" },
  { value: "hours", label: "Hours" },
  { value: "custom", label: "Custom" },
];

export function OkrDashboard() {
  const { workspaceId, workspaceSlug } = useWorkspace();
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(getCurrentAnnualPeriod());
  const [
    createModalOpened,
    { open: openCreateModal, close: closeCreateModal },
  ] = useDisclosure(false);

  // Form state for creating key results
  const [formData, setFormData] = useState({
    goalId: "",
    title: "",
    description: "",
    targetValue: 100,
    startValue: 0,
    unit: "percent",
    unitLabel: "",
    period: "",
  });

  const utils = api.useUtils();

  // Sync selected period to form data
  useEffect(() => {
    setFormData((prev) => ({ ...prev, period: selectedPeriod ?? "" }));
  }, [selectedPeriod]);

  // Fetch periods
  const { data: periods } = api.okr.getPeriods.useQuery();

  // Fetch available goals for selection
  const { data: availableGoals } = api.okr.getAvailableGoals.useQuery({
    workspaceId: workspaceId ?? undefined,
  });

  // Fetch OKRs grouped by objective
  const { data: objectives, isLoading } = api.okr.getByObjective.useQuery({
    workspaceId: workspaceId ?? undefined,
    period: selectedPeriod ?? undefined,
  });

  // Fetch stats
  const { data: stats } = api.okr.getStats.useQuery({
    workspaceId: workspaceId ?? undefined,
    period: selectedPeriod ?? undefined,
  });

  // Create key result mutation
  const createKeyResult = api.okr.create.useMutation({
    onSuccess: () => {
      void utils.okr.getByObjective.invalidate();
      void utils.okr.getStats.invalidate();
      closeCreateModal();
      setFormData({
        goalId: "",
        title: "",
        description: "",
        targetValue: 100,
        startValue: 0,
        unit: "percent",
        unitLabel: "",
        period: "",
      });
    },
  });

  const goalsPath = workspaceSlug ? `/w/${workspaceSlug}/goals` : "/goals";

  const handleCreateKeyResult = () => {
    if (!formData.goalId || !formData.title || !formData.period) return;

    createKeyResult.mutate({
      goalId: parseInt(formData.goalId),
      title: formData.title,
      description: formData.description || undefined,
      targetValue: formData.targetValue,
      startValue: formData.startValue,
      unit: formData.unit as "percent" | "count" | "currency" | "hours" | "custom",
      unitLabel: formData.unitLabel || undefined,
      period: formData.period,
      workspaceId: workspaceId ?? undefined,
    });
  };

  if (isLoading) {
    return (
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <Skeleton height={40} width={300} />
          <Skeleton height={100} />
          <Skeleton height={200} />
          <Skeleton height={200} />
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between">
          <div>
            <Title
              order={1}
              className="text-text-primary flex items-center gap-2"
            >
              <IconTargetArrow size={32} />
              OKRs
            </Title>
            <Text className="text-text-muted">
              Track your Objectives and Key Results
            </Text>
          </div>
          <Group>
            <Select
              placeholder="All Periods"
              data={periods ?? []}
              value={selectedPeriod}
              onChange={setSelectedPeriod}
              clearable
              className="w-48"
            />
            <CreateGoalModal onSuccess={() => {
              void utils.okr.getAvailableGoals.invalidate();
              void utils.okr.getByObjective.invalidate();
              void utils.okr.getStats.invalidate();
            }}>
              <Button variant="outline" leftSection={<IconPlus size={16} />}>
                Create Objective
              </Button>
            </CreateGoalModal>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={openCreateModal}
            >
              Add Key Result
            </Button>
          </Group>
        </Group>

        {/* Stats Summary */}
        {stats && (
          <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
            <Card className="border border-border-primary bg-surface-secondary text-center">
              <Text size="xs" className="text-text-muted">
                Objectives
              </Text>
              <Title order={2} className="text-text-primary">
                {stats.totalObjectives}
              </Title>
            </Card>
            <Card className="border border-border-primary bg-surface-secondary text-center">
              <Text size="xs" className="text-text-muted">
                Key Results
              </Text>
              <Title order={2} className="text-text-primary">
                {stats.totalKeyResults}
              </Title>
            </Card>
            <Card className="border border-border-primary bg-surface-secondary text-center">
              <Text size="xs" className="text-text-muted">
                Avg Progress
              </Text>
              <Title order={2} className="text-text-primary">
                {stats.averageProgress}%
              </Title>
            </Card>
            <Card className="border border-border-primary bg-surface-secondary text-center">
              <Text size="xs" className="text-text-muted">
                On Track
              </Text>
              <Title order={2} className="text-green-500">
                {stats.statusBreakdown.onTrack}
              </Title>
            </Card>
          </SimpleGrid>
        )}

        {/* Objectives with Key Results */}
        {objectives && objectives.length > 0 ? (
          <Stack gap="md">
            {objectives.map((objective) => (
              <Card
                key={objective.id}
                className="border border-border-primary bg-surface-secondary"
              >
                {/* Objective Header */}
                <Group justify="space-between" mb="md">
                  <div>
                    <Group gap="xs">
                      {objective.lifeDomain && (
                        <Badge
                          color={objective.lifeDomain.color ?? "gray"}
                          variant="light"
                        >
                          {objective.lifeDomain.title}
                        </Badge>
                      )}
                      <Title order={4} className="text-text-primary">
                        {objective.title}
                      </Title>
                    </Group>
                    {objective.description && (
                      <Text size="sm" className="text-text-muted mt-1">
                        {objective.description}
                      </Text>
                    )}
                  </div>
                  <div className="text-right">
                    <Text size="sm" className="text-text-muted">
                      Progress
                    </Text>
                    <Text size="lg" fw={600} className="text-text-primary">
                      {objective.progress}%
                    </Text>
                  </div>
                </Group>

                {/* Progress bar */}
                <Progress
                  value={objective.progress}
                  color={
                    objective.progress >= 70
                      ? "green"
                      : objective.progress >= 40
                        ? "yellow"
                        : "red"
                  }
                  size="sm"
                  mb="md"
                />

                {/* Key Results */}
                <Stack gap="xs">
                  {objective.keyResults.map((kr) => {
                    const range = kr.targetValue - kr.startValue;
                    const krProgress =
                      range > 0
                        ? Math.min(
                            100,
                            ((kr.currentValue - kr.startValue) / range) * 100
                          )
                        : 0;

                    return (
                      <Card
                        key={kr.id}
                        className="bg-background-primary border border-border-secondary hover:border-border-focus transition-colors"
                        p="sm"
                      >
                        <Group justify="space-between">
                          <div className="flex-1">
                            <Group gap="xs" mb="xs">
                              <Badge
                                size="xs"
                                color={statusColors[kr.status] ?? "gray"}
                                variant="filled"
                              >
                                {kr.status.replace("-", " ")}
                              </Badge>
                              <Text
                                size="sm"
                                fw={500}
                                className="text-text-primary"
                              >
                                {kr.title}
                              </Text>
                            </Group>
                            <Progress
                              value={krProgress}
                              size="xs"
                              color={statusColors[kr.status] ?? "gray"}
                            />
                          </div>
                          <div className="text-right min-w-20">
                            <Text
                              size="sm"
                              fw={600}
                              className="text-text-primary"
                            >
                              {kr.currentValue} / {kr.targetValue}
                            </Text>
                            <Text size="xs" className="text-text-muted">
                              {kr.unit === "percent"
                                ? "%"
                                : kr.unitLabel ?? kr.unit}
                            </Text>
                          </div>
                        </Group>
                      </Card>
                    );
                  })}
                </Stack>

                {/* Add KR button */}
                <Button
                  variant="subtle"
                  size="xs"
                  leftSection={<IconPlus size={14} />}
                  mt="sm"
                  onClick={() => {
                    setFormData((prev) => ({
                      ...prev,
                      goalId: objective.id.toString(),
                    }));
                    openCreateModal();
                  }}
                >
                  Add Key Result
                </Button>
              </Card>
            ))}
          </Stack>
        ) : (
          <Card className="border border-border-primary bg-surface-secondary text-center py-12">
            <IconTargetArrow
              size={48}
              className="text-text-muted mx-auto mb-4"
            />
            <Title order={3} className="text-text-primary mb-2">
              No OKRs Yet
            </Title>
            <Text className="text-text-muted mb-4">
              Create your first Key Result to start tracking progress toward
              your goals.
            </Text>
            <Group justify="center" gap="md">
              <Button component={Link} href={goalsPath} variant="light">
                View Objectives
              </Button>
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={openCreateModal}
              >
                Add Key Result
              </Button>
            </Group>
          </Card>
        )}
      </Stack>

      {/* Create Key Result Modal */}
      <Modal
        opened={createModalOpened}
        onClose={closeCreateModal}
        title="Add Key Result"
        size="lg"
      >
        <Stack gap="md">
          <Select
            label="Objective (Goal)"
            placeholder="Select a goal"
            data={
              availableGoals?.map((g) => ({
                value: g.id.toString(),
                label: g.title,
              })) ?? []
            }
            value={formData.goalId}
            onChange={(value) =>
              setFormData((prev) => ({ ...prev, goalId: value ?? "" }))
            }
            required
          />

          <TextInput
            label="Key Result Title"
            placeholder="e.g., Increase revenue by 20%"
            value={formData.title}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, title: e.target.value }))
            }
            required
          />

          <Textarea
            label="Description (optional)"
            placeholder="Add more details about this key result"
            value={formData.description}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, description: e.target.value }))
            }
          />

          <Select
            label="Period"
            placeholder="Select a period"
            data={periods ?? []}
            value={formData.period}
            onChange={(value) =>
              setFormData((prev) => ({ ...prev, period: value ?? "" }))
            }
            required
          />

          <Group grow>
            <NumberInput
              label="Start Value"
              value={formData.startValue}
              onChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  startValue: typeof value === "number" ? value : 0,
                }))
              }
            />
            <NumberInput
              label="Target Value"
              value={formData.targetValue}
              onChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  targetValue: typeof value === "number" ? value : 100,
                }))
              }
              required
            />
          </Group>

          <Group grow>
            <Select
              label="Unit"
              data={unitOptions}
              value={formData.unit}
              onChange={(value) =>
                setFormData((prev) => ({ ...prev, unit: value ?? "percent" }))
              }
            />
            {formData.unit === "custom" && (
              <TextInput
                label="Custom Unit Label"
                placeholder="e.g., users, deals"
                value={formData.unitLabel}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    unitLabel: e.target.value,
                  }))
                }
              />
            )}
          </Group>

          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={closeCreateModal}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateKeyResult}
              loading={createKeyResult.isPending}
              disabled={!formData.goalId || !formData.title || !formData.period}
            >
              Create Key Result
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
