import { IconCalendar, IconClock } from "@tabler/icons-react";
import type { Action } from "~/lib/actions/types";
import { toVisualPriority } from "~/lib/actions/priority";
import { formatAprDay, formatClockTime } from "~/lib/actions/dates";
import { Checkbox } from "./Checkbox";
import { TagChip, tagTone } from "./TagChip";

interface TaskRowProps {
  action: Action;
  isOverdue?: boolean;
  focused?: boolean;
  onComplete: (id: string) => void;
  onOpen: (action: Action) => void;
  onReschedule?: (action: Action) => void;
  onTagClick?: (tagId: string) => void;
}

export function TaskRow({
  action,
  isOverdue = false,
  focused = false,
  onComplete,
  onOpen,
  onReschedule,
  onTagClick,
}: TaskRowProps) {
  const isDone = action.status === "COMPLETED" || action.status === "DONE";
  const visualPrio = toVisualPriority(action.priority, isOverdue);

  const scheduled = action.scheduledStart ? new Date(action.scheduledStart) : null;
  const due = action.dueDate ? new Date(action.dueDate) : null;

  const tags = action.tags?.map((t) => t.tag) ?? [];
  const primaryTag = tags[0];
  const fallbackTagLabel = action.project?.name ?? "Unassigned";
  const fallbackTone = action.project ? "ops" : "unas";

  return (
    <div
      className={[
        "td-task",
        focused ? "td-task--focused" : "",
        isDone ? "td-task--done" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onOpen(action)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(action);
      }}
    >
      <Checkbox
        done={isDone}
        focused={focused}
        priority={visualPrio}
        onClick={() => onComplete(action.id)}
        ariaLabel={`Mark ${action.name} as complete`}
      />
      <div className="td-task__body">
        <div className="td-task__title">{action.name}</div>
        <div className="td-task__meta">
          {due && (
            <span className="td-task__meta-item">
              <IconCalendar size={11} />
              {formatAprDay(due)}
            </span>
          )}
          {scheduled && (
            <span className="td-task__meta-item">
              <IconClock size={11} />
              {formatClockTime(scheduled)}
            </span>
          )}
          {primaryTag ? (
            <TagChip
              label={primaryTag.name}
              tone={tagTone(primaryTag.color)}
              onClick={onTagClick ? () => onTagClick(primaryTag.id) : undefined}
            />
          ) : (
            <TagChip label={fallbackTagLabel} tone={fallbackTone} />
          )}
        </div>
      </div>
      <button
        type="button"
        className="td-task__action"
        aria-label="Reschedule"
        onClick={(e) => {
          e.stopPropagation();
          onReschedule?.(action);
        }}
      >
        <IconCalendar size={14} />
      </button>
    </div>
  );
}
