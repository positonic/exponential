"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Container,
  Title,
  Text,
  Stack,
  Card,
  Group,
  Button,
  Select,
  Modal,
  Skeleton,
  TextInput,
  NumberInput,
  Textarea,
  Checkbox,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconTargetArrow, IconPlus } from "@tabler/icons-react";
import { OkrTableView } from "./OkrTableView";
import {
  isQuarterlyPeriod,
  getParentPeriod,
} from "../utils/periodUtils";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import Link from "next/link";
import { CreateGoalModal } from "~/app/_components/CreateGoalModal";
import { OkrOverview } from "./OkrOverview";
import { ObjectiveRow } from "./ObjectiveRow";

// Helper to get current annual period string
function getCurrentAnnualPeriod(): string {
  const year = new Date().getFullYear();
  return `Annual-${year}`;
}

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
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(
    getCurrentAnnualPeriod()
  );
  const [showWithAnnual, setShowWithAnnual] = useState(false);
  const [
    createModalOpened,
    { open: openCreateModal, close: closeCreateModal },
  ] = useDisclosure(false);

  // Track expanded objectives (all expanded by default)
  const [expandedObjectives, setExpandedObjectives] = useState<Set<number>>(
    new Set()
  );

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

  // Determine if we can show the "Show with Annual" toggle
  const canShowAnnualToggle = selectedPeriod
    ? isQuarterlyPeriod(selectedPeriod)
    : false;

  // Fetch OKRs grouped by objective
  const { data: objectives, isLoading } = api.okr.getByObjective.useQuery({
    workspaceId: workspaceId ?? undefined,
    period: selectedPeriod ?? undefined,
    includePairedPeriod: canShowAnnualToggle && showWithAnnual,
  });

  // Fetch stats
  const { data: stats, isLoading: statsLoading } = api.okr.getStats.useQuery({
    workspaceId: workspaceId ?? undefined,
    period: selectedPeriod ?? undefined,
  });

  // Initialize expanded state when objectives load (all expanded by default)
  useEffect(() => {
    if (objectives && expandedObjectives.size === 0) {
      setExpandedObjectives(new Set(objectives.map((o) => o.id)));
    }
  }, [objectives, expandedObjectives.size]);

  // Toggle expand/collapse for an objective
  const toggleExpand = (objectiveId: number) => {
    setExpandedObjectives((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(objectiveId)) {
        newSet.delete(objectiveId);
      } else {
        newSet.add(objectiveId);
      }
      return newSet;
    });
  };

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

  // Delete objective (goal) mutation
  const deleteObjective = api.goal.deleteGoal.useMutation({
    onSuccess: () => {
      void utils.okr.getByObjective.invalidate();
      void utils.okr.getStats.invalidate();
      void utils.okr.getAvailableGoals.invalidate();
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
      unit: formData.unit as
        | "percent"
        | "count"
        | "currency"
        | "hours"
        | "custom",
      unitLabel: formData.unitLabel || undefined,
      period: formData.period,
      workspaceId: workspaceId ?? undefined,
    });
  };

  const handleDeleteObjective = (id: number) => {
    if (
      confirm(
        "Are you sure you want to delete this objective? This will also delete all associated key results."
      )
    ) {
      deleteObjective.mutate({ id });
    }
  };

  // Transform stats for OkrOverview component
  const overviewStats = useMemo(() => {
    if (!stats) return null;
    return {
      totalKeyResults: stats.totalKeyResults,
      completedKeyResults: stats.completedKeyResults,
      averageProgress: stats.averageProgress,
      averageConfidence: stats.averageConfidence,
      periodEndDate: stats.periodEndDate,
    };
  }, [stats]);

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
            {canShowAnnualToggle && (
              <Checkbox
                label="Show with Annual"
                checked={showWithAnnual}
                onChange={(e) => setShowWithAnnual(e.currentTarget.checked)}
              />
            )}
            <CreateGoalModal
              onSuccess={() => {
                void utils.okr.getAvailableGoals.invalidate();
                void utils.okr.getByObjective.invalidate();
                void utils.okr.getStats.invalidate();
              }}
            >
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

        {/* Overview Metrics */}
        <OkrOverview stats={overviewStats} isLoading={statsLoading} />

        {/* Objectives with Key Results */}
        {objectives && objectives.length > 0 ? (
          showWithAnnual && selectedPeriod ? (
            // Table view: separate objectives by period and show side-by-side
            (() => {
              const annualPeriod = getParentPeriod(selectedPeriod);
              const annualObjectives = objectives
                .filter((obj) =>
                  obj.keyResults.some((kr) => kr.period === annualPeriod)
                )
                .map((obj) => ({
                  ...obj,
                  keyResults: obj.keyResults.filter(
                    (kr) => kr.period === annualPeriod
                  ),
                }));
              const quarterlyObjectives = objectives
                .filter((obj) =>
                  obj.keyResults.some((kr) => kr.period === selectedPeriod)
                )
                .map((obj) => ({
                  ...obj,
                  keyResults: obj.keyResults.filter(
                    (kr) => kr.period === selectedPeriod
                  ),
                }));
              return (
                <OkrTableView
                  annualObjectives={annualObjectives}
                  quarterlyObjectives={quarterlyObjectives}
                  selectedQuarter={selectedPeriod}
                />
              );
            })()
          ) : (
            // Tree view: default hierarchical layout
            <Card className="border border-border-primary bg-surface-secondary">
              {objectives.map((objective) => (
                <ObjectiveRow
                  key={objective.id}
                  objective={{
                    ...objective,
                    lifeDomain: objective.lifeDomain
                      ? {
                          id: objective.lifeDomain.id,
                          name: objective.lifeDomain.title,
                        }
                      : null,
                  }}
                  isExpanded={expandedObjectives.has(objective.id)}
                  onToggleExpand={() => toggleExpand(objective.id)}
                  onDelete={handleDeleteObjective}
                  isDeleting={deleteObjective.isPending}
                  onEditSuccess={() => {
                    void utils.okr.getByObjective.invalidate();
                    void utils.okr.getStats.invalidate();
                  }}
                />
              ))}
            </Card>
          )
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
