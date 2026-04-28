"use client";

import { useMemo, useState } from "react";
import { SlackSummaryModal } from './SlackSummaryModal';
import Link from "next/link";
import {
  Group,
  Tabs,
  Title,
  Paper,
  Stack,
  Text,
  Badge,
  Select,
  Button,
  Card,
  Checkbox,
  Menu,
  Modal,
  TextInput,
  ActionIcon,
  Collapse,
  Tooltip,
  Kbd,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";
import {
  IconMicrophone,
  IconCalendarEvent,
  IconFilter,
  IconChecks,
  IconSquare,
  IconDotsVertical,
  IconFolder,
  IconTrash,
  IconBrandSlack,
  IconArchive,
  IconArchiveOff,
  IconHistory,
  IconRefresh,
  IconPlayerPlay,
  IconExternalLink,
  IconSearch,
  IconStarFilled,
  IconChevronDown,
  IconChevronUp,
  IconClock,
  IconPlayerPlayFilled,
  IconUsers,
  IconSparkles,
  IconLayersIntersect,
  IconFlag,
  IconBell,
  IconSettings,
  IconCheck,
} from "@tabler/icons-react";
import { TranscriptionRenderer } from "./TranscriptionRenderer";
import { FirefliesWizardModal } from "./integrations/FirefliesWizardModal";
import { TranscriptionDetailsDrawer } from "./TranscriptionDetailsDrawer";
import { parseFirefliesSummary } from "~/lib/fireflies-summary";
import { CreateTranscriptionModal } from "./CreateTranscriptionModal";

type TabValue = "transcriptions" | "upcoming" | "archive" | "activity";

// Type for webhook activity logs
interface WebhookLog {
  id: string;
  provider: string;
  eventType: string;
  status: string;
  meetingId: string | null;
  meetingTitle: string | null;
  errorMessage: string | null;
  metadata: unknown;
  userId: string | null;
  workspaceId: string | null;
  createdAt: Date;
}

interface MeetingsContentProps {
  workspaceId?: string;
}

// Helper function to check if a transcription has extractable action items
function hasExtractableActions(session: { summary: string | null }): boolean {
  const summary = parseFirefliesSummary(session.summary);
  if (!summary?.action_items) return false;
  if (Array.isArray(summary.action_items)) return summary.action_items.length > 0;
  if (typeof summary.action_items === "string") return summary.action_items.trim().length > 0;
  return false;
}

export function MeetingsContent({ workspaceId }: MeetingsContentProps = {}) {
  // Add CSS animation for fade effect
  const fadeAnimationStyles = `
    @keyframes fadeInOut {
      0% { opacity: 0; transform: translateY(-5px); }
      10% { opacity: 1; transform: translateY(0); }
      90% { opacity: 1; transform: translateY(0); }
      100% { opacity: 0; transform: translateY(-5px); }
    }
  `;

  // Add styles to document if not already present
  if (typeof document !== 'undefined' && !document.getElementById('fade-animation-styles')) {
    const style = document.createElement('style');
    style.id = 'fade-animation-styles';
    style.textContent = fadeAnimationStyles;
    document.head.appendChild(style);
  }
  const [activeTab, setActiveTab] = useState<TabValue>("transcriptions");
  const [drawerOpened, setDrawerOpened] = useState(false);
  const [selectedTranscription, setSelectedTranscription] = useState<any>(null);
  const [_successMessages, setSuccessMessages] = useState<Record<string, string>>({}); // transcriptionId -> message (kept for future sync-status UI)
  const [syncingToIntegration, setSyncingToIntegration] = useState<string | null>(null); // transcriptionId being synced to external integration
  
  // Slack Summary Modal state
  const [slackModalOpened, setSlackModalOpened] = useState(false);
  const [selectedMeetingForSlack, setSelectedMeetingForSlack] = useState<any>(null);

  // Fireflies settings modal state
  const [firefliesModalOpened, setFirefliesModalOpened] = useState(false);
  const [selectedFirefliesIntegrationId, setSelectedFirefliesIntegrationId] = useState<string | null>(null);

  // New state for filtering and bulk operations
  const [selectedIntegrationFilter, setSelectedIntegrationFilter] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [syncBannerOpen, setSyncBannerOpen] = useState(true);
  const [selectedTranscriptionIds, setSelectedTranscriptionIds] = useState<Set<string>>(new Set());
  const [bulkProjectAssignment, setBulkProjectAssignment] = useState<string | null>(null);
  const [deleteModalOpened, setDeleteModalOpened] = useState(false);
  // Per-meeting workspace selections (undefined = use session.workspaceId, null = cleared)
  const [meetingWorkspaceSelections, setMeetingWorkspaceSelections] = useState<Record<string, string | null | undefined>>({});
  
  const shouldUseCachedTranscriptions = Boolean(workspaceId);
  const { data: transcriptions, isLoading } = api.transcription.getAllTranscriptions.useQuery(
    { workspaceId },
    {
      refetchOnMount: shouldUseCachedTranscriptions ? false : undefined,
      refetchOnWindowFocus: shouldUseCachedTranscriptions ? false : undefined,
      staleTime: shouldUseCachedTranscriptions ? 5 * 60 * 1000 : undefined,
    }
  );
  const { data: archivedTranscriptions, isLoading: isLoadingArchived } = api.transcription.getAllTranscriptions.useQuery(
    { includeArchived: true, workspaceId },
    {
      select: (data) => data.filter(t => t.archivedAt), // Only get archived ones
      refetchOnMount: shouldUseCachedTranscriptions ? false : undefined,
      refetchOnWindowFocus: shouldUseCachedTranscriptions ? false : undefined,
      staleTime: shouldUseCachedTranscriptions ? 5 * 60 * 1000 : undefined,
    }
  );
  const { data: projects } = api.project.getAll.useQuery({});
  const { data: workspaces } = api.workspace.list.useQuery();
  const { data: workflows = [] } = api.workflow.list.useQuery();
  const { data: webhookLogsData, isLoading: isLoadingLogs, refetch: refetchLogs } = api.transcription.getWebhookLogs.useQuery(
    { workspaceId, limit: 50 },
    { enabled: activeTab === "activity" }
  );
  const utils = api.useUtils();
  
  
  const assignProjectMutation = api.transcription.associateWithProject.useMutation({
    onMutate: async ({ transcriptionId, projectId }) => {
      // Cancel outgoing refetches
      await utils.transcription.getAllTranscriptions.cancel();

      // Snapshot previous value
      const previousData = utils.transcription.getAllTranscriptions.getData({ workspaceId });

      // Optimistically update the cache
      utils.transcription.getAllTranscriptions.setData({ workspaceId }, (old) => {
        if (!old) return old;
        return old.map((session) => {
          if (session.id === transcriptionId) {
            const project = projects?.find(p => p.id === projectId);
            return {
              ...session,
              projectId,
              project: project ? {
                id: project.id,
                name: project.name,
                taskManagementTool: project.taskManagementTool,
                taskManagementConfig: project.taskManagementConfig
              } : null
            };
          }
          return session;
        });
      });

      return { previousData };
    },
    onError: (err, _variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        utils.transcription.getAllTranscriptions.setData({ workspaceId }, context.previousData);
      }
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to assign project',
        color: 'red',
      });
    },
    onSuccess: () => {
      notifications.show({
        title: 'Project Assigned',
        message: 'Project assigned to this meeting',
        color: 'green',
      });
    },
    onSettled: () => {
      void utils.transcription.getAllTranscriptions.invalidate();
    },
  });

  const assignWorkspaceMutation = api.transcription.assignWorkspace.useMutation({
    onMutate: async ({ transcriptionId, workspaceId: newWorkspaceId }) => {
      // Capture previous workspace selection before optimistic update
      const previousWorkspaceSelection = meetingWorkspaceSelections[transcriptionId];

      // Optimistically update state
      setMeetingWorkspaceSelections(prev => ({ ...prev, [transcriptionId]: newWorkspaceId ?? null }));

      return { previousWorkspaceSelection, transcriptionId };
    },
    onError: (err, _variables, context) => {
      // Rollback optimistic update on error
      if (context) {
        setMeetingWorkspaceSelections(prev => {
          const next = { ...prev };
          if (context.previousWorkspaceSelection === undefined) {
            delete next[context.transcriptionId];
          } else {
            next[context.transcriptionId] = context.previousWorkspaceSelection;
          }
          return next;
        });
      }
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to assign workspace',
        color: 'red',
      });
    },
    onSettled: () => {
      void utils.transcription.getAllTranscriptions.invalidate();
    },
  });

  const processTranscriptionMutation = api.transcription.processTranscription.useMutation({
    onSuccess: (result) => {
      if (result.actionsCreated === 0) {
        notifications.show({
          title: 'No Actions Found',
          message: 'This meeting summary does not contain any action items to extract',
          color: 'yellow',
        });
      } else {
        notifications.show({
          title: 'Actions Created',
          message: `Created ${result.actionsCreated} action${result.actionsCreated === 1 ? '' : 's'} from this meeting`,
          color: 'green',
        });
      }
      void utils.transcription.getAllTranscriptions.invalidate();
    },
    onError: (error) => {
      notifications.show({
        title: 'Processing Failed',
        message: error.message || 'Failed to create actions',
        color: 'red',
      });
    },
  });

  const bulkAssignProjectMutation = api.transcription.bulkAssignProject.useMutation({
    onSuccess: (data) => {
      notifications.show({
        title: 'Bulk Assignment Complete',
        message: `Assigned ${data.count} transcriptions and their actions to project`,
        color: 'green',
      });
      // Clear selections and refresh data
      setSelectedTranscriptionIds(new Set());
      setBulkProjectAssignment(null);
      void utils.transcription.getAllTranscriptions.invalidate();
    },
    onError: (error) => {
      notifications.show({
        title: 'Bulk Assignment Failed',
        message: error.message || 'Failed to assign transcriptions to project',
        color: 'red',
      });
    },
  });

  const bulkDeleteMutation = api.transcription.bulkDeleteTranscriptions.useMutation({
    onSuccess: (data) => {
      notifications.show({
        title: 'Bulk Delete Complete',
        message: `Deleted ${data.count} transcriptions`,
        color: 'green',
      });
      // Clear selections and refresh data
      setSelectedTranscriptionIds(new Set());
      void utils.transcription.getAllTranscriptions.invalidate();
    },
    onError: (error) => {
      notifications.show({
        title: 'Bulk Delete Failed',
        message: error.message || 'Failed to delete transcriptions',
        color: 'red',
      });
    },
  });

  const archiveTranscriptionMutation = api.transcription.archiveTranscription.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Meeting Archived',
        message: 'Meeting has been moved to archive',
        color: 'green',
      });
      void utils.transcription.getAllTranscriptions.invalidate();
    },
    onError: (error) => {
      notifications.show({
        title: 'Archive Failed',
        message: error.message || 'Failed to archive meeting',
        color: 'red',
      });
    },
  });

  const unarchiveTranscriptionMutation = api.transcription.unarchiveTranscription.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Meeting Unarchived',
        message: 'Meeting has been restored from archive',
        color: 'green',
      });
      void utils.transcription.getAllTranscriptions.invalidate();
    },
    onError: (error) => {
      notifications.show({
        title: 'Unarchive Failed',
        message: error.message || 'Failed to unarchive meeting',
        color: 'red',
      });
    },
  });

  const bulkArchiveMutation = api.transcription.bulkArchiveTranscriptions.useMutation({
    onSuccess: (data) => {
      notifications.show({
        title: 'Bulk Archive Complete',
        message: `Archived ${data.count} meetings`,
        color: 'green',
      });
      // Clear selections and refresh data
      setSelectedTranscriptionIds(new Set());
      void utils.transcription.getAllTranscriptions.invalidate();
    },
    onError: (error) => {
      notifications.show({
        title: 'Bulk Archive Failed',
        message: error.message || 'Failed to archive meetings',
        color: 'red',
      });
    },
  });

  const bulkSyncFromFirefliesMutation = api.transcription.bulkSyncFromFireflies.useMutation({
    onSuccess: (result) => {
      notifications.show({
        title: "Sync complete",
        message: `Synced ${result.newTranscripts} new, ${result.updatedTranscripts} updated transcripts`,
        color: "green",
      });
      void utils.transcription.getAllTranscriptions.invalidate();
      void utils.transcription.getFirefliesSyncStatus.invalidate();
    },
    onError: (error) => {
      notifications.show({
        title: "Sync failed",
        message: error.message || "Failed to sync from Fireflies",
        color: "red",
      });
    },
  });

  const syncToIntegrationMutation = api.workflow.run.useMutation({
    onSuccess: (data, variables) => {
      const workflowId = variables.id;
      setSyncingToIntegration(null);
      
      // Find the workflow to get the provider name
      const workflow = workflows.find(w => w.id === workflowId);
      const providerName = workflow?.provider === 'monday' ? 'Monday.com' : 
                          workflow?.provider === 'notion' ? 'Notion' : 
                          workflow?.provider;
      
      const message = `Successfully synced ${data.itemsCreated} actions to ${providerName}`;
      
      // Set success message
      setSuccessMessages(prev => ({ ...prev, [`sync-${workflowId}`]: message }));
      
      // Fade out the message after 3 seconds
      setTimeout(() => {
        setSuccessMessages(prev => {
          const newMessages = { ...prev };
          delete newMessages[`sync-${workflowId}`];
          return newMessages;
        });
      }, 3000);
    },
    onError: (error, variables) => {
      setSyncingToIntegration(null);
      
      // Find the workflow to get the provider name for error message
      const workflowId = variables.id;
      const workflow = workflows.find(w => w.id === workflowId);
      const providerName = workflow?.provider === 'monday' ? 'Monday.com' : 
                          workflow?.provider === 'notion' ? 'Notion' : 
                          workflow?.provider;
      
      notifications.show({
        title: `${providerName} Sync Failed`,
        message: error.message || `Failed to sync to ${providerName}`,
        color: 'red',
      });
    },
  });

  const handleTabChange = (value: string | null) => {
    if (value) {
      setActiveTab(value as TabValue);
    }
  };

  const handleTranscriptionClick = (transcription: any) => {
    setSelectedTranscription(transcription);
    setDrawerOpened(true);
  };

  const handleProjectAssignment = (transcriptionId: string, projectId: string | null) => {
    if (projectId) {
      assignProjectMutation.mutate({
        transcriptionId,
        projectId,
        autoProcess: false
      });
    }
  };

  const handleWorkspaceAssignment = (transcriptionId: string, newWorkspaceId: string | null) => {
    assignWorkspaceMutation.mutate({ transcriptionId, workspaceId: newWorkspaceId });
  };

  const getWorkspaceForMeeting = (sessionId: string, sessionWorkspaceId: string | null | undefined) => {
    return sessionId in meetingWorkspaceSelections
      ? meetingWorkspaceSelections[sessionId]
      : sessionWorkspaceId;
  };

  const getProjectsForMeeting = (sessionId: string, sessionWorkspaceId: string | null | undefined) => {
    const wId = getWorkspaceForMeeting(sessionId, sessionWorkspaceId);
    if (!wId) return [];
    return (projects ?? []).filter(p => p.workspaceId === wId);
  };

  const handleSlackSummaryModal = (session: any) => {
    setSelectedMeetingForSlack(session);
    setSlackModalOpened(true);
  };

  const handleSyncToIntegration = (session: any) => {
    if (!session.project || !session.project.taskManagementTool || session.project.taskManagementTool === 'internal') {
      notifications.show({
        title: 'Configuration Error',
        message: 'Project is not configured to use an external task management tool',
        color: 'orange',
      });
      return;
    }

    const toolName = session.project.taskManagementTool === 'monday' ? 'Monday.com' : 
                    session.project.taskManagementTool === 'notion' ? 'Notion' : 
                    session.project.taskManagementTool;

    // Get the workflow ID from project configuration
    const workflowId = session.project.taskManagementConfig?.workflowId;
    if (!workflowId) {
      notifications.show({
        title: 'Configuration Missing',
        message: `No ${toolName} workflow configured for this project. Please configure it in project settings.`,
        color: 'orange',
      });
      return;
    }

    // Verify the workflow exists and is active
    const workflow = workflows.find(w => 
      w.id === workflowId && 
      w.provider === session.project.taskManagementTool && 
      w.status === 'ACTIVE'
    );

    if (!workflow) {
      notifications.show({
        title: 'Workflow Not Found',
        message: `The configured ${toolName} workflow is no longer available or active.`,
        color: 'orange',
      });
      return;
    }

    setSyncingToIntegration(session.id);
    syncToIntegrationMutation.mutate({ id: workflowId });
  };

  // Helper functions for bulk operations
  const handleSelectAll = () => {
    const filteredTranscriptions = getFilteredTranscriptions();
    setSelectedTranscriptionIds(new Set(filteredTranscriptions.map(t => t.id)));
  };

  const handleSelectNone = () => {
    setSelectedTranscriptionIds(new Set());
  };

  const handleBulkProjectAssignment = async () => {
    if (selectedTranscriptionIds.size === 0 || !bulkProjectAssignment) return;
    
    await bulkAssignProjectMutation.mutateAsync({
      transcriptionIds: Array.from(selectedTranscriptionIds),
      projectId: bulkProjectAssignment === "none" ? null : bulkProjectAssignment,
    });
  };

  const handleBulkDelete = async () => {
    if (selectedTranscriptionIds.size === 0) return;
    
    await bulkDeleteMutation.mutateAsync({
      ids: Array.from(selectedTranscriptionIds),
    });
    setDeleteModalOpened(false);
  };

  const handleArchiveTranscription = (transcriptionId: string) => {
    archiveTranscriptionMutation.mutate({ id: transcriptionId });
  };

  const handleUnarchiveTranscription = (transcriptionId: string) => {
    unarchiveTranscriptionMutation.mutate({ id: transcriptionId });
  };

  const handleBulkArchive = async () => {
    if (selectedTranscriptionIds.size === 0) return;
    
    await bulkArchiveMutation.mutateAsync({
      ids: Array.from(selectedTranscriptionIds),
    });
  };

  const getFilteredTranscriptions = () => {
    if (!transcriptions) return [];

    let filtered = transcriptions;

    // Filter by integration
    if (selectedIntegrationFilter.length > 0) {
      filtered = filtered.filter(session =>
        session.sourceIntegration &&
        selectedIntegrationFilter.includes(session.sourceIntegration.id)
      );
    }

    // Filter by search query (title, transcription, participants)
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(session => {
        const title = (session.title ?? "").toLowerCase();
        const provider = session.sourceIntegration?.provider?.toLowerCase() ?? "";
        const transcription = (session.transcription ?? "").toLowerCase();
        return title.includes(q) || provider.includes(q) || transcription.includes(q);
      });
    }

    return filtered;
  };

  // Derived counts for tab badges
  const activeCount = transcriptions?.length ?? 0;
  const archivedCount = archivedTranscriptions?.length ?? 0;
  const activityCount = webhookLogsData?.logs?.length ?? 0;

  // Fireflies connection summary for the banner
  const { data: firefliesIntegrations = [] } = api.transcription.getFirefliesIntegrations.useQuery();
  const firstFireflies = firefliesIntegrations[0];
  const firefliesEmail = firstFireflies?.credentials?.find(c => c.keyType === "EMAIL")?.key;
  const meetingsToday = useMemo(() => {
    if (!transcriptions) return 0;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return transcriptions.filter(t => {
      const d = new Date(t.createdAt);
      return d.getTime() >= start.getTime();
    }).length;
  }, [transcriptions]);

  const { data: firstFirefliesStatus } = api.transcription.getFirefliesSyncStatus.useQuery(
    { integrationId: firstFireflies?.id ?? "" },
    { enabled: !!firstFireflies?.id }
  );

  if (isLoading && !transcriptions) {
    return <div>Loading transcriptions...</div>;
  }

  const formatRelativeTime = (date: Date | null | undefined) => {
    if (!date) return "Never";
    const diffMs = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  };

  const formatMeetingTime = (date: Date | string) => {
    const d = new Date(date);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const sameDay = d >= today;
    const isYesterday = d >= yesterday && d < today;
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    if (sameDay) return `Today, ${time}`;
    if (isYesterday) return `Yesterday, ${time}`;
    return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
  };

  const getParticipantCount = (session: { transcription: string | null }): number | null => {
    if (!session.transcription) return null;
    try {
      const parsed = JSON.parse(session.transcription) as { sentences?: Array<{ speaker_name?: string | null }> };
      if (!parsed?.sentences?.length) return null;
      const speakers = new Set(parsed.sentences.map(s => s.speaker_name).filter(Boolean));
      return speakers.size || null;
    } catch {
      return null;
    }
  };

  const getDurationMinutes = (session: { transcription: string | null }): number | null => {
    if (!session.transcription) return null;
    try {
      const parsed = JSON.parse(session.transcription) as { sentences?: Array<{ end_time?: number }> };
      const sentences = parsed?.sentences;
      if (!sentences?.length) return null;
      const last = sentences[sentences.length - 1];
      if (!last?.end_time) return null;
      return Math.max(1, Math.round(last.end_time / 60));
    } catch {
      return null;
    }
  };

  const getInitials = (name: string | null | undefined): string => {
    if (!name) return "?";
    return name.split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() ?? "").join("") || "?";
  };

  const speakerColors = ["bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500", "bg-pink-500", "bg-teal-500"];

  const getTranscriptPreview = (session: { transcription: string | null }): Array<{ time: string; speaker: string; text: string }> => {
    if (!session.transcription) return [];
    try {
      const parsed = JSON.parse(session.transcription) as { sentences?: Array<{ start_time?: number; speaker_name?: string | null; text?: string }> };
      const sentences = parsed?.sentences;
      if (!sentences?.length) return [];
      return sentences.slice(0, 2).map(s => {
        const t = s.start_time ?? 0;
        const hh = String(Math.floor(t / 3600)).padStart(2, "0");
        const mm = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
        const ss = String(Math.floor(t % 60)).padStart(2, "0");
        return {
          time: `${hh}:${mm}:${ss}`,
          speaker: s.speaker_name ?? "Unknown",
          text: s.text ?? "",
        };
      });
    } catch {
      return [];
    }
  };

  // Get unique integrations for filter options
  const integrationOptions = transcriptions
    ? Array.from(new Set(
        transcriptions
          .filter(t => t.sourceIntegration)
          .map(t => ({
            value: t.sourceIntegration!.id,
            label: `${t.sourceIntegration!.name} (${t.sourceIntegration!.provider})`
          }))
          .map(item => JSON.stringify(item))
      )).map(item => JSON.parse(item) as { value: string; label: string })
    : [];

  const filteredTranscriptions = getFilteredTranscriptions();

  return (
    <>
      {/* Page Title */}
      <div className="w-full max-w-4xl">
        <Title order={1} className="text-text-primary" fw={700}>
          Meetings
        </Title>
        <Text size="sm" c="dimmed" mt={6} mb="md">
          Transcripts from Fireflies sync automatically. Zoe drafts summaries, extracts tasks, and assigns them to the right project.
        </Text>
        <div className="mb-6 h-px w-full bg-border-primary" />
      </div>

      {/* Main Content */}
      <div className="w-full max-w-4xl">
        <Tabs value={activeTab} onChange={handleTabChange}>
          <Stack gap="xl" align="stretch" justify="flex-start">
            {/* Tabs Navigation */}
            <Tabs.List>
              {[
                { value: "transcriptions", label: "Transcriptions", count: activeCount },
                { value: "upcoming", label: "Upcoming", count: 0 },
                { value: "archive", label: "Archive", count: archivedCount },
                { value: "activity", label: "Activity", count: activityCount },
              ].map((t) => {
                const isActive = activeTab === t.value;
                return (
                  <Tabs.Tab key={t.value} value={t.value}>
                    <span className="inline-flex items-center gap-2">
                      <span>{t.label}</span>
                      <span
                        className={
                          isActive
                            ? "rounded-md bg-blue-500/20 px-1.5 py-0.5 text-xs font-medium text-blue-300"
                            : "rounded-md bg-surface-secondary px-1.5 py-0.5 text-xs text-text-secondary"
                        }
                      >
                        {t.count}
                      </span>
                    </span>
                  </Tabs.Tab>
                );
              })}
            </Tabs.List>

            {/* Content Area */}
            <Tabs.Panel value="transcriptions">
              <Stack gap="lg">
                {/* Fireflies connected banner (always visible) */}
                <div className="overflow-hidden rounded-lg border border-border-primary bg-surface-secondary">
                  <button
                    type="button"
                    onClick={() => setSyncBannerOpen(!syncBannerOpen)}
                    className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-surface-hover"
                  >
                    <Group gap="md" wrap="nowrap">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-yellow-500/10 text-yellow-400">
                        <IconStarFilled size={20} />
                      </div>
                      <div>
                        <Text fw={600} size="md" className="text-text-primary">
                          {firstFireflies ? "Fireflies is connected and syncing" : "Connect Fireflies to sync meetings"}
                        </Text>
                        <Text size="sm" c="dimmed">
                          {firstFireflies
                            ? `Last sync ${formatRelativeTime(firstFirefliesStatus?.lastSyncAt)} · ${meetingsToday} meeting${meetingsToday === 1 ? "" : "s"} pulled today`
                            : "Meetings, summaries and action items will flow in automatically once connected."}
                        </Text>
                      </div>
                    </Group>
                    {syncBannerOpen ? <IconChevronUp size={16} className="text-text-secondary" /> : <IconChevronDown size={16} className="text-text-secondary" />}
                  </button>
                  <Collapse in={syncBannerOpen}>
                    <div className="border-t border-border-primary px-4 pb-4 pt-4">
                      {firstFireflies ? (
                        <div className="rounded-md border border-border-primary bg-background-primary p-4">
                          <Group justify="space-between" align="center" wrap="nowrap">
                            <Group gap="md" wrap="nowrap">
                              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-yellow-500/10 text-yellow-400">
                                <IconStarFilled size={18} />
                              </div>
                              <div>
                                <Group gap="xs" align="center">
                                  <Text fw={600} size="sm" className="text-text-primary">{firstFireflies.name || "Fireflies.ai"}</Text>
                                  <span className="inline-flex items-center gap-1 rounded-md bg-green-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-400">
                                    <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                                    Connected
                                  </span>
                                </Group>
                                <Group gap={6} align="center" mt={4} wrap="nowrap">
                                  {firefliesEmail && (
                                    <Text size="xs" c="dimmed">{firefliesEmail}</Text>
                                  )}
                                  {firefliesEmail && <Text size="xs" c="dimmed">·</Text>}
                                  <Text size="xs" c="dimmed">
                                    {transcriptions?.length ?? 0} meetings this month
                                  </Text>
                                  {!!firstFirefliesStatus?.estimatedNewCount && (
                                    <>
                                      <Text size="xs" c="dimmed">·</Text>
                                      <Text size="xs" c="blue" fw={500}>
                                        {firstFirefliesStatus.estimatedNewCount} new today
                                      </Text>
                                    </>
                                  )}
                                </Group>
                              </div>
                            </Group>
                            <Group gap="xs">
                              <Button
                                variant="default"
                                size="sm"
                                leftSection={<IconSettings size={14} />}
                                onClick={() => {
                                  setSelectedFirefliesIntegrationId(firstFireflies.id);
                                  setFirefliesModalOpened(true);
                                }}
                              >
                                Settings
                              </Button>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => {
                                  void bulkSyncFromFirefliesMutation.mutateAsync({ integrationId: firstFireflies.id });
                                }}
                                loading={bulkSyncFromFirefliesMutation.isPending}
                              >
                                Sync now
                              </Button>
                            </Group>
                          </Group>
                        </div>
                      ) : (
                        <div className="rounded-md border border-border-primary bg-background-primary p-4">
                          <Group justify="space-between" align="center" wrap="nowrap">
                            <Group gap="md" wrap="nowrap">
                              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-yellow-500/10 text-yellow-400">
                                <IconStarFilled size={18} />
                              </div>
                              <div>
                                <Text fw={600} size="sm">Fireflies.ai</Text>
                                <Text size="xs" c="dimmed" mt={2}>Not connected yet</Text>
                              </div>
                            </Group>
                            <Button
                              variant="filled"
                              size="sm"
                              color="blue"
                              onClick={() => {
                                setSelectedFirefliesIntegrationId(null);
                                setFirefliesModalOpened(true);
                              }}
                            >
                              Connect
                            </Button>
                          </Group>
                        </div>
                      )}
                      <Text size="xs" c="dimmed" ta="center" mt="md">
                        Connect Zoom, Google Meet, Otter, or Grain in{" "}
                        <Text component="span" c="blue" fw={500}>Settings → Integrations.</Text>
                      </Text>
                    </div>
                  </Collapse>
                </div>

                {/* Recent transcripts heading */}
                <Group justify="space-between" align="center">
                  <Title order={4} fw={600}>Recent transcripts</Title>
                  <Group gap="sm">
                    <Text size="sm" c="dimmed">
                      {filteredTranscriptions.length} meeting{filteredTranscriptions.length === 1 ? "" : "s"}
                    </Text>
                    <CreateTranscriptionModal workspaceId={workspaceId} />
                  </Group>
                </Group>

                {/* Search + Filter/Group/Ask bar */}
                <Paper withBorder radius="md" p="xs">
                  <Group gap="sm" wrap="nowrap">
                    <TextInput
                      leftSection={<IconSearch size={16} />}
                      placeholder="Search transcripts, participants, topics..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.currentTarget.value)}
                      variant="unstyled"
                      className="flex-1"
                      styles={{ input: { paddingLeft: 8 } }}
                      rightSection={
                        <Kbd className="mr-2">⌘K</Kbd>
                      }
                      rightSectionWidth={44}
                    />
                    <Menu shadow="md" position="bottom-end" width={240}>
                      <Menu.Target>
                        <Button variant="default" size="sm" leftSection={<IconFilter size={14} />}>
                          Filter
                        </Button>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Label>Integration</Menu.Label>
                        {integrationOptions.length === 0 && (
                          <Menu.Item disabled>No integrations</Menu.Item>
                        )}
                        {integrationOptions.map((opt) => {
                          const active = selectedIntegrationFilter.includes(opt.value);
                          return (
                            <Menu.Item
                              key={opt.value}
                              leftSection={active ? <IconCheck size={14} /> : <IconSquare size={14} />}
                              onClick={() => {
                                setSelectedIntegrationFilter(
                                  active
                                    ? selectedIntegrationFilter.filter(v => v !== opt.value)
                                    : [...selectedIntegrationFilter, opt.value]
                                );
                              }}
                            >
                              {opt.label}
                            </Menu.Item>
                          );
                        })}
                        {selectedIntegrationFilter.length > 0 && (
                          <>
                            <Menu.Divider />
                            <Menu.Item color="red" onClick={() => setSelectedIntegrationFilter([])}>
                              Clear filters
                            </Menu.Item>
                          </>
                        )}
                      </Menu.Dropdown>
                    </Menu>
                    <Button variant="default" size="sm" leftSection={<IconLayersIntersect size={14} />} disabled>
                      Group
                    </Button>
                    <Button variant="default" size="sm" leftSection={<IconSparkles size={14} />} disabled>
                      Ask across all
                    </Button>
                  </Group>
                </Paper>

                {/* Bulk operations bar (only when selections exist) */}
                {selectedTranscriptionIds.size > 0 && (
                  <Paper withBorder p="sm" radius="md" className="bg-surface-secondary">
                    <Group justify="space-between" align="center">
                      <Group gap="sm">
                        <Badge variant="filled" color="blue">
                          {selectedTranscriptionIds.size} selected
                        </Badge>
                        <Button size="xs" variant="subtle" onClick={handleSelectNone} leftSection={<IconSquare size={14} />}>
                          Clear
                        </Button>
                        <Button size="xs" variant="subtle" onClick={handleSelectAll} leftSection={<IconChecks size={14} />}>
                          Select all
                        </Button>
                      </Group>
                      <Menu shadow="md">
                        <Menu.Target>
                          <Button size="xs" variant="filled" rightSection={<IconDotsVertical size={14} />}>
                            Bulk actions
                          </Button>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Label>Project Assignment</Menu.Label>
                          {projects?.map(project => (
                            <Menu.Item
                              key={project.id}
                              leftSection={<IconFolder size={14} />}
                              onClick={() => {
                                setBulkProjectAssignment(project.id);
                                void handleBulkProjectAssignment();
                              }}
                            >
                              {project.name}
                            </Menu.Item>
                          ))}
                          <Menu.Divider />
                          <Menu.Item color="gray" onClick={() => {
                            setBulkProjectAssignment("none");
                            void handleBulkProjectAssignment();
                          }}>
                            Remove from Project
                          </Menu.Item>
                          <Menu.Divider />
                          <Menu.Item leftSection={<IconArchive size={14} />} onClick={() => void handleBulkArchive()}>
                            Archive Meetings
                          </Menu.Item>
                          <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => setDeleteModalOpened(true)}>
                            Delete Transcriptions
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Group>
                  </Paper>
                )}

                {filteredTranscriptions.length > 0 ? (
                  <Stack gap="md">
                    {filteredTranscriptions.map((session) => {
                      const participants = getParticipantCount(session);
                      const duration = getDurationMinutes(session);
                      const preview = getTranscriptPreview(session);
                      const tasksCount = session.actions?.length ?? 0;
                      const selectedWorkspace = getWorkspaceForMeeting(session.id, session.workspaceId);
                      const projectsForWorkspace = getProjectsForMeeting(session.id, session.workspaceId);
                      const projectName = session.project?.name;
                      const workspaceName = workspaces?.find(w => w.id === (selectedWorkspace ?? ""))?.name;
                      const speakers: string[] = [];
                      try {
                        const parsed = JSON.parse(session.transcription ?? "null") as { sentences?: Array<{ speaker_name?: string | null }> } | null;
                        parsed?.sentences?.forEach(s => {
                          if (s.speaker_name && !speakers.includes(s.speaker_name)) speakers.push(s.speaker_name);
                        });
                      } catch { /* no-op */ }

                      return (
                      <Card
                        key={session.id}
                        withBorder
                        radius="md"
                        padding="md"
                        className="hover:border-border-focus transition-colors"
                      >
                        <Stack gap="md">
                          {/* Title row */}
                          <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
                            <Group gap="sm" align="flex-start" wrap="nowrap" style={{ flex: 1 }}>
                              <Checkbox
                                mt={4}
                                checked={selectedTranscriptionIds.has(session.id)}
                                onChange={(event) => {
                                  const newSelected = new Set(selectedTranscriptionIds);
                                  if (event.currentTarget.checked) {
                                    newSelected.add(session.id);
                                  } else {
                                    newSelected.delete(session.id);
                                  }
                                  setSelectedTranscriptionIds(newSelected);
                                }}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <Text size="lg" fw={600} lineClamp={1} style={{ flex: 1 }}>
                                {session.title ?? `Meeting ${session.sessionId}`}
                              </Text>
                            </Group>
                            <Menu shadow="md" position="bottom-end">
                              <Menu.Target>
                                <ActionIcon variant="subtle" color="gray" size="sm">
                                  <IconDotsVertical size={16} />
                                </ActionIcon>
                              </Menu.Target>
                              <Menu.Dropdown>
                                <Menu.Item
                                  leftSection={<IconExternalLink size={14} />}
                                  component={Link}
                                  href={`/recording/${session.id}`}
                                >
                                  Open page
                                </Menu.Item>
                                <Menu.Item
                                  leftSection={<IconPlayerPlay size={14} />}
                                  onClick={() => handleTranscriptionClick(session)}
                                >
                                  View details
                                </Menu.Item>
                                {session.projectId && !session.processedAt && hasExtractableActions(session) && (
                                  <Menu.Item
                                    leftSection={<IconPlayerPlay size={14} />}
                                    onClick={() => processTranscriptionMutation.mutate({ transcriptionId: session.id })}
                                  >
                                    Extract actions
                                  </Menu.Item>
                                )}
                                {session.processedAt && (
                                  <Menu.Item
                                    leftSection={<IconBrandSlack size={14} />}
                                    onClick={() => handleSlackSummaryModal(session)}
                                  >
                                    Send summary to Slack
                                  </Menu.Item>
                                )}
                                {session.project?.taskManagementTool && session.project.taskManagementTool !== "internal" && tasksCount > 0 && (
                                  <Menu.Item
                                    leftSection={<IconCalendarEvent size={14} />}
                                    onClick={() => handleSyncToIntegration(session)}
                                  >
                                    Sync to {session.project.taskManagementTool}
                                  </Menu.Item>
                                )}
                                <Menu.Divider />
                                <Menu.Item
                                  leftSection={<IconArchive size={14} />}
                                  onClick={() => handleArchiveTranscription(session.id)}
                                >
                                  Archive
                                </Menu.Item>
                                <Menu.Item
                                  color="red"
                                  leftSection={<IconTrash size={14} />}
                                  onClick={() => {
                                    if (confirm("Are you sure you want to delete this meeting?")) {
                                      bulkDeleteMutation.mutate({ ids: [session.id] });
                                    }
                                  }}
                                >
                                  Delete
                                </Menu.Item>
                              </Menu.Dropdown>
                            </Menu>
                          </Group>

                          {/* Metadata row */}
                          <Group gap="lg" c="dimmed" wrap="wrap" pl={32}>
                            <Group gap={6} wrap="nowrap">
                              <IconClock size={14} />
                              <Text size="sm">{formatMeetingTime(session.meetingDate ?? session.createdAt)}</Text>
                            </Group>
                            {duration !== null && (
                              <Group gap={6} wrap="nowrap">
                                <IconPlayerPlayFilled size={12} />
                                <Text size="sm">{duration}m</Text>
                              </Group>
                            )}
                            {participants !== null && (
                              <Group gap={6} wrap="nowrap">
                                <IconUsers size={14} />
                                <Text size="sm">{participants} participant{participants === 1 ? "" : "s"}</Text>
                              </Group>
                            )}
                            {session.sourceIntegration && (
                              <Group gap={6} wrap="nowrap">
                                <IconStarFilled size={12} className="text-yellow-400" />
                                <Text size="sm" c="yellow" className="capitalize">
                                  {session.sourceIntegration.provider}
                                </Text>
                              </Group>
                            )}
                          </Group>

                          {/* Project / folder / avatars row */}
                          <Group gap="sm" pl={32} wrap="wrap" align="center">
                            {session.projectId && projectName ? (
                              <Menu shadow="md" width={240}>
                                <Menu.Target>
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-2 rounded-md border border-border-primary bg-surface-secondary px-2 py-1 text-xs text-text-primary hover:bg-surface-hover"
                                  >
                                    <IconFolder size={12} className="text-blue-400" />
                                    <span className="font-medium">{projectName}</span>
                                    {workspaceName && (
                                      <>
                                        <span className="text-text-muted">·</span>
                                        <span className="text-text-secondary">{workspaceName}</span>
                                      </>
                                    )}
                                  </button>
                                </Menu.Target>
                                <Menu.Dropdown>
                                  <Menu.Label>Reassign project</Menu.Label>
                                  {projectsForWorkspace.map((p) => (
                                    <Menu.Item key={p.id} onClick={() => handleProjectAssignment(session.id, p.id)}>
                                      {p.name}
                                    </Menu.Item>
                                  ))}
                                  <Menu.Divider />
                                  <Menu.Item color="gray" onClick={() => handleProjectAssignment(session.id, null)}>
                                    Remove project
                                  </Menu.Item>
                                </Menu.Dropdown>
                              </Menu>
                            ) : selectedWorkspace ? (
                              <Select
                                searchable
                                placeholder="Assign to project"
                                value={session.projectId ?? ""}
                                onChange={(value) => handleProjectAssignment(session.id, value)}
                                data={[
                                  { value: "", label: "No project" },
                                  ...projectsForWorkspace.map(p => ({ value: p.id, label: p.name })),
                                ]}
                                size="xs"
                                style={{ minWidth: 200 }}
                              />
                            ) : null}

                            <Menu shadow="md" width={240}>
                              <Menu.Target>
                                <Button variant="default" size="xs" leftSection={<IconFolder size={12} />} rightSection={<IconChevronDown size={12} />}>
                                  {selectedWorkspace && workspaceName ? workspaceName : "Move to folder"}
                                </Button>
                              </Menu.Target>
                              <Menu.Dropdown>
                                <Menu.Label>Workspace</Menu.Label>
                                {workspaces?.map((w) => (
                                  <Menu.Item key={w.id} onClick={() => handleWorkspaceAssignment(session.id, w.id)}>
                                    {w.name}
                                  </Menu.Item>
                                ))}
                                <Menu.Divider />
                                <Menu.Item color="gray" onClick={() => handleWorkspaceAssignment(session.id, null)}>
                                  No workspace
                                </Menu.Item>
                              </Menu.Dropdown>
                            </Menu>

                            {speakers.length > 0 && (
                              <div className="flex items-center -space-x-2 pl-1">
                                {speakers.slice(0, 3).map((name, idx) => (
                                  <Tooltip key={name} label={name} withArrow>
                                    <div
                                      className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-background-primary text-[10px] font-semibold text-white ${speakerColors[idx % speakerColors.length] ?? "bg-blue-500"}`}
                                    >
                                      {getInitials(name)}
                                    </div>
                                  </Tooltip>
                                ))}
                                {speakers.length > 3 && (
                                  <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background-primary bg-surface-secondary text-[10px] font-semibold text-text-secondary">
                                    +{speakers.length - 3}
                                  </div>
                                )}
                              </div>
                            )}
                          </Group>

                          {/* Transcript preview */}
                          {preview.length > 0 ? (
                            <div className="ml-8 rounded-md border border-border-primary bg-surface-secondary p-3 font-mono text-sm leading-relaxed text-text-secondary">
                              {preview.map((line, idx) => (
                                <span key={idx}>
                                  <span className="text-blue-400">{line.time}</span>{" "}
                                  <span className="font-semibold text-text-primary">{line.speaker}:</span>{" "}
                                  <span>{line.text}</span>
                                  {idx < preview.length - 1 && " "}
                                </span>
                              ))}
                            </div>
                          ) : session.transcription ? (
                            <div className="ml-8 rounded-md border border-border-primary bg-surface-secondary p-3">
                              <TranscriptionRenderer
                                transcription={session.transcription}
                                provider={session.sourceIntegration?.provider}
                                isPreview={true}
                                maxLines={2}
                              />
                            </div>
                          ) : null}

                          {/* Footer: ZOE EXTRACTED + counts + Open transcript */}
                          <Group justify="space-between" align="center" pl={32} wrap="wrap">
                            <Group gap="sm" wrap="wrap">
                              <Group gap={4} wrap="nowrap">
                                <IconSparkles size={12} className="text-violet-400" />
                                <Text size="xs" fw={700} c="violet" className="uppercase tracking-wide">
                                  Zoe Extracted
                                </Text>
                              </Group>
                              {tasksCount > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs text-blue-300">
                                  <IconSquare size={10} />
                                  {tasksCount} task{tasksCount === 1 ? "" : "s"}
                                </span>
                              )}
                              {!!session.processedAt && (
                                <span className="inline-flex items-center gap-1 rounded-md border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs text-green-300">
                                  <IconFlag size={10} />
                                  Processed
                                </span>
                              )}
                              {!session.processedAt && hasExtractableActions(session) && (
                                <span className="inline-flex items-center gap-1 rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-xs text-orange-300">
                                  <IconBell size={10} />
                                  Actions pending
                                </span>
                              )}
                              {!!session.slackNotificationAt && (
                                <span className="inline-flex items-center gap-1 rounded-md border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs text-green-300">
                                  <IconBrandSlack size={10} />
                                  Slack sent
                                </span>
                              )}
                            </Group>
                            <Button
                              variant="subtle"
                              size="xs"
                              rightSection={<IconExternalLink size={12} />}
                              onClick={() => handleTranscriptionClick(session)}
                            >
                              Open transcript
                            </Button>
                          </Group>
                        </Stack>
                      </Card>
                      );
                    })}
                  </Stack>
                ) : (
                  <Paper p="xl" radius="md" className="text-center">
                    <Stack gap="md" align="center">
                      <IconMicrophone size={40} opacity={0.3} />
                      <Text size="md" c="dimmed">No meetings found</Text>
                      <Text size="sm" c="dimmed">
                        Meeting transcriptions will appear here once they are synced from Fireflies
                      </Text>
                    </Stack>
                  </Paper>
                )}
              </Stack>
            </Tabs.Panel>
            <Tabs.Panel value="upcoming">
              <Paper
                p="md"
                radius="sm"
                className="mx-auto w-full max-w-3xl bg-surface-secondary"
              >
                <Text size="sm" c="dimmed" ta="center" py="xl">
                  No upcoming meetings scheduled.
                </Text>
              </Paper>
            </Tabs.Panel>

            <Tabs.Panel value="archive">
              <Stack gap="md">
                <Group justify="space-between" align="center">
                  <Title order={4}>Archived Meetings</Title>
                  <Text size="sm" c="dimmed">
                    {archivedTranscriptions?.length || 0} archived meetings
                  </Text>
                </Group>

                {isLoadingArchived ? (
                  <div>Loading archived meetings...</div>
                ) : archivedTranscriptions && archivedTranscriptions.length > 0 ? (
                  <Stack gap="lg">
                    {archivedTranscriptions.map((session) => (
                      <Card
                        key={session.id}
                        withBorder
                        shadow="sm"
                        radius="md"
                        className="hover:shadow-md transition-shadow opacity-75"
                      >
                        <Stack gap="md">
                          {/* Meeting Header */}
                          <Group justify="space-between" align="flex-start" wrap="nowrap">
                            <div style={{ flex: 1 }}>
                              <Group justify="space-between" align="flex-start" wrap="nowrap">
                                <Stack gap="xs" style={{ flex: 1 }}>
                                  <Group gap="sm" wrap="nowrap">
                                    <Text size="lg" fw={600} lineClamp={1} c="dimmed">
                                      {session.title || `Meeting ${session.sessionId}`}
                                    </Text>
                                    <Group gap="xs">
                                      <Badge variant="outline" color="gray" size="sm">
                                        Archived
                                      </Badge>
                                      {session.sourceIntegration && (
                                        <Badge variant="dot" color="teal" size="sm">
                                          {session.sourceIntegration.provider}
                                        </Badge>
                                      )}
                                    </Group>
                                  </Group>
                                  
                                  <Group gap="md" c="dimmed">
                                    <Text size="sm">
                                      Archived: {new Date(session.archivedAt!).toLocaleDateString('en-US', {
                                        weekday: 'short',
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric',
                                      })}
                                    </Text>
                                    <Text size="sm">
                                      Original: {new Date(session.createdAt).toLocaleDateString('en-US', {
                                        weekday: 'short',
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric',
                                      })}
                                    </Text>
                                  </Group>
                                </Stack>
                                
                                <Group gap="xs">
                                  {/* View Details Button */}
                                  <Button
                                    size="sm"
                                    variant="light"
                                    color="gray"
                                    onClick={() => handleTranscriptionClick(session)}
                                  >
                                    View Details
                                  </Button>
                                  
                                  {/* Unarchive Button */}
                                  <Button
                                    size="sm"
                                    variant="light"
                                    color="blue"
                                    leftSection={<IconArchiveOff size={14} />}
                                    onClick={() => handleUnarchiveTranscription(session.id)}
                                    loading={unarchiveTranscriptionMutation.isPending}
                                  >
                                    Restore
                                  </Button>
                                </Group>
                              </Group>
                            </div>
                          </Group>

                          {/* Project Badge */}
                          {session.project && (
                            <Group>
                              <Badge variant="light" color="gray" size="md" leftSection="📁">
                                {session.project.name}
                              </Badge>
                            </Group>
                          )}

                          {/* Meeting Preview */}
                          {session.transcription && (
                            <Paper p="sm" radius="sm" className="bg-gray-50 dark:bg-gray-800 opacity-75">
                              <TranscriptionRenderer
                                transcription={session.transcription}
                                provider={session.sourceIntegration?.provider}
                                isPreview={true}
                                maxLines={2}
                              />
                            </Paper>
                          )}

                          {/* Actions Summary */}
                          {session.actions && session.actions.length > 0 && (
                            <Paper p="sm" radius="sm" withBorder className="opacity-75">
                              <Group justify="space-between" align="center">
                                <Group gap="xs">
                                  <Text size="sm" fw={500} c="dimmed">
                                    Action Items:
                                  </Text>
                                  <Badge variant="outline" color="gray" size="sm">
                                    {session.actions.length}
                                  </Badge>
                                </Group>
                              </Group>
                            </Paper>
                          )}
                        </Stack>
                      </Card>
                    ))}
                  </Stack>
                ) : (
                  <Paper p="xl" radius="md" className="text-center">
                    <Stack gap="md" align="center">
                      <IconArchive size={48} opacity={0.3} />
                      <Text size="lg" c="dimmed">No archived meetings</Text>
                      <Text size="sm" c="dimmed">
                        Meetings you archive will appear here
                      </Text>
                    </Stack>
                  </Paper>
                )}
              </Stack>
            </Tabs.Panel>

            {/* Activity Tab - Webhook Logs */}
            <Tabs.Panel value="activity">
              <Stack gap="md">
                <Group justify="space-between" align="center">
                  <Title order={4}>Webhook Activity</Title>
                  <Group gap="xs">
                    <Text size="sm" c="dimmed">
                      {webhookLogsData?.logs?.length ?? 0} recent events
                    </Text>
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<IconRefresh size={14} />}
                      onClick={() => void refetchLogs()}
                      loading={isLoadingLogs}
                    >
                      Refresh
                    </Button>
                  </Group>
                </Group>

                <Text size="sm" c="dimmed">
                  Monitor webhook calls from Fireflies, manual syncs, and API activity.
                  Use this to debug if automatic webhooks are working correctly.
                </Text>

                {isLoadingLogs ? (
                  <div>Loading activity logs...</div>
                ) : webhookLogsData?.logs && webhookLogsData.logs.length > 0 ? (
                  <Stack gap="sm">
                    {(webhookLogsData.logs as WebhookLog[]).map((log) => (
                      <Card
                        key={log.id}
                        withBorder
                        shadow="xs"
                        radius="sm"
                        p="sm"
                      >
                        <Group justify="space-between" align="flex-start" wrap="nowrap">
                          <Stack gap={4} style={{ flex: 1 }}>
                            <Group gap="xs">
                              <Badge
                                size="sm"
                                color={
                                  log.status === "success"
                                    ? "green"
                                    : log.status === "invalid_signature"
                                    ? "yellow"
                                    : "red"
                                }
                              >
                                {log.status}
                              </Badge>
                              <Badge size="sm" variant="outline" color="gray">
                                {log.eventType.replace(/_/g, " ")}
                              </Badge>
                              <Badge size="sm" variant="dot" color="teal">
                                {log.provider}
                              </Badge>
                            </Group>
                            {log.meetingTitle && (
                              <Text size="sm" fw={500}>
                                {log.meetingTitle}
                              </Text>
                            )}
                            {log.errorMessage && (
                              <Text size="xs" c="red">
                                Error: {log.errorMessage}
                              </Text>
                            )}
                          </Stack>
                          <Text size="xs" c="dimmed">
                            {new Date(log.createdAt).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </Text>
                        </Group>
                      </Card>
                    ))}
                  </Stack>
                ) : (
                  <Paper p="xl" radius="md" className="text-center">
                    <Stack gap="md" align="center">
                      <IconHistory size={48} opacity={0.3} />
                      <Text size="lg" c="dimmed">No webhook activity yet</Text>
                      <Text size="sm" c="dimmed">
                        Webhook calls and manual syncs will appear here.
                        Try clicking &quot;Sync&quot; on the Transcriptions tab to see activity.
                      </Text>
                    </Stack>
                  </Paper>
                )}
              </Stack>
            </Tabs.Panel>
          </Stack>
        </Tabs>
      </div>

      {/* Transcription Details Drawer */}
      <TranscriptionDetailsDrawer
        opened={drawerOpened}
        onClose={() => setDrawerOpened(false)}
        transcription={selectedTranscription}
        workflows={workflows}
        onSyncToIntegration={(workflowId) => {
          setSyncingToIntegration(selectedTranscription?.id || null);
          syncToIntegrationMutation.mutate(
            { id: workflowId },
            {
              onSuccess: (data) => {
                notifications.update({
                  id: 'notion-sync',
                  title: 'Success!',
                  message: `Successfully sent ${data.itemsCreated} actions to Notion`,
                  color: 'green',
                  loading: false,
                });
                // Clear the loading state
                setSyncingToIntegration(null);
              },
              onError: (error) => {
                notifications.update({
                  id: 'notion-sync',
                  title: 'Failed to send to Notion',
                  message: error.message || 'An error occurred while sending actions to Notion',
                  color: 'red',
                  loading: false,
                });
                setSyncingToIntegration(null);
              },
            }
          );
        }}
        syncingToIntegration={syncingToIntegration}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        opened={deleteModalOpened}
        onClose={() => setDeleteModalOpened(false)}
        title="Delete Transcriptions"
        centered
      >
        <Stack gap="md">
          <Text>
            Are you sure you want to delete {selectedTranscriptionIds.size} transcription{selectedTranscriptionIds.size === 1 ? '' : 's'}?
          </Text>
          <Text size="sm" c="dimmed">
            This action cannot be undone. All associated actions will also be removed.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button
              variant="light"
              onClick={() => setDeleteModalOpened(false)}
            >
              Cancel
            </Button>
            <Button
              color="red"
              loading={bulkDeleteMutation.isPending}
              onClick={handleBulkDelete}
              leftSection={<IconTrash size={16} />}
            >
              Delete {selectedTranscriptionIds.size} Transcription{selectedTranscriptionIds.size === 1 ? '' : 's'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Slack Summary Modal */}
      <SlackSummaryModal
        opened={slackModalOpened}
        onClose={() => {
          setSlackModalOpened(false);
          setSelectedMeetingForSlack(null);
        }}
        transcriptionId={selectedMeetingForSlack?.id || ''}
        meetingTitle={selectedMeetingForSlack?.title || 'Untitled Meeting'}
        projectId={selectedMeetingForSlack?.projectId}
        teamId={selectedMeetingForSlack?.project?.teamId}
      />

      {/* Fireflies Settings Modal */}
      <FirefliesWizardModal
        opened={firefliesModalOpened}
        onClose={() => {
          setFirefliesModalOpened(false);
          setSelectedFirefliesIntegrationId(null);
        }}
        editIntegrationId={selectedFirefliesIntegrationId ?? undefined}
      />
    </>
  );
}
