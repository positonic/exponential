"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Actions } from "./Actions";
import ProjectDetails from "./ProjectDetails";
//import Chat from "./Chat";
import { Team } from "./Team";
import { MatrixRoomBinding } from "~/app/_components/matrix/MatrixRoomBinding";
import { ProjectTimeline } from "./ProjectTimeline";
import { InitiativeDashboard } from "~/app/_components/initiatives/InitiativeDashboard";
import { Button } from "@mantine/core";
import {
  Group,
  Tabs,
  Paper,
  Stack,
  Text,
  Drawer,
  ActionIcon,
  Card,
  SegmentedControl,
  Switch,
  Alert,
  Tooltip,
} from "@mantine/core";
import { api } from "~/trpc/react";
import {
  IconLayoutKanban,
  IconSettings,
  // IconClipboardList,
  IconTargetArrow,
  IconClock,
  IconMicrophone,
  IconMessageCircle,
  IconX,
  IconUsers,
  IconCalendarWeek,
  IconGitBranch,
  IconHome,
  IconEdit,
  IconLayoutList,
  IconCoin,
  IconPlug,
  IconShieldLock,
  IconLock,
  IconWorld,
} from "@tabler/icons-react";
import { format, isBefore, startOfDay } from "date-fns";
import overviewStyles from "./ProjectOverview.module.css";
import { CreateProjectModal } from "~/app/_components/CreateProjectModal";
import { UnifiedDatePicker } from "~/app/_components/UnifiedDatePicker";
import { ProjectIntegrations } from "./ProjectIntegrations";
import { ProjectSyncStatus } from "./ProjectSyncStatus";
import { ProjectSyncConfiguration } from "./ProjectSyncConfiguration";
import { TeamWeeklyReview } from "./TeamWeeklyReview";
import { WeeklyOutcomes } from "./WeeklyOutcomes";
import { ProjectMeetingsTab } from "./meeting/ProjectMeetingsTab";
import { ProjectWorkflowsTab } from "./ProjectWorkflowsTab";
import { ProjectOverview } from "./ProjectOverview";
import { ProjectOverviewLegacy } from "./ProjectOverviewLegacy";
import { ProjectMembersPanel } from "./ProjectMembersPanel";
import { useAgentModal } from "~/providers/AgentModalProvider";
import { useRegisterPageContext } from "~/hooks/useRegisterPageContext";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { notifications } from "@mantine/notifications";
import Link from "next/link";
import { useMemo } from "react";

type TabValue =
  | "overview"
  | "tasks"
  | "goals"
  | "timeline"
  | "transcriptions"
  | "integrations"
  | "workflows"
  | "weekly-team-review"
  | "weekly-outcomes"
  | "access";

const VALID_TABS: TabValue[] = [
  "overview",
  "tasks",
  "goals",
  "timeline",
  "transcriptions",
  "integrations",
  "workflows",
  "weekly-team-review",
  "weekly-outcomes",
  "access",
];

function isValidTab(tab: string | null | undefined): tab is TabValue {
  return tab != null && VALID_TABS.includes(tab as TabValue);
}

export function ProjectContent({
  viewName,
  projectId,
  initialTab,
  legacyOverview = false,
}: {
  viewName: string;
  projectId: string;
  initialTab?: string;
  legacyOverview?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get tab from URL or use initial/default
  const tabFromUrl = searchParams.get("tab");
  const activeTab: TabValue = isValidTab(tabFromUrl)
    ? tabFromUrl
    : isValidTab(initialTab)
      ? initialTab
      : "tasks";

  const pathname = usePathname();
  const [activeDrawer, setActiveDrawer] = useState<'settings' | null>(null);
  const { openModal: openChatModal, isOpen: chatModalOpen } = useAgentModal();
  const [syncStatusOpened, setSyncStatusOpened] = useState(false);
  const [selectedActionIds, setSelectedActionIds] = useState<Set<string>>(new Set());
  const { data: project, isLoading, error: projectError } = api.project.getById.useQuery({
    id: projectId,
  });

  // Register project context for agent chat — merges with workspace context.
  // Wait for the project to load so we register the resolved project id (not
  // the URL slug). Downstream queries treat this as a project id and the
  // access middleware does not resolve slugs.
  const { workspace, workspaceId } = useWorkspace();
  const projectPageContext = useMemo(() => {
    if (!project) return null;
    return {
      pageType: 'project' as const,
      pageTitle: project.name,
      pagePath: pathname,
      data: {
        projectId: project.id,
        projectName: project.name,
        ...(workspaceId && {
          workspaceId,
          workspaceName: workspace?.name,
          workspaceSlug: workspace?.slug,
        }),
      },
    };
  }, [project, pathname, workspaceId, workspace?.name, workspace?.slug]);
  useRegisterPageContext(projectPageContext);
  // Workspace data for detailed actions setting
  const { data: workspaceData } = api.workspace.getBySlug.useQuery(
    { slug: workspace?.slug ?? "" },
    { enabled: !!workspace?.slug },
  );
  const workspaceDetailedEnabled = workspaceData?.enableDetailedActions ?? false;
  const workspaceBountiesEnabled = workspaceData?.enableBounties ?? false;

  const updateDetailedActionsMutation = api.project.update.useMutation({
    onSuccess: () => {
      void utils.project.getById.invalidate({ id: projectId });
      notifications.show({
        title: "Settings Updated",
        message: "Detailed action pages setting has been updated",
        color: "green",
        autoClose: 3000,
      });
    },
  });

  const updateBountiesMutation = api.project.update.useMutation({
    onSuccess: () => {
      void utils.project.getById.invalidate({ id: projectId });
      notifications.show({
        title: "Settings Updated",
        message: "Bounties setting has been updated",
        color: "green",
        autoClose: 3000,
      });
    },
  });

  // Use the resolved project ID (from getById which handles slug resolution)
  // instead of the raw projectId prop which may be a slug like "home-renovation-cmm3mjlev...".
  // URL slugs use the compound "slug-cuid" format, so when the CUID is present
  // we can extract it and start the dependent queries in parallel with getById
  // instead of serializing a second network round-trip behind it.
  const idFromSlug = /(?:^|-)(c[a-z0-9]{24,})$/.exec(projectId)?.[1];
  const resolvedProjectId = project?.id ?? idFromSlug ?? projectId;
  const dependentQueriesEnabled = !!project || !!idFromSlug;
  const { data: projectActions } = api.action.getProjectActions.useQuery(
    { projectId: resolvedProjectId },
    { enabled: dependentQueriesEnabled },
  );
  const goalsQuery = api.goal.getProjectGoals.useQuery(
    { projectId: resolvedProjectId },
    { enabled: dependentQueriesEnabled },
  );
  const { data: projectWorkflows } = api.projectWorkflow.getProjectWorkflows.useQuery(
    { projectId: resolvedProjectId },
    { enabled: dependentQueriesEnabled },
  );
  const utils = api.useUtils();
  const updateDates = api.project.updateDates.useMutation({
    onSuccess: () => {
      void utils.project.getById.invalidate({ id: projectId });
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message,
        color: "red",
      });
    },
  });

  const handleTabChange = useCallback((value: string | null) => {
    if (value && isValidTab(value)) {
      // Update URL with new tab
      const params = new URLSearchParams(searchParams.toString());
      if (value === "tasks") {
        params.delete("tab");
      } else {
        params.set("tab", value);
      }
      const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
      router.push(newUrl, { scroll: false });
    }
  }, [router, searchParams]);

  // Check if project has active Fireflies workflow
  const hasFirefliesWorkflow = projectWorkflows?.some(
    workflow => workflow.template?.id === 'fireflies-meeting-transcription' && workflow.status === 'ACTIVE'
  ) || false;

  // Legacy `?transcription=<sessionId>` links opened a modal on this tab;
  // meetings now live on their own detail page, so forward old links there.
  const legacyTranscriptionParam = searchParams.get("transcription");
  useEffect(() => {
    if (!legacyTranscriptionParam || !project?.transcriptionSessions) return;
    const match = project.transcriptionSessions.find(
      (session) => session.sessionId === legacyTranscriptionParam || session.id === legacyTranscriptionParam
    );
    if (match) {
      router.replace(`/recording/${match.id}`);
    }
  }, [legacyTranscriptionParam, project?.transcriptionSessions, router]);

  if (isLoading) {
    return <div>Loading project...</div>;
  }

  if (projectError) {
    const isAccessDenied = projectError.data?.code === "FORBIDDEN";
    return (
      <Paper p="xl" className="text-center">
        <Text size="lg" c="dimmed">
          {isAccessDenied
            ? "Access denied - you don't have permission to view this project"
            : "Project not found"}
        </Text>
      </Paper>
    );
  }

  if (!project) {
    return <div>Project not found</div>;
  }

  // Derive header stats
  const monogram = project.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase() || "P";

  const statusLabel = (() => {
    switch (project.status) {
      case "ACTIVE":
        return "Active project";
      case "ON_HOLD":
        return "On hold";
      case "COMPLETED":
        return "Completed";
      case "CANCELLED":
        return "Cancelled";
      default:
        return "Project";
    }
  })();

  const totalActions = projectActions?.length ?? 0;
  const doneActions =
    projectActions?.filter((a) => a.status === "COMPLETED").length ?? 0;
  const progressPct = Math.max(0, Math.min(100, Math.round(project.progress ?? 0)));

  // "Due" is the project's end date — the same field the create/edit modal sets.
  const dueDate = project.endDate ? new Date(project.endDate) : null;
  const dueLabel = dueDate ? format(dueDate, "MMM d") : null;
  const dueIsOverdue = dueDate ? isBefore(dueDate, startOfDay(new Date())) : false;

  const ownerUser = project.dri ?? project.createdBy;
  const ownerName = ownerUser?.name ?? null;
  const ownerFirstName = ownerName ? ownerName.split(" ")[0] : null;
  const ownerInitial = (ownerName ?? "?")[0]?.toUpperCase() ?? "?";

  return (
    <>
      {/* Project Header */}
      <div className={overviewStyles.header}>
        <div className={overviewStyles.headerMain}>
          <div className={overviewStyles.eyebrow}>
            <span className={overviewStyles.eyebrowDot} />
            {statusLabel}
            {workspace?.name ? ` · ${workspace.name}` : ""}
          </div>
          <h1 className={overviewStyles.title}>
            <span className={overviewStyles.titleGlyph}>{monogram}</span>
            {project.name}
            {project.isRestricted && (
              <Tooltip label="Restricted — only members can access">
                <IconLock size={18} className="ml-2 text-text-muted" aria-label="Restricted project" />
              </Tooltip>
            )}
          </h1>
          {project.description && (
            <div className={overviewStyles.sub}>{project.description}</div>
          )}

          <div className={overviewStyles.stats}>
            <div className={overviewStyles.stat}>
              <div className={overviewStyles.statLabel}>Progress</div>
              <div className={overviewStyles.statValue}>
                <div className={overviewStyles.progressBar}>
                  <div
                    className={overviewStyles.progressBarFill}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                {progressPct}%
              </div>
            </div>
            <div className={overviewStyles.stat}>
              <div className={overviewStyles.statLabel}>Actions</div>
              <div className={overviewStyles.statValue}>
                {doneActions} of {totalActions}
              </div>
            </div>
            <div className={overviewStyles.stat}>
              <div className={overviewStyles.statLabel}>Due</div>
              <UnifiedDatePicker
                value={dueDate}
                onChange={(date) =>
                  updateDates.mutate({
                    id: project.id,
                    startDate: project.startDate ?? null,
                    endDate: date,
                  })
                }
                notificationContext="project"
                renderTrigger={({ toggle }) => (
                  <button
                    type="button"
                    onClick={toggle}
                    aria-label="Set due date"
                    className={`${overviewStyles.statValue} ${overviewStyles.statValueButton} ${
                      dueIsOverdue ? overviewStyles.statValueDue : ""
                    } ${dueLabel ? "" : overviewStyles.statValuePlaceholder}`}
                  >
                    {dueLabel ?? "Set date"}
                  </button>
                )}
              />
            </div>
            {ownerFirstName && (
              <div className={overviewStyles.stat}>
                <div className={overviewStyles.statLabel}>Owner</div>
                <div className={overviewStyles.statValue}>
                  <div className={overviewStyles.ownerAvatar}>{ownerInitial}</div>
                  {ownerFirstName}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={overviewStyles.headerActions}>
          <CreateProjectModal project={project}>
            <button
              type="button"
              className={`${overviewStyles.iconBtn} ${overviewStyles.iconBtnPrimary}`}
              title="Edit Project"
              aria-label="Edit project"
            >
              <IconEdit size={14} />
            </button>
          </CreateProjectModal>
          <button
            type="button"
            className={`${overviewStyles.iconBtn} ${overviewStyles.iconBtnPrimary}`}
            onClick={() => openChatModal(projectId)}
            title={chatModalOpen ? "Close Project Chat" : "Open Project Chat"}
            aria-label="Project chat"
          >
            <IconMessageCircle size={14} />
          </button>
          <button
            type="button"
            className={`${overviewStyles.iconBtn} ${overviewStyles.iconBtnPrimary}`}
            onClick={() =>
              setActiveDrawer(activeDrawer === "settings" ? null : "settings")
            }
            title={
              activeDrawer === "settings"
                ? "Close Project Settings"
                : "Open Project Settings"
            }
            aria-label="Project settings"
          >
            <IconSettings size={14} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="w-full">
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          classNames={{ list: overviewStyles.tabsList, tab: overviewStyles.tab }}
        >
          <Stack gap="xl" align="stretch" justify="flex-start">
            {/* Tabs Navigation */}
            <Tabs.List>
              <Tabs.Tab
                value="overview"
                leftSection={<IconHome size={14} />}
              >
                Overview
              </Tabs.Tab>
              <Tabs.Tab
                value="tasks"
                leftSection={<IconLayoutKanban size={14} />}
                rightSection={
                  totalActions > 0 ? (
                    <span
                      className={`${overviewStyles.tabCount} ${
                        activeTab === "tasks" ? overviewStyles.tabCountActive : ""
                      }`}
                    >
                      {totalActions}
                    </span>
                  ) : null
                }
              >
                Tasks
              </Tabs.Tab>
              <Tabs.Tab
                value="goals"
                leftSection={<IconTargetArrow size={14} />}
              >
                Goals
              </Tabs.Tab>
              <Tabs.Tab value="timeline" leftSection={<IconClock size={14} />}>
                Timeline
              </Tabs.Tab>
              {/* Team Weekly Planning Tabs - Only show for team projects */}
              {project.teamId && (
                <>
                  <Tabs.Tab 
                    value="weekly-team-review" 
                    leftSection={<IconUsers size={14} />}
                  >
                    Weekly Team Review
                  </Tabs.Tab>
                  <Tabs.Tab 
                    value="weekly-outcomes" 
                    leftSection={<IconCalendarWeek size={14} />}
                  >
                    Weekly Commitments
                  </Tabs.Tab>
                </>
              )}
              
              <Tabs.Tab
                value="workflows"
                leftSection={<IconGitBranch size={14} />}
              >
                Workflows
              </Tabs.Tab>
              <Tabs.Tab
                value="transcriptions"
                leftSection={<IconMicrophone size={14} />}
              >
                Meetings
              </Tabs.Tab>
              <Tabs.Tab
                value="integrations"
                leftSection={<IconPlug size={14} />}
              >
                Integrations
              </Tabs.Tab>
              <Tabs.Tab
                value="access"
                leftSection={<IconShieldLock size={14} />}
              >
                Access
              </Tabs.Tab>
            </Tabs.List>

            {/* Content Area */}
            <Tabs.Panel value="overview">
              {legacyOverview ? (
                <ProjectOverviewLegacy project={project} goals={goalsQuery.data ?? []} />
              ) : (
                <ProjectOverview project={project} goals={goalsQuery.data ?? []} />
              )}
            </Tabs.Panel>

            <Tabs.Panel value="tasks">
              <Stack gap="md">
                <ProjectSyncStatus
                  project={project}
                  opened={syncStatusOpened}
                  onToggle={() => setSyncStatusOpened(!syncStatusOpened)}
                />
                <Actions
                  viewName={viewName}
                  defaultView="list"
                  projectId={project.id}
                  displayAlignment={false}
                  projectSyncInfo={{
                    taskManagementTool: project.taskManagementTool,
                    taskManagementConfig: project.taskManagementConfig as {
                      workflowId?: string;
                      syncStrategy?: 'manual' | 'auto_pull_then_push' | 'notion_canonical';
                    } | null,
                  }}
                />
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="goals">
              <InitiativeDashboard projectId={resolvedProjectId} />
            </Tabs.Panel>

            <Tabs.Panel value="timeline">
              <Paper
                p="md"
                radius="sm"
                className="mx-auto w-full bg-surface-secondary"
              >
                <ProjectTimeline projectId={resolvedProjectId} />
              </Paper>
            </Tabs.Panel>

            <Tabs.Panel value="workflows">
              <Paper
                p="md"
                radius="sm"
                className="mx-auto w-full bg-surface-secondary"
              >
                <ProjectWorkflowsTab projectId={resolvedProjectId} />
              </Paper>
            </Tabs.Panel>

            {/* Team Weekly Planning Panels - Only show for team projects */}
            {project.teamId && (
              <>
                <Tabs.Panel value="weekly-team-review">
                  <TeamWeeklyReview projectId={resolvedProjectId} />
                </Tabs.Panel>

                <Tabs.Panel value="weekly-outcomes">
                  <WeeklyOutcomes projectId={resolvedProjectId} />
                </Tabs.Panel>
              </>
            )}

            <Tabs.Panel value="transcriptions">
              <ProjectMeetingsTab
                projectId={resolvedProjectId}
                projectName={project.name}
                workspaceId={project.workspaceId}
                hasFirefliesWorkflow={hasFirefliesWorkflow}
              />
            </Tabs.Panel>

            <Tabs.Panel value="integrations">
              <ProjectIntegrations project={{ ...project, teamId: project.teamId }} />
            </Tabs.Panel>

            <Tabs.Panel value="access">
              <AccessTabPanel projectId={resolvedProjectId} />
            </Tabs.Panel>
          </Stack>
        </Tabs>
      </div>

      {/* Project Settings Drawer */}
      <Drawer
        opened={activeDrawer === 'settings'}
        onClose={() => setActiveDrawer(null)}
        position="right"
        size="lg"
        trapFocus={false}
        lockScroll={false}
        withOverlay={false}
        styles={{
          header: { display: 'none' },
          body: { padding: 0 },
          content: { backgroundColor: 'var(--color-bg-elevated)' }
        }}
      >
        <Stack gap="xl" p="lg" h="100vh" style={{ overflowY: 'auto' }}>
          {/* Custom Header with Close Button */}
          <Group justify="space-between" align="center" pb="sm" style={{ borderBottom: '1px solid var(--color-border-primary)' }}>
            <div>
              <Text size="lg" fw={600} c="bright">
                {project.name}
              </Text>
              <Text size="sm" c="dimmed">
                Project Configuration
              </Text>
            </div>
            <ActionIcon
              variant="subtle"
              size="lg"
              onClick={() => setActiveDrawer(null)}
              c="dimmed"
            >
              <IconX size={20} />
            </ActionIcon>
          </Group>

          {/* Team Section */}
          {project.team && (
            <Stack gap="xs">
              <Group gap="xs" align="center">
                <IconTargetArrow size={16} className="text-brand-primary" />
                <Text size="sm" fw={600} className="text-brand-primary">
                  TEAM
                </Text>
              </Group>
              <Card 
                withBorder 
                p="lg" 
                radius="lg" 
                className="bg-gradient-to-br from-blue-500/15 via-indigo-500/10 to-purple-500/15 border-blue-500/30 hover:border-blue-400/50 transition-all duration-200 hover:shadow-lg"
              >
                <Group justify="space-between" align="flex-start">
                  <Stack gap="xs" style={{ flex: 1 }}>
                    <Text size="xl" fw={700} c="bright" className="bg-gradient-to-r from-blue-300 to-indigo-300 bg-clip-text text-transparent">
                      {project.team.name}
                    </Text>
                    <Text size="sm" c="dimmed" lineClamp={2}>
                      {project.team.description || 'Collaborate with your team on this project'}
                    </Text>
                  </Stack>
                  <Button
                    variant="gradient"
                    gradient={{ from: 'blue', to: 'indigo', deg: 45 }}
                    size="sm"
                    component={Link}
                    href={`/teams/${project.team.slug}`}
                    leftSection={<IconTargetArrow size={14} />}
                    className="shrink-0"
                  >
                    View Team
                  </Button>
                </Group>
              </Card>
            </Stack>
          )}

          {/* Project Details */}
          <ProjectDetails project={project} />

          {/* Project Sync Configuration */}
          {project && (
            <ProjectSyncConfiguration
              project={{
                id: project.id,
                taskManagementTool: project.taskManagementTool,
                taskManagementConfig: project.taskManagementConfig,
              }}
              actions={projectActions || []}
              selectedActionIds={selectedActionIds}
              onSelectionChange={setSelectedActionIds}
            />
          )}
          
          {/* Detailed Action Pages Override */}
          <Stack gap="xs">
            <Group gap="xs" align="center">
              <IconLayoutList size={16} className="text-brand-primary" />
              <Text size="sm" fw={600} className="text-brand-primary">
                ACTION DETAIL PAGES
              </Text>
            </Group>
            <Card withBorder p="md" radius="lg" className="bg-surface-secondary border-border-primary">
              <Stack gap="sm">
                <Text size="sm" className="text-text-secondary">
                  Override the workspace default for detailed action pages in this project.
                </Text>
                <SegmentedControl
                  value={
                    project?.enableDetailedActions == null
                      ? "inherit"
                      : project.enableDetailedActions
                        ? "on"
                        : "off"
                  }
                  onChange={(value) => {
                    if (!project) return;
                    const newValue = value === "inherit" ? null : value === "on";
                    updateDetailedActionsMutation.mutate({
                      id: project.id,
                      name: project.name,
                      status: project.status as "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED",
                      priority: project.priority as "HIGH" | "MEDIUM" | "LOW" | "NONE",
                      enableDetailedActions: newValue,
                    });
                  }}
                  data={[
                    {
                      label: `Inherit (${workspaceDetailedEnabled ? "ON" : "OFF"})`,
                      value: "inherit",
                    },
                    { label: "On", value: "on" },
                    { label: "Off", value: "off" },
                  ]}
                  fullWidth
                  disabled={updateDetailedActionsMutation.isPending}
                />
              </Stack>
            </Card>
          </Stack>

          {/* Bounties Override */}
          <Stack gap="xs">
            <Group gap="xs" align="center">
              <IconCoin size={16} className="text-brand-primary" />
              <Text size="sm" fw={600} className="text-brand-primary">
                BOUNTIES
              </Text>
            </Group>
            <Card withBorder p="md" radius="lg" className="bg-surface-secondary border-border-primary">
              <Stack gap="sm">
                <Text size="sm" className="text-text-secondary">
                  Override the workspace default for bounties in this project.
                </Text>
                <SegmentedControl
                  value={
                    project?.enableBounties == null
                      ? "inherit"
                      : project.enableBounties
                        ? "on"
                        : "off"
                  }
                  onChange={(value) => {
                    if (!project) return;
                    const newValue = value === "inherit" ? null : value === "on";
                    updateBountiesMutation.mutate({
                      id: project.id,
                      name: project.name,
                      status: project.status as "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED",
                      priority: project.priority as "HIGH" | "MEDIUM" | "LOW" | "NONE",
                      enableBounties: newValue,
                    });
                  }}
                  data={[
                    {
                      label: `Inherit (${workspaceBountiesEnabled ? "ON" : "OFF"})`,
                      value: "inherit",
                    },
                    { label: "On", value: "on" },
                    { label: "Off", value: "off" },
                  ]}
                  fullWidth
                  disabled={updateBountiesMutation.isPending}
                />
              </Stack>
            </Card>
          </Stack>

          {/* Matrix room binding */}
          <Stack gap="xs">
            <Group gap="xs" align="center">
              <IconMessageCircle size={16} className="text-brand-primary" />
              <Text size="sm" fw={600} className="text-brand-primary">
                MATRIX ROOM
              </Text>
            </Group>
            <Card withBorder p="md" radius="lg" className="bg-surface-secondary border-border-primary">
              <Stack gap="sm">
                <Text size="sm" className="text-text-secondary">
                  Where this project&apos;s meeting summaries are posted. Posting is
                  always a manual click — nothing is sent automatically.
                </Text>
                {workspaceId && resolvedProjectId && (
                  <MatrixRoomBinding
                    workspaceId={workspaceId}
                    projectId={resolvedProjectId}
                  />
                )}
              </Stack>
            </Card>
          </Stack>

          {/* Team Members */}
          <Team projectId={resolvedProjectId} />
        </Stack>
      </Drawer>
    </>
  );
}

function AccessTabPanel({ projectId }: { projectId: string }) {
  const utils = api.useUtils();
  const projectQuery = api.project.getById.useQuery({ id: projectId });
  const accessQuery = api.project.getMyAccess.useQuery({ projectId });

  const setRestrictedMutation = api.project.setRestricted.useMutation({
    onSuccess: () => {
      void utils.project.getById.invalidate({ id: projectId });
      void utils.project.getMyAccess.invalidate({ projectId });
      notifications.show({
        title: "Access updated",
        message: "Restriction setting saved.",
        color: "green",
        autoClose: 2000,
      });
    },
    onError: (err) => {
      notifications.show({
        title: "Could not update restriction",
        message: err.message,
        color: "red",
      });
    },
  });

  const updateMutation = api.project.update.useMutation({
    onSuccess: () => {
      void utils.project.getById.invalidate({ id: projectId });
      notifications.show({
        title: "Visibility updated",
        message: "Public setting saved.",
        color: "green",
        autoClose: 2000,
      });
    },
    onError: (err) => {
      notifications.show({
        title: "Could not update visibility",
        message: err.message,
        color: "red",
      });
    },
  });

  if (projectQuery.isLoading || accessQuery.isLoading) {
    return <Text size="sm" c="dimmed">Loading access settings…</Text>;
  }

  const project = projectQuery.data;
  const access = accessQuery.data;
  if (!project || !access) return null;

  const canEdit = access.canEdit;
  const canManageMembers = access.canManageMembers;

  return (
    <Stack gap="xl">
      <Paper p="lg" withBorder radius="md" className="border-border-primary bg-surface-secondary">
        <Stack gap="md">
          <Group gap="xs" align="center">
            <IconShieldLock size={16} className="text-brand-primary" />
            <Text size="sm" fw={600} className="text-brand-primary">
              VISIBILITY
            </Text>
          </Group>

          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <Stack gap={4} style={{ flex: 1 }}>
              <Group gap="xs">
                <IconLock size={14} className="text-text-secondary" />
                <Text fw={500} className="text-text-primary">
                  Restricted project
                </Text>
              </Group>
              <Text size="xs" className="text-text-muted">
                Only the creator, project members, and workspace owners/admins
                can see this project. Workspace members and team members lose
                visibility — add teammates as project members to keep them.
                Meetings keep one exception: attendees can still view meetings
                they were part of.
              </Text>
            </Stack>
            <Tooltip
              label={
                canManageMembers
                  ? ""
                  : "Only the creator, project admins, or workspace owners/admins can change this"
              }
              disabled={canManageMembers}
            >
              <span>
                <Switch
                  checked={project.isRestricted ?? false}
                  disabled={!canManageMembers || setRestrictedMutation.isPending}
                  onChange={(e) =>
                    setRestrictedMutation.mutate({
                      projectId,
                      isRestricted: e.currentTarget.checked,
                    })
                  }
                />
              </span>
            </Tooltip>
          </Group>

          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <Stack gap={4} style={{ flex: 1 }}>
              <Group gap="xs">
                <IconWorld size={14} className="text-text-secondary" />
                <Text fw={500} className="text-text-primary">
                  Public project
                </Text>
              </Group>
              <Text size="xs" className="text-text-muted">
                Anyone with the link can view this project. Public visibility
                wins over restriction for read access.
              </Text>
            </Stack>
            <Tooltip
              label={canEdit ? "" : "You do not have edit access"}
              disabled={canEdit}
            >
              <span>
                <Switch
                  checked={project.isPublic ?? false}
                  disabled={!canEdit || updateMutation.isPending}
                  onChange={(e) =>
                    updateMutation.mutate({
                      id: project.id,
                      name: project.name,
                      status: project.status as "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED",
                      priority: project.priority as "HIGH" | "MEDIUM" | "LOW" | "NONE",
                      isPublic: e.currentTarget.checked,
                    })
                  }
                />
              </span>
            </Tooltip>
          </Group>

          {project.isPublic && project.isRestricted && (
            <Alert color="yellow" variant="light" icon={<IconWorld size={14} />}>
              <Text size="xs" className="text-text-secondary">
                Both flags are on. The project is publicly viewable; the
                restriction only narrows who can edit and manage members.
              </Text>
            </Alert>
          )}
        </Stack>
      </Paper>

      <Paper p="lg" withBorder radius="md" className="border-border-primary bg-surface-secondary">
        <Stack gap="md">
          <Group gap="xs" align="center">
            <IconUsers size={16} className="text-brand-primary" />
            <Text size="sm" fw={600} className="text-brand-primary">
              MEMBERS
            </Text>
          </Group>
          <Text size="xs" className="text-text-muted">
            Project members can access the project and its data even when the
            project is restricted. Use Admin for people who should manage
            membership, Editor for collaborators, Viewer for read-only access.
          </Text>
          <ProjectMembersPanel projectId={projectId} />
        </Stack>
      </Paper>
    </Stack>
  );
}
