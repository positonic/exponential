'use client';

import React, { useState, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Avatar, Checkbox, Collapse, Skeleton, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconTable,
  IconLayoutList,
  IconTimeline,
  IconSearch,
  IconFilter,
  IconArrowsSort,
  IconSparkles,
  IconPlus,
  IconChevronRight,
  IconCircleDot,
  IconFlag,
  IconUser,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { CreateProjectModal } from '~/app/_components/CreateProjectModal';
import { CreateActionModal } from '~/app/_components/CreateActionModal';
import { EditActionModal } from '~/app/_components/EditActionModal';
import { calculateProjectHealth } from '~/app/_components/home/ProjectHealth';
import { FilterBar } from '~/app/_components/filters';
import { ProjectSortMenu } from '~/app/_components/toolbar';
import { useProjectViewState, filterProjects } from './useProjectViewState';
import { hasActiveFilters } from '~/types/filter';
import type { FilterBarConfig, FilterMember } from '~/types/filter';
import { getAvatarColor, getInitial } from '~/utils/avatarColors';
import type { RouterOutputs } from '~/trpc/react';
import styles from './WorkspaceProjectsTasksConceptD.module.css';

type ProjectWithActions = RouterOutputs['project']['getProjectsWithActions']['projects'][0];
type ActionItem = ProjectWithActions['actions'][0];

const VIEW_TABS = [
  { value: 'table', label: 'Projects', icon: IconTable, path: '/projects' },
  { value: 'projects-tasks', label: 'Projects & Tasks', icon: IconLayoutList, path: '/projects-tasks' },
  { value: 'timeline', label: 'Timeline', icon: IconTimeline, path: '/timeline' },
] as const;

type ViewTabValue = typeof VIEW_TABS[number]['value'];

function getProjectStatusStyle(status: string): React.CSSProperties {
  switch (status) {
    case 'ACTIVE':
      return { background: 'var(--mantine-color-green-light)', color: 'var(--mantine-color-green-light-color)' };
    case 'ON_HOLD':
      return { background: 'var(--mantine-color-yellow-light)', color: 'var(--mantine-color-yellow-light-color)' };
    case 'COMPLETED':
      return { background: 'var(--mantine-color-blue-light)', color: 'var(--mantine-color-blue-light-color)' };
    default:
      return { background: 'var(--mantine-color-gray-light)', color: 'var(--mantine-color-gray-light-color)' };
  }
}

function getProjectStatusLabel(status: string): string {
  const labels: Record<string, string> = { ACTIVE: 'Active', ON_HOLD: 'On Hold', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };
  return labels[status] ?? status;
}

function getProjectPriorityStyle(priority: string): { chip: React.CSSProperties; bars: Array<{ height: number; bg: string }> } {
  const dim = 'var(--color-border-primary)';
  switch (priority) {
    case 'HIGH':
      return {
        chip: { background: 'var(--mantine-color-red-light)', color: 'var(--mantine-color-red-light-color)' },
        bars: [{ height: 5, bg: 'var(--mantine-color-red-6)' }, { height: 8, bg: 'var(--mantine-color-red-6)' }, { height: 12, bg: 'var(--mantine-color-red-6)' }],
      };
    case 'MEDIUM':
      return {
        chip: { background: 'var(--mantine-color-orange-light)', color: 'var(--mantine-color-orange-light-color)' },
        bars: [{ height: 5, bg: 'var(--mantine-color-orange-6)' }, { height: 8, bg: 'var(--mantine-color-orange-6)' }, { height: 12, bg: dim }],
      };
    case 'LOW':
      return {
        chip: { background: 'var(--mantine-color-blue-light)', color: 'var(--mantine-color-blue-light-color)' },
        bars: [{ height: 5, bg: 'var(--mantine-color-blue-6)' }, { height: 8, bg: dim }, { height: 12, bg: dim }],
      };
    default:
      return {
        chip: { background: 'var(--mantine-color-gray-light)', color: 'var(--mantine-color-gray-light-color)' },
        bars: [{ height: 5, bg: dim }, { height: 8, bg: dim }, { height: 12, bg: dim }],
      };
  }
}

function getProjectPriorityLabel(priority: string): string {
  const labels: Record<string, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low', NONE: 'None' };
  return labels[priority] ?? priority;
}

function getTaskStatusStyle(status: string): React.CSSProperties {
  if (status === 'COMPLETED' || status === 'DONE') {
    return { background: 'var(--mantine-color-gray-light)', color: 'var(--mantine-color-gray-light-color)' };
  }
  return { background: 'var(--mantine-color-green-light)', color: 'var(--mantine-color-green-light-color)' };
}

function getTaskStatusLabel(status: string): string {
  if (status === 'COMPLETED' || status === 'DONE') return 'Done';
  if (status === 'ACTIVE') return 'Open';
  return status;
}

function getTaskPriorityInfo(priority: string): { label: string; style: React.CSSProperties } {
  const dim = 'var(--color-border-primary)';
  const map: Record<string, { label: string; style: React.CSSProperties }> = {
    '1st Priority': { label: '1st', style: { background: 'var(--mantine-color-red-light)', color: 'var(--mantine-color-red-light-color)' } },
    '2nd Priority': { label: '2nd', style: { background: 'var(--mantine-color-orange-light)', color: 'var(--mantine-color-orange-light-color)' } },
    '3rd Priority': { label: '3rd', style: { background: 'var(--mantine-color-yellow-light)', color: 'var(--mantine-color-yellow-light-color)' } },
    HIGH: { label: 'High', style: { background: 'var(--mantine-color-red-light)', color: 'var(--mantine-color-red-light-color)' } },
    MEDIUM: { label: 'Medium', style: { background: 'var(--mantine-color-orange-light)', color: 'var(--mantine-color-orange-light-color)' } },
    LOW: { label: 'Low', style: { background: 'var(--mantine-color-blue-light)', color: 'var(--mantine-color-blue-light-color)' } },
  };
  return map[priority] ?? { label: priority, style: { background: `${dim}`, color: 'var(--color-text-muted)' } };
}

function ProgressRing({ progress, size = 22 }: { progress: number; size?: number }) {
  const r = (size - 3) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(progress, 100) / 100) * circ;
  const color =
    progress >= 60
      ? 'var(--mantine-color-green-6)'
      : progress >= 20
        ? 'var(--brand-400)'
        : 'var(--mantine-color-gray-5)';

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-border-primary)" strokeWidth={2.5} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={2.5}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
    </svg>
  );
}

function PriorityChip({ priority }: { priority: string }) {
  const p = getProjectPriorityStyle(priority);
  return (
    <span className={styles.priorityChip} style={p.chip}>
      <span className={styles.priorityBars}>
        {p.bars.map((b, i) => (
          <span key={i} className={styles.priorityBar} style={{ height: b.height, background: b.bg }} />
        ))}
      </span>
      {getProjectPriorityLabel(priority)}
    </span>
  );
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface ProjectRowProps {
  project: ProjectWithActions;
  isExpanded: boolean;
  onToggle: () => void;
}

function ProjectRow({ project, isExpanded, onToggle }: ProjectRowProps) {
  const taskCount = project.actions.length;
  const healthData = { progress: project.progress ?? 0, actions: project.actions, keyResults: [], goals: [] };
  const { score } = calculateProjectHealth(healthData);
  void score;

  return (
    <tr className={styles.projectRow} onClick={onToggle}>
      <td className={styles.nameCol}>
        <div className={styles.projectNameCell}>
          <button className={styles.expandBtn} type="button" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
            <IconChevronRight
              size={14}
              stroke={2}
              className={styles.expandArrow}
              data-open={isExpanded ? 'true' : 'false'}
              style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 160ms' }}
            />
          </button>
          <ProgressRing progress={project.progress ?? 0} />
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)' }}>
            {project.name}
          </span>
          {taskCount > 0 && (
            <span className={styles.taskCountBadge}>{taskCount}</span>
          )}
        </div>
      </td>
      <td><span className={styles.muted}>—</span></td>
      <td><span className={styles.muted}>—</span></td>
      <td>
        <span className={styles.statusChip} style={getProjectStatusStyle(project.status)}>
          {getProjectStatusLabel(project.status)}
        </span>
      </td>
      <td>
        <PriorityChip priority={project.priority} />
      </td>
      <td>
        <span className={styles.driPlaceholder}>—</span>
      </td>
    </tr>
  );
}

interface TaskRowProps {
  action: ActionItem;
  projectName?: string;
  onRowClick: () => void;
  onCheckboxChange: (checked: boolean) => void;
}

function TaskRow({ action, projectName, onRowClick, onCheckboxChange }: TaskRowProps) {
  const isCompleted = action.status === 'COMPLETED' || action.status === 'DONE';
  const taskPriority = getTaskPriorityInfo(action.priority);

  return (
    <tr className={styles.taskRow} onClick={onRowClick}>
      <td className={styles.nameCol}>
        <div className={styles.taskNameCell}>
          <div className={styles.taskCheckboxWrap} onClick={(e) => e.stopPropagation()}>
            <Checkbox
              size="xs"
              radius="sm"
              checked={isCompleted}
              onChange={(e) => onCheckboxChange(e.currentTarget.checked)}
              styles={{ input: { cursor: 'pointer' } }}
            />
          </div>
          <span className={`${styles.taskName} ${isCompleted ? styles.taskNameDone : ''}`}>
            {action.name}
          </span>
        </div>
      </td>
      <td>
        <span className={styles.muted} style={{ fontSize: 12 }}>{formatDate(action.dueDate)}</span>
      </td>
      <td>
        {projectName ? (
          <span className={styles.projectBadge}>{projectName}</span>
        ) : (
          <span className={styles.muted}>—</span>
        )}
      </td>
      <td>
        <span className={styles.statusChip} style={getTaskStatusStyle(action.status)}>
          {getTaskStatusLabel(action.status)}
        </span>
      </td>
      <td>
        <span className={styles.priorityChip} style={taskPriority.style}>
          {taskPriority.label}
        </span>
      </td>
      <td>
        {action.assignees && action.assignees.length > 0 ? (
          <Tooltip label={action.assignees[0]?.user.name ?? action.assignees[0]?.user.email ?? 'Unknown'} withArrow>
            <Avatar
              src={action.assignees[0]?.user.image}
              size={24}
              radius="xl"
              color={getAvatarColor(action.assignees[0]?.user.id ?? '')}
            >
              {getInitial(action.assignees[0]?.user.name ?? action.assignees[0]?.user.email)}
            </Avatar>
          </Tooltip>
        ) : (
          <span className={styles.driPlaceholder}>—</span>
        )}
      </td>
    </tr>
  );
}

const PROJECT_FILTER_CONFIG: FilterBarConfig = {
  fields: [
    {
      key: 'status',
      label: 'Status',
      type: 'multi-select',
      icon: IconCircleDot,
      badgeColor: 'cyan',
      options: [
        { value: 'ACTIVE', label: 'Active' },
        { value: 'ON_HOLD', label: 'On Hold' },
        { value: 'COMPLETED', label: 'Completed' },
        { value: 'CANCELLED', label: 'Cancelled' },
      ],
    },
    {
      key: 'priority',
      label: 'Priority',
      type: 'multi-select',
      icon: IconFlag,
      badgeColor: 'grape',
      options: [
        { value: 'HIGH', label: 'High' },
        { value: 'MEDIUM', label: 'Medium' },
        { value: 'LOW', label: 'Low' },
        { value: 'NONE', label: 'None' },
      ],
    },
    {
      key: 'driId',
      label: 'DRI',
      type: 'user',
      icon: IconUser,
      badgeColor: 'blue',
    },
  ],
};

export function WorkspaceProjectsTasksConceptD() {
  const { workspace, workspaceId } = useWorkspace();
  const pathname = usePathname();
  const searchRef = useRef<HTMLInputElement>(null);

  const {
    filters,
    setFilters,
    searchQuery,
    setSearchQuery,
    sortState,
    setSortField,
    clearSort,
    sortProjects,
    viewParamsQueryString,
  } = useProjectViewState();
  const [filterRowOpen, { toggle: toggleFilterRow }] = useDisclosure(false);
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [editingAction, setEditingAction] = useState<ActionItem | null>(null);

  const prefix = workspace?.slug ? `/w/${workspace.slug}` : '';

  const workspaceMembers: FilterMember[] = useMemo(() => {
    if (!workspace?.members) return [];
    return workspace.members.map((m) => ({
      id: m.user.id,
      name: m.user.name ?? null,
      email: m.user.email ?? null,
      image: m.user.image ?? null,
    }));
  }, [workspace?.members]);

  const filtersActive = hasActiveFilters(PROJECT_FILTER_CONFIG, filters);

  const activeTab: ViewTabValue = useMemo(() => {
    if (pathname.includes('/projects-tasks')) return 'projects-tasks';
    if (pathname.includes('/timeline')) return 'timeline';
    return 'table';
  }, [pathname]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') searchRef.current?.blur();
  }, []);

  const utils = api.useUtils();

  const { data, isLoading } = api.project.getProjectsWithActions.useQuery(
    { workspaceId: workspaceId ?? undefined, includeCompleted },
    { enabled: !!workspaceId },
  );

  const updateStatus = api.action.update.useMutation({
    onSuccess: async () => {
      await utils.project.getProjectsWithActions.invalidate();
    },
  });

  const toggleProject = useCallback((id: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }, []);

  const filteredProjects = useMemo(() => {
    const all = data?.projects ?? [];
    const filtered = filterProjects(all, filters, '');
    const q = searchQuery.trim().toLowerCase();
    const searchFiltered = q
      ? filtered.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.actions.some((a) => a.name.toLowerCase().includes(q)),
        )
      : filtered;
    return sortProjects(searchFiltered);
  }, [data?.projects, filters, searchQuery, sortProjects]);

  const totalActive = filteredProjects.filter((p) => p.status === 'ACTIVE').length;
  const totalOnHold = filteredProjects.filter((p) => p.status === 'ON_HOLD').length;

  return (
    <div className={styles.page}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <nav className={styles.viewTabs}>
          {VIEW_TABS.map(({ value, label, icon: Icon, path }) => (
            <Link
              key={value}
              href={`${prefix}${path}${viewParamsQueryString ? `?${viewParamsQueryString}` : ''}`}
              className={styles.viewTab}
              data-active={activeTab === value ? 'true' : 'false'}
            >
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
              onKeyDown={handleSearchKeyDown}
              className={styles.searchInput}
            />
          </div>
          <button
            className={styles.actionBtn}
            type="button"
            onClick={toggleFilterRow}
            data-active={filtersActive ? 'true' : 'false'}
          >
            <IconFilter size={13} stroke={1.75} />
            Filter
          </button>
          <ProjectSortMenu
            sortState={sortState}
            onSortChange={setSortField}
            onClearSort={clearSort}
            trigger={
              <button
                type="button"
                className={styles.actionBtn}
                data-active={sortState ? 'true' : 'false'}
              >
                <IconArrowsSort size={13} stroke={1.75} />
                Sort
              </button>
            }
          />
          <button
            className={`${styles.actionBtn} ${includeCompleted ? styles.actionBtnActive : ''}`}
            type="button"
            onClick={() => setIncludeCompleted((v) => !v)}
          >
            Show completed
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

      <Collapse in={filterRowOpen || filtersActive}>
        <div className={styles.filterRow}>
          <FilterBar
            config={PROJECT_FILTER_CONFIG}
            filters={filters}
            onFiltersChange={setFilters}
            members={workspaceMembers}
          />
        </div>
      </Collapse>

      {/* Stats row */}
      <div style={{ padding: '8px 32px', borderBottom: '1px solid var(--color-border-primary)', flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          {filteredProjects.length} projects
          {totalActive > 0 && ` · ${totalActive} active`}
          {totalOnHold > 0 && ` · ${totalOnHold} on hold`}
        </span>
        <CreateActionModal viewName="projects-tasks">
          <button className={styles.actionBtn} type="button" style={{ float: 'right', marginTop: -2 }}>
            <IconPlus size={13} stroke={2} />
            Add task
          </button>
        </CreateActionModal>
      </div>

      {/* Table */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead className={styles.tableHead}>
            <tr>
              <th className={styles.nameCol}>Name</th>
              <th style={{ width: 90 }}>ETA</th>
              <th style={{ width: 130 }}>Project</th>
              <th style={{ width: 110 }}>Status</th>
              <th style={{ width: 110 }}>Priority</th>
              <th style={{ width: 60 }}>DRI</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--color-border-secondary)' }}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} style={{ padding: '10px 12px' }}>
                        <Skeleton height={18} radius="sm" />
                      </td>
                    ))}
                  </tr>
                ))
              : filteredProjects.length === 0
                ? (
                    <tr>
                      <td colSpan={6} className={styles.empty}>
                        {searchQuery ? 'No matches.' : 'No projects yet.'}
                      </td>
                    </tr>
                  )
                : filteredProjects.map((project) => (
                    <React.Fragment key={project.id}>
                      <ProjectRow
                        project={project}
                        isExpanded={expandedProjects.has(project.id)}
                        onToggle={() => toggleProject(project.id)}
                      />
                      {expandedProjects.has(project.id) &&
                        project.actions.map((action) => (
                          <TaskRow
                            key={action.id}
                            action={action}
                            projectName={project.name}
                            onRowClick={() => setEditingAction(action)}
                            onCheckboxChange={(checked) =>
                              updateStatus.mutate({ id: action.id, status: checked ? 'COMPLETED' : 'ACTIVE' })
                            }
                          />
                        ))}
                    </React.Fragment>
                  ))}
          </tbody>
        </table>
      </div>

      <EditActionModal
        action={editingAction as Parameters<typeof EditActionModal>[0]['action']}
        opened={!!editingAction}
        onClose={() => setEditingAction(null)}
        onSuccess={() => void utils.project.getProjectsWithActions.invalidate()}
      />
    </div>
  );
}
