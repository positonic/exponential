"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ActionIcon, Badge, Button, Group, Paper, Skeleton, Stack, Text, Title, Tooltip } from "@mantine/core";
import { api } from "~/trpc/react";
import { IconEdit } from "@tabler/icons-react";
import { CreateProjectModal } from "~/app/_components/CreateProjectModal";
import {
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

interface TimelineProject {
  id: string;
  name: string;
  slug: string;
  status: string;
  priority: string;
  createdAt: Date;
  reviewDate: Date | null;
  nextActionDate: Date | null;
}

interface TimelineProjectRange extends TimelineProject {
  startDate: Date;
  endDate: Date;
}

interface ProjectTimelineViewProps {
  workspaceId: string;
  workspaceSlug: string;
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
  const startDate = startOfDay(project.nextActionDate ?? project.createdAt);
  const candidateEnd = project.reviewDate ?? startDate;
  const normalizedEnd = startOfDay(candidateEnd);
  const endDate = isBefore(normalizedEnd, startDate) ? startDate : normalizedEnd;

  return { ...project, startDate, endDate };
}

export function ProjectTimelineView({
  workspaceId,
  workspaceSlug,
}: ProjectTimelineViewProps) {
  const [zoom, setZoom] = useState<TimelineZoom>("quarter");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const { data: projects, isLoading } = api.project.getAll.useQuery(
    { workspaceId },
    {
      select: (data): TimelineProject[] =>
        data?.map((project) => ({
          id: project.id,
          name: project.name,
          slug: project.slug,
          status: project.status,
          priority: project.priority,
          createdAt: project.createdAt,
          reviewDate: project.reviewDate ?? null,
          nextActionDate: project.nextActionDate ?? null,
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
      isBefore(project.startDate, minDate) ? project.startDate : minDate
    , timelineProjects[0]!.startDate);

    const latestEnd = timelineProjects.reduce((maxDate, project) =>
      isAfter(project.endDate, maxDate) ? project.endDate : maxDate
    , timelineProjects[0]!.endDate);

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
        <div ref={scrollRef} className="overflow-x-auto">
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
                    isBefore(project.endDate, rangeStart) ||
                    isAfter(project.startDate, rangeEnd)
                  ) {
                    return null;
                  }

                  const clampedStart = clampToRange(
                    project.startDate,
                    rangeStart,
                    rangeEnd
                  );
                  const clampedEnd = clampToRange(
                    project.endDate,
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
                            href={`/w/${workspaceSlug}/projects/${project.slug}-${project.id}`}
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
                        <div
                          className="absolute top-2 h-6 rounded-full border border-border-primary bg-brand-primary/15 px-3 text-xs font-medium text-text-primary"
                          style={{ left, width }}
                          title={`${format(
                            project.startDate,
                            "PPP"
                          )} → ${format(project.endDate, "PPP")}`}
                        >
                          <div className="flex h-full items-center truncate">
                            {project.name}
                          </div>
                        </div>
                        <div className="h-10" />
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
