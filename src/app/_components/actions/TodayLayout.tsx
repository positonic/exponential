"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Text } from "@mantine/core";
import { api, type RouterOutputs } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { useActionDeepLink } from "~/hooks/useActionDeepLink";
import { useDetailedActionsEnabled } from "~/hooks/useDetailedActionsEnabled";
import { useDayRollover } from "~/hooks/useDayRollover";
import { addDays, hourFloat } from "~/lib/actions/dates";
import type { Action } from "~/lib/actions/types";
import { CreateActionModal } from "../CreateActionModal";
import { MobileFAB } from "../today-mobile/MobileFAB";
import { ActionsList } from "./ActionsList";
import { TimelineRail, type RailBlock } from "./components/TimelineRail";
import { ZoePanel } from "./components/ZoePanel";
import { useActionMutations } from "./hooks/useActionMutations";
import { useBulkActionMutations } from "./hooks/useBulkActionMutations";
import { useActionPartition } from "./hooks/useActionPartition";
import styles from "./TodayLayout.module.css";

type ActionData = RouterOutputs["action"]["getAll"][number];
type SchedulingSuggestionData = NonNullable<
  RouterOutputs["scheduling"]["getSchedulingSuggestions"]["suggestions"]
>[number];

interface TodayLayoutProps {
  tagIds?: string[];
}

export function TodayLayout({ tagIds }: TodayLayoutProps) {
  const router = useRouter();
  const { workspace, workspaceId } = useWorkspace();
  const { actionIdFromUrl, setActionId, clearActionId } = useActionDeepLink();
  const detailedEnabled = useDetailedActionsEnabled();
  const today = useDayRollover();

  const [zoeOpen, setZoeOpen] = useState(true);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(
    new Set(),
  );
  const [now, setNow] = useState<number>(() => hourFloat(new Date()));

  // Tick the now-line every minute
  useEffect(() => {
    const id = window.setInterval(() => setNow(hourFloat(new Date())), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Data — /today spans all workspaces (route is not workspace-scoped)
  const actionsQuery = api.action.getAll.useQuery({}, { enabled: true });
  const calendarEventsQuery = api.calendar.getTodayEvents.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const filteredActions = useMemo<ActionData[]>(() => {
    const all = actionsQuery.data ?? [];
    if (!tagIds || tagIds.length === 0) return all;
    return all.filter((a) =>
      a.tags?.some((at) => tagIds.includes(at.tagId.toString())),
    );
  }, [actionsQuery.data, tagIds]);

  const actionsById = useMemo(() => {
    const m = new Map<string, ActionData>();
    for (const a of filteredActions) m.set(a.id, a);
    return m;
  }, [filteredActions]);

  const partition = useActionPartition(filteredActions, { today });
  const hasOverdue = partition.overdue.length > 0;

  // Suggestions
  const suggestionsQuery = api.scheduling.getSchedulingSuggestions.useQuery(
    { days: 7, workspaceId: workspaceId ?? undefined },
    {
      enabled: hasOverdue,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: false,
    },
  );

  const activeSuggestions = useMemo(() => {
    const list = suggestionsQuery.data?.suggestions ?? [];
    return list.filter((s) => !dismissedSuggestions.has(s.actionId));
  }, [suggestionsQuery.data?.suggestions, dismissedSuggestions]);

  const suggestionProposalByActionId = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of activeSuggestions) {
      const date = new Date(`${s.suggestedDate}T${s.suggestedTime}`);
      const tomorrow = addDays(today, 1);
      const isToday = date.toDateString() === today.toDateString();
      const isTomorrow = date.toDateString() === tomorrow.toDateString();
      const timeStr = date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      const label = isToday
        ? `Today ${timeStr}`
        : isTomorrow
          ? `Tomorrow ${timeStr}`
          : `${date.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" })} ${timeStr}`;
      m.set(s.actionId, label);
    }
    return m;
  }, [activeSuggestions, today]);

  // Suppress unused warning — Phase 6 hands suggestions to ActionsList in a
  // future iteration; for now they're passed via deep-linked CreateActionModal
  // and the row visual on /today renders them as chips natively in Phase 7+
  void suggestionProposalByActionId;

  // Rail blocks (calendar events + scheduled actions)
  const railBlocks: RailBlock[] = useMemo(() => {
    const blocks: RailBlock[] = [];
    for (const ev of calendarEventsQuery.data ?? []) {
      const startStr = ev.start?.dateTime ?? ev.start?.date;
      const endStr = ev.end?.dateTime ?? ev.end?.date;
      if (!startStr || !endStr) continue;
      const s = new Date(startStr);
      const e = new Date(endStr);
      blocks.push({
        id: ev.id,
        title: ev.summary || "Untitled",
        start: hourFloat(s),
        end: hourFloat(e),
        kind: "cal",
      });
    }
    for (const a of partition.todays) {
      if (!a.scheduledStart) continue;
      const s = new Date(a.scheduledStart);
      const durationMinutes =
        (a as ActionData & { duration?: number | null }).duration ?? 60;
      const e = new Date(s.getTime() + durationMinutes * 60_000);
      blocks.push({
        id: `act-${a.id}`,
        title: a.name,
        start: hourFloat(s),
        end: hourFloat(e),
        kind: "task",
      });
    }
    return blocks;
  }, [calendarEventsQuery.data, partition.todays]);

  const eventsCount = (calendarEventsQuery.data ?? []).length;
  const focusCount = railBlocks.filter((b) => b.kind === "focus").length;

  const dayLabel = useMemo(() => {
    const d = new Date();
    const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const MON = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return `${DOW[d.getDay()]} · ${MON[d.getMonth()]} ${d.getDate()}`;
  }, []);

  // Mutations for suggestion accept (writes to scheduledStart/dueDate)
  const { updateAction } = useActionMutations({ viewName: "today" });
  const { bulkReschedule, bulkDelete } = useBulkActionMutations({
    viewName: "today",
  });

  const handleAcceptSuggestion = (s: SchedulingSuggestionData) => {
    const [h, m] = s.suggestedTime.split(":").map(Number);
    const when = new Date(`${s.suggestedDate}T00:00:00`);
    when.setHours(h ?? 9, m ?? 0, 0, 0);
    updateAction({ id: s.actionId, scheduledStart: when, dueDate: when });
    setDismissedSuggestions((prev) => new Set([...prev, s.actionId]));
  };

  const handleAcceptAllSuggestions = () => {
    for (const s of activeSuggestions) handleAcceptSuggestion(s);
  };

  const handleActionOpen = (id: string) => {
    if (detailedEnabled && workspace?.slug) {
      router.push(`/w/${workspace.slug}/actions/${id}`);
      return;
    }
    setActionId(id);
  };

  const railRange: [number, number] = [6, 22];

  const rootRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={rootRef} className={styles.page}>
      <div className={styles.grid}>
        <div className={styles.main}>
          {zoeOpen && activeSuggestions.length > 0 && (
            <ZoePanel
              suggestions={activeSuggestions}
              actionsById={actionsById as unknown as Map<string, Action>}
              onAcceptAll={handleAcceptAllSuggestions}
              onAccept={handleAcceptSuggestion}
              onDismissAll={() => setZoeOpen(false)}
              onDismissOne={(id) =>
                setDismissedSuggestions((prev) => new Set([...prev, id]))
              }
            />
          )}

          {actionsQuery.isLoading ? (
            <Text size="sm" c="dimmed">
              Loading…
            </Text>
          ) : (
            <ActionsList
              viewName="today"
              actions={filteredActions as unknown as Action[]}
              completedSection="collapsed"
              bulkActions={[
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
              ]}
              isLoading={actionsQuery.isLoading}
              deepLinkActionId={actionIdFromUrl}
              onActionOpen={handleActionOpen}
              onActionClose={clearActionId}
            />
          )}
        </div>

        <div className={styles.rail}>
          <TimelineRail
            dayLabel={dayLabel}
            eventsCount={eventsCount}
            focusCount={focusCount}
            blocks={railBlocks}
            range={railRange}
            now={now}
          />
        </div>
      </div>

      <div className={styles.desktopAddTask}>
        <CreateActionModal viewName="today" />
      </div>
      <MobileFAB />
    </div>
  );
}
