"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Modal, MultiSelect } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconHash, IconSearch } from "@tabler/icons-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { useActionDeepLink } from "~/hooks/useActionDeepLink";
import { useDetailedActionsEnabled } from "~/hooks/useDetailedActionsEnabled";
import { useDayRollover } from "~/hooks/useDayRollover";
import { hourFloat } from "~/lib/actions/dates";
import type { Action } from "~/lib/actions/types";
import { CreateActionModal } from "../CreateActionModal";
import { EditActionModal } from "../EditActionModal";
import { ScoreBreakdown } from "../scoring/ScoreBreakdown";
import { ZoePanel } from "../actions/components/ZoePanel";
import {
  BulkEditToolbar,
  type BulkActionDef,
} from "../actions/components/BulkEditToolbar";
import type { RescheduleChoice } from "../actions/components/ReschedulePopover";
import { useActionMutations } from "../actions/hooks/useActionMutations";
import { useActionPartition } from "../actions/hooks/useActionPartition";
import { useBulkActionMutations } from "../actions/hooks/useBulkActionMutations";
import { useBulkSelection } from "../actions/hooks/useBulkSelection";
import type { RailBlock } from "../actions/components/TimelineRail";
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

  const handleReschedule = (id: string, choice: RescheduleChoice) => {
    const newDate = choice.date ?? null;
    updateAction({ id, scheduledStart: newDate, dueDate: newDate });
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

  // Deep link
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (!actionIdFromUrl || deepLinkHandled.current) return;
    const found = filteredActions.find((a) => a.id === actionIdFromUrl);
    if (found) {
      setSelectedAction(found as unknown as Action);
      setEditModalOpened(true);
      deepLinkHandled.current = true;
    }
  }, [actionIdFromUrl, filteredActions]);
  useEffect(() => {
    deepLinkHandled.current = false;
  }, [actionIdFromUrl]);

  // ---- Rail blocks ---------------------------------------------------------
  const railBlocks: RailBlock[] = useMemo(() => {
    const blocks: RailBlock[] = [];
    for (const ev of calendarEventsQuery.data ?? []) {
      const startStr = ev.start?.dateTime ?? ev.start?.date;
      const endStr = ev.end?.dateTime ?? ev.end?.date;
      if (!startStr || !endStr) continue;
      blocks.push({
        id: ev.id,
        title: ev.summary || "Untitled",
        start: hourFloat(new Date(startStr)),
        end: hourFloat(new Date(endStr)),
        kind: "cal",
      });
    }
    for (const a of partition.todays) {
      if (!a.scheduledStart) continue;
      const s = new Date(a.scheduledStart);
      const durationMinutes =
        (a as ActionData & { duration?: number | null }).duration ?? 60;
      blocks.push({
        id: `act-${a.id}`,
        title: a.name,
        start: hourFloat(s),
        end: hourFloat(new Date(s.getTime() + durationMinutes * 60_000)),
        kind: "task",
      });
    }
    return blocks;
  }, [calendarEventsQuery.data, partition.todays]);

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

  // ---- Rendered task list (active todays + overdue, completed at bottom) ---
  const renderedActions = useMemo(() => {
    const overdue = partition.overdue;
    const todays = partition.todays;
    return [...overdue, ...todays];
  }, [partition.overdue, partition.todays]);

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
                ) : renderedActions.length === 0 ? (
                  <div className="td-tasklist__empty">Nothing scheduled. Enjoy the calm.</div>
                ) : (
                  renderedActions.map((a) => (
                    <TaskRow
                      key={a.id}
                      action={a as unknown as Action}
                      isOverdue={partition.overdue.some((o) => o.id === a.id)}
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
                  ))
                )}
              </div>

              <div style={{ padding: "12px 24px" }}>
                <CreateActionModal viewName="today" />
              </div>
            </div>

            <AgendaRail
              dayLabel={dayLabel}
              eventsCount={(calendarEventsQuery.data ?? []).length}
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
