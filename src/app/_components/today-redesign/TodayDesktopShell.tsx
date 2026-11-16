"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DocsHelpLink } from "~/app/_components/docs/DocsHelpLink";
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
import {
  addDays,
  formatDayLabel,
  formatRelativeDueAge,
  hourFloat,
  startOfLocalDay,
} from "~/lib/actions/dates";
import {
  groupUpcomingByDay,
  overdueAnchor,
  partitionActions,
} from "~/lib/actions/partition";
import { withoutPausedProjects } from "~/lib/actions/pausedProjects";
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

const DAYS: { key: DayMode; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "upcoming", label: "Upcoming" },
];

const EMPTY_MESSAGE: Record<DayMode, string> = {
  today: "Nothing scheduled. Enjoy the calm.",
  tomorrow: "Nothing scheduled for tomorrow.",
  upcoming: "Nothing upcoming.",
};

/** One labelled run of rows below Overdue — a single day, or one per day on Upcoming. */
interface DaySection {
  key: string;
  label: string;
  actions: ActionData[];
}

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

  // Today's score on every tab — it's the day being played, and dropping the
  // chip off-today would shift the top bar when switching tabs.
  const { data: score } = api.scoring.getTodayScore.useQuery(
    { date: today },
    { enabled: gamificationEnabled },
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

  // The rail shows one day: today, or tomorrow on the Tomorrow and Upcoming
  // tabs (Upcoming's list starts at tomorrow). Today omits the input so it
  // shares a cache entry with the other getTodayEvents callers.
  const railIsToday = filter === "today";
  const railDay = useMemo(
    () => (railIsToday ? today : addDays(today, 1)),
    [railIsToday, today],
  );
  const calendarEventsQuery = api.calendar.getTodayEvents.useQuery(
    railIsToday ? undefined : { dayOffset: 1 },
    {
      retry: false,
      refetchOnWindowFocus: false,
    },
  );

  // Actions of an On hold, Completed or Cancelled project are off the plate
  // on every tab; the project's own page still lists them.
  const filteredActions = useMemo<ActionData[]>(() => {
    const all = withoutPausedProjects(actionsQuery.data ?? []);
    if (selectedTagIds.length === 0) return all;
    return all.filter((a) =>
      a.tags?.some((at) => selectedTagIds.includes(at.tagId.toString())),
    );
  }, [actionsQuery.data, selectedTagIds]);

  const partition = useActionPartition(filteredActions, { today });
  const hasOverdue = partition.overdue.length > 0;

  // Tomorrow is "today's" bucket one day on, so the two tabs share a rule.
  const tomorrowActions = useMemo(
    () => partitionActions(filteredActions, { today: addDays(today, 1) }).todays,
    [filteredActions, today],
  );

  const daySections = useMemo<DaySection[]>(() => {
    if (filter === "today") {
      return [{ key: "today", label: "Today", actions: partition.todays }];
    }
    if (filter === "tomorrow") {
      return [{ key: "tomorrow", label: "Tomorrow", actions: tomorrowActions }];
    }
    const tomorrowTime = addDays(today, 1).getTime();
    return groupUpcomingByDay(filteredActions, { today }).map((g) => ({
      key: String(g.day.getTime()),
      label: g.day.getTime() === tomorrowTime ? "Tomorrow" : formatDayLabel(g.day),
      actions: g.actions,
    }));
  }, [filter, partition.todays, tomorrowActions, filteredActions, today]);

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
  const { bulkReschedule, bulkDelete } = useBulkActionMutations({
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

  // Moves the do-date, and the deadline only if it would fall before it — see
  // `rescheduleUpdateFields`.
  const handleReschedule = (id: string, choice: RescheduleChoice) => {
    const a = actionsById.get(id);
    updateAction({ id, ...rescheduleUpdateFields(choice, a?.dueDate) });
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
        actions: railIsToday ? partition.todays : tomorrowActions,
      }),
    [calendarEventsQuery.data, railIsToday, partition.todays, tomorrowActions],
  );

  // ---- Rendered task list (bulk selection scope: overdue + day sections) --
  const renderedActions = useMemo(
    () => [...partition.overdue, ...daySections.flatMap((s) => s.actions)],
    [partition.overdue, daySections],
  );
  // Completed-today only belongs to the Today tab.
  const completedToday = filter === "today" ? partition.completedToday : [];

  // Local midnight, not the current instant: bulkReschedule writes this into
  // scheduledStart, and a wall-clock time there draws as a phantom hour-long
  // block on the agenda rail (see resolveQuickReschedule). Deadlines later
  // than today are left alone by the server.
  const handleRescheduleAllOverdue = useCallback(() => {
    bulkReschedule({
      actionIds: partition.overdue.map((a) => a.id),
      date: startOfLocalDay(new Date()),
      label: "Today",
      fromOverdue: true,
    });
  }, [bulkReschedule, partition.overdue]);

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
            date,
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

  return (
    <div className="-m-4 -mt-16 sm:-mt-4 lg:-m-8 -mb-20 sm:-mb-4 lg:-mb-8">
      <div className="today-surface">
        <div className="td">
        <div className="td-main">
          {/* ===== Top bar (page title + actions in one row) ===== */}
          <div className="td-topbar">
            <div className="td-topbar__title">
              {DAYS.find((d) => d.key === filter)?.label ?? "Today"}
            </div>
            <DocsHelpLink pathname="/today" />
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
              {DAYS.map((d) => (
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
                ) : renderedActions.length === 0 && completedToday.length === 0 ? (
                  <div className="td-tasklist__empty">{EMPTY_MESSAGE[filter]}</div>
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

                    {daySections.map((section) => (
                      <Fragment key={section.key}>
                        {/* A lone section needs no header unless Overdue sits above it. */}
                        {section.actions.length > 0 &&
                          (hasOverdue || daySections.length > 1) && (
                            <div className="td-section">
                              {section.label}
                              <span className="td-section__count">
                                {section.actions.length}
                              </span>
                            </div>
                          )}
                        {section.actions.map((a) => (
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
                      </Fragment>
                    ))}

                    {completedToday.length > 0 && (
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
                              {completedToday.length}
                            </span>
                          </button>
                        </div>
                        {completedOpen &&
                          completedToday.map((a) => (
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
                {/* Keyed so the default due date follows the tab. */}
                <CreateActionModal key={filter} viewName={filter} />
              </div>
            </div>

            <AgendaRail
              dayLabel={formatDayLabel(railDay)}
              eventsCount={railBlocks.length}
              blocks={railBlocks}
              now={railIsToday ? now : null}
              pillLabel={railIsToday ? "Today" : "Tomorrow"}
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
