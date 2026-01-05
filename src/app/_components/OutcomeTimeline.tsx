"use client";

import React from 'react';
import { Timeline, Text, Box } from '@mantine/core';
import { api } from '~/trpc/react';
import { format, startOfDay, isBefore } from 'date-fns';
import { IconCalendarEvent, IconClock, IconTarget } from '@tabler/icons-react';
import classes from './OutcomeTimeline.module.css';

interface OutcomeTimelineProps {
  projectId: string;
}

// Interface for outcome data used in the timeline
interface OutcomeData {
  id: string;
  description: string;
  dueDate: Date | null;
  type: string | null; // Allow null explicitly
}

// Interface for goal data used in the timeline
interface GoalData {
  id: number;
  title: string;
  dueDate: Date | null;
}

// Type for items displayed in the timeline
type TimelineDisplayItem =
  | (OutcomeData & { itemType: 'outcome'; isTodayMarker: false })
  | (GoalData & { itemType: 'goal'; isTodayMarker: false })
  | { id: string; description: string; dueDate: Date; isTodayMarker: true }; // Today marker

export function OutcomeTimeline({ projectId }: OutcomeTimelineProps) {
  const { data: outcomes, isLoading: outcomesLoading, error: outcomesError } = api.outcome.getProjectOutcomes.useQuery(
    { projectId },
    {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      // Select only the needed fields and cast type
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

  if (outcomesLoading || goalsLoading) {
    return <Text>Loading timeline...</Text>;
  }

  if (outcomesError ?? goalsError) {
    return <Text color="red">Error loading timeline: {outcomesError?.message ?? goalsError?.message}</Text>;
  }

  const today = startOfDay(new Date());

  // Combine outcomes and today marker
  const timelineItemsData: TimelineDisplayItem[] = [
    ...(outcomes?.map(o => ({ ...o, isTodayMarker: false as const })) ?? []),
    { id: 'today', description: 'Today', dueDate: today, isTodayMarker: true as const },
  ].sort((a, b) => {
    if (a.dueDate === null && b.dueDate === null) return 0;
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate.getTime() - b.dueDate.getTime();
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
      classNames={{ // Use classNames for more control if needed
        itemTitle: classes.todayTitle,
      }}
      // styles={{
      //   itemTitle: {
      //     color: 'var(--mantine-color-green-6)',
      //   },
      // }}
    >
      <Text c="dimmed" size="sm">{format(today, 'PPP')}</Text>
    </Timeline.Item>
  );

  if (!outcomes || outcomes.length === 0) {
    return (
      <Timeline active={0} bulletSize={24} lineWidth={2}>
        {todayTimelineItem}
      </Timeline>
    );
  }

  return (
    <Timeline active={activeIndex} bulletSize={24} lineWidth={2}>
      {timelineItemsData.map((item, index) => {
        if (item.isTodayMarker) {
          return React.cloneElement(todayTimelineItem, {
            lineVariant: index === 0 ? 'solid' : 'dashed'
          });
        } else {
          const isPast = item.dueDate && isBefore(item.dueDate, today);
          return (
            <Timeline.Item
              key={item.id}
              bullet={<IconClock size={14} />}
              title={item.description}
              lineVariant={index <= activeIndex ? 'solid' : 'dashed'}
            >
              <Text c={isPast ? 'dimmed' : 'white'} size="sm">
                {item.dueDate ? `Due: ${format(item.dueDate, 'PPP')}` : 'No due date'}
              </Text>
              {/* Type is now explicitly allowed to be null */}
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
  );
} 