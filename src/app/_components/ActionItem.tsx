import { Checkbox, Text, Group, Paper, Badge, Tooltip, Avatar, HoverCard } from '@mantine/core';
import { IconCalendar, IconCloudOff, IconAlertTriangle, IconCloudCheck, IconBrandNotion, IconClock, IconMicrophone, IconTrendingUp, IconTrendingDown } from '@tabler/icons-react';
import { type RouterOutputs } from "~/trpc/react";
import { TagBadgeList } from "./TagBadge";
import { getAvatarColor, getInitial, getColorSeed, getTextColor } from "~/utils/avatarColors";
import { HTMLContent } from "./HTMLContent";
import Link from "next/link";

type ActionWithSyncs = RouterOutputs["action"]["getAll"][0];
// Make createdBy and tags optional to support various queries that may not include them
export type Action = Omit<ActionWithSyncs, 'createdBy' | 'tags'> & {
  createdBy?: ActionWithSyncs['createdBy'] | null;
  tags?: ActionWithSyncs['tags'];
};

// Also export a simpler action type for components that don't need all fields
export type SimpleAction = {
  id: string;
  name: string;
  status: string;
  priority: string;
  dueDate?: Date | null;
  completedAt?: Date | null;
  projectId?: string | null;
  createdById?: string;
};

// Helper function to format date like "22 Feb"
const formatDate = (date: Date | null | undefined): string => {
  if (!date) return '';
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
};

// Helper function to format scheduled time like "9:00 AM"
const formatScheduledTime = (date: Date | null | undefined): string => {
  if (!date) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

// Helper function to get sync status for an action
const getSyncStatus = (action: Action) => {
  if (!('syncs' in action) || !action.syncs || action.syncs.length === 0) {
    return { status: 'not_synced', provider: null };
  }

  const notionSync = action.syncs.find((sync: any) => sync.provider === 'notion');
  if (notionSync) {
    return {
      status: notionSync.status,
      provider: 'notion',
      externalId: notionSync.externalId,
      syncedAt: notionSync.syncedAt
    };
  }

  const otherSync = action.syncs[0];
  if (otherSync) {
    return {
      status: otherSync.status,
      provider: otherSync.provider,
      externalId: otherSync.externalId,
      syncedAt: otherSync.syncedAt
    };
  }

  return { status: 'not_synced', provider: null };
};

// Helper component to render sync status indicator
const SyncStatusIndicator = ({ action }: { action: Action }) => {
  const syncInfo = getSyncStatus(action);

  if (syncInfo.status === 'not_synced') {
    return null;
  }

  if (syncInfo.status === 'deleted_remotely') {
    return (
      <Tooltip label={`Deleted from ${syncInfo.provider === 'notion' ? 'Notion' : syncInfo.provider}. This task no longer exists in the external system.`}>
        <Badge
          size="sm"
          color="red"
          variant="light"
          leftSection={<IconCloudOff size={12} />}
        >
          Deleted from {syncInfo.provider === 'notion' ? 'Notion' : syncInfo.provider}
        </Badge>
      </Tooltip>
    );
  }

  if (syncInfo.status === 'failed') {
    return (
      <Tooltip label={`Failed to sync to ${syncInfo.provider === 'notion' ? 'Notion' : syncInfo.provider}. There was an error during synchronization.`}>
        <Badge
          size="sm"
          color="orange"
          variant="light"
          leftSection={<IconAlertTriangle size={12} />}
        >
          Sync failed
        </Badge>
      </Tooltip>
    );
  }

  if (syncInfo.status === 'synced') {
    if (syncInfo.provider === 'notion') {
      return (
        <Tooltip label={`Synced to Notion on ${syncInfo.syncedAt ? new Date(syncInfo.syncedAt).toLocaleDateString() : 'unknown date'}`}>
          <IconBrandNotion size={16} style={{ color: 'var(--mantine-color-gray-5)' }} />
        </Tooltip>
      );
    }
    return (
      <Tooltip label={`Synced to ${syncInfo.provider} on ${syncInfo.syncedAt ? new Date(syncInfo.syncedAt).toLocaleDateString() : 'unknown date'}`}>
        <IconCloudCheck size={16} style={{ color: 'var(--mantine-color-green-5)' }} />
      </Tooltip>
    );
  }

  return null;
};

// Helper component to render ETA badge for auto-scheduled tasks
const ETABadge = ({ action }: { action: Action }) => {
  const actionWithETA = action as typeof action & {
    etaStatus?: string | null;
    etaDaysOffset?: number | null;
    isAutoScheduled?: boolean;
  };

  // Only show ETA badge for auto-scheduled tasks with ETA data
  if (!actionWithETA.isAutoScheduled || !actionWithETA.etaStatus) {
    return null;
  }

  const daysOffset = actionWithETA.etaDaysOffset ?? 0;
  const status = actionWithETA.etaStatus;

  if (status === 'on_track' && daysOffset > 0) {
    return (
      <Tooltip label={`Scheduled ${daysOffset} day${daysOffset !== 1 ? 's' : ''} before deadline`}>
        <Badge
          size="sm"
          variant="light"
          color="green"
          leftSection={<IconTrendingUp size={10} />}
        >
          {daysOffset}d ahead
        </Badge>
      </Tooltip>
    );
  }

  if (status === 'at_risk') {
    return (
      <Tooltip label="Task is at risk of missing its deadline">
        <Badge
          size="sm"
          variant="light"
          color="yellow"
          leftSection={<IconAlertTriangle size={10} />}
        >
          At risk
        </Badge>
      </Tooltip>
    );
  }

  if (status === 'overdue') {
    const absDays = Math.abs(daysOffset);
    return (
      <Tooltip label={`Task is ${absDays} day${absDays !== 1 ? 's' : ''} past deadline`}>
        <Badge
          size="sm"
          variant="light"
          color="red"
          leftSection={<IconTrendingDown size={10} />}
        >
          {absDays}d overdue
        </Badge>
      </Tooltip>
    );
  }

  return null;
};

// Get checkbox border color based on priority
const getPriorityBorderColor = (priority: string) => {
  switch (priority) {
    case '1st Priority': return 'var(--mantine-color-red-filled)';
    case '2nd Priority': return 'var(--mantine-color-orange-filled)';
    case '3rd Priority': return 'var(--mantine-color-yellow-filled)';
    case '4th Priority': return 'var(--mantine-color-green-filled)';
    case '5th Priority': return 'var(--mantine-color-blue-filled)';
    case 'Quick': return 'var(--mantine-color-violet-filled)';
    case 'Scheduled': return 'var(--mantine-color-pink-filled)';
    case 'Errand': return 'var(--mantine-color-cyan-filled)';
    case 'Remember': return 'var(--mantine-color-indigo-filled)';
    case 'Watch': return 'var(--mantine-color-grape-filled)';
    default: return 'var(--color-border-primary)';
  }
};

export interface ActionItemProps {
  action: Action;
  onCheckboxChange?: (actionId: string, checked: boolean) => void;
  onClick?: (action: Action) => void;
  isOverdue?: boolean;
  showCheckbox?: boolean;
  disabled?: boolean;
  showAssignees?: boolean;
  showTags?: boolean;
  showSyncStatus?: boolean;
  showProject?: boolean;
  // For bulk selection (rendered by parent)
  leftSlot?: React.ReactNode;
  // For action menu (rendered by parent)
  rightSlot?: React.ReactNode;
}

export function ActionItem({
  action,
  onCheckboxChange,
  onClick,
  isOverdue = false,
  showCheckbox = true,
  disabled = false,
  showAssignees = true,
  showTags = true,
  showSyncStatus = true,
  showProject = false,
  leftSlot,
  rightSlot,
}: ActionItemProps) {
  const handleClick = (e: React.MouseEvent) => {
    // Only trigger onClick if we didn't click the checkbox
    if (!(e.target as HTMLElement).closest('.checkbox-wrapper') && onClick) {
      onClick(action);
    }
  };

  return (
    <Paper
      py="sm"
      className="transition-all hover:shadow-md cursor-pointer mb-3 border-b border-border-primary rounded-none"
      style={{
        background: 'transparent',
        marginBottom: '0',
      }}
      onClick={handleClick}
    >
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group gap="md" wrap="nowrap" className="min-w-0 flex-1">
          {/* Optional left slot for bulk selection checkbox */}
          {leftSlot}

          {/* Main checkbox */}
          {showCheckbox && (
            <div className="checkbox-wrapper pl-1">
              <Checkbox
                size="md"
                radius="xl"
                checked={action.status === "COMPLETED" || action.status === "DONE"}
                onChange={(event) => {
                  if (onCheckboxChange) {
                    onCheckboxChange(action.id, event.currentTarget.checked);
                  }
                }}
                disabled={disabled}
                styles={{
                  input: {
                    borderColor: getPriorityBorderColor(action.priority),
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    flexShrink: 0,
                  },
                }}
              />
            </div>
          )}

          <div className="truncate flex-grow">
            <HTMLContent html={action.name} className="text-text-primary" />
            <Group gap="xs" align="center" className="mt-1">
              {/* Due date */}
              {action.dueDate && (
                <Group gap={4} align="center" className={`text-xs ${isOverdue ? 'text-red-500' : 'text-text-muted'}`}>
                  <IconCalendar size={12} />
                  <span>{formatDate(action.dueDate)}</span>
                </Group>
              )}

              {/* Scheduled time indicator */}
              {(() => {
                const actionWithSchedule = action as typeof action & { scheduledStart?: Date | null; duration?: number | null };
                if (actionWithSchedule.scheduledStart) {
                  return (
                    <Tooltip label={`Scheduled${actionWithSchedule.duration ? ` for ${actionWithSchedule.duration} min` : ''}`}>
                      <Badge
                        size="sm"
                        variant="light"
                        color="blue"
                        leftSection={<IconClock size={10} />}
                      >
                        {formatScheduledTime(actionWithSchedule.scheduledStart)}
                      </Badge>
                    </Tooltip>
                  );
                }
                return null;
              })()}

              {/* ETA badge for auto-scheduled tasks */}
              <ETABadge action={action} />

              {/* Sync status */}
              {showSyncStatus && <SyncStatusIndicator action={action} />}

              {/* Transcription link */}
              {(() => {
                const actionWithTranscription = action as typeof action & {
                  transcriptionSessionId?: string | null;
                  project?: { id: string; name: string; slug?: string } | null;
                };
                if (actionWithTranscription.transcriptionSessionId && actionWithTranscription.project) {
                  const projectSlug = actionWithTranscription.project.slug ??
                    `${actionWithTranscription.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}-${actionWithTranscription.project.id}`;
                  return (
                    <Tooltip label="View source transcription">
                      <Link
                        href={`/projects/${projectSlug}?tab=transcriptions`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center text-text-muted hover:text-brand-primary transition-colors"
                      >
                        <IconMicrophone size={14} />
                      </Link>
                    </Tooltip>
                  );
                }
                return null;
              })()}

              {/* Tags */}
              {showTags && (() => {
                const actionWithTags = action as typeof action & {
                  tags?: Array<{ tag: { id: string; name: string; slug: string; color: string } }>;
                };
                if (actionWithTags.tags && actionWithTags.tags.length > 0) {
                  return (
                    <TagBadgeList
                      tags={actionWithTags.tags.map(t => t.tag)}
                      maxDisplay={2}
                      size="xs"
                    />
                  );
                }
                return null;
              })()}

              {/* Project badge */}
              {showProject && action.project && (
                <Badge size="sm" variant="light" color="gray">
                  {action.project.name}
                </Badge>
              )}

              {/* Assignees */}
              {showAssignees && action.assignees && action.assignees.length > 0 && (
                <Avatar.Group spacing="xs">
                  {action.assignees.slice(0, 2).map((assignee: any) => {
                    const colorSeed = getColorSeed(assignee.user.name, assignee.user.email);
                    const backgroundColor = assignee.user.image ? undefined : getAvatarColor(colorSeed);
                    const textColor = backgroundColor ? getTextColor(backgroundColor) : 'white';
                    const initial = getInitial(assignee.user.name, assignee.user.email);

                    return (
                      <HoverCard key={assignee.user.id} width={200} shadow="md">
                        <HoverCard.Target>
                          <Avatar
                            size="sm"
                            src={assignee.user.image}
                            alt={assignee.user.name || assignee.user.email || 'User'}
                            radius="xl"
                            className="cursor-pointer"
                            styles={{
                              root: {
                                backgroundColor: backgroundColor,
                                color: textColor,
                                fontWeight: 600,
                                fontSize: '12px',
                              }
                            }}
                          >
                            {!assignee.user.image && initial}
                          </Avatar>
                        </HoverCard.Target>
                        <HoverCard.Dropdown>
                          <Group gap="sm">
                            <Avatar
                              src={assignee.user.image}
                              alt={assignee.user.name || assignee.user.email || 'User'}
                              radius="xl"
                              styles={{
                                root: {
                                  backgroundColor: backgroundColor,
                                  color: textColor,
                                  fontWeight: 600,
                                  fontSize: '14px',
                                }
                              }}
                            >
                              {!assignee.user.image && initial}
                            </Avatar>
                            <div>
                              <Text size="sm" fw={500}>
                                {assignee.user.name || "Unknown User"}
                              </Text>
                              <Text size="xs" c="dimmed">
                                {assignee.user.email}
                              </Text>
                            </div>
                          </Group>
                        </HoverCard.Dropdown>
                      </HoverCard>
                    );
                  })}
                  {action.assignees.length > 2 && (
                    <Tooltip label={`${action.assignees.length - 2} more assignees`}>
                      <Avatar
                        size="sm"
                        radius="xl"
                        className="cursor-pointer"
                        color="gray"
                        styles={{
                          root: {
                            backgroundColor: 'var(--mantine-color-gray-6)',
                            color: 'white',
                            fontWeight: 600,
                            fontSize: '10px',
                          }
                        }}
                      >
                        +{action.assignees.length - 2}
                      </Avatar>
                    </Tooltip>
                  )}
                </Avatar.Group>
              )}
            </Group>
          </div>
        </Group>

        {/* Optional right slot for action menu */}
        {rightSlot}
      </Group>
    </Paper>
  );
}
