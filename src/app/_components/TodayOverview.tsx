"use client";

import {
  Card,
  Text,
  Group,
  Stack,
  Badge,
  ActionIcon,
  Indicator,
  Tooltip,
} from "@mantine/core";
import { Calendar } from "@mantine/dates";
import {
  IconPlus,
  IconCalendar,
  IconTarget,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { ActionsList } from "./actions/ActionsList";
import { CreateActionModal } from "./CreateActionModal";
import { CreateGoalModal } from "./CreateGoalModal";
import { ProjectCalendarCard } from "./ProjectCalendarCard";
import { useState } from "react";
import { isSameDay, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import type { FocusPeriod, DateRange } from "~/types/focus";
import { getFocusSectionTitle } from "~/lib/dateUtils";

interface TodayOverviewProps {
  focus?: FocusPeriod;
  dateRange?: DateRange;
  workspaceId?: string;
}

export function TodayOverview({ focus = "today", dateRange, workspaceId }: TodayOverviewProps) {
  // Use dateRange for queries if provided, otherwise default to today
  const today = new Date();
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<Date>(today);
  const effectiveDateRange = dateRange ?? {
    startDate: startOfDay(today),
    endDate: endOfDay(today),
  };

  // Fetch actions based on focus
  const { data: actionsFromRange = [] } = api.action.getByDateRange.useQuery(
    {
      startDate: effectiveDateRange.startDate,
      endDate: effectiveDateRange.endDate,
      workspaceId,
    },
    { enabled: focus !== "today" }
  );

  const { data: actionsToday = [] } = api.action.getToday.useQuery(
    { workspaceId },
    { enabled: focus === "today" }
  );

  const actions = focus === "today" ? actionsToday : actionsFromRange;

  // Goals - always fetch all and filter client-side
  const { data: goals = [] } = api.goal.getAllMyGoals.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: workspaceId !== null }
  );

  // Filter items based on focus
  const filteredGoals = focus === "today"
    ? goals.filter((goal) => goal.dueDate && isSameDay(goal.dueDate, today))
    : goals.filter(
        (goal) =>
          goal.dueDate &&
          isWithinInterval(goal.dueDate, {
            start: effectiveDateRange.startDate,
            end: effectiveDateRange.endDate,
          })
      );

  // Helper for calendar rendering - get items for a specific date
  const getItemsForDate = (date: Date) => {
    const dateStr = date.toDateString();
    const items: { type: "goal"; title: string; color: string; subLabel?: string }[] = [];

    // Check goals
    goals.forEach((goal) => {
      if (goal.dueDate && new Date(goal.dueDate).toDateString() === dateStr) {
        items.push({ type: "goal", title: goal.title, color: "yellow", subLabel: goal.lifeDomain?.title });
      }
    });

    return items;
  };

  // Check if a date is within the selected range (for highlighting)
  const isDateInRange = (date: Date) => {
    return isWithinInterval(date, {
      start: effectiveDateRange.startDate,
      end: effectiveDateRange.endDate,
    });
  };

  const getEmptyMessage = (type: "goals" | "actions") => {
    const periodText = focus === "today" ? "today" : focus === "tomorrow" ? "tomorrow" : focus === "week" ? "this week" : "this month";
    return `No ${type} due ${periodText}`;
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-6">
      {/* Left Column - Calendar */}
      <div className="lg:col-span-2">
        <Card
          withBorder
          radius="md"
          p="sm"
          className="border-border-primary bg-surface-secondary"
        >
          <div className="flex justify-center">
            <Calendar
              date={calendarSelectedDate}
              getDayProps={(date) => ({
                selected: isSameDay(date, calendarSelectedDate),
                onClick: () => setCalendarSelectedDate(date),
              })}
              renderDay={(date) => {
                const day = date.getDate();
                const items = getItemsForDate(date);
                const isInRange = isDateInRange(date);

                const dayContent = (
                  <div
                    className={
                      isInRange && focus !== "today"
                        ? "rounded-sm bg-brand-primary/20 px-1"
                        : ""
                    }
                  >
                    {day}
                  </div>
                );

                if (items.length === 0) {
                  return dayContent;
                }

                return (
                  <Tooltip
                    label={
                      <Stack gap={4}>
                        {items.map((item, idx) => (
                          <Group key={idx} gap="xs">
                            <Badge size="xs" color={item.color} variant="filled">
                              {item.type}
                            </Badge>
                            <Text size="xs" lineClamp={1}>
                              {item.title}
                            </Text>
                          </Group>
                        ))}
                      </Stack>
                    }
                    withArrow
                    multiline
                    w={220}
                  >
                    <Indicator size={6} color={items[0]?.color ?? "gray"} offset={-2}>
                      {dayContent}
                    </Indicator>
                  </Tooltip>
                );
              }}
            />
          </div>
        </Card>

        {/* Google Calendar Events */}
        <ProjectCalendarCard selectedDate={calendarSelectedDate} />
      </div>

      {/* Goals */}
      <div className="lg:col-span-2">
        <Card
          withBorder
          radius="md"
          className="border-border-primary bg-surface-secondary"
        >
          <Group justify="space-between" mb="md">
            <Group gap="xs">
              <IconTarget size={18} className="text-text-primary" />
              <Text fw={600} size="lg" className="text-text-primary">
                {getFocusSectionTitle(focus, "Goals")}
              </Text>
            </Group>
            <CreateGoalModal>
              <ActionIcon variant="subtle" size="md" aria-label="Add goal">
                <IconPlus size={16} />
              </ActionIcon>
            </CreateGoalModal>
          </Group>

          <Stack gap="md">
            {filteredGoals.length > 0 ? (
              filteredGoals.map((goal) => (
                <CreateGoalModal
                  key={goal.id}
                  goal={{
                    id: goal.id,
                    title: goal.title,
                    description: goal.description,
                    whyThisGoal: goal.whyThisGoal,
                    notes: goal.notes,
                    dueDate: goal.dueDate,
                    period: goal.period ?? null,
                    lifeDomainId: goal.lifeDomainId,
                  }}
                  trigger={
                    <div className="cursor-pointer rounded-md p-2 hover:bg-surface-hover">
                      <Stack gap={2}>
                        <Text
                          size="sm"
                          fw={500}
                          className="text-text-primary"
                          lineClamp={2}
                        >
                          {goal.title}
                        </Text>
                        <Group gap="xs">
                          {goal.lifeDomain && (
                            <Badge variant="light" color="yellow" size="xs">
                              {goal.lifeDomain.title}
                            </Badge>
                          )}
                          {goal.dueDate && (
                            <Group gap={4} align="center" className="text-xs text-text-muted">
                              <IconCalendar size={12} />
                              <span>
                                {goal.dueDate.toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </span>
                            </Group>
                          )}
                        </Group>
                      </Stack>
                    </div>
                  }
                />
              ))
            ) : (
              <Text size="sm" c="dimmed" ta="center" py="md">
                {getEmptyMessage("goals")}
              </Text>
            )}
          </Stack>
        </Card>
      </div>

      {/* Actions */}
      <div className="lg:col-span-2">
        <Card
          withBorder
          radius="md"
          className="border-border-primary bg-surface-secondary"
        >
          {/* Card Header */}
          <Group justify="space-between" mb="lg">
            <Text fw={600} size="lg" className="text-text-primary">
              {getFocusSectionTitle(focus, "Actions")}
            </Text>
            <CreateActionModal viewName="today">
              <ActionIcon variant="subtle" size="md" aria-label="Add action">
                <IconPlus size={16} />
              </ActionIcon>
            </CreateActionModal>
          </Group>

          {/* Action List */}
          <ActionsList
            viewName="today"
            actions={actions}
            showCheckboxes={false}
          />
        </Card>
      </div>
    </div>
  );
}
