"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { keepPreviousData } from "@tanstack/react-query";
import { Container, Skeleton, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconSearch, IconTarget, IconUser } from "@tabler/icons-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { useTerminology } from "~/hooks/useTerminology";
import { useRegisterPageContext } from "~/hooks/useRegisterPageContext";
import { useProjectViewState } from "~/app/_components/projects/useProjectViewState";
import { FilterBar } from "~/app/_components/filters";
import { hasActiveFilters } from "~/types/filter";
import type { FilterMember } from "~/types/filter";
import {
  GoalsTableBody,
  type GoalRow,
} from "~/app/_components/initiatives/GoalsTableBody";
import { OkrObjectivesView } from "~/plugins/okr/client/components/OkrObjectivesView";
import { OkrTimeline } from "~/plugins/okr/client/components/OkrTimeline";
import {
  buildTimelineData,
  computeTimelineAxis,
} from "~/plugins/okr/client/utils/okrTimelineData";
import { OkrDetailDrawer } from "~/plugins/okr/client/components/OkrDetailDrawer";
import { EditKeyResultModal } from "~/plugins/okr/client/components/EditKeyResultModal";
import type {
  ObjectiveCardKeyResult,
  ObjectiveCardObjective,
} from "~/plugins/okr/client/components/ObjectiveCardV2";
import { extractYearsFromPeriods } from "~/plugins/okr/client/utils/periodUtils";
import { GoalsControls } from "./GoalsControls";
import { GoalsPeriodHeader } from "./GoalsPeriodHeader";
import { GOAL_FILTER_CONFIG, GOAL_FILTER_KEYS, filterGoalRows } from "./goalFilters";
import { KeyResultsTable } from "./KeyResultsTable";
import { flattenKeyResultRows, type KeyResultRowData } from "./keyResultRows";
import {
  applyGoalsViewParams,
  useGoalsViewParams,
  type GoalsPageView,
} from "./useGoalsViewParams";

const VIEW_OPTIONS: { value: GoalsPageView; label: string }[] = [
  { value: "table", label: "Table" },
  { value: "okrs", label: "OKRs" },
  { value: "key-results", label: "Key results" },
  { value: "timeline", label: "Timeline" },
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

/** A Table row opened via `drawer=`: enough to paint the hero before the fetch. */
function buildTableRowDrawerItem(row: GoalRow): DrawerItem {
  const progress = row.resolvedProgress ?? 0;
  return {
    type: "objective",
    id: row.id,
    title: row.title,
    description: row.description,
    progress,
    status: statusFromObjectiveProgress(progress),
    lifeDomainName: null,
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

type ObjectivesQueryRow = RouterOutputs["okr"]["getByObjective"][number];

/** A card objective that still carries its lifecycle status for the filters. */
type CardObjective = ObjectiveCardObjective & { status: string };

/** The getByObjective payload in the shape the cards, timeline and drawer read. */
function toCardObjectives(rows: ObjectivesQueryRow[]): CardObjective[] {
  return rows.map((o) => ({
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
}

/**
 * The Goals page: one period-scoped list of objectives, rendered as Table,
 * OKRs or Timeline. This shell owns the URL state (view, period, year, mine,
 * drawer), fetches the active view's data, and mounts the OKR drawer so a
 * `drawer=` deep link opens on any view. The bodies only render what they
 * are handed.
 */
export function GoalsPage() {
  const { workspace, workspaceId, workspaceSlug } = useWorkspace();
  const terminology = useTerminology();
  const pathname = usePathname();
  const utils = api.useUtils();
  const {
    view,
    period,
    year,
    onlyMine,
    drawer: drawerParam,
    effectivePeriod,
    isRewritingLegacyUrl,
    setView,
    setPeriod,
    setYear,
    setOnlyMine,
    openDrawer,
    closeDrawer,
  } = useGoalsViewParams();

  // The cards pace against a real period; on All that is the selected year.
  const pacePeriod = effectivePeriod ?? `Annual-${year}`;

  const { data: periods } = api.okr.getPeriods.useQuery();
  const availableYears = useMemo(() => {
    const years = new Set(periods ? extractYearsFromPeriods(periods) : []);
    years.add(year);
    return [...years].sort((a, b) => Number(b) - Number(a));
  }, [periods, year]);

  // One query per view, mounted only while that view is on screen: the Table
  // needs projects and sub-goals, the OKRs and Timeline views need key
  // results with check-ins and executing work. Both scope by the same
  // server-side rule (objectiveScopeWhere), so switching view never changes
  // which objectives are in the list.
  const activeView: GoalsPageView = view;
  const usesObjectives =
    activeView === "okrs" || activeView === "key-results" || activeView === "timeline";
  const tableQuery = api.goal.getAllMyGoals.useQuery(
    {
      workspaceId: workspaceId ?? undefined,
      period: effectivePeriod,
      ...(onlyMine ? { onlyMine } : {}),
    },
    {
      enabled: activeView === "table" && !!workspaceId,
      // Flipping period or Mine keeps the previous list on screen rather
      // than dropping to a skeleton.
      placeholderData: keepPreviousData,
    },
  );
  const objectivesQuery = api.okr.getByObjective.useQuery(
    {
      workspaceId: workspaceId ?? undefined,
      period: effectivePeriod ?? undefined,
      includePairedPeriod: false,
      onlyMine,
    },
    { enabled: usesObjectives && !!workspaceId, placeholderData: keepPreviousData },
  );

  // The header's numbers come from one cheap query whatever view is mounted,
  // so the narrative never depends on the heavy getByObjective payload.
  const statsQuery = api.okr.getStats.useQuery(
    {
      workspaceId: workspaceId ?? undefined,
      period: effectivePeriod,
      year,
      ...(onlyMine ? { onlyMine } : {}),
    },
    { enabled: !!workspaceId, placeholderData: keepPreviousData },
  );

  // ---- Search and filters, applied once to whichever body is mounted ------

  const searchRef = useRef<HTMLInputElement>(null);
  const { filters, setFilters, searchQuery, deferredSearchQuery, setSearchQuery } =
    useProjectViewState(GOAL_FILTER_KEYS, "goals");
  const [filterRowOpen, { toggle: toggleFilterRow }] = useDisclosure(false);
  const filtersActive = hasActiveFilters(GOAL_FILTER_CONFIG, filters);
  const isNarrowed = filtersActive || deferredSearchQuery.trim().length > 0;
  const clearNarrowing = useCallback(() => {
    setFilters({});
    setSearchQuery("");
  }, [setFilters, setSearchQuery]);

  const workspaceMembers: FilterMember[] = useMemo(() => {
    if (!workspace?.members) return [];
    return workspace.members.map((m) => ({
      id: m.user.id,
      name: m.user.name ?? null,
      email: m.user.email ?? null,
      image: m.user.image ?? null,
    }));
  }, [workspace?.members]);

  const tableRows = useMemo(
    () => (tableQuery.data ?? []) as unknown as GoalRow[],
    [tableQuery.data],
  );
  const filteredTableRows = useMemo(
    () => filterGoalRows(tableRows, filters, deferredSearchQuery),
    [tableRows, filters, deferredSearchQuery],
  );
  const objectives = useMemo(
    () => toCardObjectives(objectivesQuery.data ?? []),
    [objectivesQuery.data],
  );
  const filteredObjectives = useMemo(
    () => filterGoalRows(objectives, filters, deferredSearchQuery),
    [objectives, filters, deferredSearchQuery],
  );

  // The Key results view is the same scoped list flattened to one row per KR
  // (no procedure of its own — D-0041).
  const keyResultRows = useMemo(
    () => (activeView === "key-results" ? flattenKeyResultRows(filteredObjectives) : []),
    [activeView, filteredObjectives],
  );

  // Timeline is a rendering of the same list on a week axis. The axis is the
  // selected period; on All it is the selected year (`Annual-<year>`), so
  // period-less objectives still have somewhere to sit.
  const timeline = useMemo(() => {
    if (activeView !== "timeline") return null;
    return {
      axis: computeTimelineAxis(pacePeriod),
      ...buildTimelineData(filteredObjectives, pacePeriod),
    };
  }, [activeView, filteredObjectives, pacePeriod]);

  // ---- Drawer, on every view ------------------------------------------------

  const [drawerItem, setDrawerItem] = useState<DrawerItem | null>(null);

  // The drawer is open when the URL `drawer=` param resolves to an item we've
  // materialised. Requiring the materialised item to match the param keeps
  // invalid/stale ids from opening an empty drawer.
  const drawerOpened =
    drawerParam !== null &&
    drawerItem !== null &&
    drawerItem.type === drawerParam.type &&
    String(drawerItem.id) === drawerParam.id;

  // Materialise the drawer item from the URL param: deep links, refresh, and
  // browser back/forward have no in-memory item from a click. Whichever
  // view's data holds the item seeds the hero; when it is in neither (a
  // different period, or a view that never loads key results) we open an id
  // stub and the drawer fetches it. A malformed objective id stays closed.
  useEffect(() => {
    if (!drawerParam) return;
    if (
      drawerItem &&
      drawerItem.type === drawerParam.type &&
      String(drawerItem.id) === drawerParam.id
    ) {
      return;
    }
    if (drawerParam.type === "objective") {
      const obj = objectives.find((o) => String(o.id) === drawerParam.id);
      if (obj) {
        setDrawerItem(buildObjectiveDrawerItem(obj));
        return;
      }
      const row = tableRows.find((r) => String(r.id) === drawerParam.id);
      if (row) {
        setDrawerItem(buildTableRowDrawerItem(row));
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
      const kr = objectives
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
  }, [drawerParam, objectives, tableRows, drawerItem]);

  const handleViewObjective = useCallback(
    (obj: ObjectiveCardObjective) => {
      // Set the item synchronously to avoid a flash before the effect
      // resolves it, then push the deep-link param.
      setDrawerItem(buildObjectiveDrawerItem(obj));
      openDrawer("objective", obj.id);
    },
    [openDrawer],
  );

  const handleViewKeyResultRow = (row: KeyResultRowData) => {
    const source = objectives.flatMap((o) => o.keyResults).find((k) => k.id === row.id);
    if (source) handleViewKeyResult(source);
  };

  const handleViewKeyResult = useCallback(
    (kr: ObjectiveCardKeyResult) => {
      setDrawerItem(buildKeyResultDrawerItem(kr));
      openDrawer("keyResult", kr.id);
    },
    [openDrawer],
  );

  // Open a KR drawer by id — used by the objective Activity tab's rolled-up
  // KR source chips. Reuses the loaded KR when available (correct
  // progress/status) and otherwise opens by id so the drawer can fetch it.
  const handleOpenKeyResultById = (krId: string, krTitle?: string) => {
    const kr = objectives.flatMap((o) => o.keyResults).find((k) => k.id === krId);
    if (kr) {
      handleViewKeyResult(kr);
      return;
    }
    setDrawerItem({
      type: "keyResult",
      id: krId,
      title: krTitle,
      progress: 0,
      status: "on-track",
    });
    openDrawer("keyResult", krId);
  };

  // Copy an absolute deep link that reopens this exact drawer on the same
  // view, period, year and Mine state the sharer has.
  const handleShare = (type: "objective" | "keyResult", id: number | string) => {
    const params = applyGoalsViewParams(new URLSearchParams(), {
      view,
      period,
      year,
      onlyMine,
    });
    params.set("drawer", `${type}:${id}`);
    const url = `${window.location.origin}${pathname}?${params.toString()}`;
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

  // ---- Key result check-in modal (the drawer's "Update progress" CTA) -------

  const [editKrModalOpened, { open: openEditKrModal, close: closeEditKrModal }] =
    useDisclosure(false);
  const [editingKeyResult, setEditingKeyResult] =
    useState<ObjectiveCardKeyResult | null>(null);

  const handleEditKeyResult = useCallback(
    (kr: ObjectiveCardKeyResult) => {
      setEditingKeyResult(kr);
      openEditKrModal();
    },
    [openEditKrModal],
  );

  // Reuse the loaded KR when available; otherwise (a KR outside this view's
  // data) open an id stub — the modal fetches fresh data by id.
  const handleUpdateProgressForKr = (krId: string) => {
    const kr = objectives.flatMap((o) => o.keyResults).find((k) => k.id === krId);
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

  // ---- Agent page context ---------------------------------------------------

  const goalsPageContext = useMemo(() => {
    if (!workspaceId) return null;
    const count = activeView === "table" ? filteredTableRows.length : filteredObjectives.length;
    return {
      pageType: "goals-list",
      pageTitle: terminology.goals,
      pagePath: pathname,
      data: { workspaceId, goalCount: count, view: activeView, period: effectivePeriod, onlyMine },
    };
  }, [
    workspaceId,
    activeView,
    filteredTableRows.length,
    filteredObjectives.length,
    terminology.goals,
    pathname,
    effectivePeriod,
    onlyMine,
  ]);
  useRegisterPageContext(goalsPageContext, { clearOnUnmount: false });

  // One render at most, and only for a retired URL — see the hook's note.
  if (isRewritingLegacyUrl) return null;

  const goalsLower = terminology.goals.toLowerCase();

  return (
    // `w-full`: the route's <main> is a flex column with items-start, so
    // without it the container would size to its widest child and the
    // Timeline's week axis would push the control line off screen instead of
    // scrolling inside its own wrapper.
    <Container size="xl" className="w-full py-6">
      <Stack gap="md">
        <GoalsPeriodHeader
          period={period}
          year={year}
          effectivePeriod={effectivePeriod}
          onlyMine={onlyMine}
          stats={statsQuery.data}
          goalsLabel={terminology.goals}
        />

        <GoalsControls
          period={period}
          onPeriodChange={setPeriod}
          year={year}
          availableYears={availableYears}
          onYearChange={setYear}
          view={activeView}
          viewOptions={VIEW_OPTIONS}
          onViewChange={setView}
          onlyMine={onlyMine}
          onOnlyMineChange={setOnlyMine}
          searchRef={searchRef}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filtersActive={filtersActive}
          filterRowOpen={filterRowOpen}
          onToggleFilterRow={toggleFilterRow}
          filterBar={
            <FilterBar
              config={GOAL_FILTER_CONFIG}
              filters={filters}
              onFiltersChange={setFilters}
              members={workspaceMembers}
            />
          }
          createDefaultPeriod={effectivePeriod ?? undefined}
          createLabel={`New ${terminology.goal.toLowerCase()}`}
        />

        {activeView === "table" ? (
          <GoalsTableBody
            goals={filteredTableRows}
            isLoading={tableQuery.isLoading}
            workspaceSlug={workspaceSlug ?? ""}
            goalLabel={terminology.goal}
            emptyState={
              tableRows.length > 0 ? (
                <div className="py-16 text-center">
                  <IconSearch size={48} className="text-text-muted mx-auto mb-4" />
                  <Text size="lg" fw={500} className="text-text-primary">
                    No {goalsLower} match your search or filters
                  </Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    Try a different search, or clear the active filters.
                  </Text>
                </div>
              ) : onlyMine ? (
                // "Mine" narrows server-side, so an empty result means none
                // of the period's objectives are the user's — not that the
                // workspace has none.
                <div className="py-16 text-center">
                  <IconUser size={48} className="text-text-muted mx-auto mb-4" />
                  <Text size="lg" fw={500} className="text-text-primary">
                    None of this period&apos;s {goalsLower} are yours
                  </Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    You&apos;re not the DRI on any {goalsLower} or key results
                    here. Turn off Mine to see the whole workspace.
                  </Text>
                </div>
              ) : (
                <div className="py-16 text-center">
                  <IconTarget size={48} className="text-text-muted mx-auto mb-4" />
                  <Text size="lg" fw={500} className="text-text-primary">
                    No {goalsLower} {effectivePeriod ? "in this period" : "yet"}
                  </Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    Create {goalsLower} to track strategic outcomes and their
                    progress.
                  </Text>
                </div>
              )
            }
          />
        ) : activeView === "key-results" ? (
          objectivesQuery.isLoading ? (
            <Skeleton height={320} />
          ) : keyResultRows.length === 0 ? (
            <div className="rounded-lg border border-border-primary bg-surface-secondary px-6 py-12 text-center">
              <Text className="text-text-muted">
                {isNarrowed
                  ? "No key results match your search or filters."
                  : onlyMine
                    ? "None of this period's key results are yours."
                    : "No key results in this period yet."}
              </Text>
            </div>
          ) : (
            <KeyResultsTable rows={keyResultRows} onRowClick={handleViewKeyResultRow} />
          )
        ) : activeView === "timeline" ? (
          objectivesQuery.isLoading ? (
            <Skeleton height={320} />
          ) : filteredObjectives.length === 0 ? (
            <div className="rounded-lg border border-border-primary bg-surface-secondary px-6 py-12 text-center">
              <Text className="text-text-muted">
                {objectives.length > 0
                  ? "No objectives match your search or filters."
                  : onlyMine
                    ? "None of this period's objectives are yours."
                    : "No objectives in this period yet."}
              </Text>
            </div>
          ) : (
            <OkrTimeline
              objectives={timeline?.objectives ?? []}
              getUser={(id) => timeline?.users.get(id)}
              weekCount={timeline?.axis?.weekCount}
              weekLabels={timeline?.axis?.weekLabels}
              monthStarts={timeline?.axis?.monthStarts}
              monthLabels={timeline?.axis?.monthLabels}
              todayFrac={timeline?.axis?.todayFrac}
              onObjectiveClick={(o) => {
                const source = objectives.find((v) => String(v.id) === o.id);
                if (source) handleViewObjective(source);
              }}
              onKeyResultClick={(kr) => {
                const source = objectives
                  .flatMap((v) => v.keyResults)
                  .find((k) => k.id === kr.id);
                if (source) handleViewKeyResult(source);
              }}
            />
          )
        ) : (
          <OkrObjectivesView
            objectives={objectives}
            visibleObjectives={filteredObjectives}
            pacePeriod={pacePeriod}
            effectivePeriod={effectivePeriod}
            onlyMine={onlyMine}
            isLoading={objectivesQuery.isLoading}
            hasActiveFilters={isNarrowed}
            onClearFilters={clearNarrowing}
            onViewObjective={handleViewObjective}
            onViewKeyResult={handleViewKeyResult}
            onEditKeyResult={handleEditKeyResult}
          />
        )}
      </Stack>

      <EditKeyResultModal
        keyResult={editingKeyResult}
        opened={editKrModalOpened}
        onClose={() => {
          closeEditKrModal();
          setEditingKeyResult(null);
        }}
        onSuccess={() => {
          // The modal already refreshed every okr.* query once its mutations
          // settled. The objective drawer (goal.getById) and the Table view
          // (goal.getAllMyGoals) are ours, so a check-in reflects on both.
          void utils.goal.getById.invalidate();
          void utils.goal.getAllMyGoals.invalidate();
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
