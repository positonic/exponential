"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useRegisterPageContext } from "~/hooks/useRegisterPageContext";
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
  Button,
  Card,
  Menu,
  Modal,
  TextInput,
  ActionIcon,
  Skeleton,
  Kbd,
  Select,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";
import {
  IconMicrophone,
  IconFilter,
  IconChecks,
  IconSquare,
  IconDotsVertical,
  IconFolder,
  IconTrash,
  IconArchive,
  IconArchiveOff,
  IconHistory,
  IconRefresh,
  IconSearch,
  IconStarFilled,
  IconSparkles,
  IconCheck,
  IconTrendingUp,
  IconUsers,
  IconCalendarPlus,
} from "@tabler/icons-react";
import { TranscriptView } from "./meeting/TranscriptView";
import { MeetingProjectPicker } from "./meeting/MeetingProjectPicker";
import { MeetingCardList } from "./meeting/MeetingCardList";
import { FirefliesWizardModal } from "./integrations/FirefliesWizardModal";
import type { WeeklyMeetingStatsResult } from "~/server/services/meetings/weeklyMeetingStats";
import { CreateTranscriptionModal } from "./CreateTranscriptionModal";
import { ScheduleMeetingModal } from "./calendar/ScheduleMeetingModal";

type MeetingType =
  | "all"
  | "mine"
  | "one_on_one"
  | "customer"
  | "internal";
type TabValue = MeetingType | "archive" | "activity";

const MEETING_TYPE_TABS: ReadonlyArray<MeetingType> = [
  "all",
  "mine",
  "one_on_one",
  "customer",
  "internal",
];

function isMeetingTypeTab(tab: TabValue): tab is MeetingType {
  return (MEETING_TYPE_TABS as readonly string[]).includes(tab);
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

function RailCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-border-subtle bg-background-secondary p-4">
      {children}
    </div>
  );
}

function RailCardTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Group
      gap={6}
      align="center"
      className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted"
    >
      {icon}
      <span>{children}</span>
    </Group>
  );
}

function avatarColorClass(key: string): string {
  // Tailwind avatar palette — must remain in sync with the meetingCardViewModel
  // palette so the same Participant gets the same colour across the page.
  const palette = [
    "bg-blue-500",
    "bg-green-500",
    "bg-purple-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-teal-500",
  ];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length] ?? palette[0]!;
}

function ThisWeekChart({ stats, weekStart }: { stats: WeeklyMeetingStatsResult | undefined; weekStart: Date }) {
  if (!stats) {
    return (
      <RailCard>
        <RailCardTitle icon={<IconTrendingUp size={12} />}>This Week</RailCardTitle>
        <Skeleton height={44} mb={8} />
        <Skeleton height={14} width="70%" />
      </RailCard>
    );
  }
  const maxCount = Math.max(1, ...stats.perDayCounts.map((d) => d.count));
  const hours = Math.floor(stats.totalDurationMinutes / 60);
  const mins = stats.totalDurationMinutes % 60;
  const labels = ["M", "T", "W", "T", "F", "S", "S"];
  // Highlight the bar for today (if today falls inside the displayed week).
  const todayKey = (() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  })();
  const weekStartTime = new Date(
    weekStart.getFullYear(),
    weekStart.getMonth(),
    weekStart.getDate(),
  ).getTime();
  const todayIndex = Math.floor((todayKey - weekStartTime) / (24 * 60 * 60 * 1000));
  return (
    <RailCard>
      <RailCardTitle icon={<IconTrendingUp size={12} />}>This Week</RailCardTitle>
      <div className="mb-2.5 flex h-9 items-end gap-[3px]">
        {stats.perDayCounts.map((d, i) => {
          const isToday = i === todayIndex;
          const heightPct = (d.count / maxCount) * 100;
          return (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`min-h-[4px] w-full rounded-[2px] transition-colors ${
                  isToday ? "bg-brand-400" : "bg-surface-muted"
                }`}
                style={{ height: `${heightPct}%` }}
                aria-label={`${d.count} on ${d.date}`}
              />
              <span className="text-[10px] text-text-faint">{labels[i]}</span>
            </div>
          );
        })}
      </div>
      <Text size="xs" className="text-text-secondary">
        <span className="font-semibold text-text-primary tabular-nums">
          {stats.totalMeetings}
        </span>{" "}
        meeting{stats.totalMeetings === 1 ? "" : "s"} ·{" "}
        <span className="font-semibold text-text-primary tabular-nums">
          {hours}h {mins}m
        </span>
      </Text>
    </RailCard>
  );
}

function TopPeoplePanel({ stats }: { stats: WeeklyMeetingStatsResult | undefined }) {
  if (!stats) {
    return (
      <RailCard>
        <RailCardTitle icon={<IconUsers size={12} />}>Top People</RailCardTitle>
        <Stack gap="xs">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={24} />
          ))}
        </Stack>
      </RailCard>
    );
  }
  const people = stats.topParticipants.slice(0, 4);
  return (
    <RailCard>
      <RailCardTitle icon={<IconUsers size={12} />}>Top People</RailCardTitle>
      {people.length === 0 ? (
        <Text size="xs" className="text-text-muted">No meetings yet this week.</Text>
      ) : (
        <Stack gap={6}>
          {people.map((p) => (
            <Group key={p.participantId} gap={8} justify="space-between" wrap="nowrap">
              <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
                {p.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.avatarUrl}
                    alt={p.displayName}
                    className="h-6 w-6 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${avatarColorClass(p.participantId)}`}
                  >
                    {computeInitials(p.displayName)}
                  </div>
                )}
                <Text size="sm" lineClamp={1} className="text-text-primary">
                  {p.displayName}
                </Text>
              </Group>
              <Text size="xs" className="tabular-nums text-text-muted">
                {p.count}
              </Text>
            </Group>
          ))}
        </Stack>
      )}
    </RailCard>
  );
}

function ZoesWeekPanel({ stats }: { stats: WeeklyMeetingStatsResult | undefined }) {
  if (!stats) {
    return (
      <RailCard>
        <RailCardTitle icon={<IconSparkles size={12} className="text-accent-meetings" />}>
          Zoe&apos;s Week
        </RailCardTitle>
        <Skeleton height={36} />
      </RailCard>
    );
  }
  return (
    <RailCard>
      <RailCardTitle icon={<IconSparkles size={12} className="text-accent-meetings" />}>
        Zoe&apos;s Week
      </RailCardTitle>
      <Text size="xs" className="leading-[1.55] text-text-secondary">
        <span className="font-semibold text-text-primary tabular-nums">
          {stats.totalActionsExtracted}
        </span>{" "}
        action{stats.totalActionsExtracted === 1 ? "" : "s"} extracted across{" "}
        <span className="font-semibold text-text-primary tabular-nums">
          {stats.totalMeetings}
        </span>{" "}
        meeting{stats.totalMeetings === 1 ? "" : "s"} this week.
      </Text>
    </RailCard>
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

export function MeetingsContent({ workspaceId }: MeetingsContentProps = {}) {
  // Page-local keyframes — Mantine + Tailwind don't expose these utilities
  // out of the box, so we inject once per session.
  // - fadeInOut: legacy bulk-action notification banner
  // - meetings-v2-pulse: pulsing dot on the Fireflies sync pill
  const inlineKeyframes = `
    @keyframes fadeInOut {
      0% { opacity: 0; transform: translateY(-5px); }
      10% { opacity: 1; transform: translateY(0); }
      90% { opacity: 1; transform: translateY(0); }
      100% { opacity: 0; transform: translateY(-5px); }
    }
    @keyframes meetings-v2-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50%      { opacity: 0.45; transform: scale(0.85); }
    }
    .meetings-v2-pulse {
      animation: meetings-v2-pulse 2.4s ease-in-out infinite;
    }
  `;

  if (typeof document !== 'undefined' && !document.getElementById('fade-animation-styles')) {
    const style = document.createElement('style');
    style.id = 'fade-animation-styles';
    style.textContent = inlineKeyframes;
    document.head.appendChild(style);
  }
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<TabValue>("all");
  // Ceremony filter (ADR-0059): narrows every tab to meetings attached to an
  // occurrence of the chosen ceremony. Client-side over the cached list, like
  // the integration filter, so the tab counts stay in step.
  const [selectedCeremonyId, setSelectedCeremonyId] = useState<string | null>(null);
  const { data: ceremonies = [] } = api.ceremony.list.useQuery(
    { workspaceId: workspaceId ?? "", includeInactive: true },
    { enabled: Boolean(workspaceId) },
  );
  const [_successMessages, setSuccessMessages] = useState<Record<string, string>>({}); // transcriptionId -> message (kept for future sync-status UI)
  const [_syncingToIntegration, setSyncingToIntegration] = useState<string | null>(null); // transcriptionId being synced to external integration
  
  // Slack Summary Modal state
  const [slackModalOpened, setSlackModalOpened] = useState(false);
  const [selectedMeetingForSlack, setSelectedMeetingForSlack] = useState<any>(null);

  // Cross-member scheduling modal state (V3)
  const [scheduleModalOpened, setScheduleModalOpened] = useState(false);

  // Fireflies settings modal state
  const [firefliesModalOpened, setFirefliesModalOpened] = useState(false);
  const [selectedFirefliesIntegrationId, setSelectedFirefliesIntegrationId] = useState<string | null>(null);

  // New state for filtering and bulk operations
  const [selectedIntegrationFilter, setSelectedIntegrationFilter] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTranscriptionIds, setSelectedTranscriptionIds] = useState<Set<string>>(new Set());
  const [deleteModalOpened, setDeleteModalOpened] = useState(false);
  const shouldUseCachedTranscriptions = Boolean(workspaceId);
  // One card-shaped fetch covers every tab: active and archived meetings are
  // split client-side from the same rows, so the page pays the list query
  // once per mount instead of twice. `getMeetingCards` leaves transcript and
  // notes bodies on the server; the details modal loads them via `getById`.
  const meetingCardsInput = { includeArchived: true, workspaceId };
  const { data: allMeetingCards, isLoading } = api.transcription.getMeetingCards.useQuery(
    meetingCardsInput,
    {
      refetchOnMount: shouldUseCachedTranscriptions ? false : undefined,
      refetchOnWindowFocus: shouldUseCachedTranscriptions ? false : undefined,
      staleTime: shouldUseCachedTranscriptions ? 5 * 60 * 1000 : undefined,
    }
  );
  const transcriptions = useMemo(
    () => allMeetingCards?.filter((t) => !t.archivedAt),
    [allMeetingCards],
  );
  const archivedTranscriptions = useMemo(
    () => allMeetingCards?.filter((t) => t.archivedAt),
    [allMeetingCards],
  );
  const isLoadingArchived = isLoading;
  // Register lightweight page context for the AI agent. Counts only; the agent
  // fetches actual meetings on demand via its `get-meeting-transcriptions` tool.
  const meetingsPageContext = useMemo(() => {
    if (!workspaceId) return null;
    return {
      pageType: "meetings-list",
      pageTitle: "Meetings",
      pagePath: pathname,
      data: { workspaceId, meetingCount: transcriptions?.length ?? 0 },
    };
  }, [workspaceId, pathname, transcriptions?.length]);
  useRegisterPageContext(meetingsPageContext, { clearOnUnmount: false });

  const { data: projects } = api.project.getAll.useQuery({});
  // Cross-workspace, edit-scoped candidates for the placement picker (grouped
  // by workspace). Distinct from `projects` above, which feeds the optimistic
  // cache update and carries the full project shape.
  const { data: assignableProjects = [] } = api.project.getAssignable.useQuery();
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
  // Drives the "Mine" tab count: filter client-side to meetings where the
  // caller owns the session OR appears as a Participant with this userId.
  const { data: currentUser } = api.user.getCurrentUser.useQuery();
  const utils = api.useUtils();

  // On first load, heal the current user's unsummarized meetings on demand
  // (one bounded server-side sweep, limit 10) instead of waiting for the hourly
  // cron. Fires at most once per mount and only when a card is actually missing
  // a summary; refetches the list when any summary lands.
  const summariesSweptRef = useRef(false);
  const { mutate: ensureMyMeetingSummaries } =
    api.transcription.ensureMyMeetingSummaries.useMutation({
      onSuccess: (result) => {
        if (result.summarized > 0) {
          void utils.transcription.getMeetingCards.invalidate();
        }
      },
    });
  useEffect(() => {
    if (summariesSweptRef.current || isLoading || !transcriptions) return;
    const hasUnsummarized = transcriptions.some(
      (t) => !t.archivedAt && !t.summary?.trim(),
    );
    if (!hasUnsummarized) return;
    summariesSweptRef.current = true;
    ensureMyMeetingSummaries();
  }, [isLoading, transcriptions, ensureMyMeetingSummaries]);


  const assignProjectMutation = api.transcription.assignProject.useMutation({
    onMutate: async ({ transcriptionId, projectId }) => {
      // Cancel outgoing refetches
      await utils.transcription.getMeetingCards.cancel();

      // Snapshot previous value
      const previousData = utils.transcription.getMeetingCards.getData(meetingCardsInput);

      // Optimistically update the cache
      utils.transcription.getMeetingCards.setData(meetingCardsInput, (old) => {
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
        utils.transcription.getMeetingCards.setData(meetingCardsInput, context.previousData);
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
      void utils.transcription.getMeetingCards.invalidate();
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
      void utils.transcription.getMeetingCards.invalidate();
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
      void utils.transcription.getMeetingCards.invalidate();
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
      void utils.transcription.getMeetingCards.invalidate();
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
      void utils.transcription.getMeetingCards.invalidate();
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
      void utils.transcription.getMeetingCards.invalidate();
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
      void utils.transcription.getMeetingCards.invalidate();
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
    // projectId may be null to clear placement (Personal / no project). The
    // assignProject endpoint routes through the placement service, so workspace
    // and the meeting's Actions are re-homed to match.
    assignProjectMutation.mutate({ transcriptionId, projectId });
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

  const handleBulkProjectAssignment = async (projectId: string | null) => {
    if (selectedTranscriptionIds.size === 0) return;

    await bulkAssignProjectMutation.mutateAsync({
      transcriptionIds: Array.from(selectedTranscriptionIds),
      projectId,
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

  const isMine = (session: {
    userId: string | null;
    participants?: Array<{ user: { id: string } | null }>;
  }): boolean => {
    if (!currentUser?.id) return false;
    if (session.userId === currentUser.id) return true;
    return Boolean(
      session.participants?.some((p) => p.user?.id === currentUser.id),
    );
  };

  const getFilteredTranscriptions = (meetingType: MeetingType) => {
    if (!transcriptions) return [];
    // Customer and Internal ship empty until a tagging mechanism exists.
    if (meetingType === "customer" || meetingType === "internal") return [];

    let filtered = transcriptions;

    if (meetingType === "one_on_one") {
      filtered = filtered.filter((session) => session.participantCount === 2);
    }
    if (meetingType === "mine") {
      filtered = filtered.filter(isMine);
    }

    if (selectedIntegrationFilter.length > 0) {
      filtered = filtered.filter(session =>
        session.sourceIntegration &&
        selectedIntegrationFilter.includes(session.sourceIntegration.id)
      );
    }

    if (selectedCeremonyId) {
      filtered = filtered.filter((session) => session.occurrence?.ceremonyId === selectedCeremonyId);
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(session => {
        const title = (session.title ?? "").toLowerCase();
        const provider = session.sourceIntegration?.provider?.toLowerCase() ?? "";
        const preview = session.transcriptPreview
          .map((turn) => turn.text)
          .join(" ")
          .toLowerCase();
        return title.includes(q) || provider.includes(q) || preview.includes(q);
      });
    }

    return filtered;
  };

  // Derived counts for tab badges
  const allCount = transcriptions?.length ?? 0;
  const mineCount = transcriptions?.filter(isMine).length ?? 0;
  const oneOnOneCount = transcriptions?.filter((t) => t.participantCount === 2).length ?? 0;
  const customerCount = 0;
  const internalCount = 0;
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

  return (
    <>
      {/* Compact header: title + stat strip + Fireflies pill */}
      <div className="w-full max-w-[1180px]">
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
          <Group gap="xs" wrap="nowrap" className="shrink-0">
            {firstFireflies ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedFirefliesIntegrationId(firstFireflies.id);
                  setFirefliesModalOpened(true);
                }}
                className="inline-flex items-center gap-2.5 whitespace-nowrap rounded-full border border-border-subtle bg-background-secondary py-1.5 pl-2 pr-3 text-xs text-text-secondary transition-colors hover:border-border-strong"
                aria-label="Fireflies integration settings"
              >
                <span className="grid h-5 w-5 place-items-center rounded-full bg-accent-okr/15 text-accent-okr">
                  <IconStarFilled size={11} />
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-accent-crm meetings-v2-pulse" aria-hidden />
                <span>Fireflies syncing</span>
                <span className="text-text-faint">·</span>
                <span className="tabular-nums">{meetingsToday} today</span>
                <span className="text-text-faint">·</span>
                <span className="font-medium text-brand-400">Settings</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSelectedFirefliesIntegrationId(null);
                  setFirefliesModalOpened(true);
                }}
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-border-subtle bg-background-secondary py-1.5 pl-2 pr-3 text-xs text-brand-400 transition-colors hover:border-border-strong"
              >
                <span className="grid h-5 w-5 place-items-center rounded-full bg-accent-okr/15 text-accent-okr">
                  <IconStarFilled size={11} />
                </span>
                Connect Fireflies
              </button>
            )}
            {/* Workspace-page entry point for cross-member scheduling (V3);
                hidden on the legacy non-workspace /meetings page. */}
            {workspaceId && (
              <Button
                size="xs"
                variant="light"
                leftSection={<IconCalendarPlus size={14} />}
                onClick={() => setScheduleModalOpened(true)}
              >
                Schedule meeting
              </Button>
            )}
            <CreateTranscriptionModal workspaceId={workspaceId} />
          </Group>
        </Group>
        {workspaceId && (
          <ScheduleMeetingModal
            opened={scheduleModalOpened}
            onClose={() => setScheduleModalOpened(false)}
            defaultWorkspaceId={workspaceId}
          />
        )}
        <div className="mt-6 h-px w-full bg-border-primary" />
      </div>

      {/* Main Content — left column (tabs + list) + right rail (widgets) */}
      <div className="flex w-full max-w-[1180px] gap-8">
      <div className="min-w-0 flex-1">
        <Tabs value={activeTab} onChange={handleTabChange}>
          <Stack gap="lg" align="stretch" justify="flex-start">
            {/* Toolbar: tabs (left) + search and filter (right) inline */}
            <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
              <Tabs.List style={{ borderBottom: 0 }}>
                {[
                  { value: "all", label: "All", count: allCount },
                  { value: "mine", label: "Mine", count: mineCount },
                  { value: "one_on_one", label: "1:1s", count: oneOnOneCount },
                  { value: "customer", label: "Customer", count: customerCount },
                  { value: "internal", label: "Internal", count: internalCount },
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
                              ? "rounded-md bg-brand-400/20 px-1.5 py-0.5 text-xs font-medium text-brand-400 tabular-nums"
                              : "rounded-md bg-surface-muted px-1.5 py-0.5 text-xs text-text-muted tabular-nums"
                          }
                        >
                          {t.count}
                        </span>
                      </span>
                    </Tabs.Tab>
                  );
                })}
              </Tabs.List>
              <Group gap={6} wrap="nowrap" className="shrink-0">
                {workspaceId && ceremonies.length > 0 && (
                  <Select
                    size="xs"
                    className="w-[200px]"
                    styles={{ input: { height: 30, minHeight: 30 } }}
                    placeholder="All ceremonies"
                    aria-label="Filter by ceremony"
                    data-testid="ceremony-filter"
                    data={ceremonies.map((c) => ({ value: c.id, label: c.name }))}
                    value={selectedCeremonyId}
                    onChange={setSelectedCeremonyId}
                    clearable
                    searchable
                  />
                )}
                <TextInput
                  leftSection={<IconSearch size={14} />}
                  placeholder="Search transcripts, people, topics..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.currentTarget.value)}
                  rightSection={<Kbd className="mr-2 text-[10px]">⌘K</Kbd>}
                  rightSectionWidth={44}
                  size="xs"
                  className="w-[280px]"
                  styles={{ input: { height: 30 } }}
                />
                <Menu shadow="md" position="bottom-end" width={240}>
                  <Menu.Target>
                    <ActionIcon variant="default" size={30} aria-label="Filter">
                      <IconFilter size={14} />
                    </ActionIcon>
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
                <ActionIcon
                  variant="default"
                  size={30}
                  aria-label="Ask Zoe across all"
                  disabled
                >
                  <IconSparkles size={14} className="text-accent-meetings" />
                </ActionIcon>
              </Group>
            </Group>

            {/* Content Area */}
            {/*
              All / 1:1s / Rituals share the same panel content. The meeting
              list itself is filtered by `currentMeetingType` (see
              getFilteredTranscriptions). Mantine renders only the active
              Panel's tree thanks to `keepMounted={false}` on Tabs.
            */}
            {(["all", "mine", "one_on_one", "customer", "internal"] as const).map((tabValue) => (
            <Tabs.Panel key={tabValue} value={tabValue} keepMounted={false}>
              <Stack gap="md">
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
                      <Group gap="sm">
                        {/* Placement: same searchable, workspace-grouped picker as the rows */}
                        <MeetingProjectPicker
                          projects={assignableProjects}
                          value={null}
                          onChange={(projectId) => void handleBulkProjectAssignment(projectId)}
                        >
                          {({ toggle }) => (
                            <Button
                              size="xs"
                              variant="light"
                              leftSection={<IconFolder size={14} />}
                              onClick={toggle}
                              loading={bulkAssignProjectMutation.isPending}
                            >
                              Assign to project
                            </Button>
                          )}
                        </MeetingProjectPicker>
                      <Menu shadow="md">
                        <Menu.Target>
                          <Button size="xs" variant="filled" rightSection={<IconDotsVertical size={14} />}>
                            Bulk actions
                          </Button>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item leftSection={<IconArchive size={14} />} onClick={() => void handleBulkArchive()}>
                            Archive Meetings
                          </Menu.Item>
                          <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => setDeleteModalOpened(true)}>
                            Delete Transcriptions
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                      </Group>
                    </Group>
                  </Paper>
                )}

                {activeTab === "customer" || activeTab === "internal" ? (
                  <Paper p="xl" radius="md" className="text-center">
                    <Stack gap="md" align="center">
                      <IconMicrophone size={40} opacity={0.3} />
                      <Text size="md" c="dimmed">
                        {activeTab === "customer"
                          ? "We don't tag customer meetings yet"
                          : "We don't tag internal meetings yet"}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {activeTab === "customer"
                          ? "Customer-tagged meetings will surface here once tagging ships. For now, head to All or 1:1s to see your synced meetings."
                          : "Internal-tagged meetings will surface here once tagging ships. For now, head to All or 1:1s to see your synced meetings."}
                      </Text>
                    </Stack>
                  </Paper>
) : filteredTranscriptions.length > 0 ? (
                  <MeetingCardList
                    meetings={filteredTranscriptions}
                    assignableProjects={assignableProjects}
                    onProjectChange={handleProjectAssignment}
                    selectedIds={selectedTranscriptionIds}
                    onSelectedChange={(transcriptionId, selected) => {
                      const newSelected = new Set(selectedTranscriptionIds);
                      if (selected) {
                        newSelected.add(transcriptionId);
                      } else {
                        newSelected.delete(transcriptionId);
                      }
                      setSelectedTranscriptionIds(newSelected);
                    }}
                    onExtractActions={(session) => processTranscriptionMutation.mutate({ transcriptionId: session.id })}
                    onSendToSlack={handleSlackSummaryModal}
                    onSyncToIntegration={handleSyncToIntegration}
                    onArchive={(session) => handleArchiveTranscription(session.id)}
                    onDelete={(session) => {
                      if (confirm("Are you sure you want to delete this meeting?")) {
                        bulkDeleteMutation.mutate({ ids: [session.id] });
                      }
                    }}
                  />
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
                          {session.hasTranscript && (
                            <Paper p="sm" radius="sm" className="bg-gray-50 dark:bg-gray-800 opacity-75">
                              <TranscriptView
                                variant="preview"
                                transcription={null}
                                turns={session.transcriptPreview}
                                totalTurnCount={session.transcriptTurnCount}
                                provider={session.sourceIntegration?.provider}
                                previewCount={2}
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
      <aside className="hidden w-60 shrink-0 lg:block">
        <Stack gap="md" mt={56}>
          <ThisWeekChart stats={weeklyStats} weekStart={weekStart} />
          <TopPeoplePanel stats={weeklyStats} />
          <ZoesWeekPanel stats={weeklyStats} />
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
