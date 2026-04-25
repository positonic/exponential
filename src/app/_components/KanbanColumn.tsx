"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { IconDots, IconPlus } from "@tabler/icons-react";
import { TaskCard } from "./TaskCard";
import styles from "./ProjectTasks.module.css";

type ActionStatus = "BACKLOG" | "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "CANCELLED";
type ColumnAccent = "slate" | "brand" | "amber" | "violet" | "green" | "red";

interface Task {
  id: string;
  name: string;
  description?: string | null;
  dueDate?: Date | null;
  kanbanStatus?: ActionStatus | null;
  priority: string;
  projectId?: string | null;
  kanbanOrder?: number | null;
  assignees: Array<{
    user: {
      id: string;
      name: string | null;
      email: string | null;
      image: string | null;
    };
  }>;
  project?: {
    id: string;
    name: string;
  } | null;
  lists?: Array<{
    listId: string;
    list: {
      id: string;
      name: string;
    };
  }>;
}

interface KanbanColumnProps {
  id: string;
  title: string;
  accent: ColumnAccent;
  tasks: Task[];
  dragOverTaskId?: string | null;
  onActionOpen?: (id: string) => void;
}

const ACCENT_CLASS: Record<ColumnAccent, string> = {
  slate: styles.kcolSlate!,
  brand: styles.kcolBrand!,
  amber: styles.kcolAmber!,
  violet: styles.kcolViolet!,
  green: styles.kcolGreen!,
  red: styles.kcolRed!,
};

export function KanbanColumn({ id, title, accent, tasks, dragOverTaskId, onActionOpen }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  const taskIds = tasks.map((task) => task.id);
  const classes = [styles.kcol, ACCENT_CLASS[accent], isOver ? styles.kcolOver : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={setNodeRef}
      className={classes}
      role="region"
      aria-label={`${title} column with ${tasks.length} task${tasks.length !== 1 ? "s" : ""}`}
    >
      <div className={styles.kcolHead}>
        <div className={styles.kcolHeadLeft}>
          <span className={styles.kcolDot} aria-hidden="true" />
          <span className={styles.kcolLabel}>{title}</span>
          <span className={styles.kcolCount}>{tasks.length}</span>
        </div>
        <div className={styles.kcolHeadRight}>
          <button type="button" className={styles.kcolAdd} aria-label={`Add task to ${title}`}>
            <IconPlus size={12} />
          </button>
          <button type="button" className={styles.kcolMore} aria-label={`${title} column options`}>
            <IconDots size={13} />
          </button>
        </div>
      </div>

      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div className={styles.kcolBody}>
          {tasks.map((task) => (
            <div key={task.id}>
              {dragOverTaskId === task.id && (
                <div className={styles.kcolDropIndicator} aria-hidden="true" />
              )}
              <TaskCard task={task} onActionOpen={onActionOpen} />
            </div>
          ))}
          {tasks.length === 0 && (
            <div
              className={styles.kcolEmpty}
              role="region"
              aria-label={`Empty ${title.toLowerCase()} column. Drop tasks here to change their status.`}
            >
              Drop tasks here
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}
