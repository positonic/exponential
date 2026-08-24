"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
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
  Tooltip,
  Menu,
  Checkbox,
  Popover,
  Indicator,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconTargetArrow,
  IconPlus,
  IconFilter,
  IconHierarchy,
  IconSparkles,
  IconX,
  IconCheck,
  IconLayoutDashboard,
  IconLayoutDashboardFilled,
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
  periodStatus,
  statusToConfidence,
} from "../utils/okrDashboardUtils";

const objectiveStatusOptions = [
  { value: "achieved", label: "Achieved" },
  { value: "on-track", label: "On track" },
  { value: "at-risk", label: "At risk" },
  { value: "off-track", label: "Off track" },
];

const unitOptions = [
  { value: "percent", label: "Percentage (%)" },
  { value: "count", label: "Count (#)" },
  { value: "currency", label: "Currency ($)" },
  { value: "hours", label: "Hours" },
  { value: "custom", label: "Custom" },
];

interface DrawerItem {
  type: "objective" | "keyResult";
  id: number | string;
  title?: string;
  description?: string | null;
  progress: number;
  status: string;
  lifeDomainName?: string | null;
}

function statusFromObjectiveProgress(progress: number): string {
  return progress >= 100
    ? "achieved"
    : progress >= 70
      ? "on-track"
      : progress >= 40
        ? "at-risk"
        : "off-track";
}

function buildObjectiveDrawerItem(obj: ObjectiveCardObjective): DrawerItem {
  return {
    type: "objective",
    id: obj.id,
    title: obj.title,
    description: obj.description,
    progress: obj.progress,
    status: statusFromObjectiveProgress(obj.progress),
    lifeDomainName: obj.lifeDomain?.name ?? null,
  };
}

function buildKeyResultDrawerItem(kr: ObjectiveCardKeyResult): DrawerItem {
  const range = kr.targetValue - kr.startValue;
  const progress = range > 0 ? ((kr.currentValue - kr.startValue) / range) * 100 : 0;
  return {
    type: "keyResult",
    id: kr.id,
    title: kr.title,
    description: kr.description ?? null,
    progress: Math.min(100, Math.max(0, progress)),
    status: kr.status,
    lifeDomainName: null,
  };
}

export function OkrDashboard({
  scope = "workspace",
}: { scope?: "workspace" | "mine" } = {}) {
  const { workspaceId, workspaceSlug } = useWorkspace();
  const {
    year: selectedYear,
    period: selectedPeriod,
    setYear,
    setPeriod,
    drawerParam,
    openDrawer: openDrawerUrl,
    closeDrawer: closeDrawerUrl,
  } = useOkrSearchParams();
  const searchParams = useSearchParams();

  const onlyMine = scope === "mine";

  // Both the OKRs and My Goals tabs mount an OkrDashboard simultaneously
  // (Mantine keeps inactive Tabs.Panels mounted). Gate URL-driven drawer
  // opening to the active panel so a `drawer=` param opens only one drawer.
  const activeTab = searchParams.get("tab") ?? "goals";
  const isActivePanel =
    scope === "mine" ? activeTab === "my-goals" : activeTab === "okrs";

  const [createModalOpened, { open: openCreateModal, close: closeCreateModal }] =
    useDisclosure(false);
  const [editKrModalOpened, { open: openEditKrModal, close: closeEditKrModal }] =
    useDisclosure(false);
  const [editingKeyResult, setEditingKeyResult] =
    useState<ObjectiveCardKeyResult | null>(null);

  const [drawerItem, setDrawerItem] = useState<DrawerItem | null>(null);

  // The drawer is open when this panel is active and the URL `drawer=` param
  // resolves to an item we've materialised. Requiring the materialised item to
  // match the param keeps invalid/stale ids from opening an empty drawer.
  const drawerOpened =
    isActivePanel &&
    drawerParam !== null &&
    drawerItem !== null &&
    drawerItem.type === drawerParam.type &&
    String(drawerItem.id) === drawerParam.id;

  const [expandedObjectives, setExpandedObjectives] = useState<Set<number>>(
    new Set(),
  );
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [heroCardsVisible, setHeroCardsVisible] = useState(false);
  const [grouping, setGrouping] = useState<"none" | "domain">("none");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

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
      { workspaceId: workspaceId ?? undefined, year: selectedYear, onlyMine },
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
      onlyMine,
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
            statusOverride: kr.statusOverride,
            confidence: kr.confidence,
            period: kr.period,
            checkIns: kr.checkIns,
            user: kr.user,
            driUser: kr.driUser,
            projects: kr.projects,
            features: kr.features,
          }),
        ),
      }));
  }, [objectives, effectivePeriod]);

  // Status filter narrows the objective list (cards and timeline). The header
  // summary and hero cards keep describing the whole period, unfiltered.
  const filteredObjectives = useMemo(() => {
    if (statusFilter.length === 0) return visibleObjectives;
    return visibleObjectives.filter((o) =>
      statusFilter.includes(statusFromObjectiveProgress(o.progress)),
    );
  }, [visibleObjectives, statusFilter]);

  // Grouped card view: [group label, objectives] pairs, preserving list order.
  const groupedObjectives = useMemo(() => {
    if (grouping !== "domain") return null;
    const groups = new Map<string, ObjectiveCardObjective[]>();
    for (const obj of filteredObjectives) {
      const key = obj.lifeDomain?.name ?? "No life domain";
      const list = groups.get(key) ?? [];
      list.push(obj);
      groups.set(key, list);
    }
    return Array.from(groups.entries());
  }, [grouping, filteredObjectives]);

  // O1/O2/… codes stay tied to the objective's position in the filtered list
  // so a card keeps the same code whether or not grouping is on.
  const objectiveCodes = useMemo(
    () =>
      new Map(filteredObjectives.map((o, idx) => [o.id, `O${idx + 1}`])),
    [filteredObjectives],
  );

  useEffect(() => {
    if (visibleObjectives.length > 0 && expandedObjectives.size === 0) {
      setExpandedObjectives(new Set([visibleObjectives[0]!.id]));
    }
  }, [visibleObjectives, expandedObjectives.size]);

  // Materialise the drawer item from the URL `drawer=` param. Handles deep
  // links, refresh, and browser back/forward where there's no in-memory item
  // from a click. When the item isn't in the current period's data we open it
  // by id so the drawer can fetch it; a malformed objective id stays closed.
  useEffect(() => {
    if (!isActivePanel || !drawerParam) return;
    if (
      drawerItem &&
      drawerItem.type === drawerParam.type &&
      String(drawerItem.id) === drawerParam.id
    ) {
      return;
    }
    if (drawerParam.type === "objective") {
      const obj = visibleObjectives.find(
        (o) => String(o.id) === drawerParam.id,
      );
      if (obj) {
        setDrawerItem(buildObjectiveDrawerItem(obj));
        return;
      }
      const numericId = Number(drawerParam.id);
      if (!Number.isInteger(numericId)) return;
      setDrawerItem({
        type: "objective",
        id: numericId,
        progress: 0,
        status: "on-track",
      });
    } else {
      const kr = visibleObjectives
        .flatMap((o) => o.keyResults)
        .find((k) => String(k.id) === drawerParam.id);
      if (kr) {
        setDrawerItem(buildKeyResultDrawerItem(kr));
        return;
      }
      setDrawerItem({
        type: "keyResult",
        id: drawerParam.id,
        progress: 0,
        status: "on-track",
      });
    }
  }, [isActivePanel, drawerParam, visibleObjectives, drawerItem]);

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

  const deleteKeyResult = api.okr.delete.useMutation({
    onSuccess: () => {
      void utils.okr.getByObjective.invalidate();
      void utils.okr.getStats.invalidate();
      void utils.okr.getCountsByYear.invalidate();
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

  const handleDeleteKeyResult = (id: string) => {
    if (
      confirm(
        "Are you sure you want to delete this key result? This action cannot be undone.",
      )
    ) {
      deleteKeyResult.mutate({ id });
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

  // "Update progress" CTA in the drawer opens the KR's check-in modal. Reuse
  // the loaded KR when available; otherwise (e.g. an objective's KR from a
  // different period) open an id stub — the modal fetches fresh data by id.
  const handleUpdateProgressForKr = (krId: string) => {
    const kr = visibleObjectives
      .flatMap((o) => o.keyResults)
      .find((k) => k.id === krId);
    if (kr) {
      handleEditKeyResult(kr);
      return;
    }
    setEditingKeyResult({
      id: krId,
      title: "",
      currentValue: 0,
      targetValue: 0,
      startValue: 0,
      status: "on-track",
    });
    openEditKrModal();
  };

  const handleViewObjective = (obj: ObjectiveCardObjective) => {
    // Set the item synchronously to avoid a flash before the effect resolves
    // it, then push the deep-link param.
    setDrawerItem(buildObjectiveDrawerItem(obj));
    openDrawerUrl("objective", obj.id);
  };

  const handleViewKeyResult = (kr: ObjectiveCardKeyResult) => {
    setDrawerItem(buildKeyResultDrawerItem(kr));
    openDrawerUrl("keyResult", kr.id);
  };

  // Open a KR drawer by id — used by the objective Activity tab's rolled-up KR
  // source chips. Reuses the loaded KR when available (correct progress/status)
  // and otherwise opens by id so the drawer can fetch it.
  const handleOpenKeyResultById = (krId: string, krTitle?: string) => {
    const kr = visibleObjectives
      .flatMap((o) => o.keyResults)
      .find((k) => k.id === krId);
    if (kr) {
      handleViewKeyResult(kr);
      return;
    }
    // Not in the current period's data — set a minimal item and push the
    // deep-link param so the URL-driven drawer (ticket 1) opens and fetches it.
    setDrawerItem({
      type: "keyResult",
      id: krId,
      title: krTitle,
      progress: 0,
      status: "on-track",
    });
    openDrawerUrl("keyResult", krId);
  };

  // Copy an absolute deep link that reopens this exact drawer (?drawer=type:id)
  // on the panel that matches this dashboard's scope. Used by the Share CTA.
  const handleShare = (type: "objective" | "keyResult", id: number | string) => {
    const tab = scope === "mine" ? "my-goals" : "okrs";
    const path = workspaceSlug ? `/w/${workspaceSlug}/goals` : "/goals";
    const url = `${window.location.origin}${path}?tab=${tab}&drawer=${type}:${id}`;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(url).then(
        () => notifications.show({ message: "Link copied", color: "green" }),
        () =>
          notifications.show({
            title: "Couldn't copy link",
            message: url,
            color: "red",
          }),
      );
    } else {
      notifications.show({
        title: "Clipboard unavailable — copy this link",
        message: url,
        color: "yellow",
      });
    }
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

  // Tense-aware header copy: the card reads correctly whether the period is
  // upcoming, active, or already ended. `summary.avg` is goal attainment, not
  // time elapsed, so the wording says "reached/finished at X%" rather than
  // "X% through".
  const periodState = periodStatus(effectivePeriod);
  const isEnded = periodState === "ended";
  const isUpcoming = periodState === "upcoming";
  // "Annual-2026" is a year, not a quarter — both the noun ("this year") and
  // the ended-period label ("in 2026", never "in Annual") must reflect that.
  const periodPrefix = effectivePeriod.split("-")[0] ?? selectedPeriod;
  const isAnnual = periodPrefix === "Annual";
  const periodNoun = isAnnual ? "year" : "quarter";
  const periodLabel = isAnnual ? selectedYear : periodPrefix;

  const headerTitle = isEnded
    ? onlyMine
      ? `What I focused on in ${periodLabel}`
      : `What we bet on in ${periodLabel}`
    : onlyMine
      ? `What I'm focused on this ${periodNoun}`
      : `What we're betting on this ${periodNoun}`;

  const progressLead = isEnded
    ? onlyMine
      ? `You finished the ${periodNoun} at `
      : `The team finished the ${periodNoun} at `
    : onlyMine
      ? "You've reached "
      : "The team has reached ";
  const progressTail = onlyMine ? " of your KR targets" : " of its KR targets";
  const atRiskConnector = isEnded ? " — " : " with ";
  const atRiskLabel = isEnded
    ? `${summary.atRisk} missed target`
    : `${summary.atRisk} at risk`;
  const upcomingText = onlyMine
    ? `Your KRs for the ${periodNoun} are set`
    : `The team's KRs for the ${periodNoun} are set`;

  // Nudge: only show if at-risk KRs exist.
  const showNudge = !nudgeDismissed && summary.atRisk > 0;

  const renderObjectiveCard = (obj: ObjectiveCardObjective) => (
    <div key={obj.id} id={`okr-obj-${obj.id}`}>
      <ObjectiveCardV2
        objective={obj}
        code={objectiveCodes.get(obj.id) ?? ""}
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
        onDeleteKeyResult={handleDeleteKeyResult}
        deletingKeyResultId={
          deleteKeyResult.isPending
            ? (deleteKeyResult.variables?.id ?? null)
            : null
        }
        onViewObjective={() => handleViewObjective(obj)}
        onViewKeyResult={handleViewKeyResult}
      />
    </div>
  );

  if (isLoading) {
    return (
      <Container size="xl" py="xl" px="xl">
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
    <Container size="xl" py="xl" px="xl">
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
                {onlyMine ? "My OKRs" : "Company OKRs"} · {selectedPeriod}{" "}
                {selectedYear}
              </div>
              <h1 className="m-0 flex items-center gap-3 text-2xl font-semibold tracking-tight text-text-primary">
                <IconTargetArrow
                  size={22}
                  style={{ color: "var(--accent-okr)" }}
                />
                {headerTitle}
              </h1>
              <div className="mt-2 text-sm text-text-secondary">
                {isUpcoming ? (
                  <>{upcomingText}.</>
                ) : (
                  <>
                    {progressLead}
                    <strong className="font-semibold text-text-primary">
                      {summary.avg}%
                    </strong>
                    {progressTail}
                    {summary.atRisk > 0 ? (
                      <>
                        {atRiskConnector}
                        <span
                          className="font-medium"
                          style={{ color: "var(--color-brand-error)" }}
                        >
                          {atRiskLabel}
                        </span>
                        .
                      </>
                    ) : (
                      "."
                    )}
                  </>
                )}
                {(() => {
                  const label = periodCountdownLabel(effectivePeriod);
                  return label ? (
                    <span
                      className={
                        isEnded ? "text-brand-warning" : "text-text-muted"
                      }
                    >
                      {" "}
                      · {label}
                    </span>
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
              <Tooltip
                label={heroCardsVisible ? "Hide overview" : "Show overview"}
              >
                <ActionIcon
                  variant={heroCardsVisible ? "light" : "default"}
                  size="lg"
                  aria-label={
                    heroCardsVisible ? "Hide overview" : "Show overview"
                  }
                  onClick={() => setHeroCardsVisible((v) => !v)}
                >
                  {heroCardsVisible ? (
                    <IconLayoutDashboardFilled size={16} />
                  ) : (
                    <IconLayoutDashboard size={16} />
                  )}
                </ActionIcon>
              </Tooltip>
              <Menu shadow="md" width={190} position="bottom-end">
                <Menu.Target>
                  <Tooltip label="Group objectives">
                    <ActionIcon
                      variant={grouping !== "none" ? "light" : "default"}
                      size="lg"
                      aria-label="Group objectives"
                    >
                      <IconHierarchy size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Group by</Menu.Label>
                  <Menu.Item
                    onClick={() => setGrouping("none")}
                    rightSection={
                      grouping === "none" ? <IconCheck size={14} /> : null
                    }
                  >
                    None
                  </Menu.Item>
                  <Menu.Item
                    onClick={() => setGrouping("domain")}
                    rightSection={
                      grouping === "domain" ? <IconCheck size={14} /> : null
                    }
                  >
                    Life domain
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
              <Popover position="bottom-end" shadow="md">
                <Tooltip label="Filter by status">
                  <Indicator
                    disabled={statusFilter.length === 0}
                    color="brand"
                    size={8}
                    offset={3}
                  >
                    <Popover.Target>
                      <ActionIcon
                        variant={statusFilter.length > 0 ? "light" : "default"}
                        size="lg"
                        aria-label="Filter by status"
                      >
                        <IconFilter size={16} />
                      </ActionIcon>
                    </Popover.Target>
                  </Indicator>
                </Tooltip>
                <Popover.Dropdown>
                  <Stack gap="xs">
                    <Text size="xs" fw={600} className="text-text-muted">
                      Status
                    </Text>
                    <Checkbox.Group
                      value={statusFilter}
                      onChange={setStatusFilter}
                    >
                      <Stack gap="xs">
                        {objectiveStatusOptions.map((o) => (
                          <Checkbox
                            key={o.value}
                            value={o.value}
                            label={o.label}
                            size="sm"
                          />
                        ))}
                      </Stack>
                    </Checkbox.Group>
                    {statusFilter.length > 0 && (
                      <Button
                        variant="subtle"
                        size="compact-xs"
                        onClick={() => setStatusFilter([])}
                      >
                        Clear filter
                      </Button>
                    )}
                  </Stack>
                </Popover.Dropdown>
              </Popover>
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
        {heroCardsVisible && visibleObjectives.length > 0 && (
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
          filteredObjectives.length === 0 ? (
            <div className="rounded-lg border border-border-primary bg-surface-secondary px-6 py-8 text-center">
              <Text className="text-text-muted">
                No objectives match the current filter.
              </Text>
              <Button
                variant="subtle"
                size="compact-sm"
                mt="sm"
                onClick={() => setStatusFilter([])}
              >
                Clear filter
              </Button>
            </div>
          ) : isTimelineView ? (
            (() => {
              const axis = computeTimelineAxis(effectivePeriod);
              const { objectives: timelineObjectives, users } =
                buildTimelineData(filteredObjectives, effectivePeriod);
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
          ) : groupedObjectives ? (
            <div>
              {groupedObjectives.map(([label, objs]) => (
                <div key={label}>
                  <div className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-text-muted first:mt-0">
                    {label}
                  </div>
                  {objs.map(renderObjectiveCard)}
                </div>
              ))}
            </div>
          ) : (
            <div>{filteredObjectives.map(renderObjectiveCard)}</div>
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
              <Group gap={4} align="center" component="span" display="inline-flex">
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
          // Refresh the objective drawer (goal.getById) so a KR check-in made
          // via its "Update progress" picker reflects immediately.
          void utils.goal.getById.invalidate();
        }}
      />

      <OkrDetailDrawer
        opened={drawerOpened}
        onClose={closeDrawerUrl}
        type={drawerItem?.type ?? "objective"}
        itemId={drawerItem?.id ?? null}
        title={drawerItem?.title}
        description={drawerItem?.description}
        progress={drawerItem?.progress}
        status={drawerItem?.status}
        lifeDomainName={drawerItem?.lifeDomainName}
        onOpenKeyResult={handleOpenKeyResultById}
        onUpdateProgress={handleUpdateProgressForKr}
        onShare={
          drawerItem
            ? () => handleShare(drawerItem.type, drawerItem.id)
            : undefined
        }
      />
    </Container>
  );
}
