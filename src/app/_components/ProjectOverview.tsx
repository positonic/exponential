"use client";

import { useMemo, useState } from "react";
import {
  IconActivity,
  IconCalendarEvent,
  IconChecklist,
  IconLayersIntersect,
  IconMessage,
  IconTargetArrow,
} from "@tabler/icons-react";
import { format, formatDistanceToNow, isAfter, isBefore, isSameDay, startOfDay } from "date-fns";
import { api, type RouterOutputs } from "~/trpc/react";
import { OutcomeTimeline } from "./OutcomeTimeline";
import { TranscriptionDetailsModal } from "./TranscriptionDetailsModal";
import styles from "./ProjectOverview.module.css";

type Project = NonNullable<RouterOutputs["project"]["getById"]>;
type Goal = RouterOutputs["goal"]["getProjectGoals"][number];
type Outcome = RouterOutputs["outcome"]["getProjectOutcomes"][number];
type ActivityRow = RouterOutputs["project"]["getRecentActivity"][number];
type Transcription = NonNullable<Project["transcriptionSessions"]>[number];

interface ProjectOverviewProps {
  project: Project;
  goals: Goal[];
  outcomes: Outcome[];
}

const STANDUP_NOTES_PREVIEW_CHARS = 200;

function startOfThisWeek(): Date {
  const today = startOfDay(new Date());
  const day = today.getDay(); // 0=Sun … 6=Sat
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - diffToMonday);
  return monday;
}

function endOfThisWeek(): Date {
  const monday = startOfThisWeek();
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);
  return sunday;
}

function formatRelativeDay(date: Date): string {
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  if (isSameDay(target, today)) return "Today";
  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  return format(date, "EEE MMM d");
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase() || "?";
}

function healthClass(health: string | null | undefined): string {
  switch (health) {
    case "on-track":
      return styles.healthOnTrack!;
    case "at-risk":
      return styles.healthAtRisk!;
    case "off-track":
      return styles.healthOffTrack!;
    default:
      return styles.healthNoUpdate!;
  }
}

function healthLabel(health: string | null | undefined): string {
  switch (health) {
    case "on-track":
      return "On track";
    case "at-risk":
      return "At risk";
    case "off-track":
      return "Off track";
    default:
      return "No update";
  }
}

function activityDotClass(type: string): string {
  switch (type) {
    case "STATUS_CHANGED":
      return styles.activityDotStatus!;
    case "DUE_DATE_CHANGED":
      return styles.activityDotDue!;
    case "ASSIGNEE_CHANGED":
      return styles.activityDotAssignee!;
    case "ACTION_CREATED":
      return styles.activityDotCreated!;
    case "ACTION_DELETED":
      return styles.activityDotDeleted!;
    default:
      return "";
  }
}

function describeActivity(row: ActivityRow): { verb: string; target: string | null; detail: string | null } {
  const targetName = row.action?.name ?? row.fromValue ?? null;
  switch (row.type) {
    case "STATUS_CHANGED":
      return {
        verb: "moved",
        target: targetName,
        detail: row.fromValue && row.toValue ? `${row.fromValue} → ${row.toValue}` : row.toValue,
      };
    case "DUE_DATE_CHANGED": {
      const fromLabel = row.fromValue ? format(new Date(row.fromValue), "MMM d") : "no date";
      const toLabel = row.toValue ? format(new Date(row.toValue), "MMM d") : "no date";
      return {
        verb: "rescheduled",
        target: targetName,
        detail: `${fromLabel} → ${toLabel}`,
      };
    }
    case "ASSIGNEE_CHANGED":
      return { verb: "changed assignees on", target: targetName, detail: null };
    case "ACTION_CREATED":
      return { verb: "created", target: row.toValue ?? targetName, detail: null };
    case "ACTION_DELETED":
      return { verb: "deleted", target: row.fromValue ?? targetName, detail: null };
    default:
      return { verb: row.type, target: targetName, detail: null };
  }
}

export function ProjectOverview({ project, goals, outcomes }: ProjectOverviewProps) {
  const [openTranscription, setOpenTranscription] = useState<Transcription | null>(null);

  const { data: actions = [] } = api.action.getProjectActions.useQuery({ projectId: project.id });
  const { data: activity = [] } = api.project.getRecentActivity.useQuery({
    projectId: project.id,
    sinceDays: 7,
    limit: 12,
  });
  const transcriptions = project.transcriptionSessions ?? [];

  const weekStart = useMemo(() => startOfThisWeek(), []);
  const weekEnd = useMemo(() => endOfThisWeek(), []);
  const today = useMemo(() => startOfDay(new Date()), []);

  const outcomesThisWeek = useMemo(
    () =>
      outcomes
        .filter((o) => o.dueDate && isAfter(new Date(o.dueDate), new Date(weekStart.getTime() - 1)) && isBefore(new Date(o.dueDate), weekEnd))
        .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()),
    [outcomes, weekStart, weekEnd],
  );

  const actionsThisWeek = useMemo(() => {
    return actions
      .filter((a) => {
        if (a.status === "COMPLETED") return false;
        if (!a.dueDate) return false;
        const due = new Date(a.dueDate);
        const isOverdue = isBefore(due, today);
        const inWeek = isAfter(due, new Date(weekStart.getTime() - 1)) && isBefore(due, weekEnd);
        return isOverdue || inWeek;
      })
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
  }, [actions, weekStart, weekEnd, today]);

  const standupTranscriptions = transcriptions.slice(0, 3);

  return (
    <div className={styles.dashboard}>
      {/* ── 1. OKR alignment strip ──────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div className={styles.sectionTitle}>
            <IconTargetArrow size={14} className={styles.sectionTitleIcon} />
            OKR alignment
            <span className={styles.sectionMeta}>{goals.length}</span>
          </div>
        </div>
        <div className={styles.sectionBody}>
          {goals.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>
                <IconTargetArrow size={16} />
              </div>
              <div>No goal linked yet — link one to see alignment here.</div>
            </div>
          ) : (
            <div className={styles.okrStrip}>
              {goals.map((goal) => (
                <div key={goal.id} className={styles.okrChip}>
                  <div className={styles.okrChipTop}>
                    <span className={styles.okrChipTitle}>{goal.title}</span>
                    <span className={`${styles.healthBadge} ${healthClass(goal.health)}`}>
                      {healthLabel(goal.health)}
                    </span>
                  </div>
                  <div className={styles.okrChipSub}>
                    {goal.period && <span>{goal.period}</span>}
                    {goal.dueDate && <span>Due {format(new Date(goal.dueDate), "MMM d")}</span>}
                    {goal.lifeDomain?.title && <span>{goal.lifeDomain.title}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── 2. Timeline ─────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div className={styles.sectionTitle}>
            <IconLayersIntersect size={14} className={styles.sectionTitleIcon} />
            Timeline
          </div>
        </div>
        <OutcomeTimeline projectId={project.id} />
      </section>

      {/* ── 3. This week ────────────────────────────────── */}
      <div className={styles.twoCol}>
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionTitle}>
              <IconCalendarEvent size={14} className={styles.sectionTitleIcon} />
              Outcomes this week
              <span className={styles.sectionMeta}>{outcomesThisWeek.length}</span>
            </div>
          </div>
          <div className={styles.sectionBodyFlush}>
            {outcomesThisWeek.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}>
                  <IconCalendarEvent size={16} />
                </div>
                <div>Nothing due this week.</div>
              </div>
            ) : (
              outcomesThisWeek.map((o) => (
                <div key={o.id} className={styles.row}>
                  <div className={styles.rowBody}>
                    <div className={styles.rowTitle}>{o.description}</div>
                    <div className={styles.rowSub}>
                      {o.type && <span>{o.type}</span>}
                      {o.dueDate && <span className={styles.rowDue}>{formatRelativeDay(new Date(o.dueDate))}</span>}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionTitle}>
              <IconChecklist size={14} className={styles.sectionTitleIcon} />
              Actions this week
              <span className={styles.sectionMeta}>{actionsThisWeek.length}</span>
            </div>
          </div>
          <div className={styles.sectionBodyFlush}>
            {actionsThisWeek.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}>
                  <IconChecklist size={16} />
                </div>
                <div>No actions due this week.</div>
              </div>
            ) : (
              actionsThisWeek.map((a) => {
                const due = a.dueDate ? new Date(a.dueDate) : null;
                const overdue = due ? isBefore(due, today) : false;
                const firstAssignee = a.assignees?.[0]?.user;
                return (
                  <div key={a.id} className={styles.row}>
                    {firstAssignee && (
                      <span className={styles.rowAvatar} aria-label={firstAssignee.name ?? "Assignee"}>
                        {getInitials(firstAssignee.name)}
                      </span>
                    )}
                    <div className={styles.rowBody}>
                      <div className={styles.rowTitle}>{a.name}</div>
                      <div className={styles.rowSub}>
                        <span>{a.priority ?? "Action"}</span>
                        {due && (
                          <span className={`${styles.rowDue} ${overdue ? styles.rowDueOverdue : ""}`}>
                            {overdue ? "Overdue · " : ""}
                            {formatRelativeDay(due)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* ── 4. What shifted this week ───────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div className={styles.sectionTitle}>
            <IconActivity size={14} className={styles.sectionTitleIcon} />
            What shifted this week
            <span className={styles.sectionMeta}>{activity.length}</span>
          </div>
        </div>
        <div className={styles.sectionBodyFlush}>
          {activity.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>
                <IconActivity size={16} />
              </div>
              <div>No changes recorded in the last 7 days.</div>
            </div>
          ) : (
            activity.map((row) => {
              const { verb, target, detail } = describeActivity(row);
              const actor = row.changedBy?.name ?? "Someone";
              return (
                <div key={row.id} className={styles.activityRow}>
                  <span className={`${styles.activityDot} ${activityDotClass(row.type)}`} />
                  <div className={styles.activityBody}>
                    <span className={styles.activityActor}>{actor}</span>
                    <span className={styles.activityVerb}> {verb} </span>
                    {target && <span className={styles.activityTarget}>{target}</span>}
                    {detail && <span className={styles.activityVerb}> · {detail}</span>}
                    <div className={styles.activityMeta}>
                      {formatDistanceToNow(new Date(row.changedAt), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* ── 5. Recent standups ──────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div className={styles.sectionTitle}>
            <IconMessage size={14} className={styles.sectionTitleIcon} />
            Recent standups
            <span className={styles.sectionMeta}>{standupTranscriptions.length}</span>
          </div>
        </div>
        <div className={styles.sectionBodyFlush}>
          {standupTranscriptions.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>
                <IconMessage size={16} />
              </div>
              <div>No standups recorded yet.</div>
            </div>
          ) : (
            standupTranscriptions.map((t) => {
              const notesPreview = t.notes
                ? t.notes.slice(0, STANDUP_NOTES_PREVIEW_CHARS) +
                  (t.notes.length > STANDUP_NOTES_PREVIEW_CHARS ? "…" : "")
                : null;
              const dateLabel = t.meetingDate
                ? format(new Date(t.meetingDate), "MMM d, yyyy")
                : t.processedAt
                  ? format(new Date(t.processedAt), "MMM d, yyyy")
                  : "";
              const liveActions = t.actions.filter((a) => a.status !== "DELETED").length;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={styles.standup}
                  onClick={() => setOpenTranscription(t)}
                >
                  <div className={styles.standupTop}>
                    <span className={styles.standupTitle}>{t.title ?? "Standup"}</span>
                    <span className={styles.standupDate}>{dateLabel}</span>
                  </div>
                  {notesPreview && <div className={styles.standupNotes}>{notesPreview}</div>}
                  {liveActions > 0 && (
                    <span className={styles.standupActionPill}>
                      {liveActions} action{liveActions === 1 ? "" : "s"} extracted
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </section>

      <TranscriptionDetailsModal
        opened={!!openTranscription}
        onClose={() => setOpenTranscription(null)}
        transcription={openTranscription}
        onTranscriptionUpdate={(updated) => setOpenTranscription(updated as Transcription)}
      />
    </div>
  );
}
