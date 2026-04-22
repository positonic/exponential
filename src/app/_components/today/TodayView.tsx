"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { notifications } from "@mantine/notifications";
import { api, type RouterOutputs } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { useActionDeepLink } from "~/hooks/useActionDeepLink";
import { useDetailedActionsEnabled } from "~/hooks/useDetailedActionsEnabled";
import { EditActionModal } from "../EditActionModal";
import { CreateActionModal } from "../CreateActionModal";
import type { Priority } from "~/types/action";
import "./TodayView.css";

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

type ActionData = RouterOutputs["action"]["getAll"][number];
type SchedulingSuggestionData = NonNullable<
  RouterOutputs["scheduling"]["getSchedulingSuggestions"]["suggestions"]
>[number];

type VisualPriority = "urgent" | "high" | "normal" | "low";

interface RescheduleChoice {
  id: string;
  label: string;
  date?: Date | null;
}

interface RailBlock {
  id: string;
  title: string;
  start: number; // hour as float
  end: number;
  kind: "cal" | "task" | "focus";
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

const PROJECT_PALETTE_SIZE = 10;

function projectColorIndexFor(projectId: string | null | undefined): number {
  if (!projectId) return 4;
  let hash = 0;
  for (let i = 0; i < projectId.length; i++) {
    hash = (hash * 31 + projectId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % PROJECT_PALETTE_SIZE;
}

function toVisualPriority(priority: string | null | undefined, isOverdue: boolean): VisualPriority {
  if (isOverdue) return "urgent";
  const p = (priority ?? "") as Priority | "";
  if (p === "1st Priority") return "urgent";
  if (p === "2nd Priority" || p === "3rd Priority") return "high";
  if (p === "Remember" || p === "Watch") return "low";
  return "normal";
}

function priorityClass(p: VisualPriority): string {
  if (p === "urgent") return "today-check--urgent";
  if (p === "high") return "today-check--high";
  if (p === "low") return "today-check--low";
  return "";
}

function formatClockTime(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatAprDay(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

function hourFloat(date: Date): number {
  return date.getHours() + date.getMinutes() / 60;
}

function formatHourLabel(h: number): string {
  const hr = Math.floor(h);
  const disp = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
  const suffix = hr >= 12 ? "PM" : "AM";
  return `${disp} ${suffix}`;
}

function formatHourMinute12(h: number): string {
  const hr = Math.floor(h);
  const min = Math.round((h - hr) * 60);
  const suffix = hr >= 12 ? "PM" : "AM";
  const disp = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
  return `${disp}:${String(min).padStart(2, "0")} ${suffix}`;
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

function nextSaturday(from: Date): Date {
  const daysUntilSat = (6 - from.getDay() + 7) % 7;
  return addDays(from, daysUntilSat === 0 ? 7 : daysUntilSat);
}

// ─────────────────────────────────────────────────────────
// Icons (inlined stroke SVG; matches Tabler naming)
// ─────────────────────────────────────────────────────────

type IconName =
  | "chevDown" | "sparkles" | "arrow" | "calendar" | "clock"
  | "dots" | "close" | "check" | "hash";

const ICON_PATHS: Record<IconName, React.ReactNode> = {
  chevDown: <polyline points="6 9 12 15 18 9" />,
  sparkles: (
    <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275l5.813 1.912l-5.813 1.912a2 2 0 0 0 -1.275 1.275l-1.912 5.813l-1.912 -5.813a2 2 0 0 0 -1.275 -1.275l-5.813 -1.912l5.813 -1.912a2 2 0 0 0 1.275 -1.275z" />
  ),
  arrow: (<><path d="M5 12h14" /><path d="M13 5l7 7l-7 7" /></>),
  calendar: (
    <><path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" /><path d="M16 3v4" /><path d="M8 3v4" /><path d="M4 11h16" /></>
  ),
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>),
  dots: (<><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>),
  close: (<><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></>),
  check: <polyline points="5 12 10 17 19 7" />,
  hash: (<><path d="M5 9h14" /><path d="M5 15h14" /><path d="M11 4l-4 16" /><path d="M17 4l-4 16" /></>),
};

const Icon: React.FC<{ name: IconName; size?: number; style?: React.CSSProperties }> = ({
  name, size = 16, style,
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0, ...style }}
    aria-hidden
  >
    {ICON_PATHS[name]}
  </svg>
);

// ─────────────────────────────────────────────────────────
// Reschedule popover
// ─────────────────────────────────────────────────────────

const QUICK_RESCHEDULE = [
  { id: "today",     label: "Today",        kbd: "T" },
  { id: "tomorrow",  label: "Tomorrow",     kbd: "O" },
  { id: "next-week", label: "Next week",    kbd: "N" },
  { id: "weekend",   label: "This weekend", kbd: "W" },
  { id: "no-date",   label: "No date",      kbd: "X" },
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const ReschedulePopover: React.FC<{
  onChoose: (c: RescheduleChoice) => void;
}> = ({ onChoose }) => {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [mode, setMode] = useState<"quick" | "cal">("quick");
  const today = new Date();

  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const firstDow = new Date(month.y, month.m, 1).getDay();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length < 42) cells.push(null);

  const resolveQuick = (id: string): RescheduleChoice => {
    const base = new Date();
    switch (id) {
      case "today":     return { id, label: "Today",        date: base };
      case "tomorrow":  return { id, label: "Tomorrow",     date: addDays(base, 1) };
      case "next-week": return { id, label: "Next week",    date: addDays(base, 7) };
      case "weekend":   return { id, label: "This weekend", date: nextSaturday(base) };
      default:          return { id, label: "No date",      date: null };
    }
  };

  return (
    <div className="today-popover" style={{ right: 0, top: 36 }} onClick={(e) => e.stopPropagation()}>
      {mode === "quick" && (
        <>
          <div className="today-popover__head">Reschedule</div>
          <div className="today-popover__quick">
            {QUICK_RESCHEDULE.map((q) => (
              <button key={q.id} className="today-popover__btn" onClick={() => onChoose(resolveQuick(q.id))}>
                <span>{q.label}</span>
                <span className="today-popover__btn-kbd">{q.kbd}</span>
              </button>
            ))}
          </div>
          <div className="today-popover__sep" />
          <button className="today-popover__btn" onClick={() => setMode("cal")}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Icon name="calendar" size={14} />
              Pick a date…
            </span>
          </button>
        </>
      )}
      {mode === "cal" && (
        <div className="today-popover__cal">
          <div className="today-popover__cal-head">
            <button
              className="today-popover__cal-nav"
              onClick={() => setMonth((m) => (m.m === 0 ? { y: m.y - 1, m: 11 } : { y: m.y, m: m.m - 1 }))}
              aria-label="Previous month"
            >
              <Icon name="chevDown" size={12} style={{ transform: "rotate(90deg)" }} />
            </button>
            <div className="today-popover__cal-title">{MONTHS[month.m]} {month.y}</div>
            <button
              className="today-popover__cal-nav"
              onClick={() => setMonth((m) => (m.m === 11 ? { y: m.y + 1, m: 0 } : { y: m.y, m: m.m + 1 }))}
              aria-label="Next month"
            >
              <Icon name="chevDown" size={12} style={{ transform: "rotate(-90deg)" }} />
            </button>
          </div>
          <div className="today-popover__cal-grid">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="today-popover__cal-dow">{d}</div>
            ))}
            {cells.map((d, i) =>
              d === null ? (
                <div key={i} />
              ) : (
                <button
                  key={i}
                  className={
                    "today-popover__cal-day " +
                    (d === today.getDate() && month.m === today.getMonth() && month.y === today.getFullYear()
                      ? "today-popover__cal-day--today"
                      : "")
                  }
                  onClick={() =>
                    onChoose({
                      id: "custom",
                      label: `${MONTHS[month.m]!.slice(0, 3)} ${d}`,
                      date: new Date(month.y, month.m, d),
                    })
                  }
                >
                  {d}
                </button>
              ),
            )}
          </div>
          <div className="today-popover__sep" />
          <button className="today-popover__btn" onClick={() => setMode("quick")}>
            <span>← Back to quick</span>
          </button>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// Action row
// ─────────────────────────────────────────────────────────

interface ActionRowProps {
  action: ActionData;
  isDone: boolean;
  isCompleting: boolean;
  showOverdueChip: boolean;
  openPopId: string | null;
  setOpenPopId: (id: string | null) => void;
  suggestionProposal?: string;
  onComplete: (id: string) => void;
  onReschedule: (id: string, choice: RescheduleChoice) => void;
  onOpen: (a: ActionData) => void;
}

const ActionRow: React.FC<ActionRowProps> = ({
  action, isDone, isCompleting, showOverdueChip, openPopId, setOpenPopId,
  suggestionProposal, onComplete, onReschedule, onOpen,
}) => {
  const popId = `${action.id}-pop`;
  const open = openPopId === popId;
  const visualPriority = toVisualPriority(action.priority, showOverdueChip);
  const projectTag = action.project?.name ?? "UNASSIGNED";
  const projectColorIdx = projectColorIndexFor(action.projectId ?? null);

  const scheduled = action.scheduledStart ? new Date(action.scheduledStart) : null;
  const due = action.dueDate ? new Date(action.dueDate) : null;
  const timeSource = scheduled ?? due;

  return (
    <div
      className={`today-row ${isDone ? "done" : ""} ${isCompleting ? "completing" : ""}`}
      onClick={() => onOpen(action)}
    >
      <button
        type="button"
        className={`today-check ${priorityClass(visualPriority)}`}
        onClick={(e) => { e.stopPropagation(); onComplete(action.id); }}
        title={`Priority: ${action.priority ?? "normal"}`}
        aria-label={`Mark ${action.name} as complete`}
      />
      <div className="today-body">
        <div className="today-title">{action.name}</div>
        <div className="today-meta">
          {showOverdueChip ? (
            <span className="today-chip today-chip--overdue">
              <Icon name="clock" size={10} />
              {formatClockTime(timeSource)}
            </span>
          ) : (
            <>
              {due && (
                <span className="today-chip">
                  <Icon name="calendar" size={10} />
                  {formatAprDay(due)}
                </span>
              )}
              {timeSource && (
                <span className="today-chip">
                  <Icon name="clock" size={10} />
                  {formatClockTime(timeSource)}
                </span>
              )}
            </>
          )}
          <span className={`today-chip today-chip--project today-chip--proj-${projectColorIdx}`}>
            {projectTag}
          </span>
          {suggestionProposal && (
            <span className="today-chip today-chip--suggest">
              <Icon name="sparkles" size={10} /> {suggestionProposal}
            </span>
          )}
        </div>
      </div>
      <div style={{ position: "relative" }}>
        <button
          type="button"
          className="today-rowactions__btn"
          style={{ opacity: 1 }}
          onClick={(e) => { e.stopPropagation(); setOpenPopId(open ? null : popId); }}
          title="Reschedule"
          aria-label="Reschedule"
        >
          <Icon name="calendar" size={14} />
        </button>
        {open && (
          <ReschedulePopover
            onChoose={(c) => { setOpenPopId(null); onReschedule(action.id, c); }}
          />
        )}
      </div>
      <div className="today-rowactions">
        <button type="button" className="today-rowactions__btn" title="More" aria-label="More">
          <Icon name="dots" size={14} />
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// Zoe suggestions panel
// ─────────────────────────────────────────────────────────

interface ZoePanelProps {
  suggestions: SchedulingSuggestionData[];
  actionsById: Map<string, ActionData>;
  onAcceptAll: () => void;
  onAccept: (s: SchedulingSuggestionData) => void;
  onDismissAll: () => void;
  onDismissOne: (actionId: string) => void;
}

const ZoePanel: React.FC<ZoePanelProps> = ({
  suggestions, actionsById, onAcceptAll, onAccept, onDismissAll, onDismissOne,
}) => {
  const visible = suggestions.slice(0, 3);
  return (
    <div className="today-zoe-panel">
      <div className="today-zoe-panel__head">
        <div className="today-zoe-panel__glyph">
          <Icon name="sparkles" size={12} />
        </div>
        <div>
          <div className="today-zoe-panel__title">{suggestions.length} suggestions from Zoe</div>
          <div className="today-zoe-panel__sub">Based on your calendar, energy, and priorities for today.</div>
        </div>
        <div className="today-zoe-panel__spacer" />
        <button type="button" className="today-zoe-panel__cta" onClick={onAcceptAll}>
          Accept all
        </button>
        <button
          type="button"
          className="today-rowactions__btn"
          onClick={onDismissAll}
          title="Dismiss"
          aria-label="Dismiss suggestions panel"
        >
          <Icon name="close" size={13} />
        </button>
      </div>
      <div>
        {visible.map((s) => {
          const action = actionsById.get(s.actionId);
          const date = new Date(`${s.suggestedDate}T${s.suggestedTime}`);
          const today = new Date();
          const tomorrow = addDays(today, 1);
          const isToday = date.toDateString() === today.toDateString();
          const isTomorrow = date.toDateString() === tomorrow.toDateString();
          const timeStr = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
          const dateLabel = isToday ? "today" : isTomorrow ? "tomorrow" : date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
          return (
            <div key={s.actionId} className="today-zoe-sug">
              <div className="today-zoe-sug__text">
                Move <b>{action?.name ?? "this action"}</b> to <b>{dateLabel} {timeStr}</b>
                {s.reasoning ? <> — {s.reasoning}</> : null}
              </div>
              <div className="today-zoe-sug__prop">
                {dateLabel === "today" ? "Today" : dateLabel === "tomorrow" ? "Tomorrow" : dateLabel} {timeStr}
              </div>
              <div className="today-zoe-sug__btns">
                <button
                  type="button"
                  className="today-zoe-sug__btn today-zoe-sug__btn--accept"
                  onClick={() => onAccept(s)}
                  title="Accept"
                  aria-label="Accept suggestion"
                >
                  <Icon name="check" size={14} />
                </button>
                <button
                  type="button"
                  className="today-zoe-sug__btn"
                  onClick={() => onDismissOne(s.actionId)}
                  title="Dismiss"
                  aria-label="Dismiss suggestion"
                >
                  <Icon name="close" size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// Timeline rail
// ─────────────────────────────────────────────────────────

interface TimelineRailProps {
  dayLabel: string;
  eventsCount: number;
  focusCount: number;
  blocks: RailBlock[];
  range: [number, number];
  now: number;
}

const TimelineRail: React.FC<TimelineRailProps> = ({
  dayLabel, eventsCount, focusCount, blocks, range, now,
}) => {
  const [start, end] = range;
  const hourHeight = 48;
  return (
    <aside className="today-rail">
      <div className="today-rail__head">
        <div>
          <div className="today-rail__date">{dayLabel}</div>
          <div className="today-rail__sub">
            {eventsCount} event{eventsCount === 1 ? "" : "s"} · {focusCount} focus block{focusCount === 1 ? "" : "s"}
          </div>
        </div>
        <span className="today-rail__today">Today</span>
      </div>
      <div className="today-rail__hours" style={{ position: "relative", height: (end - start) * hourHeight }}>
        {Array.from({ length: end - start }, (_, i) => {
          const hr = start + i;
          return (
            <div
              key={i}
              className="today-rail__hour"
              data-hour={formatHourLabel(hr)}
              style={{ top: i * hourHeight }}
            />
          );
        })}
        {blocks.map((ev) => {
          const clampedStart = Math.max(ev.start, start);
          const clampedEnd = Math.min(ev.end, end);
          if (clampedEnd <= clampedStart) return null;
          return (
            <div
              key={ev.id}
              className={`today-rail__block today-rail__block--${ev.kind}`}
              style={{
                top: (clampedStart - start) * hourHeight + 2,
                height: (clampedEnd - clampedStart) * hourHeight - 4,
              }}
            >
              <div>{ev.title}</div>
              <div className="today-rail__block-time">
                {formatHourMinute12(ev.start)} – {formatHourMinute12(ev.end)}
              </div>
            </div>
          );
        })}
        {now >= start && now <= end && (
          <div className="today-rail__now" style={{ top: (now - start) * hourHeight }} />
        )}
      </div>
    </aside>
  );
};

// ─────────────────────────────────────────────────────────
// Main view
// ─────────────────────────────────────────────────────────

interface TodayViewProps {
  onBulkReschedule?: () => void;
  tagIds?: string[];
}

export function TodayView({ onBulkReschedule, tagIds }: TodayViewProps) {
  const router = useRouter();
  const { workspace, workspaceId } = useWorkspace();
  const utils = api.useUtils();
  const { actionIdFromUrl, setActionId, clearActionId } = useActionDeepLink();
  const detailedEnabled = useDetailedActionsEnabled();

  const [openPopId, setOpenPopId] = useState<string | null>(null);
  const [overdueOpen, setOverdueOpen] = useState(true);
  const [zoeOpen, setZoeOpen] = useState(true);
  const [completing, setCompleting] = useState<Record<string, boolean>>({});
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());
  const [selectedAction, setSelectedAction] = useState<ActionData | null>(null);
  const [editModalOpened, setEditModalOpened] = useState(false);
  const [now, setNow] = useState<number>(() => hourFloat(new Date()));

  const rootRef = useRef<HTMLDivElement>(null);

  // Tick the now line every minute
  useEffect(() => {
    const id = window.setInterval(() => setNow(hourFloat(new Date())), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Close popovers on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(e.target as Node)) return;
      setOpenPopId(null);
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  // Data fetching — /today spans all workspaces the user belongs to, since the
  // route is not workspace-scoped.
  const actionsQuery = api.action.getAll.useQuery(
    {},
    { enabled: true },
  );

  const calendarEventsQuery = api.calendar.getTodayEvents.useQuery(
    undefined,
    { retry: false, refetchOnWindowFocus: false },
  );

  // Filter actions into overdue + today
  const { overdueActions, todayActions, todayOverallMap } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = addDays(today, 1);

    const rawAll = actionsQuery.data ?? [];
    const all = tagIds && tagIds.length > 0
      ? rawAll.filter((a) => a.tags?.some((at) => tagIds.includes(at.tagId.toString())))
      : rawAll;
    const overall = new Map<string, ActionData>();
    for (const a of all) overall.set(a.id, a);

    const overdue: ActionData[] = [];
    const todays: ActionData[] = [];

    for (const a of all) {
      if (a.status !== "ACTIVE") continue;
      if (!a.scheduledStart) continue;
      const scheduled = new Date(a.scheduledStart);
      const normalized = new Date(scheduled);
      normalized.setHours(0, 0, 0, 0);
      if (normalized < today) {
        overdue.push(a);
      } else if (normalized.getTime() === today.getTime() && scheduled < tomorrow) {
        todays.push(a);
      }
    }

    // Also include actions with dueDate today but no scheduledStart
    for (const a of all) {
      if (a.status !== "ACTIVE") continue;
      if (a.scheduledStart) continue;
      if (!a.dueDate) continue;
      const d = new Date(a.dueDate);
      const normalized = new Date(d);
      normalized.setHours(0, 0, 0, 0);
      if (normalized.getTime() === today.getTime()) {
        todays.push(a);
      }
    }

    return { overdueActions: overdue, todayActions: todays, todayOverallMap: overall };
  }, [actionsQuery.data, tagIds]);

  const hasOverdue = overdueActions.length > 0;

  // Scheduling suggestions
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
      const today = new Date();
      const tomorrow = addDays(today, 1);
      const isToday = date.toDateString() === today.toDateString();
      const isTomorrow = date.toDateString() === tomorrow.toDateString();
      const timeStr = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      const label = isToday ? `Today ${timeStr}` : isTomorrow ? `Tomorrow ${timeStr}` : `${date.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" })} ${timeStr}`;
      m.set(s.actionId, label);
    }
    return m;
  }, [activeSuggestions]);

  // Timeline rail blocks
  const railBlocks: RailBlock[] = useMemo(() => {
    const blocks: RailBlock[] = [];

    // Calendar events
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

    // Scheduled actions (shown as task blocks on the rail)
    for (const a of todayActions) {
      if (!a.scheduledStart) continue;
      const s = new Date(a.scheduledStart);
      const durationMinutes = a.duration ?? 60;
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
  }, [calendarEventsQuery.data, todayActions]);

  const eventsCount = (calendarEventsQuery.data ?? []).length;
  const focusCount = railBlocks.filter((b) => b.kind === "focus").length;

  const dayLabel = useMemo(() => {
    const d = new Date();
    const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${DOW[d.getDay()]} · ${MON[d.getMonth()]} ${d.getDate()}`;
  }, []);

  // Mutations
  const updateMutation = api.action.update.useMutation({
    onMutate: async ({ id, status, scheduledStart, dueDate }) => {
      await utils.action.getAll.cancel();
      const prev = utils.action.getAll.getData({});
      if (prev) {
        utils.action.getAll.setData({}, (old) => {
          if (!old) return [];
          return old.map((a) => {
            if (a.id !== id) return a;
            return {
              ...a,
              ...(status !== undefined ? { status } : {}),
              ...(scheduledStart !== undefined ? { scheduledStart } : {}),
              ...(dueDate !== undefined ? { dueDate } : {}),
            };
          });
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.action.getAll.setData({}, ctx.prev);
      notifications.show({ title: "Update failed", message: "Could not update action.", color: "red" });
    },
    onSettled: () => {
      void utils.action.getAll.invalidate();
      void utils.action.getToday.invalidate();
      void utils.scoring.getTodayScore.invalidate();
    },
  });

  const bulkRescheduleMutation = api.action.bulkReschedule.useMutation({
    onSettled: () => {
      void utils.action.getAll.invalidate();
      void utils.action.getToday.invalidate();
    },
  });

  // Action handlers
  const handleComplete = (id: string) => {
    setCompleting((c) => ({ ...c, [id]: true }));
    const action = todayOverallMap.get(id);
    window.setTimeout(() => {
      const nextStatus = action?.status === "COMPLETED" ? "ACTIVE" : "COMPLETED";
      updateMutation.mutate({
        id,
        status: nextStatus,
        ...(action?.projectId ? { kanbanStatus: nextStatus === "COMPLETED" ? "DONE" : "TODO" } : {}),
      });
    }, 350);
    window.setTimeout(() => setCompleting((c) => ({ ...c, [id]: false })), 600);
  };

  const handleReschedule = (id: string, choice: RescheduleChoice) => {
    const newDate = choice.date ?? null;
    updateMutation.mutate({
      id,
      scheduledStart: newDate,
      dueDate: newDate,
    });
    notifications.show({
      title: "Rescheduled",
      message: newDate ? `Moved to ${choice.label}` : "Due date removed",
      color: "blue",
      autoClose: 2000,
    });
  };

  const handleOpenAction = (a: ActionData) => {
    if (detailedEnabled && workspace?.slug) {
      router.push(`/w/${workspace.slug}/actions/${a.id}`);
      return;
    }
    setSelectedAction(a);
    setEditModalOpened(true);
    setActionId(a.id);
  };

  const handleAcceptSuggestion = (s: SchedulingSuggestionData) => {
    const [h, m] = s.suggestedTime.split(":").map(Number);
    const when = new Date(`${s.suggestedDate}T00:00:00`);
    when.setHours(h ?? 9, m ?? 0, 0, 0);
    updateMutation.mutate({
      id: s.actionId,
      scheduledStart: when,
      dueDate: when,
    });
    setDismissedSuggestions((prev) => new Set([...prev, s.actionId]));
  };

  const handleAcceptAllSuggestions = () => {
    for (const s of activeSuggestions) handleAcceptSuggestion(s);
  };

  const handleBulkReschedule = () => {
    if (onBulkReschedule) {
      onBulkReschedule();
      return;
    }
    const tomorrow = addDays(new Date(), 1);
    tomorrow.setHours(9, 0, 0, 0);
    bulkRescheduleMutation.mutate(
      { actionIds: overdueActions.map((a) => a.id), dueDate: tomorrow },
      {
        onSuccess: (data) =>
          notifications.show({
            title: "Bulk reschedule complete",
            message: `Rescheduled ${data.count} action${data.count === 1 ? "" : "s"} to tomorrow`,
            color: "green",
          }),
      },
    );
  };

  // Handle deep-link action open (only when not using detailed actions)
  useEffect(() => {
    if (!actionIdFromUrl || detailedEnabled) return;
    const a = todayOverallMap.get(actionIdFromUrl);
    if (a) {
      setSelectedAction(a);
      setEditModalOpened(true);
    }
  }, [actionIdFromUrl, detailedEnabled, todayOverallMap]);

  const isLoading = actionsQuery.isLoading;

  return (
    <div className="today-page" ref={rootRef}>
      <div className="today-v1">
        <div className="today-v1__main">
          {/* Overdue section */}
          {hasOverdue && (
            <>
              <div className="today-section">
                <button
                  type="button"
                  className={`today-section__chev ${overdueOpen ? "" : "collapsed"}`}
                  onClick={() => setOverdueOpen((o) => !o)}
                  aria-label={overdueOpen ? "Collapse overdue" : "Expand overdue"}
                >
                  <Icon name="chevDown" size={14} />
                </button>
                <span className="today-section__title">Overdue</span>
                <span className="today-section__count-bad">{overdueActions.length}</span>
                {activeSuggestions.length > 0 && (
                  <button
                    type="button"
                    className="today-section__ai"
                    onClick={() => setZoeOpen((o) => !o)}
                  >
                    <Icon name="sparkles" size={11} /> {activeSuggestions.length} AI SUGGESTIONS
                  </button>
                )}
                <span className="today-section__spacer" />
                <button type="button" className="today-section__action" onClick={handleBulkReschedule}>
                  <Icon name="arrow" size={12} /> Bulk reschedule
                </button>
              </div>

              {overdueOpen && (
                <>
                  {zoeOpen && activeSuggestions.length > 0 && (
                    <ZoePanel
                      suggestions={activeSuggestions}
                      actionsById={todayOverallMap}
                      onAcceptAll={handleAcceptAllSuggestions}
                      onAccept={handleAcceptSuggestion}
                      onDismissAll={() => setZoeOpen(false)}
                      onDismissOne={(id) =>
                        setDismissedSuggestions((prev) => new Set([...prev, id]))
                      }
                    />
                  )}
                  <div onClick={(e) => e.stopPropagation()}>
                    {overdueActions.map((a) => (
                      <ActionRow
                        key={a.id}
                        action={a}
                        isDone={a.status === "COMPLETED"}
                        isCompleting={!!completing[a.id]}
                        showOverdueChip
                        openPopId={openPopId}
                        setOpenPopId={setOpenPopId}
                        suggestionProposal={suggestionProposalByActionId.get(a.id)}
                        onComplete={handleComplete}
                        onReschedule={handleReschedule}
                        onOpen={handleOpenAction}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* Active section */}
          <div className="today-section" style={{ marginTop: hasOverdue ? 24 : 0 }}>
            <span
              className="today-section__title"
              style={{ fontSize: 12.5, fontWeight: 500, color: "var(--color-text-muted)", textTransform: "none", letterSpacing: 0 }}
            >
              Show: Active
            </span>
            <span className="today-section__spacer" />
            <button type="button" className="today-section__action">Bulk edit</button>
          </div>

          <div onClick={(e) => e.stopPropagation()}>
            {isLoading && todayActions.length === 0 ? (
              <div style={{ padding: 24, color: "var(--color-text-muted)", fontSize: 13 }}>Loading…</div>
            ) : todayActions.length === 0 ? (
              <div style={{ padding: 24, color: "var(--color-text-muted)", fontSize: 13 }}>
                No active actions for today.
              </div>
            ) : (
              todayActions.map((a) => (
                <ActionRow
                  key={a.id}
                  action={a}
                  isDone={a.status === "COMPLETED"}
                  isCompleting={!!completing[a.id]}
                  showOverdueChip={false}
                  openPopId={openPopId}
                  setOpenPopId={setOpenPopId}
                  onComplete={handleComplete}
                  onReschedule={handleReschedule}
                  onOpen={handleOpenAction}
                />
              ))
            )}
          </div>
        </div>

        <TimelineRail
          dayLabel={dayLabel}
          eventsCount={eventsCount}
          focusCount={focusCount}
          blocks={railBlocks}
          range={[8, 20]}
          now={now}
        />
      </div>

      <div style={{ marginTop: 24 }}>
        <CreateActionModal viewName="today" />
      </div>

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

export default TodayView;
