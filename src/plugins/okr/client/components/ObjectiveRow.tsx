"use client";

import { Text, Progress, Badge, Collapse, ActionIcon, Tooltip } from "@mantine/core";
import { IconChevronRight, IconTrash, IconPencil, IconPlus, IconMessageCircle } from "@tabler/icons-react";
import { ObjectiveIndicator, getObjectiveColor } from "./ObjectiveIndicator";
import { DeltaIndicator, calculateAggregateDelta } from "./DeltaIndicator";
import { KeyResultRow } from "./KeyResultRow";
import { CreateGoalModal } from "~/app/_components/CreateGoalModal";

interface KeyResultCheckIn {
  previousValue: number;
  newValue: number;
}

interface KeyResultUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

interface LinkedProject {
  project: {
    id: string;
    name: string;
    status: string;
  };
}

interface KeyResult {
  id: string;
  title: string;
  currentValue: number;
  targetValue: number;
  startValue: number;
  status: string;
  checkIns?: KeyResultCheckIn[];
  user?: KeyResultUser | null;
  projects?: LinkedProject[];
}

interface LifeDomain {
  id: number;
  name: string;
}

interface ObjectiveData {
  id: number;
  title: string;
  description?: string | null;
  whyThisGoal?: string | null;
  notes?: string | null;
  dueDate?: Date | null;
  period?: string | null;
  progress: number;
  lifeDomain?: LifeDomain | null;
  workspaceId?: string | null;
  keyResults: KeyResult[];
}

interface ObjectiveRowProps {
  objective: ObjectiveData;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDelete?: (id: number) => void;
  isDeleting?: boolean;
  onEditSuccess?: () => void;
  onAddKeyResult?: (objectiveId: number) => void;
  onEditKeyResult?: (keyResult: KeyResult) => void;
  onViewObjective?: () => void;
  onViewKeyResult?: (keyResult: KeyResult) => void;
  expandedKeyResults?: Set<string>;
  onToggleKeyResult?: (krId: string) => void;
}

/**
 * Get the Mantine color for progress level.
 */
function getProgressColor(progress: number): string {
  if (progress >= 70) return "green";
  if (progress >= 40) return "yellow";
  return "red";
}

/**
 * An objective row with expand/collapse for key results.
 * Shows color indicator, title, life domain badge, delta, and progress bar.
 */
export function ObjectiveRow({
  objective,
  isExpanded,
  onToggleExpand,
  onDelete,
  isDeleting,
  onEditSuccess,
  onAddKeyResult,
  onEditKeyResult,
  onViewObjective,
  onViewKeyResult,
  expandedKeyResults,
  onToggleKeyResult,
}: ObjectiveRowProps) {
  const objectiveColor = getObjectiveColor(objective.title);
  const aggregateDelta = calculateAggregateDelta(objective.keyResults);
  const progressColor = getProgressColor(objective.progress);
  const hasKeyResults = objective.keyResults.length > 0;

  return (
    <div className="border-b border-border-primary last:border-b-0">
      {/* Objective header row */}
      <div
        className="flex items-center gap-3 py-3 px-2 cursor-pointer hover:bg-surface-hover rounded transition-colors"
        onClick={onToggleExpand}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleExpand();
          }
        }}
      >
        {/* Expand/collapse chevron */}
        <IconChevronRight
          size={16}
          className={`text-text-muted transition-transform flex-shrink-0 ${
            isExpanded ? "rotate-90" : ""
          }`}
        />

        {/* Unique color indicator per objective */}
        <ObjectiveIndicator title={objective.title} />

        {/* Title + edit icon + life domain badge */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 group/title">
            <Text fw={500} className="truncate text-text-primary">
              {objective.title}
            </Text>
            <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
              {onViewObjective && (
                <Tooltip label="Discussion">
                  <ActionIcon
                    variant="subtle"
                    size="xs"
                    className="opacity-0 group-hover/title:opacity-100 transition-opacity flex-shrink-0"
                    aria-label="View discussion"
                    onClick={onViewObjective}
                  >
                    <IconMessageCircle size={14} />
                  </ActionIcon>
                </Tooltip>
              )}
              <CreateGoalModal
                goal={{
                  id: objective.id,
                  title: objective.title,
                  description: objective.description ?? null,
                  whyThisGoal: objective.whyThisGoal ?? null,
                  notes: objective.notes ?? null,
                  dueDate: objective.dueDate ?? null,
                  period: objective.period ?? null,
                  lifeDomainId: objective.lifeDomain?.id ?? null,
                  workspaceId: objective.workspaceId ?? null,
                }}
                onSuccess={onEditSuccess}
              >
                <ActionIcon
                  variant="subtle"
                  size="xs"
                  className="opacity-0 group-hover/title:opacity-100 transition-opacity flex-shrink-0"
                  aria-label="Edit objective"
                >
                  <IconPencil size={14} />
                </ActionIcon>
              </CreateGoalModal>
            </div>
          </div>
          {objective.lifeDomain && (
            <Badge size="xs" variant="light" color="gray" className="mt-1">
              {objective.lifeDomain.name}
            </Badge>
          )}
        </div>

        {/* Key results count */}
        <Text size="xs" className="text-text-muted flex-shrink-0">
          {objective.keyResults.length} KR{objective.keyResults.length !== 1 ? "s" : ""}
        </Text>

        {/* Aggregate delta */}
        <DeltaIndicator delta={aggregateDelta} size="xs" />

        {/* Compact progress bar */}
        <div className="w-24 flex-shrink-0">
          <Progress
            value={objective.progress}
            size="sm"
            color={progressColor}
            radius="xl"
          />
        </div>

        {/* Delete button */}
        {onDelete && (
          <ActionIcon
            variant="subtle"
            color="red"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(objective.id);
            }}
            loading={isDeleting}
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100"
            aria-label="Delete objective"
          >
            <IconTrash size={14} />
          </ActionIcon>
        )}
      </div>

      {/* Collapsible key results */}
      <Collapse in={isExpanded}>
        <div className="ml-4 mb-2">
          {hasKeyResults ? (
            objective.keyResults.map((kr, index) => (
              <KeyResultRow
                key={kr.id}
                keyResult={kr}
                parentColor={objectiveColor}
                isLastChild={index === objective.keyResults.length - 1}
                onEdit={onEditKeyResult}
                onViewDetails={onViewKeyResult ? () => onViewKeyResult(kr) : undefined}
                isExpanded={expandedKeyResults?.has(kr.id)}
                onToggleExpand={onToggleKeyResult ? () => onToggleKeyResult(kr.id) : undefined}
                linkedProjects={kr.projects?.map((p) => p.project)}
              />
            ))
          ) : (
            <Text size="sm" className="text-text-muted py-2 pl-8">
              No key results yet. Add one to track progress.
            </Text>
          )}
          {/* Add Key Result button */}
          {onAddKeyResult && (
            <Tooltip label="Add Key Result" position="right">
              <ActionIcon
                variant="subtle"
                size="sm"
                className="ml-6 mt-1 text-text-muted hover:text-text-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddKeyResult(objective.id);
                }}
                aria-label="Add key result to this objective"
              >
                <IconPlus size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </div>
      </Collapse>
    </div>
  );
}
