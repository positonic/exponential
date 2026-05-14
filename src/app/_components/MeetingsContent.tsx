"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SlackSummaryModal } from './SlackSummaryModal';
import Link from "next/link";
import {
  Accordion,
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
  Skeleton,
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
  IconSparkles,
  IconLayersIntersect,
  IconCheck,
} from "@tabler/icons-react";
import { TranscriptionRenderer } from "./TranscriptionRenderer";
import { FirefliesWizardModal } from "./integrations/FirefliesWizardModal";
import { parseFirefliesSummary } from "~/lib/fireflies-summary";
import {
  buildMeetingCardViewModel,
  type MeetingCardParticipant,
  type MeetingCardSession,
} from "~/lib/meetingCardViewModel";
import type { WeeklyMeetingStatsResult } from "~/server/services/meetings/weeklyMeetingStats";
import { CreateTranscriptionModal } from "./CreateTranscriptionModal";

type MeetingType = "all" | "one_on_one" | "ritual";
type TabValue = MeetingType | "archive" | "activity";

function isMeetingTypeTab(tab: TabValue): tab is MeetingType {
  return tab === "all" || tab === "one_on_one" || tab === "ritual";
}

// ── Date grouping helpers ────────────────────────────────────────────
// Group Meetings by their *local* calendar day. Day boundaries respect the
// user's browser timezone (not UTC), and the header label resolves to TODAY /
// YESTERDAY / `<Weekday>, <Mon Day>`.

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDayLabel(d: Date, now: Date): string {
  const day = startOfLocalDay(d);
  const today = startOfLocalDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (day.getTime() === today.getTime()) return "TODAY";
  if (day.getTime() === yesterday.getTime()) return "YESTERDAY";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

interface MeetingDateLike {
  meetingDate: Date | string | null;
  createdAt: Date | string;
}

function groupMeetingsByLocalDay<T extends MeetingDateLike>(
  meetings: T[],
  now: Date = new Date(),
): Array<{ key: string; label: string; meetings: T[] }> {
  const buckets = new Map<string, { key: string; label: string; sortDate: Date; meetings: T[] }>();
  for (const m of meetings) {
    const raw = m.meetingDate ?? m.createdAt;
    const d = raw instanceof Date ? raw : new Date(raw);
    const key = localDayKey(d);
    const existing = buckets.get(key);
    if (existing) {
      existing.meetings.push(m);
    } else {
      buckets.set(key, {
        key,
        label: formatDayLabel(d, now),
        sortDate: startOfLocalDay(d),
        meetings: [m],
      });
    }
  }
  // Sort buckets by date descending, and meetings within each by their date
  // descending (so newest in the day comes first).
  return Array.from(buckets.values())
    .sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime())
    .map(({ meetings: items, ...rest }) => ({
      ...rest,
      meetings: items.slice().sort((a, b) => {
        const ad = a.meetingDate ?? a.createdAt;
        const bd = b.meetingDate ?? b.createdAt;
        return new Date(bd).getTime() - new Date(ad).getTime();
      }),
    }));
}

// ── Right rail widgets ──────────────────────────────────────────────
// Pure renderers over `weeklyStats`. Both expect a possibly-undefined value
// so they can render a Skeleton while the query is in flight without each
// widget firing a separate fetch.

function computeInitials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase() || "?";
  }
  return parts[0]!.slice(0, 2).toUpperCase();
}

function ThisWeekChart({ stats }: { stats: WeeklyMeetingStatsResult | undefined }) {
  if (!stats) {
    return (
      <Stack gap="xs">
        <Text size="xs" fw={700} className="uppercase tracking-wide text-text-secondary">
          This Week
        </Text>
        <Skeleton height={64} />
        <Skeleton height={14} width="60%" />
      </Stack>
    );
  }
  const maxCount = Math.max(1, ...stats.perDayCounts.map((d) => d.count));
  const hours = Math.floor(stats.totalDurationMinutes / 60);
  const mins = stats.totalDurationMinutes % 60;
  const dayLabels = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <Stack gap="xs">
      <Text size="xs" fw={700} className="uppercase tracking-wide text-text-secondary">
        This Week
      </Text>
      <div className="flex h-16 items-end gap-1">
        {stats.perDayCounts.map((d, i) => (
          <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="min-h-[2px] w-full rounded-t bg-blue-500/40"
              style={{ height: `${(d.count / maxCount) * 100}%` }}
              aria-label={`${d.count} on ${d.date}`}
            />
            <span className="text-[10px] text-text-secondary">{dayLabels[i]}</span>
          </div>
        ))}
      </div>
      <Text size="xs" c="dimmed">
        {stats.totalMeetings} meeting{stats.totalMeetings === 1 ? "" : "s"} · {hours}h {mins}m
      </Text>
    </Stack>
  );
}

function TopPeoplePanel({ stats }: { stats: WeeklyMeetingStatsResult | undefined }) {
  if (!stats) {
    return (
      <Stack gap="xs">
        <Text size="xs" fw={700} className="uppercase tracking-wide text-text-secondary">
          Top People
        </Text>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={28} />
        ))}
      </Stack>
    );
  }
  const people = stats.topParticipants.slice(0, 6);
  return (
    <Stack gap="xs">
      <Text size="xs" fw={700} className="uppercase tracking-wide text-text-secondary">
        Top People
      </Text>
      {people.length === 0 ? (
        <Text size="xs" c="dimmed">No meetings yet this week</Text>
      ) : (
        people.map((p) => (
          <Group key={p.participantId} gap="xs" justify="space-between" wrap="nowrap">
            <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
              {p.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.avatarUrl}
                  alt={p.displayName}
                  className="h-6 w-6 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[10px] font-semibold text-white">
                  {computeInitials(p.displayName)}
                </div>
              )}
              <Text size="sm" lineClamp={1}>{p.displayName}</Text>
            </Group>
            <Text size="xs" c="dimmed">{p.count}</Text>
          </Group>
        ))
      )}
    </Stack>
  );
}

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
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabValue>("all");
  const [_successMessages, setSuccessMessages] = useState<Record<string, string>>({}); // transcriptionId -> message (kept for future sync-status UI)
  const [_syncingToIntegration, setSyncingToIntegration] = useState<string | null>(null); // transcriptionId being synced to external integration
  
  // Slack Summary Modal state
  const [slackModalOpened, setSlackModalOpened] = useState(false);
  const [selectedMeetingForSlack, setSelectedMeetingForSlack] = useState<any>(null);

  // Fireflies settings modal state
  const [firefliesModalOpened, setFirefliesModalOpened] = useState(false);
  const [selectedFirefliesIntegrationId, setSelectedFirefliesIntegrationId] = useState<string | null>(null);

  // New state for filtering and bulk operations
  const [selectedIntegrationFilter, setSelectedIntegrationFilter] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTranscriptionIds, setSelectedTranscriptionIds] = useState<Set<string>>(new Set());
  const [bulkProjectAssignment, setBulkProjectAssignment] = useState<string | null>(null);
  const [deleteModalOpened, setDeleteModalOpened] = useState(false);
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
  const { data: workflows = [] } = api.workflow.list.useQuery();
  const { data: webhookLogsData, isLoading: isLoadingLogs, refetch: refetchLogs } = api.transcription.getWebhookLogs.useQuery(
    { workspaceId, limit: 50 },
    { enabled: activeTab === "activity" }
  );
  // Anchor the weekly stats to the start of the current ISO week (Monday) in
  // the browser's local timezone so day boundaries match what the user sees.
  const weekStart = useMemo(() => {
    const now = new Date();
    const local = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = (local.getDay() + 6) % 7;
    local.setDate(local.getDate() - day);
    return local;
  }, []);
  const { data: weeklyStats } = api.transcription.weeklyStats.useQuery(
    { workspaceId, weekStart },
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
        message: `Assigned ${data.count} meetings and their actions to project`,
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
        message: error.message || 'Failed to assign meetings to project',
        color: 'red',
      });
    },
  });

  const bulkDeleteMutation = api.transcription.bulkDeleteTranscriptions.useMutation({
    onSuccess: (data) => {
      notifications.show({
        title: 'Bulk Delete Complete',
        message: `Deleted ${data.count} meetings`,
        color: 'green',
      });
      // Clear selections and refresh data
      setSelectedTranscriptionIds(new Set());
      void utils.transcription.getAllTranscriptions.invalidate();
    },
    onError: (error) => {
      notifications.show({
        title: 'Bulk Delete Failed',
        message: error.message || 'Failed to delete meetings',
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

  const handleProjectAssignment = (transcriptionId: string, projectId: string | null) => {
    if (projectId) {
      assignProjectMutation.mutate({
        transcriptionId,
        projectId,
        autoProcess: false
      });
    }
  };

  const getProjectsForMeeting = (sessionWorkspaceId: string | null | undefined) => {
    if (!sessionWorkspaceId) return [];
    return (projects ?? []).filter(p => p.workspaceId === sessionWorkspaceId);
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
    const meetingType: MeetingType = isMeetingTypeTab(activeTab) ? activeTab : "all";
    const filteredTranscriptions = getFilteredTranscriptions(meetingType);
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

  const getFilteredTranscriptions = (meetingType: MeetingType) => {
    if (!transcriptions) return [];
    if (meetingType === "ritual") return [];

    let filtered = transcriptions;

    // Meeting type narrowing — 1:1s derive from participant count until a
    // stored meetingType column exists. See CONTEXT.md "Flagged ambiguities".
    if (meetingType === "one_on_one") {
      filtered = filtered.filter((session) => session.participantCount === 2);
    }

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
  const allCount = transcriptions?.length ?? 0;
  const oneOnOneCount = transcriptions?.filter((t) => t.participantCount === 2).length ?? 0;
  const ritualCount = 0;
  const archivedCount = archivedTranscriptions?.length ?? 0;
  const activityCount = webhookLogsData?.logs?.length ?? 0;

  // Fireflies connection summary for the banner
  const { data: firefliesIntegrations = [] } = api.transcription.getFirefliesIntegrations.useQuery();
  const firstFireflies = firefliesIntegrations[0];
  const meetingsToday = useMemo(() => {
    if (!transcriptions) return 0;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return transcriptions.filter(t => {
      const d = new Date(t.createdAt);
      return d.getTime() >= start.getTime();
    }).length;
  }, [transcriptions]);

  if (isLoading && !transcriptions) {
    return <div>Loading meetings...</div>;
  }

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

  const currentMeetingType: MeetingType = isMeetingTypeTab(activeTab) ? activeTab : "all";
  const filteredTranscriptions = getFilteredTranscriptions(currentMeetingType);
  const groupedTranscriptions = groupMeetingsByLocalDay(filteredTranscriptions);

  return (
    <>
      {/* Compact header: title + stat strip + Fireflies pill */}
      <div className="w-full max-w-7xl">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
          <div>
            <Title order={1} className="text-text-primary" fw={700}>
              Meetings
            </Title>
            <Text size="sm" c="dimmed" mt={4}>
              <span className="font-medium text-text-primary">
                {weeklyStats?.totalMeetings ?? 0} this week
              </span>
              {" · "}
              <span>
                {weeklyStats?.totalActionsExtracted ?? 0} actions extracted
              </span>
            </Text>
          </div>
          {firstFireflies ? (
            <Group gap="xs" className="rounded-full border border-border-primary bg-surface-secondary px-3 py-1">
              <IconStarFilled size={12} className="text-yellow-400" />
              <Text size="xs" c="dimmed">
                Fireflies syncing · {meetingsToday} today ·{" "}
              </Text>
              <button
                type="button"
                onClick={() => {
                  setSelectedFirefliesIntegrationId(firstFireflies.id);
                  setFirefliesModalOpened(true);
                }}
                className="text-xs text-blue-400 hover:underline"
              >
                Settings
              </button>
            </Group>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSelectedFirefliesIntegrationId(null);
                setFirefliesModalOpened(true);
              }}
              className="inline-flex items-center gap-1 rounded-full border border-border-primary bg-surface-secondary px-3 py-1 text-xs text-blue-400 hover:bg-surface-hover"
            >
              <IconStarFilled size={12} className="text-yellow-400" />
              Connect Fireflies
            </button>
          )}
        </Group>
        <div className="mt-6 h-px w-full bg-border-primary" />
      </div>

      {/* Main Content — left column (tabs + list) + right rail (widgets) */}
      <div className="flex w-full max-w-7xl gap-6">
      <div className="min-w-0 w-full max-w-4xl flex-1">
        <Tabs value={activeTab} onChange={handleTabChange}>
          <Stack gap="xl" align="stretch" justify="flex-start">
            {/* Tabs Navigation */}
            <Tabs.List>
              {[
                { value: "all", label: "All", count: allCount },
                { value: "one_on_one", label: "1:1s", count: oneOnOneCount },
                { value: "ritual", label: "Rituals", count: ritualCount },
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
            {/*
              All / 1:1s / Rituals share the same panel content. The meeting
              list itself is filtered by `currentMeetingType` (see
              getFilteredTranscriptions). Mantine renders only the active
              Panel's tree thanks to `keepMounted={false}` on Tabs.
            */}
            {(["all", "one_on_one", "ritual"] as const).map((tabValue) => (
            <Tabs.Panel key={tabValue} value={tabValue} keepMounted={false}>
              <Stack gap="lg">
                {/* Recent meetings heading */}
                <Group justify="space-between" align="center">
                  <Title order={4} fw={600}>Recent meetings</Title>
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
                      placeholder="Search meetings, participants, topics..."
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

                {activeTab === "ritual" ? (
                  <Paper p="xl" radius="md" className="text-center">
                    <Stack gap="md" align="center">
                      <IconMicrophone size={40} opacity={0.3} />
                      <Text size="md" c="dimmed">
                        We&apos;re learning your team&apos;s recurring meetings
                      </Text>
                      <Text size="sm" c="dimmed">
                        Rituals will surface here once we can detect them. For now, head to All or
                        1:1s to see your synced meetings.
                      </Text>
                    </Stack>
                  </Paper>
                ) : groupedTranscriptions.length > 0 ? (
                  <Stack gap="xl">
                    {groupedTranscriptions.map((group) => (
                    <div key={group.key}>
                      <div className="sticky top-0 z-10 -mx-2 mb-2 bg-background-primary px-2 py-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        {group.label}
                      </div>
                      <Stack gap="md">
                        {group.meetings.map((session) => {
                      const projectsForWorkspace = getProjectsForMeeting(session.workspaceId);
                      const vmSession: MeetingCardSession = {
                        id: session.id,
                        sessionId: session.sessionId,
                        title: session.title,
                        summary: session.summary,
                        transcription: session.transcription,
                        project: session.project ? { id: session.project.id, name: session.project.name } : null,
                        actions: session.actions ?? [],
                      };
                      const vmParticipants: MeetingCardParticipant[] = (session.participants ?? []).map((p) => ({
                        id: p.id,
                        email: p.email,
                        name: p.name,
                        user: p.user ? { id: p.user.id, name: p.user.name, image: p.user.image } : null,
                        contact: p.contact
                          ? {
                              id: p.contact.id,
                              firstName: p.contact.firstName,
                              lastName: p.contact.lastName,
                            }
                          : null,
                      }));
                      const vm = buildMeetingCardViewModel(vmSession, vmParticipants);
                      const detailHref = `/recording/${session.id}`;
                      const navigateToDetail = () => router.push(detailHref);
                      const stopBubble = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation();

                      return (
                      <Card
                        key={session.id}
                        withBorder
                        radius="md"
                        padding="md"
                        className="cursor-pointer hover:border-border-focus transition-colors"
                        role="link"
                        tabIndex={0}
                        onClick={navigateToDetail}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigateToDetail();
                          }
                        }}
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
                                onClick={stopBubble}
                              />
                              <Text size="lg" fw={600} lineClamp={1} style={{ flex: 1 }}>
                                <Link
                                  href={detailHref}
                                  onClick={stopBubble}
                                  className="text-text-primary hover:underline"
                                >
                                  {vm.title}
                                </Link>
                              </Text>
                            </Group>
                            <div onClick={stopBubble}>
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
                                    href={detailHref}
                                  >
                                    Open page
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
                                  {session.project?.taskManagementTool && session.project.taskManagementTool !== "internal" && vm.actionCount > 0 && (
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
                            </div>
                          </Group>

                          {/* Project pill + Participant avatars row */}
                          <Group gap="sm" pl={32} wrap="wrap" align="center">
                            {vm.projectPill ? (
                              <div onClick={stopBubble}>
                                <Menu shadow="md" width={240}>
                                  <Menu.Target>
                                    <button
                                      type="button"
                                      className="inline-flex items-center gap-2 rounded-md border border-border-primary bg-surface-secondary px-2 py-1 text-xs text-text-primary hover:bg-surface-hover"
                                    >
                                      <IconFolder size={12} className="text-blue-400" />
                                      <span className="font-medium">{vm.projectPill.name}</span>
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
                              </div>
                            ) : (
                              <div onClick={stopBubble}>
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
                              </div>
                            )}

                            {vm.avatars.length > 0 && (
                              <Group gap={6} wrap="nowrap" align="center">
                                <div className="flex items-center -space-x-2 pl-1">
                                  {vm.avatars.slice(0, 4).map((a) => (
                                    <Tooltip key={a.key} label={a.displayName} withArrow>
                                      <div
                                        className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-background-primary text-[10px] font-semibold text-white ${a.colorClass}`}
                                      >
                                        {a.initials}
                                      </div>
                                    </Tooltip>
                                  ))}
                                  {vm.avatars.length > 4 && (
                                    <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background-primary bg-surface-secondary text-[10px] font-semibold text-text-secondary">
                                      +{vm.avatars.length - 4}
                                    </div>
                                  )}
                                </div>
                                <Text size="xs" c="dimmed">
                                  {vm.attendeeCount} attendee{vm.attendeeCount === 1 ? "" : "s"}
                                </Text>
                              </Group>
                            )}
                          </Group>

                          {/* AI highlight (Fireflies overview → shorthand_bullet[0]) */}
                          {vm.highlight && (
                            <Text size="sm" c="dimmed" lineClamp={2} pl={32}>
                              {vm.highlight}
                            </Text>
                          )}

                          {/* Peek at transcript accordion */}
                          {session.transcription && (
                            <div onClick={stopBubble} className="pl-8">
                              <Accordion variant="contained" chevronPosition="right">
                                <Accordion.Item value="peek">
                                  <Accordion.Control>
                                    <Text size="xs" fw={600} c="dimmed" className="uppercase tracking-wide">
                                      Peek at transcript
                                    </Text>
                                  </Accordion.Control>
                                  <Accordion.Panel>
                                    <TranscriptionRenderer
                                      transcription={session.transcription}
                                      provider={session.sourceIntegration?.provider}
                                      isPreview={true}
                                      maxLines={2}
                                    />
                                  </Accordion.Panel>
                                </Accordion.Item>
                              </Accordion>
                            </div>
                          )}

                          {/* Footer: Actions chip + Open transcript link */}
                          <Group justify="space-between" align="center" pl={32} wrap="wrap">
                            <span className="inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs text-blue-300">
                              <IconSparkles size={10} />
                              {vm.actionCount} action{vm.actionCount === 1 ? "" : "s"}
                            </span>
                            <Link
                              href={detailHref}
                              onClick={stopBubble}
                              className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline"
                            >
                              Open transcript
                              <IconExternalLink size={12} />
                            </Link>
                          </Group>
                        </Stack>
                      </Card>
                      );
                    })}
                      </Stack>
                    </div>
                    ))}
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
            ))}

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
                                  {/* Open page Link */}
                                  <Button
                                    size="sm"
                                    variant="light"
                                    color="gray"
                                    component={Link}
                                    href={`/recording/${session.id}`}
                                  >
                                    Open page
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
      <aside className="hidden w-80 shrink-0 lg:block">
        <Stack gap="xl" mt={64}>
          <ThisWeekChart stats={weeklyStats} />
          <TopPeoplePanel stats={weeklyStats} />
        </Stack>
      </aside>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        opened={deleteModalOpened}
        onClose={() => setDeleteModalOpened(false)}
        title="Delete Meetings"
        centered
      >
        <Stack gap="md">
          <Text>
            Are you sure you want to delete {selectedTranscriptionIds.size} meeting{selectedTranscriptionIds.size === 1 ? '' : 's'}?
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
