"use client";

import {
  Text,
  Progress,
  Avatar,
  Tooltip,
  ActionIcon,
  Collapse,
  Badge,
} from "@mantine/core";
import {
  IconMessageCircle,
  IconPencil,
  IconChevronRight,
} from "@tabler/icons-react";
import { DeltaIndicator, calculateDelta } from "./DeltaIndicator";
import {
  getAvatarColor,
  getInitial,
  getColorSeed,
  getTextColor,
} from "~/utils/avatarColors";

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
  id: string;
  name: string;
  status: string;
}

interface KeyResultData {
  id: string;
  title: string;
  currentValue: number;
  targetValue: number;
  startValue: number;
  status: string;
  checkIns?: KeyResultCheckIn[];
  user?: KeyResultUser | null;
  driUser?: KeyResultUser | null;
}

interface KeyResultRowProps {
  keyResult: KeyResultData;
  parentColor: string;
  isLastChild: boolean;
  onEdit?: (keyResult: KeyResultData) => void;
  onViewDetails?: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  linkedProjects?: LinkedProject[];
}

/**
 * Get the Mantine color for a status.
 */
function getStatusColor(status: string): string {
  switch (status) {
    case "on-track":
      return "green";
    case "achieved":
      return "blue";
    case "at-risk":
      return "yellow";
    case "off-track":
      return "red";
    default:
      return "gray";
  }
}

/**
 * Calculate progress percentage for a key result.
 */
function calculateProgress(keyResult: KeyResultData): number {
  const range = keyResult.targetValue - keyResult.startValue;
  if (range === 0) return 0;
  const progress =
    ((keyResult.currentValue - keyResult.startValue) / range) * 100;
  return Math.min(100, Math.max(0, progress));
}

/**
 * A single key result row with tree connector, color indicator,
 * title, avatar, delta, and compact progress bar.
 */
export function KeyResultRow({
  keyResult,
  parentColor,
  isLastChild,
  onEdit,
  onViewDetails,
  isExpanded,
  onToggleExpand,
  linkedProjects,
}: KeyResultRowProps) {
  const delta = calculateDelta(keyResult);
  const progress = calculateProgress(keyResult);
  const statusColor = getStatusColor(keyResult.status);

  // Avatar color setup
  const user = keyResult.driUser ?? keyResult.user;
  const colorSeed = user ? getColorSeed(user.name, user.email) : "";
  const avatarBgColor = user && !user.image ? getAvatarColor(colorSeed) : undefined;
  const avatarTextColor = avatarBgColor ? getTextColor(avatarBgColor) : "white";
  const initial = user ? getInitial(user.name, user.email) : "?";

  const hasProjects = linkedProjects && linkedProjects.length > 0;

  return (
    <div>
      <div
        className={`group flex items-center gap-3 py-2 pl-6 hover:bg-surface-hover rounded transition-colors ${hasProjects && onToggleExpand ? 'cursor-pointer' : ''}`}
        onClick={hasProjects && onToggleExpand ? onToggleExpand : undefined}
        role={hasProjects && onToggleExpand ? "button" : undefined}
        tabIndex={hasProjects && onToggleExpand ? 0 : undefined}
        onKeyDown={(e) => {
          if (hasProjects && onToggleExpand && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onToggleExpand();
          }
        }}
      >
        {/* Expand/collapse chevron (only if has linked projects) */}
        {hasProjects && onToggleExpand ? (
          <ActionIcon
            variant="subtle"
            size="xs"
            className="flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            aria-label={isExpanded ? "Collapse projects" : "Expand projects"}
          >
            <IconChevronRight
              size={14}
              className={`text-text-muted transition-transform ${
                isExpanded ? "rotate-90" : ""
              }`}
            />
          </ActionIcon>
        ) : (
          <div className="w-[22px] flex-shrink-0" /> // Spacer when no projects
        )}

        {/* Tree connector line */}
        <div className="relative w-5 flex-shrink-0">
        {/* Horizontal line to item */}
        <div className="absolute top-1/2 left-0 w-full h-px bg-border-secondary" />
        {/* Vertical line (hidden for last child bottom half) */}
        <div
          className={`absolute left-0 w-px bg-border-secondary ${
            isLastChild ? "top-0 h-1/2" : "top-0 h-full"
          }`}
        />
      </div>

      {/* Color indicator (inherits parent objective color) */}
      <div
        className="w-1 h-4 rounded-sm flex-shrink-0"
        style={{ backgroundColor: parentColor }}
      />

      {/* Title - takes remaining space */}
      <Text size="sm" className="flex-1 truncate text-text-primary">
        {keyResult.title}
      </Text>

      {/* Edit button */}
      {onEdit && (
        <Tooltip label="Edit">
          <ActionIcon
            variant="subtle"
            size="xs"
            className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            aria-label="Edit key result"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(keyResult);
            }}
          >
            <IconPencil size={14} />
          </ActionIcon>
        </Tooltip>
      )}

      {/* Discussion button */}
      {onViewDetails && (
        <Tooltip label="Discussion">
          <ActionIcon
            variant="subtle"
            size="xs"
            className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            aria-label="View discussion"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails();
            }}
          >
            <IconMessageCircle size={14} />
          </ActionIcon>
        </Tooltip>
      )}

      {/* DRI Avatar */}
      {user ? (
        <Tooltip label={user.name ?? user.email ?? "Owner"}>
          <Avatar
            size="sm"
            src={user.image}
            radius="xl"
            className="flex-shrink-0"
            styles={{
              root: {
                backgroundColor: avatarBgColor,
                color: avatarTextColor,
                fontWeight: 600,
                fontSize: "12px",
              },
            }}
          >
            {!user.image && initial}
          </Avatar>
        </Tooltip>
      ) : (
        <div className="w-[26px] flex-shrink-0" /> // Spacer when no avatar
      )}

      {/* Delta indicator */}
      <DeltaIndicator delta={delta} size="xs" />

      {/* Compact progress bar - fixed width on right side */}
      <div className="w-24 flex-shrink-0">
        <Progress value={progress} size="sm" color={statusColor} radius="xl" />
      </div>
      </div>

      {/* Linked Projects (collapsible) */}
      {hasProjects && (
        <Collapse in={isExpanded ?? false}>
          <div className="ml-16 py-1 space-y-1">
            {linkedProjects.map((project) => (
              <div
                key={project.id}
                className="flex items-center gap-2 py-1 pl-4 text-sm"
              >
                {/* Project connector line */}
                <div className="w-3 h-px bg-border-secondary flex-shrink-0" />
                <Text size="xs" className="text-text-secondary truncate">
                  {project.name}
                </Text>
                <Badge size="xs" variant="light" color="gray">
                  {project.status}
                </Badge>
              </div>
            ))}
          </div>
        </Collapse>
      )}
    </div>
  );
}
