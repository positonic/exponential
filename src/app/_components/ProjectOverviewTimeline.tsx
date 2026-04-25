"use client";

import { useMemo, useState } from "react";
import { IconChevronRight } from "@tabler/icons-react";
import { format, isSameDay, startOfDay } from "date-fns";
import type { RouterOutputs } from "~/trpc/react";
import styles from "./ProjectOverview.module.css";

type Project = NonNullable<RouterOutputs["project"]["getById"]>;
type Goal = RouterOutputs["goal"]["getProjectGoals"][number];
type Outcome = RouterOutputs["outcome"]["getProjectOutcomes"][number];
type Action = RouterOutputs["action"]["getProjectActions"][number];

type PastSubItem = { text: string; done: boolean };
type TimelineItem =
  | {
      id: string;
      kind: "past";
      title: string;
      date: Date;
      expandable: true;
      sub: PastSubItem[];
    }
  | { id: "now"; kind: "now"; title: "Today"; date: Date }
  | { id: string; kind: "future"; title: string; date: Date };

interface Props {
  project: Project;
  goals: Goal[];
  outcomes: Outcome[];
  actions: Action[];
}

export function ProjectOverviewTimeline({ project, goals, outcomes, actions }: Props) {
  const items = useMemo<TimelineItem[]>(() => {
    const today = startOfDay(new Date());
    const list: TimelineItem[] = [];

    // Past group (expandable)
    const past: PastSubItem[] = [
      { text: "Project created", done: true },
    ];
    if (project.description && project.description.trim().length > 0) {
      past.push({ text: "Description added", done: true });
    }
    const completedActions = actions.filter((a) => a.status === "COMPLETED");
    for (const a of completedActions.slice(0, 3)) {
      past.push({ text: a.name, done: true });
    }

    list.push({
      id: "past",
      kind: "past",
      title: `${past.length} completed item${past.length === 1 ? "" : "s"}`,
      date: project.createdAt ?? new Date(),
      expandable: true,
      sub: past,
    });

    // Today marker
    list.push({ id: "now", kind: "now", title: "Today", date: today });

    // Upcoming goal / outcome due dates (next 3)
    type Upcoming = { id: string; title: string; date: Date };
    const upcoming: Upcoming[] = [];
    for (const g of goals) {
      if (g.dueDate && new Date(g.dueDate) >= today) {
        upcoming.push({ id: `goal-${g.id}`, title: `Goal: ${g.title}`, date: new Date(g.dueDate) });
      }
    }
    for (const o of outcomes) {
      if (o.dueDate && new Date(o.dueDate) >= today) {
        upcoming.push({
          id: `outcome-${o.id}`,
          title: `Outcome: ${o.description}`,
          date: new Date(o.dueDate),
        });
      }
    }
    upcoming.sort((a, b) => a.date.getTime() - b.date.getTime());
    for (const u of upcoming.slice(0, 3)) {
      list.push({ id: u.id, kind: "future", title: u.title, date: u.date });
    }

    // Project review date
    if (project.reviewDate && new Date(project.reviewDate) >= today) {
      list.push({
        id: "project-review",
        kind: "future",
        title: "Project review",
        date: new Date(project.reviewDate),
      });
    }

    return list;
  }, [project, goals, outcomes, actions]);

  // One group open at a time — default: past group open
  const [openId, setOpenId] = useState<string | null>("past");

  return (
    <div className={styles.timeline}>
      <div className={styles.timelineTrack}>
        {items.map((item) => {
          const isNow = item.kind === "now";
          const isFuture = item.kind === "future";
          const isExpandable = item.kind === "past";
          const isOpen = isExpandable && openId === item.id;

          const itemClass = [
            styles.tlItem,
            isNow ? styles.tlItemNow : "",
            isFuture ? styles.tlItemFuture : "",
          ]
            .filter(Boolean)
            .join(" ");

          const headerClass = [
            styles.tlItemHeader,
            isExpandable ? styles.tlItemHeaderClickable : "",
          ]
            .filter(Boolean)
            .join(" ");

          const dateLabel = isNow
            ? format(item.date, "MMMM d, yyyy")
            : format(item.date, "MMMM d, yyyy");

          return (
            <div key={item.id} className={itemClass}>
              <div className={styles.tlItemDot} />
              {isExpandable ? (
                <button
                  type="button"
                  className={headerClass}
                  onClick={() => setOpenId(isOpen ? null : item.id)}
                  aria-expanded={isOpen}
                >
                  <IconChevronRight
                    size={11}
                    className={`${styles.tlItemHeaderChev} ${
                      isOpen ? styles.tlItemHeaderChevOpen : ""
                    }`}
                  />
                  {item.title}
                </button>
              ) : (
                <div className={headerClass}>{item.title}</div>
              )}
              <div className={styles.tlItemDate}>
                {isSameDay(item.date, startOfDay(new Date())) && !isNow
                  ? "Today"
                  : dateLabel}
              </div>
              {isExpandable && isOpen && (
                <div className={styles.tlItemSub}>
                  {item.sub.map((s, idx) => (
                    <div
                      key={idx}
                      className={`${styles.tlSubItem} ${
                        s.done ? styles.tlSubItemDone : ""
                      }`}
                    >
                      <div className={styles.tlSubItemDot} />
                      {s.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
