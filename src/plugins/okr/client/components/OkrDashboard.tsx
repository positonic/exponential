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
  SegmentedControl,
  Collapse,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconTargetArrow, IconPlus, IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { keepPreviousData } from "@tanstack/react-query";
import { PeriodTabs } from "./PeriodTabs";
import {
  extractYearsFromPeriods,
} from "../utils/periodUtils";
import { useOkrSearchParams } from "../hooks/useOkrSearchParams";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import Link from "next/link";
import { CreateGoalModal } from "~/app/_components/CreateGoalModal";
import { OkrOverview } from "./OkrOverview";
import { ObjectiveRow } from "./ObjectiveRow";
import { EditKeyResultModal } from "./EditKeyResultModal";
import { OkrDetailDrawer } from "./OkrDetailDrawer";

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
  const { year: selectedYear, period: selectedPeriod, setYear, setPeriod } = useOkrSearchParams();
  const [statsExpanded, { toggle: toggleStats }] = useDisclosure(false);
  const [
    createModalOpened,
    { open: openCreateModal, close: closeCreateModal },
  ] = useDisclosure(false);
  const [
    editKrModalOpened,
    { open: openEditKrModal, close: closeEditKrModal },
  ] = useDisclosure(false);
  const [editingKeyResult, setEditingKeyResult] = useState<{
    id: string;
    title: string;
    description?: string | null;
    currentValue: number;
    targetValue: number;
    startValue: number;
    unit?: string;
    unitLabel?: string | null;
    status: string;
    confidence?: number | null;
    period?: string;
  } | null>(null);

  // Drawer state for viewing OKR details
  const [
    drawerOpened,
    { open: openDrawer, close: closeDrawer },
  ] = useDisclosure(false);
  const [drawerItem, setDrawerItem] = useState<{
    type: "objective" | "keyResult";
    id: number | string;
    title: string;
    description?: string | null;
    progress: number;
    status: string;
    lifeDomainName?: string | null;
  } | null>(null);

  // Track expanded objectives (all expanded by default)
  const [expandedObjectives, setExpandedObjectives] = useState<Set<number>>(
    new Set()
  );

  // Track expanded key results (for showing linked projects via Accordion)
  const [expandedKeyResults, setExpandedKeyResults] = useState<string[]>([]);

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

  // Derive the effective period string
  const effectivePeriod = useMemo(() => {
    return `${selectedPeriod}-${selectedYear}`;
  }, [selectedYear, selectedPeriod]);

  // Sync selected period to form data
  useEffect(() => {
    setFormData((prev) => ({ ...prev, period: effectivePeriod }));
  }, [effectivePeriod]);

  // Fetch periods (used to extract available years)
  const { data: periods } = api.okr.getPeriods.useQuery();

  // Extract available years from periods (for year selector)
  const availableYears = useMemo(() => {
    if (!periods) return [];
    return extractYearsFromPeriods(periods);
  }, [periods]);

  // Get period counts for badge display
  const { data: periodCounts, isLoading: countsLoading } = api.okr.getCountsByYear.useQuery({
    workspaceId: workspaceId ?? undefined,
    year: selectedYear,
  }, {
    placeholderData: keepPreviousData,
  });

  // Fetch available goals for selection
  const { data: availableGoals } = api.okr.getAvailableGoals.useQuery({
    workspaceId: workspaceId ?? undefined,
  });

  // Fetch OKRs grouped by objective
  const { data: objectives, isLoading } = api.okr.getByObjective.useQuery({
    workspaceId: workspaceId ?? undefined,
    period: effectivePeriod,
    includePairedPeriod: false,
  }, {
    placeholderData: keepPreviousData,
  });

  // Fetch stats
  const { data: stats, isLoading: statsLoading } = api.okr.getStats.useQuery({
    workspaceId: workspaceId ?? undefined,
    period: effectivePeriod,
  }, {
    placeholderData: keepPreviousData,
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
      void utils.okr.getCountsByYear.invalidate();
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
      void utils.okr.getCountsByYear.invalidate();
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

  // Handler to open create modal with objective pre-selected
  const handleAddKeyResultToObjective = (objectiveId: number) => {
    setFormData((prev) => ({ ...prev, goalId: objectiveId.toString() }));
    openCreateModal();
  };

  // Handler to open edit modal for a key result
  const handleEditKeyResult = (keyResult: {
    id: string;
    title: string;
    description?: string | null;
    currentValue: number;
    targetValue: number;
    startValue: number;
    unit?: string;
    unitLabel?: string | null;
    status: string;
    confidence?: number | null;
    period?: string;
  }) => {
    setEditingKeyResult(keyResult);
    openEditKrModal();
  };

  // Handler to open drawer for viewing objective details
  const handleViewObjective = (objective: {
    id: number;
    title: string;
    description?: string | null;
    progress: number;
    lifeDomain?: { id: number; name: string } | null;
  }) => {
    setDrawerItem({
      type: "objective",
      id: objective.id,
      title: objective.title,
      description: objective.description,
      progress: objective.progress,
      status: objective.progress >= 100 ? "achieved" : objective.progress >= 70 ? "on-track" : objective.progress >= 40 ? "at-risk" : "off-track",
      lifeDomainName: objective.lifeDomain?.name ?? null,
    });
    openDrawer();
  };

  // Handler to open drawer for viewing key result details
  const handleViewKeyResult = (keyResult: {
    id: string;
    title: string;
    description?: string | null;
    currentValue: number;
    targetValue: number;
    startValue: number;
    status: string;
  }) => {
    const range = keyResult.targetValue - keyResult.startValue;
    const progress = range > 0 ? ((keyResult.currentValue - keyResult.startValue) / range) * 100 : 0;
    setDrawerItem({
      type: "keyResult",
      id: keyResult.id,
      title: keyResult.title,
      description: keyResult.description,
      progress: Math.min(100, Math.max(0, progress)),
      status: keyResult.status,
      lifeDomainName: null,
    });
    openDrawer();
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
        <Group justify="space-between" align="start">
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
            {availableYears.length > 1 && (
              <SegmentedControl
                value={selectedYear}
                onChange={setYear}
                data={availableYears.map((y) => ({ label: y, value: y }))}
                size="sm"
                color="brand"
              />
            )}
            <CreateGoalModal
              onSuccess={() => {
                void utils.okr.getAvailableGoals.invalidate();
                void utils.okr.getByObjective.invalidate();
                void utils.okr.getStats.invalidate();
                void utils.okr.getCountsByYear.invalidate();
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

        {/* Period Navigation Tabs */}
        <PeriodTabs
          selectedPeriod={selectedPeriod}
          onPeriodChange={setPeriod}
          counts={periodCounts}
          isLoading={countsLoading}
        />

        {/* Collapsible Overview Metrics */}
        <Card className="border border-border-primary bg-surface-secondary">
          <Group 
            justify="space-between" 
            onClick={toggleStats}
            style={{ cursor: 'pointer' }}
            className="select-none"
          >
            <Text size="sm" fw={500} className="text-text-primary">
              Overview Metrics
            </Text>
            {statsExpanded ? (
              <IconChevronUp size={20} className="text-text-secondary" />
            ) : (
              <IconChevronDown size={20} className="text-text-secondary" />
            )}
          </Group>
          <Collapse in={statsExpanded} transitionDuration={200}>
            <div className="mt-4">
              <OkrOverview stats={overviewStats} isLoading={statsLoading} />
            </div>
          </Collapse>
        </Card>

        {/* Objectives with Key Results */}
        {objectives && objectives.length > 0 ? (
          <Card className="border border-border-primary bg-surface-secondary">
            {objectives
              .filter((obj) => obj.keyResults.length > 0 || obj.period === effectivePeriod)
              .map((objective) => (
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
                  void utils.okr.getCountsByYear.invalidate();
                }}
                onAddKeyResult={handleAddKeyResultToObjective}
                onEditKeyResult={handleEditKeyResult}
                onViewObjective={() => handleViewObjective({
                  ...objective,
                  lifeDomain: objective.lifeDomain
                    ? { id: objective.lifeDomain.id, name: objective.lifeDomain.title }
                    : null,
                })}
                onViewKeyResult={handleViewKeyResult}
                expandedKeyResults={expandedKeyResults}
                onToggleKeyResult={setExpandedKeyResults}
              />
            ))}
          </Card>
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

      {/* Edit Key Result Modal */}
      <EditKeyResultModal
        keyResult={editingKeyResult}
        opened={editKrModalOpened}
        onClose={() => {
          closeEditKrModal();
          setEditingKeyResult(null);
        }}
        onSuccess={() => {
          void utils.okr.getByObjective.invalidate();
          void utils.okr.getStats.invalidate();
          void utils.okr.getCountsByYear.invalidate();
        }}
      />

      {/* OKR Detail Drawer */}
      <OkrDetailDrawer
        opened={drawerOpened}
        onClose={closeDrawer}
        type={drawerItem?.type ?? "objective"}
        itemId={drawerItem?.id ?? null}
        title={drawerItem?.title}
        description={drawerItem?.description}
        progress={drawerItem?.progress}
        status={drawerItem?.status}
        lifeDomainName={drawerItem?.lifeDomainName}
      />
    </Container>
  );
}
