"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Actions } from "./Actions";
import ProjectDetails from "./ProjectDetails";
//import Chat from "./Chat";
import { Team } from "./Team";
// import { Plan } from "./Plan";
import { OutcomesTable } from "./OutcomesTable";
import { OutcomeTimeline } from "./OutcomeTimeline";
import { InitiativeDashboard } from "~/app/_components/initiatives/InitiativeDashboard";
import { Button } from "@mantine/core";
import { HTMLContent } from "./HTMLContent";
import {
  Group,
  Tabs,
  Title,
  Paper,
  Stack,
  Text,
  Drawer,
  Badge,
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
  IconActivity,
  IconClock,
  IconMicrophone,
  IconMessageCircle,
  IconX,
  IconUsers,
  IconCalendarWeek,
  IconGitBranch,
  IconHome,
  IconEdit,
  IconPlayerPlay,
  IconTrash,
  IconLayoutList,
  IconCoin,
  IconPlug,
  IconShieldLock,
  IconLock,
  IconWorld,
} from "@tabler/icons-react";
import { format, isBefore, startOfDay } from "date-fns";
import overviewStyles from "./ProjectOverview.module.css";
import { CreateOutcomeModal } from "~/app/_components/CreateOutcomeModal";
import { CreateProjectModal } from "~/app/_components/CreateProjectModal";
import { SmartContentRenderer } from "./SmartContentRenderer";
import { ProjectIntegrations } from "./ProjectIntegrations";
import { ProjectSyncStatus } from "./ProjectSyncStatus";
import { ProjectSyncConfiguration } from "./ProjectSyncConfiguration";
import { TranscriptionDetailsModal } from "./TranscriptionDetailsModal";
import { TeamWeeklyReview } from "./TeamWeeklyReview";
import { WeeklyOutcomes } from "./WeeklyOutcomes";
import { ProjectFirefliesSyncPanel } from "./ProjectFirefliesSyncPanel";
import { ProjectWorkflowsTab } from "./ProjectWorkflowsTab";
import { ProjectOverview } from "./ProjectOverview";
import { ProjectMembersPanel } from "./ProjectMembersPanel";
import { CreateTranscriptionModal } from "./CreateTranscriptionModal";
import { useAgentModal } from "~/providers/AgentModalProvider";
import { useRegisterPageContext } from "~/hooks/useRegisterPageContext";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { notifications } from "@mantine/notifications";
import Link from "next/link";
import { useMemo } from "react";

type TabValue =
  | "overview"
  | "tasks"
  | "plan"
  | "goals"
  | "outcomes"
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
  "plan",
  "goals",
  "outcomes",
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
}: {
  viewName: string;
  projectId: string;
  initialTab?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get tab from URL or use initial/default
  const tabFromUrl = searchParams.get("tab");
  const activeTab: TabValue = isValidTab(tabFromUrl)
    ? tabFromUrl
    : isValidTab(initialTab)
      ? initialTab
      : "overview";

  const pathname = usePathname();
  const [drawerOpened, setDrawerOpened] = useState(false);
  const [activeDrawer, setActiveDrawer] = useState<'settings' | null>(null);
  const { openModal: openChatModal, isOpen: chatModalOpen } = useAgentModal();
  const [selectedTranscription, setSelectedTranscription] = useState<unknown>(null);
  const [syncStatusOpened, setSyncStatusOpened] = useState(false);
  const [selectedActionIds, setSelectedActionIds] = useState<Set<string>>(new Set());
  const { data: project, isLoading, error: projectError } = api.project.getById.useQuery({
    id: projectId,
  });

  // Register project context for agent chat — merges with workspace context
  const { workspace, workspaceId } = useWorkspace();
  const projectPageContext = useMemo(() => {
    if (!projectId) return null;
    return {
      pageType: 'project' as const,
      pageTitle: project?.name ?? 'Project',
      pagePath: pathname,
      data: {
        projectId,
        projectName: project?.name,
        ...(workspaceId && {
          workspaceId,
          workspaceName: workspace?.name,
          workspaceSlug: workspace?.slug,
        }),
      },
    };
  }, [projectId, project?.name, pathname, workspaceId, workspace?.name, workspace?.slug]);
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
  // instead of the raw projectId prop which may be a slug like "home-renovation-cmm3mjlev..."
  const resolvedProjectId = project?.id ?? projectId;
  const { data: projectActions } = api.action.getProjectActions.useQuery(
    { projectId: resolvedProjectId },
    { enabled: !!project },
  );
  const goalsQuery = api.goal.getProjectGoals.useQuery(
    { projectId: resolvedProjectId },
    { enabled: !!project },
  );
  const outcomesQuery = api.outcome.getProjectOutcomes.useQuery(
    { projectId: resolvedProjectId },
    { enabled: !!project },
  );
  const { data: projectWorkflows } = api.projectWorkflow.getProjectWorkflows.useQuery(
    { projectId: resolvedProjectId },
    { enabled: !!project },
  );
  const utils = api.useUtils();

  const toggleActionsMutation = api.transcription.toggleActionGeneration.useMutation({
    onSuccess: (result) => {
      if (result.action === "generated") {
        notifications.show({
          title: "Actions Generated",
          message: `Successfully created ${result.actionsCreated} action${result.actionsCreated === 1 ? "" : "s"} from the transcription`,
          color: "green",
        });
      } else {
        notifications.show({
          title: "Actions Deleted",
          message: `Successfully deleted ${result.actionsDeleted} action${result.actionsDeleted === 1 ? "" : "s"}`,
          color: "orange",
        });
      }
      // Refresh project data
      void utils.project.getById.invalidate({ id: projectId });
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to toggle actions",
        color: "red",
      });
    },
  });

  const handleTabChange = useCallback((value: string | null) => {
    if (value && isValidTab(value)) {
      // Update URL with new tab
      const params = new URLSearchParams(searchParams.toString());
      if (value === "overview") {
        params.delete("tab");
      } else {
        params.set("tab", value);
      }
      const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
      router.push(newUrl, { scroll: false });
    }
  }, [router, searchParams]);

  const handleTranscriptionClick = useCallback((transcription: any) => {
    setSelectedTranscription(transcription);
    setDrawerOpened(true);

    // Add transcription sessionId to URL
    const params = new URLSearchParams(searchParams.toString());
    params.set("transcription", transcription.sessionId);
    const newUrl = `?${params.toString()}`;
    router.push(newUrl, { scroll: false });
  }, [router, searchParams]);

  const handleTranscriptionClose = useCallback(() => {
    setDrawerOpened(false);
    setSelectedTranscription(null);

    // Remove transcription param from URL
    const params = new URLSearchParams(searchParams.toString());
    params.delete("transcription");
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
    router.push(newUrl, { scroll: false });
  }, [router, searchParams]);

  // Check if project has active Fireflies workflow
  const hasFirefliesWorkflow = projectWorkflows?.some(
    workflow => workflow.template?.id === 'fireflies-meeting-transcription' && workflow.status === 'ACTIVE'
  ) || false;

  // Auto-open transcription from URL param
  useEffect(() => {
    const transcriptionParam = searchParams.get("transcription");
    if (transcriptionParam && project?.transcriptionSessions && !drawerOpened) {
      const transcription = project.transcriptionSessions.find(
        (session) => session.sessionId === transcriptionParam
      );
      if (transcription) {
        setSelectedTranscription(transcription);
        setDrawerOpened(true);
      }
    }
  }, [searchParams, project?.transcriptionSessions, drawerOpened]);

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

  const dueDate = project.reviewDate ? new Date(project.reviewDate) : null;
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
              <div
                className={`${overviewStyles.statValue} ${
                  dueIsOverdue ? overviewStyles.statValueDue : ""
                }`}
              >
                {dueLabel ?? "—"}
              </div>
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
              <Tabs.Tab
                value="outcomes"
                leftSection={<IconActivity size={14} />}
              >
                Outcomes
              </Tabs.Tab>
              <Tabs.Tab value="timeline" leftSection={<IconClock size={14} />}>
                Timeline
              </Tabs.Tab>
              {/* <Tabs.Tab
                value="plan"
                leftSection={<IconClipboardList size={14} />}
              >
                Plan
              </Tabs.Tab> */}
              
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
                    Weekly Outcomes
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
                Transcriptions
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
              <ProjectOverview project={project} goals={goalsQuery.data ?? []} outcomes={outcomesQuery.data ?? []} />
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

            {/* <Tabs.Panel value="plan">
              <Plan projectId={projectId} />
            </Tabs.Panel> */}

            <Tabs.Panel value="goals">
              <InitiativeDashboard projectId={resolvedProjectId} />
            </Tabs.Panel>

            <Tabs.Panel value="outcomes">
              <Paper
                p="md"
                radius="sm"
                className="mx-auto w-full bg-surface-secondary"
              >
                <OutcomesTable outcomes={outcomesQuery.data ?? []} />
                <div className="mt-4">
                  <CreateOutcomeModal projectId={resolvedProjectId}>
                    <Button variant="filled" color="dark" leftSection="+">
                      Add Outcome
                    </Button>
                  </CreateOutcomeModal>
                </div>
              </Paper>
            </Tabs.Panel>

            <Tabs.Panel value="timeline">
              <Paper
                p="md"
                radius="sm"
                className="mx-auto w-full bg-surface-secondary"
              >
                <OutcomeTimeline projectId={resolvedProjectId} />
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
              <Stack gap="md">
                <Group justify="space-between" align="center">
                  <Group gap="md">
                    <Title order={4}>Project Transcriptions</Title>
                    <CreateTranscriptionModal projectId={resolvedProjectId} />
                  </Group>
                  <Group gap="md">
                    {hasFirefliesWorkflow && (
                      <ProjectFirefliesSyncPanel
                        projectId={resolvedProjectId}
                        onSyncComplete={() => {
                          // Refresh project data to show newly synced transcriptions
                          void utils.project.getById.invalidate({ id: projectId });
                        }}
                      />
                    )}
                    <Text size="sm" c="dimmed">
                      {project.transcriptionSessions?.length || 0} transcriptions
                      {(project.transcriptionSessions?.length || 0) > 3 && (
                        <Text component="span" size="xs" c="dimmed" ml="xs">
                          • Scroll to view all
                        </Text>
                      )}
                    </Text>
                  </Group>
                </Group>

                {project.transcriptionSessions && project.transcriptionSessions.length > 0 ? (
                  <div 
                    style={{ 
                      maxHeight: '600px', 
                      overflowY: 'auto',
                      paddingRight: '8px',
                      scrollbarWidth: 'thin',
                      scrollbarColor: 'var(--mantine-color-gray-4) transparent',
                    }}
                    className="scrollable-transcriptions"
                  >
                    <Stack gap="lg">
                      {project.transcriptionSessions.map((session) => (
                      <Card
                        key={session.id}
                        withBorder
                        shadow="sm"
                        radius="md"
                        className="hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => handleTranscriptionClick(session)}
                      >
                        <Stack gap="md">
                          {/* Transcription Header */}
                          <Group justify="space-between" align="flex-start" wrap="nowrap">
                            <Stack gap="xs" style={{ flex: 1 }}>
                              <Group gap="sm" wrap="nowrap">
                                <Text size="lg" fw={600} lineClamp={1}>
                                  {session.title || `Session ${session.sessionId}`}
                                </Text>
                                <Group gap="xs">
                                  {session.sourceIntegration && (
                                    <Badge variant="dot" color="teal" size="sm">
                                      {session.sourceIntegration.provider}
                                    </Badge>
                                  )}
                                </Group>
                              </Group>

                              <Group gap="md" c="dimmed">
                                <Text size="sm">
                                  {new Date(session.meetingDate ?? session.createdAt).toLocaleDateString('en-US', {
                                    weekday: 'short',
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </Text>
                                <Text size="sm">
                                  {new Date(session.meetingDate ?? session.createdAt).toLocaleTimeString('en-US', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </Text>
                                {session.actions && session.actions.length > 0 && (
                                  <>
                                    <Text size="sm">•</Text>
                                    <Text size="sm">
                                      {session.actions.length} {session.actions.length === 1 ? 'action' : 'actions'}
                                    </Text>
                                  </>
                                )}
                              </Group>
                            </Stack>

                            {/* Generate/Delete Actions Button */}
                            <Button
                              size="xs"
                              variant={(session as any).processedAt && session.actions?.length > 0 ? "light" : "filled"}
                              color={(session as any).processedAt && session.actions?.length > 0 ? "red" : "blue"}
                              leftSection={(session as any).processedAt && session.actions?.length > 0 ? <IconTrash size={14} /> : <IconPlayerPlay size={14} />}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleActionsMutation.mutate({ transcriptionId: session.id });
                              }}
                              loading={toggleActionsMutation.isPending && toggleActionsMutation.variables?.transcriptionId === session.id}
                            >
                              {(session as any).processedAt && session.actions?.length > 0 ? "Delete Actions" : "Generate Actions"}
                            </Button>
                          </Group>

                          {/* Description Preview */}
                          {session.description && (
                            <Paper p="sm" radius="sm" className="bg-surface-secondary">
                              <SmartContentRenderer
                                content={session.description}
                                isPreview={true}
                                maxLines={3}
                              />
                            </Paper>
                          )}

                          {/* Actions Summary */}
                          {session.actions && session.actions.length > 0 && (
                            <Paper p="sm" radius="sm" withBorder>
                              <Group justify="space-between" align="center">
                                <Group gap="xs">
                                  <Text size="sm" fw={500} c="dimmed">
                                    Action Items:
                                  </Text>
                                  <Badge variant="filled" color="blue" size="sm">
                                    {session.actions.length}
                                  </Badge>
                                </Group>
                              </Group>
                              
                              {/* Action Items Preview */}
                              <Stack gap="xs" mt="xs">
                                {session.actions.slice(0, 3).map((action: any) => (
                                  <Group key={action.id} gap="xs" align="flex-start">
                                    <Text size="xs" c="dimmed" mt={2}>•</Text>
                                    <Text size="sm" lineClamp={1} style={{ flex: 1 }}>
                                      <HTMLContent html={action.name} compactUrls />
                                    </Text>
                                    {action.priority && (
                                      <Badge variant="outline" size="xs" color="gray">
                                        {action.priority}
                                      </Badge>
                                    )}
                                  </Group>
                                ))}
                                {session.actions.length > 3 && (
                                  <Text size="xs" c="dimmed" fs="italic">
                                    +{session.actions.length - 3} more actions...
                                  </Text>
                                )}
                              </Stack>
                            </Paper>
                          )}
                        </Stack>
                      </Card>
                      ))}
                    </Stack>
                  </div>
                ) : (
                  <Paper p="xl" radius="md" className="text-center">
                    <Stack gap="md" align="center">
                      <Text size="lg" c="dimmed">No transcriptions found</Text>
                      <Text size="sm" c="dimmed">
                        Transcription sessions assigned to this project will appear here
                      </Text>
                    </Stack>
                  </Paper>
                )}
              </Stack>
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

      {/* Transcription Details Modal */}
      <TranscriptionDetailsModal
        opened={drawerOpened}
        onClose={handleTranscriptionClose}
        transcription={selectedTranscription}
        onTranscriptionUpdate={(updated) => setSelectedTranscription(updated)}
      />

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
                visibility.
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
