"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Container,
  Text,
  Stack,
  Group,
  Button,
  Select,
  Modal,
  Skeleton,
  TextInput,
  NumberInput,
  Textarea,
  SegmentedControl,
  ActionIcon,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconTargetArrow,
  IconPlus,
  IconFilter,
  IconHierarchy,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";
import { keepPreviousData } from "@tanstack/react-query";
import { PeriodTabs } from "./PeriodTabs";
import { OkrTimeline } from "./OkrTimeline";
import {
  buildTimelineData,
  computeTimelineAxis,
} from "../utils/okrTimelineData";
import {
  extractYearsFromPeriods,
  getCurrentQuarterType,
} from "../utils/periodUtils";
import { useOkrSearchParams } from "../hooks/useOkrSearchParams";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import Link from "next/link";
import { CreateGoalModal } from "~/app/_components/CreateGoalModal";
import { EditKeyResultModal } from "./EditKeyResultModal";
import { OkrDetailDrawer } from "./OkrDetailDrawer";
import { KeyResultGuidanceIcon } from "./KeyResultGuidance";
import { OkrHeroCards } from "./OkrHeroCards";
import {
  ObjectiveCardV2,
  type ObjectiveCardKeyResult,
  type ObjectiveCardObjective,
} from "./ObjectiveCardV2";
import {
  periodCountdownLabel,
  statusToConfidence,
} from "../utils/okrDashboardUtils";

const unitOptions = [
  { value: "percent", label: "Percentage (%)" },
  { value: "count", label: "Count (#)" },
  { value: "currency", label: "Currency ($)" },
  { value: "hours", label: "Hours" },
  { value: "custom", label: "Custom" },
];

export function OkrDashboard() {
  const { workspaceId, workspaceSlug } = useWorkspace();
  const { year: selectedYear, period: selectedPeriod, setYear, setPeriod } =
    useOkrSearchParams();

  const [createModalOpened, { open: openCreateModal, close: closeCreateModal }] =
    useDisclosure(false);
  const [editKrModalOpened, { open: openEditKrModal, close: closeEditKrModal }] =
    useDisclosure(false);
  const [editingKeyResult, setEditingKeyResult] =
    useState<ObjectiveCardKeyResult | null>(null);

  const [drawerOpened, { open: openDrawer, close: closeDrawer }] =
    useDisclosure(false);
  const [drawerItem, setDrawerItem] = useState<{
    type: "objective" | "keyResult";
    id: number | string;
    title: string;
    description?: string | null;
    progress: number;
    status: string;
    lifeDomainName?: string | null;
  } | null>(null);

  const [expandedObjectives, setExpandedObjectives] = useState<Set<number>>(
    new Set(),
  );
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

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

  const isTimelineView = selectedPeriod === "Timeline";

  // When the Timeline tab is active it's a view mode, not a period. Pick the
  // quarter matching today's date (or Q1 of the selected year for past/future
  // years) so the gantt axis has a concrete range of weeks to lay out.
  const timelineTargetQuarter = useMemo(() => {
    const now = new Date();
    const thisYear = now.getFullYear().toString();
    if (selectedYear === thisYear) return getCurrentQuarterType();
    return "Q1" as const;
  }, [selectedYear]);

  const effectivePeriod = useMemo(() => {
    if (isTimelineView) return `${timelineTargetQuarter}-${selectedYear}`;
    return `${selectedPeriod}-${selectedYear}`;
  }, [isTimelineView, timelineTargetQuarter, selectedYear, selectedPeriod]);

  useEffect(() => {
    setFormData((prev) => ({ ...prev, period: effectivePeriod }));
  }, [effectivePeriod]);

  const { data: periods } = api.okr.getPeriods.useQuery();

  const availableYears = useMemo(() => {
    if (!periods) return [];
    return extractYearsFromPeriods(periods);
  }, [periods]);

  const { data: periodCounts, isLoading: countsLoading } =
    api.okr.getCountsByYear.useQuery(
      { workspaceId: workspaceId ?? undefined, year: selectedYear },
      { enabled: !!workspaceId, placeholderData: keepPreviousData },
    );

  const { data: availableGoals } = api.okr.getAvailableGoals.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId },
  );

  // Each tab shows only goals/KRs whose period matches that tab. Annual goals
  // belong on the Annual tab; pairing them into Q1–Q4 makes the quarterly tabs
  // misrepresent what's being tracked at the quarter level.
  const { data: objectives, isLoading } = api.okr.getByObjective.useQuery(
    {
      workspaceId: workspaceId ?? undefined,
      period: effectivePeriod,
      includePairedPeriod: false,
    },
    { enabled: !!workspaceId, placeholderData: keepPreviousData },
  );

  // Only show objectives that belong to this period. Newly created KRs or
  // legacy period-less goals with matching period-specific KRs still show up.
  const visibleObjectives: ObjectiveCardObjective[] = useMemo(() => {
    if (!objectives) return [];
    return objectives
      .filter((o) => o.keyResults.length > 0 || o.period === effectivePeriod)
      .map((o) => ({
        ...o,
        lifeDomain: o.lifeDomain
          ? { id: o.lifeDomain.id, name: o.lifeDomain.title }
          : null,
        keyResults: o.keyResults.map(
          (kr): ObjectiveCardKeyResult => ({
            id: kr.id,
            title: kr.title,
            description: kr.description ?? null,
            currentValue: kr.currentValue,
            targetValue: kr.targetValue,
            startValue: kr.startValue,
            unit: kr.unit,
            unitLabel: kr.unitLabel,
            status: kr.status,
            confidence: kr.confidence,
            period: kr.period,
            checkIns: kr.checkIns,
            user: kr.user,
            driUser: kr.driUser,
            projects: kr.projects,
          }),
        ),
      }));
  }, [objectives, effectivePeriod]);

  useEffect(() => {
    if (visibleObjectives.length > 0 && expandedObjectives.size === 0) {
      setExpandedObjectives(new Set([visibleObjectives[0]!.id]));
    }
  }, [visibleObjectives, expandedObjectives.size]);

  const toggleExpand = (objectiveId: number) => {
    setExpandedObjectives((prev) => {
      const next = new Set(prev);
      if (next.has(objectiveId)) next.delete(objectiveId);
      else next.add(objectiveId);
      return next;
    });
  };

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
        "Are you sure you want to delete this objective? This will also delete all associated key results.",
      )
    ) {
      deleteObjective.mutate({ id });
    }
  };

  const handleAddKeyResultToObjective = (objectiveId: number) => {
    setFormData((prev) => ({ ...prev, goalId: objectiveId.toString() }));
    openCreateModal();
  };

  const handleEditKeyResult = (kr: ObjectiveCardKeyResult) => {
    setEditingKeyResult(kr);
    openEditKrModal();
  };

  const handleViewObjective = (obj: ObjectiveCardObjective) => {
    const statusFromProgress =
      obj.progress >= 100
        ? "achieved"
        : obj.progress >= 70
          ? "on-track"
          : obj.progress >= 40
            ? "at-risk"
            : "off-track";
    setDrawerItem({
      type: "objective",
      id: obj.id,
      title: obj.title,
      description: obj.description,
      progress: obj.progress,
      status: statusFromProgress,
      lifeDomainName: obj.lifeDomain?.name ?? null,
    });
    openDrawer();
  };

  const handleViewKeyResult = (kr: ObjectiveCardKeyResult) => {
    const range = kr.targetValue - kr.startValue;
    const progress = range > 0 ? ((kr.currentValue - kr.startValue) / range) * 100 : 0;
    setDrawerItem({
      type: "keyResult",
      id: kr.id,
      title: kr.title,
      description: kr.description ?? null,
      progress: Math.min(100, Math.max(0, progress)),
      status: kr.status,
      lifeDomainName: null,
    });
    openDrawer();
  };

  // Summary for the header subtitle
  const summary = useMemo(() => {
    const allKrs = visibleObjectives.flatMap((o) => o.keyResults);
    const atRisk = allKrs.filter((kr) => {
      const c = statusToConfidence(kr.status);
      return c === "warn" || c === "bad";
    }).length;
    const avg =
      visibleObjectives.length > 0
        ? Math.round(
            visibleObjectives.reduce((a, o) => a + o.progress, 0) /
              visibleObjectives.length,
          )
        : 0;
    return { atRisk, avg, total: allKrs.length };
  }, [visibleObjectives]);

  // Nudge: only show if at-risk KRs exist.
  const showNudge = !nudgeDismissed && summary.atRisk > 0;

  if (isLoading) {
    return (
      <Container size="xl" py="xl">
        <Stack gap="lg">
          <Skeleton height={60} width={380} />
          <Skeleton height={48} />
          <Skeleton height={200} />
          <Skeleton height={200} />
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <div className="border-b border-border-primary pb-4">
          <Group justify="space-between" align="end" wrap="wrap" gap="md">
            <div className="min-w-[260px] flex-1">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--accent-okr)" }}
                />
                Company OKRs · {selectedPeriod} {selectedYear}
              </div>
              <h1 className="m-0 flex items-center gap-3 text-2xl font-semibold tracking-tight text-text-primary">
                <IconTargetArrow
                  size={22}
                  style={{ color: "var(--accent-okr)" }}
                />
                What we&apos;re betting on this quarter
              </h1>
              <div className="mt-2 text-sm text-text-secondary">
                The team is{" "}
                <strong className="font-semibold text-text-primary">
                  {summary.avg}% through
                </strong>{" "}
                the quarter&apos;s KRs
                {summary.atRisk > 0 ? (
                  <>
                    {" with "}
                    <span
                      className="font-medium"
                      style={{ color: "var(--color-brand-error)" }}
                    >
                      {summary.atRisk} at risk
                    </span>
                    .
                  </>
                ) : (
                  "."
                )}
                {(() => {
                  const label = periodCountdownLabel(effectivePeriod);
                  return label ? (
                    <span className="text-text-muted"> · {label}</span>
                  ) : null;
                })()}
              </div>
            </div>

            <Group gap="sm">
              {availableYears.length > 1 && (
                <SegmentedControl
                  value={selectedYear}
                  onChange={setYear}
                  data={availableYears.map((y) => ({ label: y, value: y }))}
                  size="sm"
                  color="brand"
                />
              )}
              <Button
                variant="default"
                leftSection={<IconHierarchy size={14} />}
                disabled
              >
                Grouping
              </Button>
              <Button
                variant="default"
                leftSection={<IconFilter size={14} />}
                disabled
              >
                Filter
              </Button>
              <CreateGoalModal
                onSuccess={() => {
                  void utils.okr.getAvailableGoals.invalidate();
                  void utils.okr.getByObjective.invalidate();
                  void utils.okr.getStats.invalidate();
                  void utils.okr.getCountsByYear.invalidate();
                }}
              >
                <Button leftSection={<IconPlus size={14} />}>New objective</Button>
              </CreateGoalModal>
            </Group>
          </Group>
        </div>

        {/* Period tabs */}
        <PeriodTabs
          selectedPeriod={selectedPeriod}
          onPeriodChange={setPeriod}
          counts={periodCounts}
          isLoading={countsLoading}
        />

        {/* Hero cards */}
        {visibleObjectives.length > 0 && (
          <OkrHeroCards
            objectives={visibleObjectives}
            period={effectivePeriod}
          />
        )}

        {/* Nudge */}
        {showNudge && (
          <div
            className="flex items-center gap-3 rounded-lg border px-4 py-3"
            style={{
              background:
                "linear-gradient(90deg, var(--color-brand-subtle), transparent 80%)",
              borderColor: "var(--color-brand-glow)",
            }}
          >
            <div
              className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md"
              style={{
                background: "var(--color-brand-glow)",
                color: "var(--color-brand-primary)",
              }}
            >
              <IconSparkles size={14} />
            </div>
            <div className="flex-1 text-sm text-text-primary">
              <strong className="font-semibold">Zoe noticed:</strong>{" "}
              <span className="text-text-secondary">
                {summary.atRisk} KR{summary.atRisk === 1 ? " is" : "s are"} off
                expected pace. Consider reviewing blockers in your next check-in.
              </span>
            </div>
            <ActionIcon
              variant="subtle"
              size="sm"
              aria-label="Dismiss insight"
              onClick={() => setNudgeDismissed(true)}
            >
              <IconX size={14} />
            </ActionIcon>
          </div>
        )}

        {/* Objective list */}
        {visibleObjectives.length > 0 ? (
          isTimelineView ? (
            (() => {
              const axis = computeTimelineAxis(effectivePeriod);
              const { objectives: timelineObjectives, users } =
                buildTimelineData(visibleObjectives, effectivePeriod);
              return (
                <OkrTimeline
                  objectives={timelineObjectives}
                  getUser={(id) => users.get(id)}
                  weekCount={axis?.weekCount}
                  weekLabels={axis?.weekLabels}
                  monthStarts={axis?.monthStarts}
                  monthLabels={axis?.monthLabels}
                  todayFrac={axis?.todayFrac}
                  onObjectiveClick={(o) => {
                    const source = visibleObjectives.find(
                      (v) => String(v.id) === o.id,
                    );
                    if (source) handleViewObjective(source);
                  }}
                  onKeyResultClick={(kr) => {
                    const allKrs = visibleObjectives.flatMap(
                      (v) => v.keyResults,
                    );
                    const source = allKrs.find((k) => k.id === kr.id);
                    if (source) handleViewKeyResult(source);
                  }}
                />
              );
            })()
          ) : (
            <div>
              {visibleObjectives.map((obj, idx) => (
                <div key={obj.id} id={`okr-obj-${obj.id}`}>
                  <ObjectiveCardV2
                    objective={obj}
                    code={`O${idx + 1}`}
                    period={effectivePeriod}
                    isExpanded={expandedObjectives.has(obj.id)}
                    onToggleExpand={() => toggleExpand(obj.id)}
                    onDelete={handleDeleteObjective}
                    isDeleting={deleteObjective.isPending}
                    onEditSuccess={() => {
                      void utils.okr.getByObjective.invalidate();
                      void utils.okr.getStats.invalidate();
                      void utils.okr.getCountsByYear.invalidate();
                    }}
                    onAddKeyResult={handleAddKeyResultToObjective}
                    onEditKeyResult={handleEditKeyResult}
                    onViewObjective={() => handleViewObjective(obj)}
                    onViewKeyResult={handleViewKeyResult}
                  />
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="rounded-lg border border-border-primary bg-surface-secondary px-6 py-12 text-center">
            <IconTargetArrow
              size={48}
              className="mx-auto mb-4 text-text-muted"
            />
            <h3 className="mb-2 text-lg font-semibold text-text-primary">
              No OKRs yet for this period
            </h3>
            <Text className="mb-4 text-text-muted">
              Create a new objective, or add a Key Result to an existing one to
              start tracking progress.
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
          </div>
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
            label={
              <Group gap={4} align="center" component="span">
                <span>Key Result Title</span>
                <KeyResultGuidanceIcon />
              </Group>
            }
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
