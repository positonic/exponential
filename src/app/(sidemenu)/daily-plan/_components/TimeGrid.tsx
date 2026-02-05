"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Paper, Text, Group, Badge, Stack, Button } from "@mantine/core";
import { IconGripVertical, IconSparkles, IconRobot } from "@tabler/icons-react";
import {
  DndContext,
  DragOverlay,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { format, addMinutes, setHours, setMinutes, startOfDay, parseISO } from "date-fns";
import type { RouterOutputs } from "~/trpc/react";
import { HTMLContent } from "~/app/_components/HTMLContent";
import { CalendarEventBlock } from "~/app/_components/calendar/CalendarEventBlock";
import type { CalendarEvent } from "~/server/services/GoogleCalendarService";

type DailyPlan = RouterOutputs["dailyPlan"]["getOrCreateToday"];
type DailyPlanAction = DailyPlan["plannedActions"][number];

interface TimeGridProps {
  planDate: Date;
  tasks: DailyPlanAction[];
  calendarEvents?: CalendarEvent[];
  onScheduleTask: (taskId: string, scheduledStart: Date, scheduledEnd: Date) => Promise<void>;
  workHoursStart: string;
  workHoursEnd: string;
  onGetSuggestions?: () => void;
  isLoadingSuggestions?: boolean;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours} hr`;
  return `${hours}:${mins.toString().padStart(2, "0")}`;
}

// Parse time string to get hours and minutes
function parseTimeString(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return { hours: hours ?? 9, minutes: minutes ?? 0 };
}

// Generate time slots for the grid, optionally extending beyond work hours
function generateTimeSlots(
  startTime: string,
  endTime: string,
  extendToHour?: number
): { hour: number; minute: number; isAfterHours: boolean }[] {
  const { hours: startHours } = parseTimeString(startTime);
  const { hours: endHours } = parseTimeString(endTime);
  const actualEndHour = extendToHour ? Math.max(endHours, extendToHour) : endHours;

  const slots: { hour: number; minute: number; isAfterHours: boolean }[] = [];
  for (let hour = startHours; hour <= actualEndHour; hour++) {
    const isAfterHours = hour >= endHours;
    slots.push({ hour, minute: 0, isAfterHours });
    if (hour < actualEndHour) {
      slots.push({ hour, minute: 30, isAfterHours });
    }
  }
  return slots;
}

interface TimeSlotProps {
  id: string;
  hour: number;
  minute: number;
  planDate: Date;
  isOccupied: boolean;
  isAfterHours?: boolean;
}

function TimeSlot({ id, hour, minute, planDate, isOccupied, isAfterHours }: TimeSlotProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  const slotTime = setMinutes(setHours(new Date(planDate), hour), minute);

  return (
    <div
      ref={setNodeRef}
      className={`h-12 border-b border-border-secondary flex items-center px-3 transition-colors ${
        isAfterHours ? "opacity-50" : ""
      } ${
        isOver
          ? "bg-brand-primary/20"
          : isOccupied
          ? "bg-surface-tertiary/50"
          : "hover:bg-surface-hover"
      }`}
    >
      {minute === 0 && (
        <Text size="xs" className="text-text-muted w-16 flex-shrink-0">
          {format(slotTime, "h:mm a")}
        </Text>
      )}
      {minute === 30 && <div className="w-16 flex-shrink-0" />}

          </div>
  );
}

interface DraggableTaskProps {
  task: DailyPlanAction;
}

function DraggableTask({ task }: DraggableTaskProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  const isAutoScheduled = task.schedulingMethod === "auto-suggested";

  return (
    <Paper
      ref={setNodeRef}
      p="sm"
      className={`bg-surface-secondary border border-border-primary cursor-grab ${
        isDragging ? "opacity-50" : ""
      }`}
      {...listeners}
      {...attributes}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap" flex={1}>
          <IconGripVertical size={14} className="text-text-muted flex-shrink-0" />
          <Text size="sm" fw={500} className="text-text-primary truncate" component="div">
            <HTMLContent html={task.name} />
          </Text>
        </Group>
        <Group gap={4} wrap="nowrap">
          {isAutoScheduled && (
            <Badge
              size="xs"
              variant="light"
              color="violet"
              leftSection={<IconRobot size={10} />}
            >
              Auto
            </Badge>
          )}
          <Badge variant="light" color="gray" size="xs" className="flex-shrink-0">
            {formatDuration(task.duration)}
          </Badge>
        </Group>
      </Group>
    </Paper>
  );
}

interface TaskOverlayProps {
  task: DailyPlanAction;
}

function TaskOverlay({ task }: TaskOverlayProps) {
  return (
    <Paper
      p="sm"
      className="bg-surface-secondary border-2 border-brand-primary shadow-lg"
      style={{ width: 250 }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm" fw={500} className="text-text-primary truncate" component="div">
          <HTMLContent html={task.name} />
        </Text>
        <Badge variant="light" color="gray" size="xs">
          {formatDuration(task.duration)}
        </Badge>
      </Group>
    </Paper>
  );
}

interface ScheduledTaskBlockProps {
  task: DailyPlanAction;
  gridStartHour: number;
}

function ScheduledTaskBlock({ task, gridStartHour }: ScheduledTaskBlockProps) {
  if (!task.scheduledStart) return null;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  const startTime = new Date(task.scheduledStart);
  const startHour = startTime.getHours();
  const startMinute = startTime.getMinutes();

  // Calculate position (each slot is 48px, 2 slots per hour)
  const slotsFromStart = (startHour - gridStartHour) * 2 + (startMinute >= 30 ? 1 : 0);
  const top = slotsFromStart * 48;

  // Calculate height based on duration (48px per 30 min)
  const durationSlots = Math.ceil(task.duration / 30);
  const height = durationSlots * 48;

  const isAutoScheduled = task.schedulingMethod === "auto-suggested";

  return (
    <div
      ref={setNodeRef}
      className={`absolute left-20 right-2 bg-brand-primary/20 border border-brand-primary/40 rounded-md px-2 py-1 z-10 cursor-grab ${
        isDragging ? "opacity-50" : ""
      }`}
      style={{ top, height: Math.max(height, 24) }}
      {...listeners}
      {...attributes}
    >
      <Group gap={4} wrap="nowrap">
        <Text size="xs" fw={500} className="text-brand-primary truncate flex-1" component="div">
          <HTMLContent html={task.name} className="text-brand-primary" />
        </Text>
        {isAutoScheduled && (
          <Badge
            size="xs"
            variant="light"
            color="violet"
            leftSection={<IconRobot size={8} />}
            styles={{ root: { paddingLeft: 4, paddingRight: 6 } }}
          >
            Auto
          </Badge>
        )}
      </Group>
      <Text size="xs" c="dimmed">
        {format(startTime, "h:mm a")} · {formatDuration(task.duration)}
      </Text>
    </div>
  );
}

export function TimeGrid({
  planDate,
  tasks,
  calendarEvents = [],
  onScheduleTask,
  workHoursStart,
  workHoursEnd,
  onGetSuggestions,
  isLoadingSuggestions = false,
}: TimeGridProps) {
  const [activeTask, setActiveTask] = useState<DailyPlanAction | null>(null);
  const scheduleContainerRef = useRef<HTMLDivElement | null>(null);
  const [scheduleWidth, setScheduleWidth] = useState<number | null>(null);

  useEffect(() => {
    if (!scheduleContainerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setScheduleWidth(entry.contentRect.width);
    });

    observer.observe(scheduleContainerRef.current);

    return () => observer.disconnect();
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const { hours: startHours } = parseTimeString(workHoursStart);

  // Calculate the latest calendar event end hour to extend the grid if needed
  const latestEventEndHour = useMemo(() => {
    let maxHour = 0;
    for (const event of calendarEvents) {
      if (event.end?.dateTime) {
        const endTime = parseISO(event.end.dateTime);
        // Round up to next hour if there are minutes
        const endHour = endTime.getMinutes() > 0 ? endTime.getHours() + 1 : endTime.getHours();
        maxHour = Math.max(maxHour, endHour);
      }
    }
    return maxHour;
  }, [calendarEvents]);

  const timeSlots = generateTimeSlots(workHoursStart, workHoursEnd, latestEventEndHour);

  // Calculate positioned calendar events for overlay display with overlap handling
  const positionedEvents = useMemo(() => {
    const PIXELS_PER_HOUR = 96; // 48px per 30-min slot = 96px per hour
    const TIME_LABEL_WIDTH = 64; // Width of time labels on left
    const CONTAINER_WIDTH = Math.max(
      (scheduleWidth ?? 240) - TIME_LABEL_WIDTH - 8,
      160
    ); // Keep events within the visible grid

    // First pass: calculate basic positions
    const positioned = calendarEvents
      .filter((event) => event.start?.dateTime && event.end?.dateTime)
      .map((event) => {
        const startTime = parseISO(event.start.dateTime!);
        const endTime = parseISO(event.end.dateTime!);

        const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
        const endMinutes = endTime.getHours() * 60 + endTime.getMinutes();

        const top = ((startMinutes - startHours * 60) / 60) * PIXELS_PER_HOUR;
        const height = Math.max(((endMinutes - startMinutes) / 60) * PIXELS_PER_HOUR, 24);

        return { event, top, height, left: TIME_LABEL_WIDTH, width: CONTAINER_WIDTH };
      })
      .filter((item) => item.top >= 0); // Only show events within visible range

    // Handle overlapping events - place into columns
    const sortedEvents = positioned.sort((a, b) => a.top - b.top);
    const columns: Array<Array<(typeof sortedEvents)[0]>> = [];

    sortedEvents.forEach((item) => {
      let placed = false;
      for (const column of columns) {
        const lastEvent = column[column.length - 1];
        if (!lastEvent || item.top >= lastEvent.top + lastEvent.height) {
          column.push(item);
          placed = true;
          break;
        }
      }
      if (!placed) {
        columns.push([item]);
      }
    });

    // Calculate widths and positions based on columns
    const numColumns = columns.length;
    const columnWidth = numColumns > 0 ? CONTAINER_WIDTH / numColumns : CONTAINER_WIDTH;

    columns.forEach((column, columnIndex) => {
      column.forEach((item) => {
        item.left = TIME_LABEL_WIDTH + columnIndex * columnWidth;
        item.width = columnWidth - 2; // Small gap between columns
      });
    });

    return sortedEvents;
  }, [calendarEvents, scheduleWidth, startHours]);

  // Filter tasks to only show those for today (not deferred to other days)
  const todaysTasks = useMemo(() => {
    const todayStart = startOfDay(planDate);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    return tasks.filter((task) => {
      if (!task.scheduledStart) return true; // Unscheduled tasks belong to today
      const taskDate = new Date(task.scheduledStart);
      return taskDate >= todayStart && taskDate < todayEnd;
    });
  }, [tasks, planDate]);

  // Filter today's tasks into scheduled and unscheduled
  const unscheduledTasks = todaysTasks.filter((t) => !t.scheduledStart);
  const scheduledTasks = todaysTasks.filter((t) => t.scheduledStart);

  // Check if a slot is occupied by a calendar event
  const isSlotOccupied = (hour: number, minute: number): boolean => {
    const slotStart = setMinutes(setHours(new Date(planDate), hour), minute);
    const slotEnd = addMinutes(slotStart, 30);

    for (const event of calendarEvents) {
      if (!event.start?.dateTime || !event.end?.dateTime) continue;

      const eventStart = new Date(event.start.dateTime);
      const eventEnd = new Date(event.end.dateTime);

      // Check if slot overlaps with event
      if (slotStart < eventEnd && slotEnd > eventStart) {
        return true;
      }
    }

    return false;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    setActiveTask(task ?? null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const taskId = active.id as string;
    const slotId = over.id as string;

    // Parse slot ID to get time (format: "slot-HH:MM")
    const timeMatch = slotId.match(/slot-(\d+):(\d+)/);
    if (!timeMatch) return;

    const hour = parseInt(timeMatch[1] ?? "0");
    const minute = parseInt(timeMatch[2] ?? "0");

    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // Calculate scheduled times
    const scheduledStart = setMinutes(setHours(new Date(planDate), hour), minute);
    const scheduledEnd = addMinutes(scheduledStart, task.duration);

    await onScheduleTask(taskId, scheduledStart, scheduledEnd);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={(event) => void handleDragEnd(event)}
    >
      <Group align="flex-start" gap="xl" wrap="nowrap">
        {/* Unscheduled Tasks Column */}
        <Stack w={280} gap="sm">
          <Group justify="space-between" align="center">
            <Text fw={600} size="sm" className="text-text-primary">
              Unscheduled Tasks
            </Text>
            {onGetSuggestions && unscheduledTasks.length > 0 && (
              <Button
                size="xs"
                variant="light"
                leftSection={<IconSparkles size={14} />}
                onClick={onGetSuggestions}
                loading={isLoadingSuggestions}
              >
                Get Suggestions
              </Button>
            )}
          </Group>
          <Text size="xs" c="dimmed" mb="xs">
            Drag tasks to the timeline to schedule them
          </Text>

          <Stack gap="xs">
            {unscheduledTasks.map((task) => (
              <DraggableTask key={task.id} task={task} />
            ))}

            {unscheduledTasks.length === 0 && (
              <Text size="xs" c="dimmed" ta="center" py="md">
                All tasks scheduled!
              </Text>
            )}
          </Stack>
        </Stack>

        {/* Time Grid */}
        <Stack flex={1} gap="sm">
          <Text fw={600} size="sm" className="text-text-primary">
            Schedule
          </Text>

          <Paper
            ref={scheduleContainerRef}
            className="bg-surface-secondary border border-border-primary relative"
            style={{ minHeight: timeSlots.length * 48 }}
          >
            {/* Time slots */}
            {timeSlots.map(({ hour, minute, isAfterHours }) => {
              const slotId = `slot-${hour}:${minute.toString().padStart(2, "0")}`;

              return (
                <TimeSlot
                  key={slotId}
                  id={slotId}
                  hour={hour}
                  minute={minute}
                  planDate={planDate}
                  isOccupied={isSlotOccupied(hour, minute)}
                  isAfterHours={isAfterHours}
                />
              );
            })}

            {/* Calendar events overlay */}
            {positionedEvents.map((item) => (
              <CalendarEventBlock
                key={item.event.id}
                event={item.event}
                style={{
                  position: "absolute",
                  top: item.top,
                  left: item.left,
                  width: item.width,
                  height: item.height,
                  zIndex: 5,
                }}
              />
            ))}

            {/* Scheduled tasks overlay */}
            {scheduledTasks.map((task) => (
              <ScheduledTaskBlock
                key={task.id}
                task={task}
                gridStartHour={startHours}
              />
            ))}
          </Paper>
        </Stack>
      </Group>

      <DragOverlay>
        {activeTask ? <TaskOverlay task={activeTask} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
