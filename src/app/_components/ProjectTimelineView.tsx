"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ActionIcon, Badge, Button, Group, Paper, Skeleton, Stack, Text, Title, Tooltip } from "@mantine/core";
import { api } from "~/trpc/react";
import { IconEdit } from "@tabler/icons-react";
import { CreateProjectModal } from "~/app/_components/CreateProjectModal";
import { ProjectViewTabs } from "~/app/_components/ProjectViewTabs";
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachMonthOfInterval,
  eachWeekOfInterval,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  startOfDay,
  startOfMonth,
} from "date-fns";

const LABEL_WIDTH = 220;

type TimelineZoom = "month" | "quarter" | "year";
type DragMode = "move" | "resize-start" | "resize-end";

interface TimelineProject {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED";
  priority: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  createdAt: Date;
  startDate: Date | null;
  endDate: Date | null;
  workspaceSlug?: string;
  workspaceName?: string;
}

interface TimelineProjectRange extends TimelineProject {
  rangeStart: Date;
  rangeEnd: Date;
}

interface ProjectTimelineViewProps {
  workspaceId?: string;
  workspaceSlug?: string;
}

interface DragState {
  projectId: string;
  mode: DragMode;
  initialPointerX: number;
  initialStartDate: Date;
  initialEndDate: Date;
  currentStartDate: Date;
  currentEndDate: Date;
}

function getZoomDayWidth(zoom: TimelineZoom): number {
  if (zoom === "month") return 28;
  if (zoom === "year") return 10;
  return 18;
}

function getStatusColor(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "green";
    case "ON_HOLD":
      return "yellow";
    case "COMPLETED":
      return "blue";
    case "CANCELLED":
      return "red";
    default:
      return "gray";
  }
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case "HIGH":
      return "red";
    case "MEDIUM":
      return "orange";
    case "LOW":
      return "blue";
    case "NONE":
      return "gray";
    default:
      return "gray";
  }
}

function clampToRange(date: Date, rangeStart: Date, rangeEnd: Date): Date {
  if (isBefore(date, rangeStart)) return rangeStart;
  if (isAfter(date, rangeEnd)) return rangeEnd;
  return date;
}

function isWithinRange(date: Date, rangeStart: Date, rangeEnd: Date): boolean {
  return !isBefore(date, rangeStart) && !isAfter(date, rangeEnd);
}

function buildProjectRange(project: TimelineProject): TimelineProjectRange {
  const rangeStart = startOfDay(project.startDate ?? project.createdAt);
  const candidateEnd = project.endDate ?? rangeStart;
  const normalizedEnd = startOfDay(candidateEnd);
  const rangeEnd = isBefore(normalizedEnd, rangeStart) ? rangeStart : normalizedEnd;

  return { ...project, rangeStart, rangeEnd };
}

function TimelineBar({
  project,
  left,
  width,
  dayWidth,
  timelineRangeStart,
  onDragStart,
  dragState,
  dragMovedRef,
}: {
  project: TimelineProjectRange;
  left: number;
  width: number;
  dayWidth: number;
  timelineRangeStart: Date;
  onDragStart: (projectId: string, mode: DragMode, pointerX: number, startDate: Date, endDate: Date) => void;
  dragState: DragState | null;
  dragMovedRef: React.RefObject<boolean>;
}) {
  const isDragging = dragState?.projectId === project.id;
  const displayStart = isDragging ? dragState.currentStartDate : project.rangeStart;
  const displayEnd = isDragging ? dragState.currentEndDate : project.rangeEnd;

  const displayLeft = isDragging
    ? differenceInCalendarDays(displayStart, timelineRangeStart) * dayWidth
    : left;
  const displayWidth = isDragging
    ? (differenceInCalendarDays(displayEnd, displayStart) + 1) * dayWidth
    : width;

  const handlePointerDown = (e: React.PointerEvent, mode: DragMode) => {
    e.preventDefault();
    e.stopPropagation();
    onDragStart(project.id, mode, e.clientX, project.rangeStart, project.rangeEnd);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (dragMovedRef.current) {
      e.stopPropagation();
    }
  };

  return (
    <div
      className={`absolute top-2 flex h-12 items-center rounded-md border border-border-primary bg-brand-primary/25 text-xs font-medium text-text-primary ${
        isDragging ? "opacity-80 ring-2 ring-brand-primary" : ""
      }`}
      style={{
        left: displayLeft,
        width: Math.max(displayWidth, dayWidth),
        cursor: isDragging && dragState.mode === "move" ? "grabbing" : "grab",
        userSelect: "none",
      }}
      title={`${format(displayStart, "PPP")} → ${format(displayEnd, "PPP")}`}
      onPointerDown={(e) => handlePointerDown(e, "move")}
      onClick={handleClick}
    >
      {/* Left resize handle */}
      <div
        className="absolute left-0 top-0 z-10 h-full w-2 cursor-col-resize rounded-l-md hover:bg-brand-primary/30"
        onPointerDown={(e) => handlePointerDown(e, "resize-start")}
      />
      {/* Bar content */}
      <div className="truncate px-3">
        {project.name}
      </div>
      {/* Right resize handle */}
      <div
        className="absolute right-0 top-0 z-10 h-full w-2 cursor-col-resize rounded-r-md hover:bg-brand-primary/30"
        onPointerDown={(e) => handlePointerDown(e, "resize-end")}
      />
    </div>
  );
}

export function ProjectTimelineView({
  workspaceId,
  workspaceSlug,
}: ProjectTimelineViewProps) {
  const [zoom, setZoom] = useState<TimelineZoom>("quarter");
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragMovedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isGlobal = !workspaceId;

  const utils = api.useUtils();
  const queryInput = workspaceId ? { workspaceId } : {};
  const updateDates = api.project.updateDates.useMutation({
    onMutate: async (newData) => {
      await utils.project.getAll.cancel();
      const previousData = utils.project.getAll.getData(queryInput);
      utils.project.getAll.setData(queryInput, (old) =>
        old?.map((p) =>
          p.id === newData.id
            ? { ...p, startDate: newData.startDate, endDate: newData.endDate }
            : p
        )
      );
      return { previousData };
    },
    onError: (_err, _newData, context) => {
      if (context?.previousData) {
        utils.project.getAll.setData(queryInput, context.previousData);
      }
    },
    onSettled: () => {
      void utils.project.getAll.invalidate();
    },
  });

  const { data: projects, isLoading } = api.project.getAll.useQuery(
    workspaceId ? { workspaceId } : {},
    {
      select: (data): TimelineProject[] =>
        data?.map((project) => ({
          id: project.id,
          name: project.name,
          slug: project.slug,
          status: project.status as TimelineProject["status"],
          priority: project.priority as TimelineProject["priority"],
          createdAt: project.createdAt,
          startDate: project.startDate ?? null,
          endDate: project.endDate ?? null,
          workspaceSlug: project.workspace?.slug,
          workspaceName: project.workspace?.name,
        })) ?? [],
    }
  );

  const timelineProjects = useMemo(
    () => (projects ?? []).map(buildProjectRange),
    [projects]
  );

  const today = startOfDay(new Date());

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (timelineProjects.length === 0) {
      const start = startOfMonth(addMonths(today, -1));
      const end = endOfMonth(addMonths(today, 1));
      return { rangeStart: start, rangeEnd: end };
    }

    const earliestStart = timelineProjects.reduce((minDate, project) =>
      isBefore(project.rangeStart, minDate) ? project.rangeStart : minDate
    , timelineProjects[0]!.rangeStart);

    const latestEnd = timelineProjects.reduce((maxDate, project) =>
      isAfter(project.rangeEnd, maxDate) ? project.rangeEnd : maxDate
    , timelineProjects[0]!.rangeEnd);

    const paddedStart = startOfMonth(addMonths(earliestStart, -1));
    const paddedEnd = endOfMonth(addMonths(latestEnd, 1));

    return { rangeStart: paddedStart, rangeEnd: paddedEnd };
  }, [timelineProjects, today]);

  const dayWidth = getZoomDayWidth(zoom);
  const totalDays = differenceInCalendarDays(rangeEnd, rangeStart) + 1;
  const timelineWidth = totalDays * dayWidth;
  const months = useMemo(
    () => eachMonthOfInterval({ start: rangeStart, end: rangeEnd }),
    [rangeStart, rangeEnd]
  );
  const weeks = useMemo(
    () =>
      eachWeekOfInterval(
        { start: rangeStart, end: rangeEnd },
        { weekStartsOn: 1 }
      ).filter((weekStart) => !isBefore(weekStart, rangeStart)),
    [rangeStart, rangeEnd]
  );

  const isTodayInRange = isWithinRange(today, rangeStart, rangeEnd);
  const todayOffset = differenceInCalendarDays(today, rangeStart) * dayWidth;

  const weekOffsets = weeks.map(
    (weekStart) =>
      differenceInCalendarDays(weekStart, rangeStart) * dayWidth
  );

  function scrollToToday() {
    if (!scrollRef.current || !isTodayInRange) return;
    const left = Math.max(todayOffset - 240, 0);
    scrollRef.current.scrollTo({ left, behavior: "smooth" });
  }

  const handleDragStart = useCallback((
    projectId: string,
    mode: DragMode,
    pointerX: number,
    startDate: Date,
    endDate: Date,
  ) => {
    dragMovedRef.current = false;
    setDragState({
      projectId,
      mode,
      initialPointerX: pointerX,
      initialStartDate: startDate,
      initialEndDate: endDate,
      currentStartDate: startDate,
      currentEndDate: endDate,
    });
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState) return;

    const deltaX = e.clientX - dragState.initialPointerX;
    const deltaDays = Math.round(deltaX / dayWidth);

    if (deltaDays === 0 && dragState.currentStartDate === dragState.initialStartDate) return;

    dragMovedRef.current = true;

    let newStart = dragState.initialStartDate;
    let newEnd = dragState.initialEndDate;

    if (dragState.mode === "move") {
      newStart = addDays(dragState.initialStartDate, deltaDays);
      newEnd = addDays(dragState.initialEndDate, deltaDays);
    } else if (dragState.mode === "resize-start") {
      newStart = addDays(dragState.initialStartDate, deltaDays);
      if (isAfter(newStart, dragState.initialEndDate)) {
        newStart = dragState.initialEndDate;
      }
    } else if (dragState.mode === "resize-end") {
      newEnd = addDays(dragState.initialEndDate, deltaDays);
      if (isBefore(newEnd, dragState.initialStartDate)) {
        newEnd = dragState.initialStartDate;
      }
    }

    setDragState((prev) =>
      prev ? { ...prev, currentStartDate: newStart, currentEndDate: newEnd } : null
    );
  }, [dragState, dayWidth]);

  const handlePointerUp = useCallback(() => {
    if (!dragState) return;

    const startChanged = differenceInCalendarDays(dragState.currentStartDate, dragState.initialStartDate) !== 0;
    const endChanged = differenceInCalendarDays(dragState.currentEndDate, dragState.initialEndDate) !== 0;

    if (startChanged || endChanged) {
      updateDates.mutate({
        id: dragState.projectId,
        startDate: dragState.currentStartDate,
        endDate: dragState.currentEndDate,
      });
    }

    setDragState(null);
  }, [dragState, updateDates]);

  if (isLoading) {
    return (
      <Paper className="border border-border-primary bg-surface-secondary p-6">
        <Stack gap="sm">
          <Skeleton height={24} width={200} />
          <Skeleton height={280} />
        </Stack>
      </Paper>
    );
  }

  return (
    <Stack gap="md">
      <ProjectViewTabs activeView="timeline" />
      <Group justify="space-between" align="center">
        <div>
          <Title order={3} className="text-text-primary">
            Timeline
          </Title>
          <Text size="sm" className="text-text-secondary">
            Project timeline based on start and end dates
          </Text>
        </div>
        <Group gap="sm">
          <Group gap={4}>
            {(["month", "quarter", "year"] as TimelineZoom[]).map((value) => (
              <Button
                key={value}
                variant={zoom === value ? "filled" : "light"}
                size="xs"
                onClick={() => setZoom(value)}
              >
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </Button>
            ))}
          </Group>
          <Button
            variant="light"
            size="xs"
            onClick={scrollToToday}
            disabled={!isTodayInRange}
          >
            Today
          </Button>
        </Group>
      </Group>

      <Paper className="border border-border-primary bg-surface-secondary">
        <div
          ref={scrollRef}
          className="overflow-x-auto"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <div style={{ minWidth: timelineWidth + LABEL_WIDTH }}>
            <div className="grid grid-cols-[220px_1fr] border-b border-border-primary">
              <div className="sticky left-0 z-20 bg-surface-secondary px-4 py-3">
                <Text size="xs" className="text-text-muted">
                  Project
                </Text>
              </div>
              <div className="relative">
                <div className="relative h-8 border-b border-border-secondary">
                  {months.map((monthStart) => {
                    const monthEnd = endOfMonth(monthStart);
                    const clampedStart = clampToRange(
                      monthStart,
                      rangeStart,
                      rangeEnd
                    );
                    const clampedEnd = clampToRange(
                      monthEnd,
                      rangeStart,
                      rangeEnd
                    );
                    const left =
                      differenceInCalendarDays(clampedStart, rangeStart) *
                      dayWidth;
                    const width =
                      (differenceInCalendarDays(clampedEnd, clampedStart) + 1) *
                      dayWidth;

                    return (
                      <div
                        key={monthStart.toISOString()}
                        className="absolute top-0 flex h-full items-center border-r border-border-secondary px-2 text-xs text-text-secondary"
                        style={{ left, width }}
                      >
                        {format(monthStart, "MMMM")}
                      </div>
                    );
                  })}
                </div>
                <div className="relative h-8">
                  {weekOffsets.map((offset, index) => (
                    <div
                      key={`week-${index}`}
                      className="absolute top-0 flex h-full items-center border-r border-border-secondary px-2 text-xs text-text-muted"
                      style={{ left: offset, width: dayWidth * 7 }}
                    >
                      {format(weeks[index] ?? rangeStart, "d")}
                    </div>
                  ))}
                  {isTodayInRange && (
                    <div
                      className="absolute top-0 h-full w-px bg-brand-primary"
                      style={{ left: todayOffset }}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="pointer-events-none absolute inset-0">
                {weekOffsets.map((offset, index) => (
                  <div
                    key={`grid-week-${index}`}
                    className="absolute top-0 h-full border-l border-border-secondary"
                    style={{ left: offset }}
                  />
                ))}
                {isTodayInRange && (
                  <div
                    className="absolute top-0 h-full w-px bg-brand-primary"
                    style={{ left: todayOffset }}
                  />
                )}
              </div>

              {timelineProjects.length === 0 ? (
                <div className="grid grid-cols-[220px_1fr]">
                  <div className="sticky left-0 z-10 bg-surface-secondary px-4 py-4">
                    <Text size="sm" className="text-text-muted">
                      No projects yet
                    </Text>
                  </div>
                  <div className="h-12" />
                </div>
              ) : (
                timelineProjects.map((project) => {
                  if (
                    isBefore(project.rangeEnd, rangeStart) ||
                    isAfter(project.rangeStart, rangeEnd)
                  ) {
                    return null;
                  }

                  const clampedStart = clampToRange(
                    project.rangeStart,
                    rangeStart,
                    rangeEnd
                  );
                  const clampedEnd = clampToRange(
                    project.rangeEnd,
                    rangeStart,
                    rangeEnd
                  );

                  const left =
                    differenceInCalendarDays(clampedStart, rangeStart) *
                    dayWidth;
                  const width =
                    (differenceInCalendarDays(clampedEnd, clampedStart) + 1) *
                    dayWidth;

                  return (
                    <div
                      key={project.id}
                      className="group grid grid-cols-[220px_1fr] border-b border-border-secondary"
                    >
                      <div className="sticky left-0 z-10 flex flex-col gap-1 bg-surface-secondary px-4 py-3 group-hover:bg-surface-hover">
                        <Group justify="space-between" align="center" gap="xs" wrap="nowrap">
                          <Link
                            href={`/w/${workspaceSlug ?? project.workspaceSlug}/projects/${project.slug}-${project.id}`}
                            className="truncate text-sm font-medium text-text-primary hover:text-brand-primary"
                          >
                            {project.name}
                          </Link>
                          <CreateProjectModal project={project}>
                            <Tooltip label="Edit project" position="top" withArrow>
                              <ActionIcon
                                variant="subtle"
                                size="sm"
                                aria-label="Edit project"
                                className="opacity-0 transition-opacity group-hover:opacity-100"
                              >
                                <IconEdit size={14} />
                              </ActionIcon>
                            </Tooltip>
                          </CreateProjectModal>
                        </Group>
                        <Group gap={6} wrap="nowrap">
                          {isGlobal && project.workspaceName && (
                            <Badge
                              size="xs"
                              variant="outline"
                              color="gray"
                            >
                              {project.workspaceName}
                            </Badge>
                          )}
                          <Badge
                            size="xs"
                            variant="light"
                            color={getStatusColor(project.status)}
                          >
                            {project.status.toLowerCase().replace("_", " ")}
                          </Badge>
                          <Badge
                            size="xs"
                            variant="light"
                            color={getPriorityColor(project.priority)}
                          >
                            {project.priority.toLowerCase()}
                          </Badge>
                        </Group>
                      </div>
                      <div className="relative py-2">
                        <CreateProjectModal project={project}>
                          <TimelineBar
                            project={project}
                            left={left}
                            width={width}
                            dayWidth={dayWidth}
                            timelineRangeStart={rangeStart}
                            onDragStart={handleDragStart}
                            dragState={dragState}
                            dragMovedRef={dragMovedRef}
                          />
                        </CreateProjectModal>
                        <div className="h-14" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </Paper>
    </Stack>
  );
}
