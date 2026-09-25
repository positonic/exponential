"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  IconActivity,
  IconChecklist,
  IconFileText,
  IconLayersIntersect,
  IconMessage,
  IconPlus,
  IconTargetArrow,
} from "@tabler/icons-react";
import { ActionIcon } from "@mantine/core";
import { format, formatDistanceToNow, isAfter, isBefore, isSameDay, startOfDay } from "date-fns";
import { api, type RouterOutputs } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { ProjectTimeline } from "./ProjectTimeline";
import { CreateGoalModal } from "./CreateGoalModal";
import { CreateActionModal } from "./CreateActionModal";
import styles from "./ProjectOverview.module.css";

type Project = NonNullable<RouterOutputs["project"]["getById"]>;
type Goal = RouterOutputs["goal"]["getProjectGoals"][number];
type ActivityRow = RouterOutputs["project"]["getRecentActivity"][number];

interface ProjectOverviewProps {
  project: Project;
  goals: Goal[];
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

export function ProjectOverview({ project, goals }: ProjectOverviewProps) {

  const { data: actions = [] } = api.action.getProjectActions.useQuery({ projectId: project.id });
  const { data: activity = [] } = api.project.getRecentActivity.useQuery({
    projectId: project.id,
    sinceDays: 7,
    limit: 12,
  });
  const transcriptions = project.transcriptionSessions ?? [];
  const { workspace } = useWorkspace();
  const { data: docs = [] } = api.page.list.useQuery(
    { workspaceId: workspace?.id ?? "", projectId: project.id },
    { enabled: !!workspace },
  );

  const weekStart = useMemo(() => startOfThisWeek(), []);
  const weekEnd = useMemo(() => endOfThisWeek(), []);
  const today = useMemo(() => startOfDay(new Date()), []);

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
          <CreateGoalModal projectId={project.id}>
            <ActionIcon variant="subtle" size="sm" aria-label="Add goal">
              <IconPlus size={14} />
            </ActionIcon>
          </CreateGoalModal>
        </div>
        <div className={styles.sectionBody}>
          {goals.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>
                <IconTargetArrow size={16} />
              </div>
              <div>No goal linked yet — link one to see alignment here.</div>
              <CreateGoalModal projectId={project.id}>
                <button type="button" className={styles.emptyCta}>
                  <IconPlus size={12} />
                  Add a goal
                </button>
              </CreateGoalModal>
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
        <ProjectTimeline projectId={project.id} />
      </section>

      {/* ── 3. This week ────────────────────────────────── */}
      <div className={styles.twoCol}>
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionTitle}>
              <IconChecklist size={14} className={styles.sectionTitleIcon} />
              Actions this week
              <span className={styles.sectionMeta}>{actionsThisWeek.length}</span>
            </div>
            <CreateActionModal projectId={project.id} viewName={`project-${project.id}`}>
              <ActionIcon variant="subtle" size="sm" aria-label="Add action">
                <IconPlus size={14} />
              </ActionIcon>
            </CreateActionModal>
          </div>
          <div className={styles.sectionBodyFlush}>
            {actionsThisWeek.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}>
                  <IconChecklist size={16} />
                </div>
                <div>No actions due this week.</div>
                <CreateActionModal projectId={project.id} viewName={`project-${project.id}`}>
                  <button type="button" className={styles.emptyCta}>
                    <IconPlus size={12} />
                    Add an action
                  </button>
                </CreateActionModal>
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
                <Link
                  key={t.id}
                  href={`/recording/${t.id}`}
                  className={styles.standup}
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
                </Link>
              );
            })
          )}
        </div>
      </section>

      {/* ── 6. Docs ─────────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div className={styles.sectionTitle}>
            <IconFileText size={14} className={styles.sectionTitleIcon} />
            Docs
            <span className={styles.sectionMeta}>{docs.length}</span>
          </div>
        </div>
        <div className={styles.sectionBodyFlush}>
          {docs.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>
                <IconFileText size={16} />
              </div>
              <div>No docs linked to this project yet.</div>
            </div>
          ) : (
            docs.map((doc) => (
              <Link
                key={doc.id}
                href={`/w/${workspace?.slug ?? ""}/pages/${doc.id}`}
                className={`${styles.row} ${styles.rowLink}`}
              >
                <IconFileText size={16} className={styles.sectionTitleIcon} />
                <div className={styles.rowBody}>
                  <div className={styles.rowTitle}>{doc.title || "Untitled"}</div>
                  <div className={styles.rowSub}>
                    <span>
                      Edited {formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
