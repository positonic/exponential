'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Avatar, Tooltip, Skeleton } from '@mantine/core';
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
import { api } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { CreateProjectModal } from '~/app/_components/CreateProjectModal';
import { calculateProjectHealth } from '~/app/_components/home/ProjectHealth';
import { slugify } from '~/utils/slugify';
import { getAvatarColor, getInitial } from '~/utils/avatarColors';
import type { RouterOutputs } from '~/trpc/react';
import styles from './WorkspaceProjectsConceptD.module.css';

type Project = RouterOutputs['project']['getAll'][0];

const VIEW_TABS = [
  { value: 'table', label: 'Projects', icon: IconTable, path: '/projects' },
  { value: 'projects-tasks', label: 'Projects & Tasks', icon: IconLayoutList, path: '/projects-tasks' },
  { value: 'timeline', label: 'Timeline', icon: IconTimeline, path: '/timeline' },
] as const;

type ViewTabValue = typeof VIEW_TABS[number]['value'];

function getStatusStyle(status: string): React.CSSProperties {
  switch (status) {
    case 'ACTIVE':
      return {
        background: 'var(--mantine-color-green-light)',
        color: 'var(--mantine-color-green-light-color)',
      };
    case 'ON_HOLD':
      return {
        background: 'var(--mantine-color-yellow-light)',
        color: 'var(--mantine-color-yellow-light-color)',
      };
    case 'COMPLETED':
      return {
        background: 'var(--mantine-color-blue-light)',
        color: 'var(--mantine-color-blue-light-color)',
      };
    case 'CANCELLED':
    default:
      return {
        background: 'var(--mantine-color-gray-light)',
        color: 'var(--mantine-color-gray-light-color)',
      };
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'ACTIVE': return 'Active';
    case 'ON_HOLD': return 'On Hold';
    case 'COMPLETED': return 'Completed';
    case 'CANCELLED': return 'Cancelled';
    default: return status;
  }
}

function getPriorityStyle(priority: string): { chip: React.CSSProperties; bars: Array<{ height: number; style: React.CSSProperties }> } {
  const barBase: React.CSSProperties = { background: 'var(--color-border-primary)' };
  switch (priority) {
    case 'HIGH':
      return {
        chip: {
          background: 'var(--mantine-color-red-light)',
          color: 'var(--mantine-color-red-light-color)',
        },
        bars: [
          { height: 5, style: { background: 'var(--mantine-color-red-6)' } },
          { height: 8, style: { background: 'var(--mantine-color-red-6)' } },
          { height: 12, style: { background: 'var(--mantine-color-red-6)' } },
        ],
      };
    case 'MEDIUM':
      return {
        chip: {
          background: 'var(--mantine-color-orange-light)',
          color: 'var(--mantine-color-orange-light-color)',
        },
        bars: [
          { height: 5, style: { background: 'var(--mantine-color-orange-6)' } },
          { height: 8, style: { background: 'var(--mantine-color-orange-6)' } },
          { height: 12, style: barBase },
        ],
      };
    case 'LOW':
      return {
        chip: {
          background: 'var(--mantine-color-blue-light)',
          color: 'var(--mantine-color-blue-light-color)',
        },
        bars: [
          { height: 5, style: { background: 'var(--mantine-color-blue-6)' } },
          { height: 8, style: barBase },
          { height: 12, style: barBase },
        ],
      };
    default:
      return {
        chip: {
          background: 'var(--mantine-color-gray-light)',
          color: 'var(--mantine-color-gray-light-color)',
        },
        bars: [
          { height: 5, style: barBase },
          { height: 8, style: barBase },
          { height: 12, style: barBase },
        ],
      };
  }
}

function getPriorityLabel(priority: string): string {
  switch (priority) {
    case 'HIGH': return 'High';
    case 'MEDIUM': return 'Medium';
    case 'LOW': return 'Low';
    default: return 'None';
  }
}

function ProgressRing({ progress, size = 24 }: { progress: number; size?: number }) {
  const r = (size - 3) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(progress, 100) / 100) * circ;
  const color =
    progress >= 60
      ? 'var(--mantine-color-green-6)'
      : progress >= 30
        ? 'var(--mantine-color-yellow-6)'
        : 'var(--mantine-color-gray-5)';

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-border-primary)"
        strokeWidth={2.5}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}

function HealthSegments({ project }: { project: Project }) {
  if (!project.actions) {
    return <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>—</span>;
  }

  const { indicators } = calculateProjectHealth(project);
  const segs = [
    indicators.hasProgress,
    indicators.momentum,
    indicators.recentActivity,
    indicators.onTrack,
    indicators.weeklyPlanning,
  ];

  return (
    <div className={styles.healthBar}>
      {segs.map((active, i) => (
        <div
          key={i}
          className={styles.healthSeg}
          style={{
            background: active
              ? 'var(--mantine-color-green-6)'
              : 'var(--color-border-primary)',
          }}
        />
      ))}
    </div>
  );
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isOverdue(date: Date | null | undefined): boolean {
  if (!date) return false;
  return new Date(date) < new Date();
}

function ProjectTableRow({ project, workspaceSlug }: { project: Project; workspaceSlug: string }) {
  const href = `/w/${workspaceSlug}/projects/${slugify(project.name)}-${project.id}`;
  const priorityStyle = getPriorityStyle(project.priority);
  const taskCount = project.actions?.length ?? 0;
  const completedCount = project.actions?.filter((a) => a.status === 'COMPLETED' || a.status === 'DONE').length ?? 0;

  return (
    <tr className={styles.tableRow}>
      <td>
        <div className={styles.nameCell}>
          <ProgressRing progress={project.progress} />
          <div style={{ minWidth: 0 }}>
            <Link href={href} className={styles.nameText}>
              {project.name}
            </Link>
            {taskCount > 0 && (
              <div className={styles.nameSub}>
                {completedCount}/{taskCount} tasks
              </div>
            )}
          </div>
        </div>
      </td>
      <td>
        <HealthSegments project={project} />
      </td>
      <td>
        <span className={styles.statusChip} style={getStatusStyle(project.status)}>
          {getStatusLabel(project.status)}
        </span>
      </td>
      <td>
        <span className={styles.priorityChip} style={priorityStyle.chip}>
          <span className={styles.priorityBars}>
            {priorityStyle.bars.map((bar, i) => (
              <span
                key={i}
                className={styles.priorityBar}
                style={{ height: bar.height, ...bar.style }}
              />
            ))}
          </span>
          {getPriorityLabel(project.priority)}
        </span>
      </td>
      <td>
        {project.dri ? (
          <Tooltip label={project.dri.name ?? project.dri.email ?? 'Unknown'} withArrow>
            <Avatar
              src={project.dri.image}
              size={26}
              radius="xl"
              color={getAvatarColor(project.dri.id)}
            >
              {getInitial(project.dri.name ?? project.dri.email)}
            </Avatar>
          </Tooltip>
        ) : (
          <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>—</span>
        )}
      </td>
      <td>
        <span
          className={`${styles.etaText} ${isOverdue(project.endDate) ? styles.etaOverdue : ''}`}
        >
          {formatDate(project.endDate)}
        </span>
      </td>
    </tr>
  );
}

export function WorkspaceProjectsConceptD() {
  const { workspace, workspaceId } = useWorkspace();
  const pathname = usePathname();
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const activeTab: ViewTabValue = useMemo(() => {
    if (pathname.includes('/projects-tasks')) return 'projects-tasks';
    if (pathname.includes('/timeline')) return 'timeline';
    return 'table';
  }, [pathname]);

  const prefix = workspace?.slug ? `/w/${workspace.slug}` : '';

  useHotkeys([['mod+k', () => searchRef.current?.focus()]]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') searchRef.current?.blur();
  }, []);

  const { data: projectsData, isLoading } = api.project.getAll.useQuery(
    { workspaceId: workspaceId ?? undefined, include: { actions: true } },
    { enabled: !!workspaceId },
  );

  const filteredProjects = useMemo(() => {
    const all = projectsData ?? [];
    if (!searchQuery.trim()) return all;
    const q = searchQuery.toLowerCase();
    return all.filter((p) => p.name.toLowerCase().includes(q));
  }, [projectsData, searchQuery]);

  return (
    <div className={styles.page}>
      {/* Top bar: pill tabs + action bar */}
      <div className={styles.topBar}>
        <nav className={styles.viewTabs}>
          {VIEW_TABS.map(({ value, label, icon: Icon, path }) => (
            <Link
              key={value}
              href={`${prefix}${path}`}
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

      {/* Table */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead className={styles.tableHead}>
            <tr>
              <th>Name</th>
              <th>Health</th>
              <th>Status</th>
              <th>Priority</th>
              <th>DRI</th>
              <th>ETA</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className={styles.tableRow}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j}>
                        <Skeleton height={20} radius="sm" />
                      </td>
                    ))}
                  </tr>
                ))
              : filteredProjects.length === 0
                ? (
                    <tr>
                      <td colSpan={6} className={styles.empty}>
                        {searchQuery ? 'No projects match your search.' : 'No projects yet.'}
                      </td>
                    </tr>
                  )
                : filteredProjects.map((project) => (
                    <ProjectTableRow
                      key={project.id}
                      project={project}
                      workspaceSlug={workspace?.slug ?? ''}
                    />
                  ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
