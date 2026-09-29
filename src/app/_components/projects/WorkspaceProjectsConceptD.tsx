'use client';

import { memo, useMemo, useRef, useCallback, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Avatar,
  Tooltip,
  Skeleton,
  Badge,
  Modal,
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
  IconArrowsSort,
  IconSparkles,
  IconPlus,
  IconBrandNotion,
  IconEdit,
  IconTrash,
  IconLock,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { CreateProjectModal } from '~/app/_components/CreateProjectModal';
import {
  calculateProjectHealth,
  HealthRing,
  HealthIndicatorIcons,
} from '~/app/_components/home/ProjectHealth';
import { ProjectSortMenu } from '~/app/_components/toolbar';
import {
  useProjectViewState,
  filterProjects,
  computeProjectFilterCounts,
  PROJECT_FILTER_KEYS,
  DRI_ME,
  PROJECT_DEFAULT_VIEW_STATE,
} from './useProjectViewState';
import { useProjectsViewTabRedirect } from './projectsViewTab';
import { ProjectsViewTabs } from './ProjectsViewTabs';
import { useSession } from 'next-auth/react';
import {
  ProjectFilterPopover,
  ProjectFilterPills,
  countActiveProjectFilters,
} from './ProjectFilterControls';
import { useRegisterPageContext } from '~/hooks/useRegisterPageContext';
import { usePageSearchHotkey } from '~/hooks/usePageSearchHotkey';
import type { FilterMember } from '~/types/filter';
import { slugify } from '~/utils/slugify';
import { getAvatarColor, getInitial } from '~/utils/avatarColors';
import type { RouterOutputs } from '~/trpc/react';
import {
  ListPageTopBar,
  ListPageSearch,
  ListPageButton,
  ListPagePrimaryButton,
  PillSelect,
} from '~/app/_components/listPage';
import table from '~/app/_components/listPage/DataTable.module.css';
import styles from './WorkspaceProjectsConceptD.module.css';

type Project = RouterOutputs['project']['getAll'][0];

type ProjectStatus = 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
type ProjectPriority = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

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

// Memoised: every row mounts two tRPC mutations, two Selects, an Avatar and two
// SVG rings, so re-rendering the whole table on each keystroke is expensive.
// `project` comes straight out of the react-query cache, so it is referentially
// stable between renders that did not refetch.
const ProjectTableRow = memo(function ProjectTableRow({
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
    <tr className={table.tableRow}>
      <td>
        <div className={table.nameCell}>
          <ProgressRing progress={project.progress} />
          <div style={{ minWidth: 0 }}>
            <Group gap="xs" wrap="nowrap">
              <Link href={href} className={table.nameText}>
                {project.name}
              </Link>
              {project.isPublic && (
                <Badge variant="light" color="green" size="xs">Public</Badge>
              )}
              {project.isRestricted && (
                <Tooltip label="Restricted — only members can access" withArrow>
                  <span
                    aria-label="Restricted project"
                    className="inline-flex items-center text-text-muted"
                  >
                    <IconLock size={14} />
                  </span>
                </Tooltip>
              )}
            </Group>
            {taskCount > 0 && (
              <div className={table.nameSub}>
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
        <PillSelect
          value={project.status}
          data={STATUS_OPTIONS}
          color={getStatusColor(project.status)}
          aria-label="Status"
          onChange={(newStatus) =>
            updateProject.mutate({
              id: project.id,
              name: project.name,
              status: newStatus as ProjectStatus,
              priority: project.priority as ProjectPriority,
            })
          }
        />
      </td>
      <td>
        <PillSelect
          value={project.priority}
          data={PRIORITY_OPTIONS}
          color={getPriorityColor(project.priority)}
          aria-label="Priority"
          onChange={(newPriority) =>
            updateProject.mutate({
              id: project.id,
              name: project.name,
              status: project.status as ProjectStatus,
              priority: newPriority as ProjectPriority,
            })
          }
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
              className="flex text-text-muted hover:text-brand-primary"
              aria-label="Edit project"
              type="button"
            >
              <IconEdit size={18} />
            </button>
          </CreateProjectModal>
          <button
            onClick={handleDeleteProject}
            className="flex text-text-muted hover:text-red-500"
            aria-label="Delete project"
            type="button"
          >
            <IconTrash size={18} />
          </button>
        </div>
      </td>
    </tr>
  );
});

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
  const { workspace, workspaceId, userRole } = useWorkspace();
  const isGuest = userRole === 'guest';
  const { data: session, status: sessionStatus } = useSession();
  const currentUserId = session?.user?.id ?? null;
  const pathname = usePathname();
  const searchRef = useRef<HTMLInputElement>(null);
  const {
    filters,
    setFilters,
    searchQuery,
    deferredSearchQuery,
    setSearchQuery,
    sortState,
    setSortField,
    clearSort,
    sortProjects,
    viewParamsQueryString,
  } = useProjectViewState(PROJECT_FILTER_KEYS, 'projects', PROJECT_DEFAULT_VIEW_STATE);
  useProjectsViewTabRedirect();
  const [notionModalOpened, { open: openNotionModal, close: closeNotionModal }] = useDisclosure(false);

  const linkPrefix = showAllWorkspaces ? '' : (workspace?.slug ? `/w/${workspace.slug}` : '');
  const effectiveWorkspaceId = showAllWorkspaces ? undefined : (workspaceId ?? undefined);

  usePageSearchHotkey(searchRef);

  // Server-side narrowing: with the default filter hiding finished work, the
  // (actions-heavy) payload only contains what the view will show. The client
  // still applies filterProjects, so the list stays instant while a changed
  // status filter refetches behind `placeholderData`.
  const statusFilter = filters.status as string[] | undefined;
  const statusQueryInput = useMemo(
    () =>
      statusFilter && statusFilter.length > 0
        ? [...statusFilter].sort()
        : undefined,
    [statusFilter],
  );

  const { data: projectsData, isLoading } = api.project.getAll.useQuery(
    {
      workspaceId: effectiveWorkspaceId,
      include: { actions: true },
      status: statusQueryInput,
    },
    {
      enabled: showAllWorkspaces || !!workspaceId,
      placeholderData: (prev) => prev,
    },
  );

  const { data: statusCounts } = api.project.getStatusCounts.useQuery(
    { workspaceId: effectiveWorkspaceId },
    { enabled: showAllWorkspaces || !!workspaceId },
  );

  // Register lightweight page context for the AI agent. Counts only; the agent
  // fetches the actual projects on demand via its `get-all-projects` tool.
  const projectsPageContext = useMemo(() => {
    if (!workspaceId) return null;
    return {
      pageType: 'projects-list',
      pageTitle: 'Projects',
      pagePath: pathname,
      data: { workspaceId, projectCount: projectsData?.length ?? 0 },
    };
  }, [workspaceId, pathname, projectsData?.length]);
  useRegisterPageContext(projectsPageContext, { clearOnUnmount: false });

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

  const filterCtx = useMemo(() => ({ currentUserId }), [currentUserId]);

  const filteredProjects = useMemo(
    () => filterProjects(projectsData ?? [], filters, deferredSearchQuery, filterCtx),
    [projectsData, filters, deferredSearchQuery, filterCtx],
  );

  const sortedProjects = useMemo(
    () => sortProjects(filteredProjects),
    [sortProjects, filteredProjects],
  );

  const activeFilterCount = countActiveProjectFilters(filters);
  const filtersActive = activeFilterCount > 0;
  // `driId=me` can only be resolved once the session is known; until then
  // the list would flash empty, so treat that gap as loading.
  const needsSession =
    Array.isArray(filters.driId) && filters.driId.includes(DRI_ME);
  const sessionPending = needsSession && sessionStatus === 'loading';

  const optionCounts = useMemo(
    () =>
      computeProjectFilterCounts(
        projectsData ?? [],
        filters,
        deferredSearchQuery,
        statusCounts,
        filterCtx,
      ),
    [projectsData, filters, deferredSearchQuery, statusCounts, filterCtx],
  );

  const clearFiltersAndSearch = useCallback(() => {
    setFilters({});
    setSearchQuery('');
  }, [setFilters, setSearchQuery]);

  // The status default is auto-applied, so filtersActive alone can't tell a
  // filtered-out list from a workspace with no projects at all — a new
  // workspace must still greet with "No projects yet.", not a Clear button.
  const workspaceIsEmpty =
    statusCounts !== undefined &&
    Object.values(statusCounts).every((n) => n === 0);

  return (
    <div className={styles.page}>
      {isGuest && workspace && (
        <div className="border-b border-border-primary px-4 py-3 text-[12.5px] text-text-secondary">
          Projects you have access to in{' '}
          <span className="font-medium text-text-primary">{workspace.name}</span>
        </div>
      )}

      <ListPageTopBar
        left={
          <>
            <ProjectsViewTabs
              linkPrefix={linkPrefix}
              viewParamsQueryString={viewParamsQueryString}
            />
            <ProjectFilterPills
              filters={filters}
              onFiltersChange={setFilters}
              members={workspaceMembers}
            />
          </>
        }
        actions={
          <>
            <ListPageSearch ref={searchRef} value={searchQuery} onChange={setSearchQuery} />

            <ProjectFilterPopover
              filters={filters}
              onFiltersChange={setFilters}
              members={workspaceMembers}
              counts={optionCounts}
            />

            <ProjectSortMenu
              sortState={sortState}
              onSortChange={setSortField}
              onClearSort={clearSort}
              trigger={
                <ListPageButton active={!!sortState}>
                  <IconArrowsSort size={13} stroke={1.75} />
                  Sort
                </ListPageButton>
              }
            />

            <ListPageButton>
              <IconSparkles size={13} stroke={1.75} />
              Ask Zoe
            </ListPageButton>

            {unlinkedCount > 0 && (
              <ListPageButton onClick={openNotionModal}>
                <IconBrandNotion size={13} stroke={1.75} />
                Notion ({unlinkedCount})
              </ListPageButton>
            )}

            {!isGuest && (
              <CreateProjectModal>
                <ListPagePrimaryButton>
                  <IconPlus size={13} stroke={2.5} />
                  New project
                </ListPagePrimaryButton>
              </CreateProjectModal>
            )}
          </>
        }
      />

      {/* Table */}
      <div className={table.tableWrap}>
        <table className={table.table}>
          <thead className={table.tableHead}>
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
            {isLoading || sessionPending
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className={table.tableRow}>
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
                      <td colSpan={7} className={table.empty}>
                        {(searchQuery || filtersActive) && !workspaceIsEmpty ? (
                          <span className="inline-flex items-center gap-3">
                            No projects match your filters.
                            <ListPageButton onClick={clearFiltersAndSearch}>
                              Clear filters
                            </ListPageButton>
                          </span>
                        ) : (
                          'No projects yet.'
                        )}
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
