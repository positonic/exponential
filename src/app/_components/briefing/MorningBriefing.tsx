"use client";

import {
  Card,
  Text,
  Stack,
  Group,
  Badge,
  Loader,
  Collapse,
  ActionIcon,
  Divider,
} from "@mantine/core";
import { useState } from "react";
import {
  IconChevronDown,
  IconChevronUp,
  IconCalendar,
  IconChecklist,
  IconAlertTriangle,
  IconFolder,
  IconNotes,
  IconRefresh,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { format } from "date-fns";

interface MorningBriefingProps {
  workspaceId?: string;
  compact?: boolean;
}

export function MorningBriefing({ workspaceId, compact = false }: MorningBriefingProps) {
  const [expandedSections, setExpandedSections] = useState({
    calendar: true,
    actions: true,
    overdue: true,
    projects: false,
    meetings: false,
  });

  const {
    data: briefing,
    isLoading,
    refetch,
    isRefetching,
  } = api.briefing.getMorningBriefing.useQuery({
    workspaceId,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  if (isLoading) {
    return (
      <Card className="bg-surface-primary border-border-primary">
        <Group className="justify-center p-6">
          <Loader size="sm" />
          <Text className="text-text-muted">Loading your briefing...</Text>
        </Group>
      </Card>
    );
  }

  if (!briefing) {
    return (
      <Card className="bg-surface-primary border-border-primary">
        <Text className="text-text-muted text-center p-4">
          Unable to load briefing. Please try again.
        </Text>
      </Card>
    );
  }

  if (compact) {
    return (
      <Card className="bg-surface-primary border-border-primary p-4">
        <Group className="justify-between">
          <Text className="text-text-primary font-medium">{briefing.greeting}</Text>
          <Group gap="xs">
            {briefing.summary.totalOverdue > 0 && (
              <Badge color="red" variant="light" size="sm">
                {briefing.summary.totalOverdue} overdue
              </Badge>
            )}
            {briefing.summary.totalActionsDue > 0 && (
              <Badge color="blue" variant="light" size="sm">
                {briefing.summary.totalActionsDue} due today
              </Badge>
            )}
            {briefing.summary.totalEvents > 0 && (
              <Badge color="teal" variant="light" size="sm">
                {briefing.summary.totalEvents} events
              </Badge>
            )}
          </Group>
        </Group>
      </Card>
    );
  }

  return (
    <Card className="bg-surface-primary border-border-primary">
      <Stack gap="md">
        {/* Header */}
        <Group className="justify-between">
          <div>
            <Text className="text-text-primary text-xl font-semibold">
              {briefing.greeting}
            </Text>
            <Text className="text-text-muted text-sm">
              {format(new Date(briefing.date), "EEEE, MMMM d, yyyy")}
            </Text>
          </div>
          <ActionIcon
            variant="subtle"
            onClick={() => refetch()}
            loading={isRefetching}
            className="text-text-secondary"
          >
            <IconRefresh size={18} />
          </ActionIcon>
        </Group>

        {/* Summary badges */}
        <Group gap="xs">
          {briefing.summary.totalOverdue > 0 && (
            <Badge color="red" variant="light" leftSection={<IconAlertTriangle size={12} />}>
              {briefing.summary.totalOverdue} overdue
            </Badge>
          )}
          {briefing.summary.totalActionsDue > 0 && (
            <Badge color="blue" variant="light" leftSection={<IconChecklist size={12} />}>
              {briefing.summary.totalActionsDue} due today
            </Badge>
          )}
          {briefing.summary.totalEvents > 0 && (
            <Badge color="teal" variant="light" leftSection={<IconCalendar size={12} />}>
              {briefing.summary.totalEvents} events
            </Badge>
          )}
          {briefing.summary.projectsAtRisk > 0 && (
            <Badge color="yellow" variant="light" leftSection={<IconFolder size={12} />}>
              {briefing.summary.projectsAtRisk} projects need attention
            </Badge>
          )}
        </Group>

        <Divider className="border-border-primary" />

        {/* Overdue Actions */}
        {briefing.overdueActions.length > 0 && (
          <div>
            <button
              onClick={() => toggleSection("overdue")}
              className="flex items-center gap-2 w-full text-left text-text-primary font-medium hover:text-text-secondary transition-colors"
            >
              <IconAlertTriangle size={18} className="text-red-500" />
              <span>Overdue ({briefing.overdueActions.length})</span>
              {expandedSections.overdue ? (
                <IconChevronUp size={16} className="ml-auto" />
              ) : (
                <IconChevronDown size={16} className="ml-auto" />
              )}
            </button>
            <Collapse in={expandedSections.overdue}>
              <Stack gap="xs" className="mt-2 ml-6">
                {briefing.overdueActions.map((action) => (
                  <div key={action.id} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <Text className="text-text-primary text-sm flex-1" lineClamp={1}>
                      {action.name}
                    </Text>
                    {action.projectName && (
                      <Text className="text-text-muted text-xs">{action.projectName}</Text>
                    )}
                  </div>
                ))}
              </Stack>
            </Collapse>
          </div>
        )}

        {/* Calendar Events */}
        {briefing.calendarEvents.length > 0 && (
          <div>
            <button
              onClick={() => toggleSection("calendar")}
              className="flex items-center gap-2 w-full text-left text-text-primary font-medium hover:text-text-secondary transition-colors"
            >
              <IconCalendar size={18} className="text-teal-500" />
              <span>Today&apos;s Calendar ({briefing.calendarEvents.length})</span>
              {expandedSections.calendar ? (
                <IconChevronUp size={16} className="ml-auto" />
              ) : (
                <IconChevronDown size={16} className="ml-auto" />
              )}
            </button>
            <Collapse in={expandedSections.calendar}>
              <Stack gap="xs" className="mt-2 ml-6">
                {briefing.calendarEvents.map((event) => (
                  <div key={event.id} className="flex items-center gap-2">
                    <Text className="text-text-muted text-xs w-16">
                      {event.isAllDay
                        ? "All day"
                        : format(new Date(event.start), "h:mm a")}
                    </Text>
                    <Text className="text-text-primary text-sm flex-1" lineClamp={1}>
                      {event.title}
                    </Text>
                  </div>
                ))}
              </Stack>
            </Collapse>
          </div>
        )}

        {/* Actions Due Today */}
        {briefing.actionsDueToday.length > 0 && (
          <div>
            <button
              onClick={() => toggleSection("actions")}
              className="flex items-center gap-2 w-full text-left text-text-primary font-medium hover:text-text-secondary transition-colors"
            >
              <IconChecklist size={18} className="text-blue-500" />
              <span>Due Today ({briefing.actionsDueToday.length})</span>
              {expandedSections.actions ? (
                <IconChevronUp size={16} className="ml-auto" />
              ) : (
                <IconChevronDown size={16} className="ml-auto" />
              )}
            </button>
            <Collapse in={expandedSections.actions}>
              <Stack gap="xs" className="mt-2 ml-6">
                {briefing.actionsDueToday.map((action) => (
                  <div key={action.id} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <Text className="text-text-primary text-sm flex-1" lineClamp={1}>
                      {action.name}
                    </Text>
                    {action.projectName && (
                      <Text className="text-text-muted text-xs">{action.projectName}</Text>
                    )}
                  </div>
                ))}
              </Stack>
            </Collapse>
          </div>
        )}

        {/* Projects Needing Attention */}
        {briefing.projectsNeedingAttention.length > 0 && (
          <div>
            <button
              onClick={() => toggleSection("projects")}
              className="flex items-center gap-2 w-full text-left text-text-primary font-medium hover:text-text-secondary transition-colors"
            >
              <IconFolder size={18} className="text-yellow-500" />
              <span>Projects Needing Attention ({briefing.projectsNeedingAttention.length})</span>
              {expandedSections.projects ? (
                <IconChevronUp size={16} className="ml-auto" />
              ) : (
                <IconChevronDown size={16} className="ml-auto" />
              )}
            </button>
            <Collapse in={expandedSections.projects}>
              <Stack gap="xs" className="mt-2 ml-6">
                {briefing.projectsNeedingAttention.map((project) => (
                  <div key={project.id} className="flex items-center gap-2">
                    <Text className="text-text-primary text-sm flex-1">{project.name}</Text>
                    <Badge size="xs" color="yellow" variant="light">
                      {project.progress}% complete
                    </Badge>
                  </div>
                ))}
              </Stack>
            </Collapse>
          </div>
        )}

        {/* Recent Meeting Notes */}
        {briefing.recentMeetingNotes.length > 0 && (
          <div>
            <button
              onClick={() => toggleSection("meetings")}
              className="flex items-center gap-2 w-full text-left text-text-primary font-medium hover:text-text-secondary transition-colors"
            >
              <IconNotes size={18} className="text-violet-500" />
              <span>Recent Meetings ({briefing.recentMeetingNotes.length})</span>
              {expandedSections.meetings ? (
                <IconChevronUp size={16} className="ml-auto" />
              ) : (
                <IconChevronDown size={16} className="ml-auto" />
              )}
            </button>
            <Collapse in={expandedSections.meetings}>
              <Stack gap="xs" className="mt-2 ml-6">
                {briefing.recentMeetingNotes.map((note) => (
                  <div key={note.id} className="flex items-center gap-2">
                    <Text className="text-text-muted text-xs w-20">
                      {format(new Date(note.createdAt), "MMM d")}
                    </Text>
                    <Text className="text-text-primary text-sm flex-1" lineClamp={1}>
                      {note.title}
                    </Text>
                  </div>
                ))}
              </Stack>
            </Collapse>
          </div>
        )}

        {/* Empty state */}
        {briefing.summary.totalOverdue === 0 &&
          briefing.summary.totalActionsDue === 0 &&
          briefing.summary.totalEvents === 0 &&
          briefing.summary.projectsAtRisk === 0 && (
            <Text className="text-text-muted text-center py-4">
              ✨ All clear! You have a clean slate today.
            </Text>
          )}
      </Stack>
    </Card>
  );
}
