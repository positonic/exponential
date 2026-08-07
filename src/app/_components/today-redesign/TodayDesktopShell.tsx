"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Modal, MultiSelect } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconChevronRight, IconHash, IconSearch } from "@tabler/icons-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { useActionDeepLink } from "~/hooks/useActionDeepLink";
import { useDetailedActionsEnabled } from "~/hooks/useDetailedActionsEnabled";
import { useDayRollover } from "~/hooks/useDayRollover";
import { formatRelativeDueAge, hourFloat } from "~/lib/actions/dates";
import { overdueAnchor } from "~/lib/actions/partition";
import { groupOverdueCohorts } from "~/lib/actions/triage";
import type { Action } from "~/lib/actions/types";
import { CreateActionModal } from "../CreateActionModal";
import { EditActionModal } from "../EditActionModal";
import { ScoreBreakdown } from "../scoring/ScoreBreakdown";
import { ZoePanel } from "../actions/components/ZoePanel";
import {
  BulkEditToolbar,
  type BulkActionDef,
} from "../actions/components/BulkEditToolbar";
import {
  rescheduleUpdateFields,
  type RescheduleChoice,
} from "~/lib/actions/reschedule";
import { useActionMutations } from "../actions/hooks/useActionMutations";
import { useActionPartition } from "../actions/hooks/useActionPartition";
import { useBulkActionMutations } from "../actions/hooks/useBulkActionMutations";
import { useBulkSelection } from "../actions/hooks/useBulkSelection";
import { buildRailBlocks, type RailBlock } from "~/lib/actions/railBlocks";
import { ScoreRing } from "./ScoreRing";
import { AgendaRail } from "./AgendaRail";
import { TaskRow } from "./TaskRow";
import "./today-desktop.css";

type DayMode = "today" | "tomorrow" | "upcoming";

interface TodayDesktopShellProps {
  filter: DayMode;
  onFilterChange: (next: DayMode) => void;
  selectedTagIds: string[];
  onSelectedTagIdsChange: (ids: string[]) => void;
}

type ActionData = RouterOutputs["action"]["getAll"][number];

export function TodayDesktopShell({
  filter,
  onFilterChange,
  selectedTagIds,
  onSelectedTagIdsChange,
}: TodayDesktopShellProps) {
  const router = useRouter();
  const { workspace, workspaceId } = useWorkspace();
  const { actionIdFromUrl, setActionId, clearActionId } = useActionDeepLink();
  const detailedEnabled = useDetailedActionsEnabled();
  const today = useDayRollover();

  const [breakdownOpened, { open: openBreakdown, close: closeBreakdown }] =
    useDisclosure(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [overdueOpen, setOverdueOpen] = useState(true);
  const [completedOpen, setCompletedOpen] = useState(false);
  // Bulk "select all" operates on overdue + today rows; never let a collapsed
  // section hide rows that selection would silently include.
  useEffect(() => {
    if (bulkMode) setOverdueOpen(true);
  }, [bulkMode]);
  const [zoeOpen, setZoeOpen] = useState(true);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(
    new Set(),
  );
  const [selectedAction, setSelectedAction] = useState<Action | null>(null);
  const [editModalOpened, setEditModalOpened] = useState(false);
  const [now, setNow] = useState<number>(() => hourFloat(new Date()));
  useEffect(() => {
    const id = window.setInterval(() => setNow(hourFloat(new Date())), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // ---- Data ----------------------------------------------------------------
  const { data: preferences } = api.navigationPreference.getPreferences.useQuery();
  const gamificationEnabled = preferences?.showGamification !== false;

  const { data: score } = api.scoring.getTodayScore.useQuery(
    { date: today },
    { enabled: gamificationEnabled && filter === "today" },
  );

  const tagsQuery = api.tag.list.useQuery();
  const tagOptions = useMemo(
    () =>
      tagsQuery.data?.allTags?.map((t: { id: string; name: string }) => ({
        value: t.id.toString(),
        label: t.name,
      })) ?? [],
    [tagsQuery.data],
  );

  // Use undefined (not {}) to share the React Query cache key with
  // useActionMutations' optimistic updates.
  const actionsQuery = api.action.getAll.useQuery(undefined);
  const calendarEventsQuery = api.calendar.getTodayEvents.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const filteredActions = useMemo<ActionData[]>(() => {
    const all = actionsQuery.data ?? [];
    if (selectedTagIds.length === 0) return all;
    return all.filter((a) =>
      a.tags?.some((at) => selectedTagIds.includes(at.tagId.toString())),
    );
  }, [actionsQuery.data, selectedTagIds]);

  const partition = useActionPartition(filteredActions, { today });
  const hasOverdue = partition.overdue.length > 0;

  const suggestionsQuery = api.scheduling.getSchedulingSuggestions.useQuery(
    { days: 7, workspaceId: workspaceId ?? undefined },
    {
      enabled: hasOverdue,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: false,
    },
  );
  const activeSuggestions = useMemo(
    () =>
      (suggestionsQuery.data?.suggestions ?? []).filter(
        (s) => !dismissedSuggestions.has(s.actionId),
      ),
    [suggestionsQuery.data?.suggestions, dismissedSuggestions],
  );
  const actionsById = useMemo(() => {
    const m = new Map<string, ActionData>();
    for (const a of filteredActions) m.set(a.id, a);
    return m;
  }, [filteredActions]);

  // ---- Mutations -----------------------------------------------------------
  const { updateAction } = useActionMutations({ viewName: "today" });
  const {
    bulkReschedule,
    bulkDelete,
    bulkDefer,
    isMutating: isBulkMutating,
  } = useBulkActionMutations({
    viewName: "today",
  });
  const handleComplete = (id: string) => {
    const a = filteredActions.find((x) => x.id === id);
    const nextStatus = a?.status === "COMPLETED" ? "ACTIVE" : "COMPLETED";
    updateAction({
      id,
      status: nextStatus,
      ...(a?.projectId
        ? { kanbanStatus: nextStatus === "COMPLETED" ? "DONE" : "TODO" }
        : {}),
    });
  };

  // Moves the do-date and the deadline together, at day granularity — see
  // `rescheduleUpdateFields` for why scheduledStart has to move too.
  const handleReschedule = (id: string, choice: RescheduleChoice) => {
    updateAction({ id, ...rescheduleUpdateFields(choice) });
  };

  const handleAcceptSuggestion = (s: {
    actionId: string;
    suggestedDate: string;
    suggestedTime: string;
  }) => {
    const [h, m] = s.suggestedTime.split(":").map(Number);
    const when = new Date(`${s.suggestedDate}T00:00:00`);
    when.setHours(h ?? 9, m ?? 0, 0, 0);
    updateAction({ id: s.actionId, scheduledStart: when, dueDate: when });
    setDismissedSuggestions((p) => new Set([...p, s.actionId]));
  };

  // ---- Open action ---------------------------------------------------------
  const handleOpen = (a: Action) => {
    if (detailedEnabled && workspace?.slug) {
      router.push(`/w/${workspace.slug}/actions/${a.id}`);
      return;
    }
    setActionId(a.id);
    setSelectedAction(a);
    setEditModalOpened(true);
  };

  // Deep link: open modal once per unique URL actionId. We track the last
  // handled id (rather than a boolean reset on URL change) because the optimistic
  // cache update on Save can change `filteredActions` before the URL transition
  // clears `actionIdFromUrl` — without this guard the effect re-opens the modal
  // the user just closed.
  const handledActionIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!actionIdFromUrl) {
      handledActionIdRef.current = null;
      return;
    }
    if (handledActionIdRef.current === actionIdFromUrl) return;
    const found = filteredActions.find((a) => a.id === actionIdFromUrl);
    if (found) {
      setSelectedAction(found as unknown as Action);
      setEditModalOpened(true);
      handledActionIdRef.current = actionIdFromUrl;
    }
  }, [actionIdFromUrl, filteredActions]);

  // ---- Rail blocks ---------------------------------------------------------
  const railBlocks: RailBlock[] = useMemo(
    () =>
      buildRailBlocks({
        events: calendarEventsQuery.data,
        actions: partition.todays,
      }),
    [calendarEventsQuery.data, partition.todays],
  );

  // ---- Day label -----------------------------------------------------------
  const dayLabel = useMemo(() => {
    const d = new Date();
    const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const MON = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    return `${DOW[d.getDay()]} · ${MON[d.getMonth()]} ${d.getDate()}`;
  }, []);

  // ---- Rendered task list (bulk selection scope: overdue + todays) --------
  const renderedActions = useMemo(() => {
    const overdue = partition.overdue;
    const todays = partition.todays;
    return [...overdue, ...todays];
  }, [partition.overdue, partition.todays]);

  // The current instant rather than the midnight `today` from useDayRollover.
  // The time-of-day is immaterial now that this only writes `dueDate`, which
  // every consumer compares at day granularity — and bulkReschedule no longer
  // stamps it into scheduledStart, so it can't reach the agenda rail.
  const handleRescheduleAllOverdue = useCallback(() => {
    bulkReschedule({
      actionIds: partition.overdue.map((a) => a.id),
      dueDate: new Date(),
      label: "Today",
      fromOverdue: true,
    });
  }, [bulkReschedule, partition.overdue]);

  // Most large overdue piles are a few bulk writes, not a lot of missed
  // commitments. Computed client-side from the same `partition.overdue` the
  // rows below render, using the same pure function as `action.getOverdueTriage`
  // and the agent tools — so the page, the endpoint, and Zoe cannot disagree,
  // and it costs no extra fetch (ADR-0052).
  const overdueTriage = useMemo(
    () => groupOverdueCohorts(partition.overdue, { today }),
    [partition.overdue, today],
  );

  const handleDeferCohort = useCallback(
    (actionIds: string[]) => {
      bulkDefer({ actionIds, fromOverdue: true });
    },
    [bulkDefer],
  );

  // ---- Bulk selection -----------------------------------------------------
  const selection = useBulkSelection(
    renderedActions as unknown as Action[],
  );
  const toggleBulkMode = () => {
    setBulkMode((prev) => {
      if (prev) selection.clear();
      return !prev;
    });
  };
  const bulkActionDefs: BulkActionDef[] = useMemo(
    () => [
      {
        kind: "reschedule",
        onReschedule: (date, ids) =>
          bulkReschedule({
            actionIds: ids,
            dueDate: date,
            fromOverdue: true,
          }),
      },
      {
        kind: "delete",
        onDelete: (ids) =>
          bulkDelete({ actionIds: ids, fromOverdue: true }),
      },
    ],
    [bulkReschedule, bulkDelete],
  );

  const tagSelectedLabel =
    selectedTagIds.length > 0
      ? `${selectedTagIds.length} tag${selectedTagIds.length === 1 ? "" : "s"}`
      : null;

  const days: { key: DayMode; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "tomorrow", label: "Tomorrow" },
    { key: "upcoming", label: "Upcoming" },
  ];

  return (
    <div className="-m-4 -mt-16 sm:-mt-4 lg:-m-8 -mb-20 sm:-mb-4 lg:-mb-8">
      <div className="today-surface">
        <div className="td">
        <div className="td-main">
          {/* ===== Top bar (page title + actions in one row) ===== */}
          <div className="td-topbar">
            <div className="td-topbar__title">Today</div>
            <div className="td-topbar__spacer" />

            {gamificationEnabled && score && (
              <button
                type="button"
                className="td-score-chip"
                onClick={openBreakdown}
                aria-label="View daily score breakdown"
              >
                <ScoreRing value={score.totalScore} max={100} size={20} />
                <div className="td-score-chip__nums">
                  <span className="td-score-chip__value">{score.totalScore}</span>
                  <span className="td-score-chip__max">/100</span>
                </div>
              </button>
            )}

            <Link href="/daily-plan" className="td-btn">
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                <rect x="3.5" y="5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
                <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Plan
            </Link>

            <div className="td-toggle">
              {days.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  className={`td-toggle__btn ${
                    filter === d.key ? "td-toggle__btn--active" : ""
                  }`}
                  onClick={() => onFilterChange(d.key)}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <button type="button" className="td-btn--icon" aria-label="Search">
              <IconSearch size={16} />
            </button>
          </div>

          {/* ===== Body: list + rail ===== */}
          <div className="td-body">
            <div className="td-tasklist">
              {/* ===== Filter row (scoped to left panel so rail header aligns) ===== */}
              <div className="td-filter-row">
                <button
                  type="button"
                  className={`td-filter-input ${
                    tagSelectedLabel ? "" : "td-filter-input--placeholder"
                  }`}
                  onClick={() => setTagPickerOpen(true)}
                >
                  <span className="td-filter-input__hash">#</span>
                  {tagSelectedLabel ?? "Filter by tags…"}
                </button>
                <div className="td-filter-row__spacer" />
                <div className="td-filter-row__show">
                  Show: <span className="td-filter-row__show-value">Active</span>
                </div>
                <button
                  type="button"
                  className={`td-bulk-btn ${bulkMode ? "td-bulk-btn--active" : ""}`}
                  onClick={toggleBulkMode}
                >
                  {bulkMode ? "Exit bulk" : "Bulk edit"}
                </button>
              </div>

              {/* ===== Tag picker (Mantine MultiSelect rendered inline when open) ===== */}
              {tagPickerOpen && tagOptions.length > 0 && (
                <div style={{ padding: "8px 24px", borderBottom: "1px solid var(--td-hair)" }}>
                  <MultiSelect
                    data={tagOptions}
                    value={selectedTagIds}
                    onChange={onSelectedTagIdsChange}
                    placeholder="Filter by tags…"
                    leftSection={<IconHash size={14} />}
                    clearable
                    searchable
                    size="sm"
                    autoFocus
                    onBlur={() => setTagPickerOpen(false)}
                  />
                </div>
              )}

              {zoeOpen && activeSuggestions.length > 0 && (
                <div style={{ padding: "12px 24px 0" }}>
                  <ZoePanel
                    suggestions={activeSuggestions}
                    actionsById={actionsById as unknown as Map<string, Action>}
                    onAcceptAll={() => activeSuggestions.forEach(handleAcceptSuggestion)}
                    onAccept={handleAcceptSuggestion}
                    onDismissAll={() => setZoeOpen(false)}
                    onDismissOne={(id) =>
                      setDismissedSuggestions((p) => new Set([...p, id]))
                    }
                  />
                </div>
              )}

              {bulkMode && (
                <div style={{ padding: "8px 24px 0" }}>
                  <BulkEditToolbar
                    selection={selection}
                    allItems={renderedActions as unknown as Action[]}
                    actions={bulkActionDefs}
                  />
                </div>
              )}

              <div className="td-tasklist__rows">
                {actionsQuery.isLoading ? (
                  <div className="td-tasklist__empty">Loading…</div>
                ) : renderedActions.length === 0 &&
                  partition.completedToday.length === 0 ? (
                  <div className="td-tasklist__empty">Nothing scheduled. Enjoy the calm.</div>
                ) : (
                  <>
                    {hasOverdue && (
                      <div className="td-section td-section--overdue">
                        <button
                          type="button"
                          className="td-section__toggle"
                          aria-expanded={overdueOpen}
                          onClick={() => setOverdueOpen((v) => !v)}
                        >
                          <IconChevronRight
                            size={12}
                            className={
                              overdueOpen
                                ? "td-section__chev td-section__chev--open"
                                : "td-section__chev"
                            }
                          />
                          Overdue
                          <span className="td-section__count td-section__count--overdue">
                            {partition.overdue.length}
                          </span>
                        </button>
                        {!bulkMode && (
                          <button
                            type="button"
                            className="td-section__action"
                            onClick={handleRescheduleAllOverdue}
                          >
                            Reschedule all → Today
                          </button>
                        )}
                      </div>
                    )}
                    {overdueOpen && overdueTriage.cohorts.length > 0 && !bulkMode && (
                      <div className="td-amnesty">
                        <p className="td-amnesty__lede">
                          {overdueTriage.cohortCount} of these{" "}
                          {overdueTriage.totalOverdue} were created in one go —
                          they were probably never really due on that date.
                        </p>
                        {overdueTriage.cohorts.map((cohort) => (
                          <div
                            key={cohort.stampedAt.toISOString()}
                            className="td-amnesty__cohort"
                          >
                            <div className="td-amnesty__detail">
                              <span className="td-amnesty__count">
                                {cohort.count} actions
                              </span>
                              <span className="td-amnesty__meta">
                                {cohort.daysOverdue === 1
                                  ? "dated yesterday"
                                  : `dated ${cohort.daysOverdue}d ago`}
                                {cohort.projectNames.length > 0 &&
                                  ` · ${cohort.projectNames.slice(0, 3).join(", ")}`}
                                {cohort.projectNames.length > 3 &&
                                  ` +${cohort.projectNames.length - 3} more`}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="td-amnesty__action"
                              disabled={isBulkMutating}
                              onClick={() => handleDeferCohort(cohort.actionIds)}
                            >
                              Back to backlog
                            </button>
                          </div>
                        ))}
                        <p className="td-amnesty__note">
                          Nothing is deleted — they stay in their projects,
                          just without a date.
                        </p>
                      </div>
                    )}
                    {overdueOpen &&
                      partition.overdue.map((a) => {
                        const anchor = overdueAnchor(a);
                        return (
                          <TaskRow
                            key={a.id}
                            action={a as unknown as Action}
                            isOverdue
                            overdueLabel={
                              anchor
                                ? formatRelativeDueAge(anchor, today)
                                : undefined
                            }
                            bulkMode={bulkMode}
                            bulkSelected={selection.isSelected(a.id)}
                            onBulkToggle={selection.toggle}
                            onComplete={handleComplete}
                            onOpen={handleOpen}
                            onReschedule={handleReschedule}
                            onTagClick={(tagId) => {
                              if (!selectedTagIds.includes(tagId)) {
                                onSelectedTagIdsChange([...selectedTagIds, tagId]);
                              }
                            }}
                          />
                        );
                      })}

                    {hasOverdue && partition.todays.length > 0 && (
                      <div className="td-section">
                        Today
                        <span className="td-section__count">
                          {partition.todays.length}
                        </span>
                      </div>
                    )}
                    {partition.todays.map((a) => (
                      <TaskRow
                        key={a.id}
                        action={a as unknown as Action}
                        bulkMode={bulkMode}
                        bulkSelected={selection.isSelected(a.id)}
                        onBulkToggle={selection.toggle}
                        onComplete={handleComplete}
                        onOpen={handleOpen}
                        onReschedule={handleReschedule}
                        onTagClick={(tagId) => {
                          if (!selectedTagIds.includes(tagId)) {
                            onSelectedTagIdsChange([...selectedTagIds, tagId]);
                          }
                        }}
                      />
                    ))}

                    {partition.completedToday.length > 0 && (
                      <>
                        <div className="td-section">
                          <button
                            type="button"
                            className="td-section__toggle"
                            aria-expanded={completedOpen}
                            onClick={() => setCompletedOpen((v) => !v)}
                          >
                            <IconChevronRight
                              size={12}
                              className={
                                completedOpen
                                  ? "td-section__chev td-section__chev--open"
                                  : "td-section__chev"
                              }
                            />
                            Completed
                            <span className="td-section__count">
                              {partition.completedToday.length}
                            </span>
                          </button>
                        </div>
                        {completedOpen &&
                          partition.completedToday.map((a) => (
                            <TaskRow
                              key={a.id}
                              action={a as unknown as Action}
                              onComplete={handleComplete}
                              onOpen={handleOpen}
                            />
                          ))}
                      </>
                    )}
                  </>
                )}
              </div>

              <div style={{ padding: "12px 24px" }}>
                <CreateActionModal viewName="today" />
              </div>
            </div>

            <AgendaRail
              dayLabel={dayLabel}
              eventsCount={railBlocks.length}
              blocks={railBlocks}
              now={now}
            />
          </div>
        </div>
      </div>
      </div>

      {/* Score breakdown modal */}
      {score && (
        <Modal
          opened={breakdownOpened}
          onClose={closeBreakdown}
          title="Daily Productivity Score"
          size="md"
          overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
        >
          <ScoreBreakdown score={score} />
        </Modal>
      )}

      {/* Edit modal (deep link + row click fallback) */}
      <EditActionModal
        action={selectedAction}
        opened={editModalOpened}
        onClose={() => {
          setEditModalOpened(false);
          setSelectedAction(null);
          clearActionId();
        }}
      />
    </div>
  );
}
