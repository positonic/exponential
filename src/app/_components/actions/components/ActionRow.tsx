import { useState } from "react";
import { Tooltip } from "@mantine/core";
import { IconCalendar, IconClock, IconSparkles } from "@tabler/icons-react";
import { HTMLContent } from "../../HTMLContent";
import { TagBadgeList } from "../../TagBadge";
import { formatAprDay, formatClockTime } from "~/lib/actions/dates";
import type { Action } from "~/lib/actions/types";
import { PriorityCheckbox } from "./PriorityCheckbox";
import { ProjectChip } from "./ProjectChip";
import { SyncStatusIndicator } from "./SyncStatusIndicator";
import { RowAssignees } from "./RowAssignees";
import { RowCreatorBadge } from "./RowCreatorBadge";
import { RowActionsMenu } from "./RowActionsMenu";
import {
  ReschedulePopover,
  type RescheduleChoice,
} from "./ReschedulePopover";
import styles from "./ActionRow.module.css";

interface ActionRowProps {
  action: Action;
  isOverdue?: boolean;
  bulkMode?: boolean;
  bulkSelected?: boolean;
  onBulkToggle?: (id: string) => void;
  onComplete: (id: string) => void;
  onReschedule: (id: string, choice: RescheduleChoice) => void;
  onOpen: (action: Action) => void;
  onAssign?: (action: Action) => void;
  onListToggle?: (listId: string, isInList: boolean) => void;
  workspaceLists?: Array<{ id: string; name: string }>;
  suggestionProposal?: string;
  currentUserId?: string;
}

export function ActionRow({
  action,
  isOverdue = false,
  bulkMode = false,
  bulkSelected = false,
  onBulkToggle,
  onComplete,
  onReschedule,
  onOpen,
  onAssign,
  onListToggle,
  workspaceLists,
  suggestionProposal,
  currentUserId,
}: ActionRowProps) {
  const [popOpen, setPopOpen] = useState(false);
  const [completing, setCompleting] = useState(false);

  const isDone = action.status === "COMPLETED" || action.status === "DONE";
  const projectName = action.project?.name ?? "UNASSIGNED";
  const scheduled = action.scheduledStart
    ? new Date(action.scheduledStart)
    : null;
  const due = action.dueDate ? new Date(action.dueDate) : null;
  const timeSource = scheduled ?? due;
  const duration = (action as Action & { duration?: number | null }).duration;

  const tags = action.tags?.map((t) => t.tag) ?? [];

  const handleComplete = () => {
    setCompleting(true);
    window.setTimeout(() => onComplete(action.id), 350);
    window.setTimeout(() => setCompleting(false), 600);
  };

  const handleRowClick = () => {
    if (bulkMode) {
      onBulkToggle?.(action.id);
      return;
    }
    onOpen(action);
  };

  const className = [
    styles.row,
    bulkMode ? styles.rowBulk : "",
    isDone ? styles.done : "",
    completing ? styles.completing : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className} onClick={handleRowClick}>
      {bulkMode && (
        <input
          type="checkbox"
          className={styles.bulkCheck}
          checked={bulkSelected}
          onChange={() => onBulkToggle?.(action.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${action.name}`}
        />
      )}
      <PriorityCheckbox
        priority={action.priority}
        status={action.status}
        isOverdue={isOverdue}
        onToggle={handleComplete}
        ariaLabel={`Mark ${action.name} as complete`}
      />
      <div className={styles.body}>
        <div className={styles.title}>
          <HTMLContent html={action.name} compactUrls />
        </div>
        <div className={styles.meta}>
          {isOverdue && timeSource ? (
            <span className={`${styles.chip} ${styles.chipOverdue}`}>
              <IconClock size={10} />
              {formatClockTime(timeSource)}
            </span>
          ) : (
            <>
              {due && (
                <span className={styles.chip}>
                  <IconCalendar size={10} />
                  {formatAprDay(due)}
                </span>
              )}
              {scheduled && (
                <Tooltip
                  label={`Scheduled${duration ? ` for ${duration} min` : ""}`}
                  withArrow
                >
                  <span className={styles.chip}>
                    <IconClock size={10} />
                    {formatClockTime(scheduled)}
                  </span>
                </Tooltip>
              )}
            </>
          )}
          <ProjectChip
            projectId={action.projectId ?? null}
            projectName={projectName}
          />
          <SyncStatusIndicator action={action} />
          {tags.length > 0 && (
            <TagBadgeList tags={tags} maxDisplay={2} size="xs" />
          )}
          <RowCreatorBadge
            createdBy={action.createdBy}
            createdById={action.createdById}
            currentUserId={currentUserId}
          />
          <RowAssignees assignees={action.assignees} />
          {suggestionProposal && (
            <span className={`${styles.chip} ${styles.chipSuggest}`}>
              <IconSparkles size={10} />
              {suggestionProposal}
            </span>
          )}
        </div>
      </div>
      <div
        className={styles.popoverWrap}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={styles.rowActionBtn}
          style={{ opacity: 1 }}
          onClick={(e) => {
            e.stopPropagation();
            setPopOpen((v) => !v);
          }}
          title="Reschedule"
          aria-label="Reschedule"
        >
          <IconCalendar size={14} />
        </button>
        {popOpen && (
          <ReschedulePopover
            onChoose={(c) => {
              setPopOpen(false);
              onReschedule(action.id, c);
            }}
          />
        )}
      </div>
      <div className={styles.rowActions}>
        <RowActionsMenu
          action={action}
          workspaceLists={workspaceLists}
          onAssign={() => onAssign?.(action)}
          onListToggle={(listId, isInList) =>
            onListToggle?.(listId, isInList)
          }
        />
      </div>
    </div>
  );
}
