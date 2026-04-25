'use client';

import { useMemo, useRef, useCallback, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Avatar,
  Tooltip,
  Skeleton,
  Select,
  Badge,
  Modal,
  Collapse,
  Card,
  Text,
  Group,
  Stack,
  Button,
  Alert,
} from '@mantine/core';
import { modals } from '@mantine/modals';
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
  IconBrandNotion,
  IconCircleDot,
  IconFlag,
  IconUser,
  IconEdit,
  IconTrash,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { CreateProjectModal } from '~/app/_components/CreateProjectModal';
import {
  calculateProjectHealth,
  HealthRing,
  HealthIndicatorIcons,
} from '~/app/_components/home/ProjectHealth';
import { FilterBar } from '~/app/_components/filters';
import { ProjectSortMenu } from '~/app/_components/toolbar';
import { useProjectViewState, filterProjects } from './useProjectViewState';
import { hasActiveFilters } from '~/types/filter';
import type { FilterBarConfig, FilterMember } from '~/types/filter';
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

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ON_HOLD', label: 'On Hold' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const PRIORITY_OPTIONS = [
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
  { value: 'NONE', label: 'None' },
];

function getStatusColor(status: string): string {
  switch (status) {
    case 'ACTIVE': return 'green';
    case 'ON_HOLD': return 'yellow';
    case 'COMPLETED': return 'blue';
    case 'CANCELLED':
    default: return 'gray';
  }
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'HIGH': return 'red';
    case 'MEDIUM': return 'orange';
    case 'LOW': return 'blue';
    case 'NONE':
    default: return 'gray';
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

function formatDate(date: Date | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isOverdue(date: Date | null | undefined): boolean {
  if (!date) return false;
  return new Date(date) < new Date();
}

function ProjectTableRow({
  project,
  linkPrefix,
}: {
  project: Project;
  linkPrefix: string;
}) {
  const utils = api.useUtils();
  const updateProject = api.project.update.useMutation({
    onSuccess: () => {
      void utils.project.getAll.invalidate();
    },
  });
  const deleteProject = api.project.delete.useMutation({
    onSuccess: () => {
      void utils.project.getAll.invalidate();
    },
  });

  const handleDeleteProject = () => {
    modals.openConfirmModal({
      title: 'Delete Project',
      children: (
        <Text size="sm">
          Are you sure you want to delete <strong>{project.name}</strong>? This action cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteProject.mutate({ id: project.id }),
    });
  };

  const href = `${linkPrefix}/projects/${slugify(project.name)}-${project.id}`;
  const taskCount = project.actions?.length ?? 0;
  const completedCount = project.actions?.filter(
    (a) => a.status === 'COMPLETED' || a.status === 'DONE',
  ).length ?? 0;

  return (
    <tr className={styles.tableRow}>
      <td>
        <div className={styles.nameCell}>
          <ProgressRing progress={project.progress} />
          <div style={{ minWidth: 0 }}>
            <Group gap="xs" wrap="nowrap">
              <Link href={href} className={styles.nameText}>
                {project.name}
              </Link>
              {project.isPublic && (
                <Badge variant="light" color="green" size="xs">Public</Badge>
              )}
            </Group>
            {taskCount > 0 && (
              <div className={styles.nameSub}>
                {completedCount}/{taskCount} tasks
              </div>
            )}
          </div>
        </div>
      </td>
      <td>
        {project.actions ? (() => {
          const { score, indicators } = calculateProjectHealth(project);
          return (
            <div className="flex items-center gap-2">
              <HealthRing score={score} size={28} />
              <HealthIndicatorIcons indicators={indicators} />
            </div>
          );
        })() : (
          <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>—</span>
        )}
      </td>
      <td>
        <Select
          value={project.status}
          onChange={(newStatus) => {
            if (newStatus) {
              updateProject.mutate({
                id: project.id,
                name: project.name,
                status: newStatus as 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED',
                priority: project.priority as 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE',
              });
            }
          }}
          data={STATUS_OPTIONS}
          variant="filled"
          size="xs"
          styles={{
            input: {
              backgroundColor: `var(--mantine-color-${getStatusColor(project.status)}-light)`,
              color: `var(--mantine-color-${getStatusColor(project.status)}-filled)`,
              fontWeight: 500,
              border: 'none',
            },
          }}
        />
      </td>
      <td>
        <Select
          value={project.priority}
          onChange={(newPriority) => {
            if (newPriority) {
              updateProject.mutate({
                id: project.id,
                name: project.name,
                status: project.status as 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED',
                priority: newPriority as 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE',
              });
            }
          }}
          data={PRIORITY_OPTIONS}
          variant="filled"
          size="xs"
          styles={{
            input: {
              backgroundColor: `var(--mantine-color-${getPriorityColor(project.priority)}-light)`,
              color:
                project.priority === 'NONE'
                  ? 'var(--color-text-secondary)'
                  : `var(--mantine-color-${getPriorityColor(project.priority)}-filled)`,
              fontWeight: 500,
              border: 'none',
            },
          }}
        />
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
      <td>
        <div className="flex items-center gap-2">
          <CreateProjectModal project={project}>
            <button
              className="text-text-muted hover:text-brand-primary"
              aria-label="Edit project"
              type="button"
            >
              <IconEdit size={18} />
            </button>
          </CreateProjectModal>
          <button
            onClick={handleDeleteProject}
            className="text-text-muted hover:text-red-500"
            aria-label="Delete project"
            type="button"
          >
            <IconTrash size={18} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function NotionSuggestionsContent({
  unlinkedProjects,
  onProjectImported,
}: {
  unlinkedProjects: { notionId: string; title: string; url: string }[];
  onProjectImported: () => void;
}) {
  const [importingId, setImportingId] = useState<string | null>(null);

  if (unlinkedProjects.length === 0) {
    return (
      <Alert
        icon={<IconBrandNotion size={16} />}
        title="All Notion Projects Linked"
        color="green"
        variant="light"
      >
        All projects from your Notion workspace are already linked to local projects.
      </Alert>
    );
  }

  return (
    <div>
      <Text size="sm" c="dimmed" mb="md">
        These projects exist in your Notion workspace but are not linked to any local project.
        Import them to start syncing actions.
      </Text>

      <Stack gap="sm">
        {unlinkedProjects.map((notionProject) => (
          <Card key={notionProject.notionId} withBorder p="sm" radius="sm">
            <Group justify="space-between" wrap="nowrap">
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text fw={500} truncate>
                  {notionProject.title}
                </Text>
                <Text size="xs" c="dimmed" truncate>
                  {notionProject.url}
                </Text>
              </div>
              <CreateProjectModal
                prefillName={notionProject.title}
                prefillNotionProjectId={notionProject.notionId}
                onClose={() => {
                  setImportingId(null);
                  onProjectImported();
                }}
              >
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconPlus size={14} />}
                  onClick={() => setImportingId(notionProject.notionId)}
                  loading={importingId === notionProject.notionId}
                >
                  Import
                </Button>
              </CreateProjectModal>
            </Group>
          </Card>
        ))}
      </Stack>
    </div>
  );
}

interface WorkspaceProjectsConceptDProps {
  showAllWorkspaces?: boolean;
}

export function WorkspaceProjectsConceptD({ showAllWorkspaces = false }: WorkspaceProjectsConceptDProps = {}) {
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
  const [notionModalOpened, { open: openNotionModal, close: closeNotionModal }] = useDisclosure(false);

  const activeTab: ViewTabValue = useMemo(() => {
    if (pathname.includes('/projects-tasks')) return 'projects-tasks';
    if (pathname.includes('/timeline')) return 'timeline';
    return 'table';
  }, [pathname]);

  const linkPrefix = showAllWorkspaces ? '' : (workspace?.slug ? `/w/${workspace.slug}` : '');
  const effectiveWorkspaceId = showAllWorkspaces ? undefined : (workspaceId ?? undefined);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') searchRef.current?.blur();
  }, []);

  const { data: projectsData, isLoading } = api.project.getAll.useQuery(
    { workspaceId: effectiveWorkspaceId, include: { actions: true } },
    { enabled: showAllWorkspaces || !!workspaceId },
  );

  const { data: workflows = [] } = api.workflow.list.useQuery();
  const firstNotionWorkflowId = workflows.find((w) => w.provider === 'notion')?.id;

  const { data: unlinkedProjectsData, refetch: refetchUnlinkedProjects } =
    api.workflow.getUnlinkedNotionProjects.useQuery(
      { workflowId: firstNotionWorkflowId ?? '', workspaceId: effectiveWorkspaceId },
      { enabled: !!firstNotionWorkflowId && (showAllWorkspaces || !!workspaceId) },
    );

  const unlinkedCount = unlinkedProjectsData?.unlinkedProjects.length ?? 0;
  const handleProjectImported = () => {
    void refetchUnlinkedProjects();
  };

  const workspaceMembers: FilterMember[] = useMemo(() => {
    if (!workspace?.members) return [];
    return workspace.members.map((m) => ({
      id: m.user.id,
      name: m.user.name ?? null,
      email: m.user.email ?? null,
      image: m.user.image ?? null,
    }));
  }, [workspace?.members]);

  const filteredProjects = useMemo(
    () => filterProjects(projectsData ?? [], filters, searchQuery),
    [projectsData, filters, searchQuery],
  );

  const sortedProjects = useMemo(
    () => sortProjects(filteredProjects),
    [sortProjects, filteredProjects],
  );

  const filtersActive = hasActiveFilters(PROJECT_FILTER_CONFIG, filters);

  return (
    <div className={styles.page}>
      {/* Top bar: pill tabs + action bar */}
      <div className={styles.topBar}>
        <nav className={styles.viewTabs}>
          {VIEW_TABS.map(({ value, label, icon: Icon, path }) => (
            <Link
              key={value}
              href={`${linkPrefix}${path}${viewParamsQueryString ? `?${viewParamsQueryString}` : ''}`}
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

          <button className={styles.actionBtn} type="button">
            <IconSparkles size={13} stroke={1.75} />
            Ask Zoe
          </button>

          {unlinkedCount > 0 && (
            <button
              className={styles.actionBtn}
              type="button"
              onClick={openNotionModal}
            >
              <IconBrandNotion size={13} stroke={1.75} />
              Notion ({unlinkedCount})
            </button>
          )}

          <CreateProjectModal>
            <button className={styles.newBtn} type="button">
              <IconPlus size={13} stroke={2.5} />
              New project
            </button>
          </CreateProjectModal>
        </div>
      </div>

      {/* Collapsible filter row */}
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
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className={styles.tableRow}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j}>
                        <Skeleton height={20} radius="sm" />
                      </td>
                    ))}
                  </tr>
                ))
              : sortedProjects.length === 0
                ? (
                    <tr>
                      <td colSpan={7} className={styles.empty}>
                        {searchQuery || filtersActive
                          ? 'No projects match your search.'
                          : 'No projects yet.'}
                      </td>
                    </tr>
                  )
                : sortedProjects.map((project) => (
                    <ProjectTableRow
                      key={project.id}
                      project={project}
                      linkPrefix={linkPrefix}
                    />
                  ))}
          </tbody>
        </table>
      </div>

      <Modal
        opened={notionModalOpened}
        onClose={closeNotionModal}
        title="Notion Suggestions"
        size="lg"
      >
        <NotionSuggestionsContent
          unlinkedProjects={unlinkedProjectsData?.unlinkedProjects ?? []}
          onProjectImported={handleProjectImported}
        />
      </Modal>
    </div>
  );
}
