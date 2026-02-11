"use client";

import {
  Text,
  Progress,
  Avatar,
  Tooltip,
  ActionIcon,
  Accordion,
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
 * A single key result rendered as an Accordion.Item.
 * Shows tree connector, color indicator, title, avatar, delta, progress bar.
 * Expands to reveal linked projects.
 */
export function KeyResultRow({
  keyResult,
  parentColor,
  isLastChild,
  onEdit,
  onViewDetails,
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
    <Accordion.Item value={keyResult.id} className="border-none">
      <Accordion.Control
        className="group hover:bg-surface-hover rounded transition-colors"
        chevron={
          hasProjects ? (
            <IconChevronRight size={14} className="text-text-muted" />
          ) : (
            <div className="w-[14px]" />
          )
        }
        disabled={!hasProjects}
        styles={{
          control: { padding: "0.5rem 0 0.5rem 1.5rem" },
          chevron: { marginInlineStart: 0, width: 22 },
        }}
      >
        <div className="flex items-center gap-3">
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
            <div className="w-[26px] flex-shrink-0" />
          )}

          {/* Delta indicator */}
          <DeltaIndicator delta={delta} size="xs" />

          {/* Compact progress bar - fixed width on right side */}
          <div className="w-24 flex-shrink-0">
            <Progress value={progress} size="sm" color={statusColor} radius="xl" />
          </div>
        </div>
      </Accordion.Control>

      {/* Linked Projects panel */}
      {hasProjects && (
        <Accordion.Panel>
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
        </Accordion.Panel>
      )}
    </Accordion.Item>
  );
}
