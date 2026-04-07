"use client";

import React, { useState, useMemo } from 'react';
import { Timeline, Text, Box, Collapse, Stack, UnstyledButton, Group } from '@mantine/core';
import { api } from '~/trpc/react';
import { format, startOfDay, isBefore } from 'date-fns';
import { IconCalendarEvent, IconClock, IconTarget, IconCircleCheck, IconChevronRight, IconChevronDown } from '@tabler/icons-react';
import { EditActionModal } from './EditActionModal';
import classes from './OutcomeTimeline.module.css';

interface OutcomeTimelineProps {
  projectId: string;
}

interface OutcomeData {
  id: string;
  description: string;
  dueDate: Date | null;
  type: string | null;
}

interface GoalData {
  id: number;
  title: string;
  dueDate: Date | null;
}

interface CompletedActionData {
  id: string;
  name: string;
  completedAt: Date;
  description: string | null;
  status: string;
  priority: string;
  dueDate: Date | null;
  projectId: string | null;
  [key: string]: unknown;
}

type TimelineDisplayItem =
  | (OutcomeData & { itemType: 'outcome'; isTodayMarker: false })
  | (GoalData & { itemType: 'goal'; isTodayMarker: false })
  | { id: string; description: string; dueDate: Date; itemType: 'today'; isTodayMarker: true }
  | { id: string; dueDate: Date; itemType: 'completedActions'; isTodayMarker: false; actions: CompletedActionData[] };

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

function groupActionsByDate(actions: CompletedActionData[]): { date: Date; actions: CompletedActionData[] }[] {
  const groups = new Map<string, { date: Date; actions: CompletedActionData[] }>();

  for (const action of actions) {
    const day = startOfDay(action.completedAt);
    const key = day.toISOString();
    const existing = groups.get(key);
    if (existing) {
      existing.actions.push(action);
    } else {
      groups.set(key, { date: day, actions: [action] });
    }
  }

  return Array.from(groups.values());
}

export function OutcomeTimeline({ projectId }: OutcomeTimelineProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editAction, setEditAction] = useState<CompletedActionData | null>(null);

  const { data: outcomes, isLoading: outcomesLoading, error: outcomesError } = api.outcome.getProjectOutcomes.useQuery(
    { projectId },
    {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      select: (data): OutcomeData[] =>
        data?.map(o => ({
          id: o.id,
          description: o.description,
          dueDate: o.dueDate,
          type: o.type
        })) ?? [],
    }
  );

  const { data: goals, isLoading: goalsLoading, error: goalsError } = api.goal.getProjectGoals.useQuery(
    { projectId },
    {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      select: (data): GoalData[] =>
        data?.map(g => ({
          id: g.id,
          title: g.title,
          dueDate: g.dueDate,
        })) ?? [],
    }
  );

  const { data: completedActions, isLoading: actionsLoading, error: actionsError } = api.action.getProjectActions.useQuery(
    { projectId },
    {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      select: (data): CompletedActionData[] =>
        data
          ?.filter((a): a is typeof a & { completedAt: Date } =>
            a.status === "COMPLETED" && a.completedAt != null
          )
          .map(a => ({
            id: a.id,
            name: a.name,
            completedAt: a.completedAt,
            description: a.description,
            status: a.status,
            priority: a.priority,
            dueDate: a.dueDate,
            projectId: a.projectId,
          })) ?? [],
    }
  );

  if (outcomesLoading || goalsLoading || actionsLoading) {
    return <Text>Loading timeline...</Text>;
  }

  if (outcomesError ?? goalsError ?? actionsError) {
    return <Text color="red">Error loading timeline: {outcomesError?.message ?? goalsError?.message ?? actionsError?.message}</Text>;
  }

  const today = startOfDay(new Date());
  const actionGroups = groupActionsByDate(completedActions ?? []);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const timelineItemsData: TimelineDisplayItem[] = [
    ...(outcomes?.map(o => ({ ...o, itemType: 'outcome' as const, isTodayMarker: false as const })) ?? []),
    ...(goals?.map(g => ({ ...g, itemType: 'goal' as const, isTodayMarker: false as const })) ?? []),
    ...actionGroups.map(group => ({
      id: `completed-${group.date.toISOString()}`,
      dueDate: group.date,
      itemType: 'completedActions' as const,
      isTodayMarker: false as const,
      actions: group.actions,
    })),
    { id: 'today', description: 'Today', dueDate: today, itemType: 'today' as const, isTodayMarker: true as const },
  ].sort((a, b) => {
    if (a.dueDate === null && b.dueDate === null) return 0;
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return b.dueDate.getTime() - a.dueDate.getTime();
  });

  const todayIndex = timelineItemsData.findIndex(item => item.isTodayMarker);
  const activeIndex = todayIndex;

  const todayTimelineItem = (
    <Timeline.Item
      key="today"
      title="Today"
      bullet={
        <Box className={classes.todayBullet}>
          <IconCalendarEvent size={14} />
        </Box>
      }
      classNames={{
        itemTitle: classes.todayTitle,
      }}
    >
      <Text c="dimmed" size="sm">{format(today, 'PPP')}</Text>
    </Timeline.Item>
  );

  const hasItems = (outcomes && outcomes.length > 0) || (goals && goals.length > 0) || (completedActions && completedActions.length > 0);
  if (!hasItems) {
    return (
      <Timeline active={0} bulletSize={24} lineWidth={2}>
        {todayTimelineItem}
      </Timeline>
    );
  }

  return (
    <>
      <Timeline active={activeIndex} bulletSize={24} lineWidth={2}>
        {timelineItemsData.map((item, index) => {
          if (item.itemType === 'today') {
            return React.cloneElement(todayTimelineItem, {
              lineVariant: index === 0 ? 'solid' : 'dashed'
            });
          } else if (item.itemType === 'goal') {
            const isPast = item.dueDate && isBefore(item.dueDate, today);
            return (
              <Timeline.Item
                key={`goal-${item.id}`}
                bullet={<IconTarget size={14} style={{ color: 'var(--mantine-color-yellow-6)' }} />}
                title={item.title}
                lineVariant={index <= activeIndex ? 'solid' : 'dashed'}
                styles={{
                  itemTitle: {
                    color: 'var(--mantine-color-yellow-6)',
                  },
                }}
              >
                <Text c={isPast ? 'dimmed' : 'white'} size="sm">
                  {item.dueDate ? `Due: ${format(item.dueDate, 'PPP')}` : 'No due date'}
                </Text>
                <Text size="xs" mt={4} c="dimmed">
                  Goal
                </Text>
              </Timeline.Item>
            );
          } else if (item.itemType === 'completedActions') {
            const isExpanded = expandedGroups.has(item.id);
            const count = item.actions.length;
            return (
              <Timeline.Item
                key={item.id}
                bullet={<IconCircleCheck size={14} style={{ color: 'var(--mantine-color-green-6)' }} />}
                lineVariant={index <= activeIndex ? 'solid' : 'dashed'}
              >
                <UnstyledButton
                  onClick={() => toggleGroup(item.id)}
                  className={classes.completedToggle}
                >
                  <Group gap={4} wrap="nowrap" className={classes.completedToggleText}>
                    {isExpanded
                      ? <IconChevronDown size={14} />
                      : <IconChevronRight size={14} />
                    }
                    <Text size="sm" inherit>
                      {count} completed {count === 1 ? 'item' : 'items'}
                    </Text>
                  </Group>
                </UnstyledButton>
                <Text size="xs" c="dimmed">{format(item.dueDate, 'PPP')}</Text>
                <Collapse in={isExpanded}>
                  <Stack gap="xs" mt="xs">
                    {item.actions.map(action => (
                      <UnstyledButton
                        key={action.id}
                        onClick={() => setEditAction(action)}
                        className={classes.completedAction}
                      >
                        <Text size="sm" c="dimmed" td="line-through">
                          {stripHtml(action.name)}
                        </Text>
                      </UnstyledButton>
                    ))}
                  </Stack>
                </Collapse>
              </Timeline.Item>
            );
          } else {
            const isPast = item.dueDate && isBefore(item.dueDate, today);
            return (
              <Timeline.Item
                key={`outcome-${item.id}`}
                bullet={<IconClock size={14} />}
                title={item.description}
                lineVariant={index <= activeIndex ? 'solid' : 'dashed'}
              >
                <Text c={isPast ? 'dimmed' : 'white'} size="sm">
                  {item.dueDate ? `Due: ${format(item.dueDate, 'PPP')}` : 'No due date'}
                </Text>
                {item.type && (
                  <Text size="xs" mt={4} c="dimmed">
                    Type: {item.type}
                  </Text>
                )}
              </Timeline.Item>
            );
          }
        })}
      </Timeline>

      <EditActionModal
        action={editAction}
        opened={!!editAction}
        onClose={() => setEditAction(null)}
      />
    </>
  );
}
