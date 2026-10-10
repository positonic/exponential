import { useState } from "react";
import { IconAlertCircle, IconCalendar } from "@tabler/icons-react";
import type { Action } from "~/lib/actions/types";
import { toVisualPriority } from "~/lib/actions/priority";
import { formatAprDay } from "~/lib/actions/dates";
import { stripHtml } from "~/lib/utils";
import { HTMLContent } from "../HTMLContent";
import { ScheduledIndicator } from "../shared/ScheduledIndicator";
import {
  ReschedulePopover,
  type RescheduleChoice,
} from "../actions/components/ReschedulePopover";
import { Checkbox } from "./Checkbox";
import { TagChip, tagTone } from "./TagChip";

interface TaskRowProps {
  action: Action;
  isOverdue?: boolean;
  /** Relative age shown on overdue rows, e.g. "due 3d ago". Replaces the absolute due-date chip. */
  overdueLabel?: string;
  focused?: boolean;
  bulkMode?: boolean;
  bulkSelected?: boolean;
  onBulkToggle?: (id: string) => void;
  onComplete: (id: string) => void;
  onOpen: (action: Action) => void;
  onReschedule?: (id: string, choice: RescheduleChoice) => void;
  onTagClick?: (tagId: string) => void;
}

export function TaskRow({
  action,
  isOverdue = false,
  overdueLabel,
  focused = false,
  bulkMode = false,
  bulkSelected = false,
  onBulkToggle,
  onComplete,
  onOpen,
  onReschedule,
  onTagClick,
}: TaskRowProps) {
  const isDone = action.status === "COMPLETED" || action.status === "DONE";
  const visualPrio = toVisualPriority(action.priority, isOverdue);

  const due = action.dueDate ? new Date(action.dueDate) : null;

  const tags = action.tags?.map((t) => t.tag) ?? [];
  const primaryTag = tags[0];
  const fallbackTagLabel = action.project?.name ?? "Unassigned";
  const fallbackTone = action.project ? "ops" : "unas";

  const [popOpen, setPopOpen] = useState(false);
  const plainName = stripHtml(action.name);

  const handleRowClick = () => {
    if (bulkMode) {
      onBulkToggle?.(action.id);
      return;
    }
    onOpen(action);
  };

  return (
    <div
      className={[
        "td-task",
        bulkMode ? "td-task--bulk" : "",
        bulkMode && bulkSelected ? "td-task--bulk-selected" : "",
        focused ? "td-task--focused" : "",
        isDone ? "td-task--done" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={handleRowClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") handleRowClick();
      }}
    >
      {bulkMode && (
        <input
          type="checkbox"
          className="td-task__bulk-check"
          checked={bulkSelected}
          onChange={() => onBulkToggle?.(action.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${plainName}`}
        />
      )}
      <Checkbox
        done={isDone}
        focused={focused}
        priority={visualPrio}
        onClick={() => onComplete(action.id)}
        ariaLabel={`Mark ${plainName} as complete`}
      />
      <div className="td-task__body">
        <div className="td-task__title">
          <HTMLContent html={action.name} compactUrls />
        </div>
        <div className="td-task__meta">
          {isOverdue && overdueLabel ? (
            <span className="td-task__meta-item td-task__meta-item--overdue">
              <IconAlertCircle size={11} />
              {overdueLabel}
            </span>
          ) : (
            due && (
              <span className="td-task__meta-item">
                <IconCalendar size={11} />
                {formatAprDay(due)}
              </span>
            )
          )}
          <ScheduledIndicator
            action={action}
            className="td-task__meta-item"
            unscheduledClassName="td-task__meta-item--unscheduled"
          />
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
      <div
        className="td-task__reschedule"
        onClick={(e) => e.stopPropagation()}
      >
        {isOverdue && !bulkMode && onReschedule && (
          <button
            type="button"
            className="td-task__quick"
            onClick={(e) => {
              e.stopPropagation();
              onReschedule(action.id, {
                id: "today",
                label: "Today",
                date: new Date(),
              });
            }}
          >
            Today
          </button>
        )}
        <button
          type="button"
          className="td-task__action"
          aria-label="Reschedule"
          onClick={(e) => {
            e.stopPropagation();
            setPopOpen((v) => !v);
          }}
        >
          <IconCalendar size={14} />
        </button>
        {popOpen && (
          <ReschedulePopover
            onChoose={(c) => {
              setPopOpen(false);
              onReschedule?.(action.id, c);
            }}
          />
        )}
      </div>
    </div>
  );
}
