'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Skeleton } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import {
  IconTable,
  IconLayoutList,
  IconTimeline,
  IconSearch,
  IconFilter,
  IconArrowsSort,
  IconSparkles,
  IconPlus,
} from '@tabler/icons-react';
import {
  addDays,
  differenceInCalendarDays,
  eachMonthOfInterval,
  eachWeekOfInterval,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  startOfDay,
  startOfMonth,
  addMonths,
} from 'date-fns';
import { api } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { CreateProjectModal } from '~/app/_components/CreateProjectModal';
import styles from './WorkspaceProjectsTimelineConceptD.module.css';

const VIEW_TABS = [
  { value: 'table', label: 'Projects', icon: IconTable, path: '/projects' },
  { value: 'projects-tasks', label: 'Projects & Tasks', icon: IconLayoutList, path: '/projects-tasks' },
  { value: 'timeline', label: 'Timeline', icon: IconTimeline, path: '/timeline' },
] as const;

type ViewTabValue = typeof VIEW_TABS[number]['value'];
type TimelineZoom = 'month' | 'quarter' | 'year';
type DragMode = 'move' | 'resize-start' | 'resize-end';

interface TimelineProject {
  id: string;
  name: string;
  slug: string;
  status: string;
  priority: string;
  createdAt: Date;
  startDate: Date | null;
  endDate: Date | null;
  workspaceSlug?: string;
}

interface TimelineProjectRange extends TimelineProject {
  rangeStart: Date;
  rangeEnd: Date;
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

const LABEL_WIDTH = 280;
const ROW_HEIGHT = 56;
const MONTH_HEADER_HEIGHT = 28;
const WEEK_HEADER_HEIGHT = 24;
const HEADER_HEIGHT = MONTH_HEADER_HEIGHT + WEEK_HEADER_HEIGHT;

function getZoomDayWidth(zoom: TimelineZoom): number {
  if (zoom === 'month') return 28;
  if (zoom === 'year') return 10;
  return 18;
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

function getBarClass(status: string): string {
  switch (status) {
    case 'ACTIVE': return styles.ganttBarActive ?? '';
    case 'ON_HOLD': return styles.ganttBarOnHold ?? '';
    case 'COMPLETED': return styles.ganttBarCompleted ?? '';
    default: return styles.ganttBarCancelled ?? '';
  }
}

function getStatusDotColor(status: string): string {
  switch (status) {
    case 'ACTIVE': return 'var(--mantine-color-green-6)';
    case 'ON_HOLD': return 'var(--mantine-color-yellow-6)';
    case 'COMPLETED': return 'var(--mantine-color-blue-6)';
    default: return 'var(--mantine-color-gray-5)';
  }
}

function getStatusChipStyle(status: string): React.CSSProperties {
  switch (status) {
    case 'ACTIVE': return { background: 'var(--mantine-color-green-light)', color: 'var(--mantine-color-green-light-color)' };
    case 'ON_HOLD': return { background: 'var(--mantine-color-yellow-light)', color: 'var(--mantine-color-yellow-light-color)' };
    case 'COMPLETED': return { background: 'var(--mantine-color-blue-light)', color: 'var(--mantine-color-blue-light-color)' };
    default: return { background: 'var(--mantine-color-gray-light)', color: 'var(--mantine-color-gray-light-color)' };
  }
}

function getStatusLabel(status: string): string {
  const map: Record<string, string> = { ACTIVE: 'Active', ON_HOLD: 'Hold', COMPLETED: 'Done', CANCELLED: 'Cancelled' };
  return map[status] ?? status;
}

function getPriorityChipStyle(priority: string): React.CSSProperties {
  switch (priority) {
    case 'HIGH': return { background: 'var(--mantine-color-red-light)', color: 'var(--mantine-color-red-light-color)' };
    case 'MEDIUM': return { background: 'var(--mantine-color-orange-light)', color: 'var(--mantine-color-orange-light-color)' };
    case 'LOW': return { background: 'var(--mantine-color-blue-light)', color: 'var(--mantine-color-blue-light-color)' };
    default: return { background: 'var(--mantine-color-gray-light)', color: 'var(--mantine-color-gray-light-color)' };
  }
}

function getPriorityBars(priority: string): Array<{ h: number; active: boolean }> {
  switch (priority) {
    case 'HIGH': return [{ h: 5, active: true }, { h: 8, active: true }, { h: 12, active: true }];
    case 'MEDIUM': return [{ h: 5, active: true }, { h: 8, active: true }, { h: 12, active: false }];
    case 'LOW': return [{ h: 5, active: true }, { h: 8, active: false }, { h: 12, active: false }];
    default: return [{ h: 5, active: false }, { h: 8, active: false }, { h: 12, active: false }];
  }
}

function getPriorityBarColor(priority: string): string {
  switch (priority) {
    case 'HIGH': return 'var(--mantine-color-red-6)';
    case 'MEDIUM': return 'var(--mantine-color-orange-6)';
    case 'LOW': return 'var(--mantine-color-blue-6)';
    default: return 'var(--color-border-primary)';
  }
}

function getPriorityShortLabel(priority: string): string {
  const map: Record<string, string> = { HIGH: 'Hig', MEDIUM: 'Med', LOW: 'Low', NONE: '—' };
  return map[priority] ?? priority.slice(0, 3);
}

export function WorkspaceProjectsTimelineConceptD() {
  const { workspace, workspaceId } = useWorkspace();
  const pathname = usePathname();
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragMovedRef = useRef(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [zoom, setZoom] = useState<TimelineZoom>('quarter');
  const [dragState, setDragState] = useState<DragState | null>(null);

  const prefix = workspace?.slug ? `/w/${workspace.slug}` : '';

  const activeTab: ViewTabValue = useMemo(() => {
    if (pathname.includes('/projects-tasks')) return 'projects-tasks';
    if (pathname.includes('/timeline')) return 'timeline';
    return 'table';
  }, [pathname]);

  useHotkeys([['mod+k', () => searchRef.current?.focus()]]);

  const utils = api.useUtils();
  const queryInput = useMemo(
    () => (workspaceId ? { workspaceId } : {}),
    [workspaceId],
  );

  const updateDates = api.project.updateDates.useMutation({
    onMutate: async (newData) => {
      await utils.project.getAll.cancel();
      const prev = utils.project.getAll.getData(queryInput);
      utils.project.getAll.setData(queryInput, (old) =>
        old?.map((p) =>
          p.id === newData.id
            ? { ...p, startDate: newData.startDate, endDate: newData.endDate }
            : p,
        ),
      );
      return { prev };
    },
    onError: (_err, _data, ctx) => {
      if (ctx?.prev) utils.project.getAll.setData(queryInput, ctx.prev);
    },
    onSettled: () => void utils.project.getAll.invalidate(),
  });

  const { data: rawProjects, isLoading } = api.project.getAll.useQuery(queryInput, {
    select: (data): TimelineProject[] =>
      data?.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        status: p.status,
        priority: p.priority,
        createdAt: p.createdAt,
        startDate: p.startDate ?? null,
        endDate: p.endDate ?? null,
        workspaceSlug: p.workspace?.slug,
      })) ?? [],
  });

  const timelineProjects = useMemo(
    () => (rawProjects ?? []).map(buildProjectRange),
    [rawProjects],
  );

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return timelineProjects;
    const q = searchQuery.toLowerCase();
    return timelineProjects.filter((p) => p.name.toLowerCase().includes(q));
  }, [timelineProjects, searchQuery]);

  const today = startOfDay(new Date());

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (timelineProjects.length === 0) {
      return {
        rangeStart: startOfMonth(addMonths(today, -1)),
        rangeEnd: endOfMonth(addMonths(today, 2)),
      };
    }
    const earliestStart = timelineProjects.reduce(
      (min, p) => (isBefore(p.rangeStart, min) ? p.rangeStart : min),
      timelineProjects[0]!.rangeStart,
    );
    const latestEnd = timelineProjects.reduce(
      (max, p) => (isAfter(p.rangeEnd, max) ? p.rangeEnd : max),
      timelineProjects[0]!.rangeEnd,
    );
    return {
      rangeStart: startOfMonth(addMonths(earliestStart, -1)),
      rangeEnd: endOfMonth(addMonths(latestEnd, 1)),
    };
  }, [timelineProjects, today]);

  const dayWidth = getZoomDayWidth(zoom);
  const totalDays = differenceInCalendarDays(rangeEnd, rangeStart) + 1;
  const timelineWidth = totalDays * dayWidth;

  const months = useMemo(
    () => eachMonthOfInterval({ start: rangeStart, end: rangeEnd }),
    [rangeStart, rangeEnd],
  );

  const weeks = useMemo(
    () =>
      eachWeekOfInterval({ start: rangeStart, end: rangeEnd }, { weekStartsOn: 1 }).filter(
        (w) => !isBefore(w, rangeStart),
      ),
    [rangeStart, rangeEnd],
  );

  const isTodayInRange = isWithinRange(today, rangeStart, rangeEnd);
  const todayOffset = differenceInCalendarDays(today, rangeStart) * dayWidth;

  const weekOffsets = weeks.map((w) => differenceInCalendarDays(w, rangeStart) * dayWidth);

  function scrollToToday() {
    if (!scrollRef.current || !isTodayInRange) return;
    scrollRef.current.scrollLeft = Math.max(todayOffset - 240, 0);
  }

  const handleDragStart = useCallback(
    (projectId: string, mode: DragMode, pointerX: number, startDate: Date, endDate: Date) => {
      dragMovedRef.current = false;
      setDragState({ projectId, mode, initialPointerX: pointerX, initialStartDate: startDate, initialEndDate: endDate, currentStartDate: startDate, currentEndDate: endDate });
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState) return;
      const deltaDays = Math.round((e.clientX - dragState.initialPointerX) / dayWidth);
      if (deltaDays === 0) return;
      dragMovedRef.current = true;

      let newStart = dragState.initialStartDate;
      let newEnd = dragState.initialEndDate;

      if (dragState.mode === 'move') {
        newStart = addDays(dragState.initialStartDate, deltaDays);
        newEnd = addDays(dragState.initialEndDate, deltaDays);
      } else if (dragState.mode === 'resize-start') {
        newStart = addDays(dragState.initialStartDate, deltaDays);
        if (isAfter(newStart, dragState.initialEndDate)) newStart = dragState.initialEndDate;
      } else {
        newEnd = addDays(dragState.initialEndDate, deltaDays);
        if (isBefore(newEnd, dragState.initialStartDate)) newEnd = dragState.initialStartDate;
      }

      setDragState((prev) => prev ? { ...prev, currentStartDate: newStart, currentEndDate: newEnd } : null);
    },
    [dragState, dayWidth],
  );

  const handlePointerUp = useCallback(() => {
    if (!dragState) return;
    const startChanged = differenceInCalendarDays(dragState.currentStartDate, dragState.initialStartDate) !== 0;
    const endChanged = differenceInCalendarDays(dragState.currentEndDate, dragState.initialEndDate) !== 0;
    if (startChanged || endChanged) {
      updateDates.mutate({ id: dragState.projectId, startDate: dragState.currentStartDate, endDate: dragState.currentEndDate });
    }
    setDragState(null);
  }, [dragState, updateDates]);

  return (
    <div className={styles.page}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <nav className={styles.viewTabs}>
          {VIEW_TABS.map(({ value, label, icon: Icon, path }) => (
            <Link key={value} href={`${prefix}${path}`} className={styles.viewTab} data-active={activeTab === value ? 'true' : 'false'}>
              <Icon size={13} stroke={1.75} />
              {label}
            </Link>
          ))}
        </nav>

        <div className={styles.actions}>
          <div className={styles.searchWrap}>
            <IconSearch className={styles.searchIcon} size={13} stroke={1.75} />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search  ⌘K"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && searchRef.current?.blur()}
              className={styles.searchInput}
            />
          </div>
          <button className={styles.actionBtn} type="button">
            <IconFilter size={13} stroke={1.75} />
            Filter
          </button>
          <button className={styles.actionBtn} type="button">
            <IconArrowsSort size={13} stroke={1.75} />
            Sort
          </button>
          <button className={styles.actionBtn} type="button">
            <IconSparkles size={13} stroke={1.75} />
            Ask Zoe
          </button>
          <CreateProjectModal>
            <button className={styles.newBtn} type="button">
              <IconPlus size={13} stroke={2.5} />
              New project
            </button>
          </CreateProjectModal>
        </div>
      </div>

      {/* Sub-header: info + zoom controls */}
      <div className={styles.subHeader}>
        <span className={styles.subHeaderInfo}>Project timeline based on start and end dates</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <div className={styles.zoomGroup}>
            {(['month', 'quarter', 'year'] as TimelineZoom[]).map((z) => (
              <button
                key={z}
                type="button"
                className={`${styles.zoomBtn} ${zoom === z ? styles.zoomBtnActive : ''}`}
                onClick={() => setZoom(z)}
              >
                {z.charAt(0).toUpperCase() + z.slice(1)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.todayBtn}
            onClick={scrollToToday}
            disabled={!isTodayInRange}
          >
            Today
          </button>
        </div>
      </div>

      {/* Gantt chart */}
      <div className={styles.ganttOuter}>
        {isLoading ? (
          <div style={{ padding: '24px 32px' }}>
            <Skeleton height={300} radius="sm" />
          </div>
        ) : (
          <div
            className={styles.ganttScroll}
            ref={scrollRef}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            {/* Fixed-width inner wrapper */}
            <div style={{ minWidth: LABEL_WIDTH + timelineWidth, display: 'flex', flexDirection: 'column' }}>
              {/* Header row: label col header + timeline header */}
              <div className={styles.ganttHeader}>
                {/* Label col header */}
                <div className={styles.labelHeader} style={{ width: LABEL_WIDTH, height: HEADER_HEIGHT, display: 'flex', alignItems: 'flex-end' }}>
                  PROJECT
                </div>

                {/* Timeline header */}
                <div style={{ flex: 1, position: 'relative', width: timelineWidth, height: HEADER_HEIGHT }}>
                  {/* Month row */}
                  <div style={{ position: 'relative', height: MONTH_HEADER_HEIGHT, borderBottom: `1px solid var(--color-border-primary)` }}>
                    {months.map((monthStart) => {
                      const monthEnd = endOfMonth(monthStart);
                      const cStart = clampToRange(monthStart, rangeStart, rangeEnd);
                      const cEnd = clampToRange(monthEnd, rangeStart, rangeEnd);
                      const left = differenceInCalendarDays(cStart, rangeStart) * dayWidth;
                      const width = (differenceInCalendarDays(cEnd, cStart) + 1) * dayWidth;
                      return (
                        <div key={monthStart.toISOString()} className={styles.monthHeader} style={{ left, width }}>
                          {format(monthStart, 'MMMM yyyy')}
                        </div>
                      );
                    })}
                  </div>
                  {/* Week row */}
                  <div style={{ position: 'relative', height: WEEK_HEADER_HEIGHT }}>
                    {weekOffsets.map((offset, i) => (
                      <div key={`wh-${i}`} className={styles.weekHeader} style={{ left: offset, width: dayWidth * 7 }}>
                        {format(weeks[i] ?? rangeStart, 'd')}
                      </div>
                    ))}
                    {isTodayInRange && (
                      <div className={styles.todayLine} style={{ left: todayOffset }} />
                    )}
                  </div>
                </div>
              </div>

              {/* Data rows */}
              {filteredProjects.length === 0 ? (
                <div style={{ display: 'flex' }}>
                  <div className={styles.labelCell} style={{ width: LABEL_WIDTH, height: ROW_HEIGHT }}>
                    <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No projects found</span>
                  </div>
                  <div style={{ flex: 1 }} />
                </div>
              ) : (
                filteredProjects.map((project) => {
                  const isDragging = dragState?.projectId === project.id;
                  const displayStart = isDragging ? dragState.currentStartDate : project.rangeStart;
                  const displayEnd = isDragging ? dragState.currentEndDate : project.rangeEnd;

                  const clampedStart = clampToRange(displayStart, rangeStart, rangeEnd);
                  const clampedEnd = clampToRange(displayEnd, rangeStart, rangeEnd);
                  const barLeft = differenceInCalendarDays(clampedStart, rangeStart) * dayWidth;
                  const barWidth = Math.max(
                    (differenceInCalendarDays(clampedEnd, clampedStart) + 1) * dayWidth,
                    dayWidth,
                  );

                  const barClass = getBarClass(project.status);
                  const priBars = getPriorityBars(project.priority);
                  const priBarColor = getPriorityBarColor(project.priority);
                  const statusStyle = getStatusChipStyle(project.status);
                  const priStyle = getPriorityChipStyle(project.priority);

                  return (
                    <div key={project.id} className={styles.ganttRow}>
                      {/* Label column */}
                      <div className={styles.labelCell} style={{ width: LABEL_WIDTH, minHeight: ROW_HEIGHT }}>
                        <Link
                          href={`${prefix}/projects/${project.slug}-${project.id}`}
                          className={styles.labelName}
                        >
                          {project.name}
                        </Link>
                        <div className={styles.labelChips}>
                          <span className={styles.statusDotChip} style={statusStyle}>
                            <span className={styles.statusDot} style={{ background: getStatusDotColor(project.status) }} />
                            {getStatusLabel(project.status)}
                          </span>
                          <span className={styles.priorityMini} style={priStyle}>
                            <span className={styles.priorityMiniBars}>
                              {priBars.map((b, i) => (
                                <span
                                  key={i}
                                  className={styles.priorityMiniBar}
                                  style={{ height: b.h, background: b.active ? priBarColor : 'var(--color-border-primary)' }}
                                />
                              ))}
                            </span>
                            {getPriorityShortLabel(project.priority)}
                          </span>
                        </div>
                      </div>

                      {/* Gantt area */}
                      <div
                        style={{ position: 'relative', width: timelineWidth, minHeight: ROW_HEIGHT }}
                      >
                        {/* Grid lines */}
                        {weekOffsets.map((offset, i) => (
                          <div key={`gl-${i}`} className={styles.gridLine} style={{ left: offset }} />
                        ))}
                        {isTodayInRange && (
                          <div className={styles.todayLine} style={{ left: todayOffset }} />
                        )}

                        {/* Gantt bar */}
                        <CreateProjectModal project={project}>
                          <div
                            className={`${styles.ganttBar} ${barClass} ${isDragging ? 'opacity-80' : ''}`}
                            style={{ left: barLeft, width: barWidth }}
                            onPointerDown={(e) => {
                              e.preventDefault();
                              handleDragStart(project.id, 'move', e.clientX, project.rangeStart, project.rangeEnd);
                            }}
                            onClick={(e) => { if (dragMovedRef.current) e.stopPropagation(); }}
                          >
                            <div
                              className={`${styles.resizeHandle} ${styles.resizeHandleLeft}`}
                              onPointerDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDragStart(project.id, 'resize-start', e.clientX, project.rangeStart, project.rangeEnd);
                              }}
                            />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                              {project.name}
                            </span>
                            <div
                              className={`${styles.resizeHandle} ${styles.resizeHandleRight}`}
                              onPointerDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDragStart(project.id, 'resize-end', e.clientX, project.rangeStart, project.rangeEnd);
                              }}
                            />
                          </div>
                        </CreateProjectModal>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
