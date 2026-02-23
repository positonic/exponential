import { Checkbox, Text, Group, Paper, Accordion, Badge, Tooltip, Button, Avatar, HoverCard, ActionIcon, Menu, Select } from '@mantine/core';
import { IconCalendar, IconCloudOff, IconAlertTriangle, IconCloudCheck, IconTrash, IconEdit, IconDots, IconBrandNotion, IconUserShare, IconClock, IconCheck, IconList } from '@tabler/icons-react';
import { UnifiedDatePicker } from './UnifiedDatePicker';
import { type RouterOutputs } from "~/trpc/react";
import { api } from "~/trpc/react";
import { useState, useEffect, useRef } from "react";
import React from "react";
import { useSession } from 'next-auth/react';
import { EditActionModal } from "./EditActionModal";
import { AssignActionModal } from "./AssignActionModal";
import { TagBadgeList } from "./TagBadge";
import { getAvatarColor, getInitial, getColorSeed, getTextColor } from "~/utils/avatarColors";
import { HTMLContent } from "./HTMLContent";
import type { Priority } from "~/types/action";
import { SchedulingSuggestion, type SchedulingSuggestionData } from "./SchedulingSuggestion";
import { InboxZeroCelebration } from "./InboxZeroCelebration";
import { useWorkspace } from "~/providers/WorkspaceProvider";

type ActionWithSyncs = RouterOutputs["action"]["getAll"][0];
type ActionWithoutSyncs = RouterOutputs["action"]["getToday"][0];
// Make createdBy, lists, epic, and tags optional to support both queries that include them and those that don't
type Action = Omit<ActionWithSyncs, 'createdBy' | 'lists' | 'epic' | 'tags'> & {
  createdBy?: ActionWithSyncs['createdBy'] | null;
  lists?: ActionWithSyncs['lists'];
  epic?: ActionWithSyncs['epic'] | null;
  tags?: ActionWithSyncs['tags'];
};

// Helper function to format date like "22 Feb"
const formatDate = (date: Date | null | undefined): string => {
  if (!date) return '';
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
};

// Helper function to format scheduled time like "9:00 AM"
const formatScheduledTime = (date: Date | null | undefined): string => {
  if (!date) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

// Helper function to get sync status for an action
const getSyncStatus = (action: Action) => {
  if (!('syncs' in action) || !action.syncs || action.syncs.length === 0) {
    return { status: 'not_synced', provider: null };
  }

  // Check for Notion sync status
  const notionSync = ('syncs' in action) ? action.syncs.find((sync: any) => sync.provider === 'notion') : undefined;
  if (notionSync) {
    return { 
      status: notionSync.status, 
      provider: 'notion',
      externalId: notionSync.externalId,
      syncedAt: notionSync.syncedAt 
    };
  }

  // Check for other providers
  const otherSync = ('syncs' in action) ? action.syncs[0] : undefined;
  if (otherSync) {
    return { 
      status: otherSync.status, 
      provider: otherSync.provider,
      externalId: otherSync.externalId,
      syncedAt: otherSync.syncedAt 
    };
  }

  // Fallback if no sync records found
  return { status: 'not_synced', provider: null };
};

// Priority order for sorting actions (lower number = higher priority)
const PRIORITY_ORDER: Record<Priority, number> = {
  '1st Priority': 1, '2nd Priority': 2, '3rd Priority': 3, '4th Priority': 4,
  '5th Priority': 5, 'Quick': 6, 'Scheduled': 7, 'Errand': 8,
  'Remember': 9, 'Watch': 10
};

// Helper function to sort actions by priority, then by id for stable ordering
const sortByPriority = (a: Action, b: Action): number => {
  const priorityDiff = (PRIORITY_ORDER[a.priority as Priority] ?? 999) - (PRIORITY_ORDER[b.priority as Priority] ?? 999);
  if (priorityDiff !== 0) return priorityDiff;
  return a.id.localeCompare(b.id);
};

// Helper component to render sync status indicator
const SyncStatusIndicator = ({ action }: { action: Action }) => {
  const syncInfo = getSyncStatus(action);
  
  if (syncInfo.status === 'not_synced') {
    return null; // No indicator for unsynced items
  }

  if (syncInfo.status === 'deleted_remotely') {
    return (
      <Tooltip label={`Deleted from ${syncInfo.provider === 'notion' ? 'Notion' : syncInfo.provider}. This task no longer exists in the external system.`}>
        <Badge 
          size="sm" 
          color="red" 
          variant="light"
          leftSection={<IconCloudOff size={12} />}
        >
          Deleted from {syncInfo.provider === 'notion' ? 'Notion' : syncInfo.provider}
        </Badge>
      </Tooltip>
    );
  }

  if (syncInfo.status === 'failed') {
    return (
      <Tooltip label={`Failed to sync to ${syncInfo.provider === 'notion' ? 'Notion' : syncInfo.provider}. There was an error during synchronization.`}>
        <Badge 
          size="sm" 
          color="orange" 
          variant="light"
          leftSection={<IconAlertTriangle size={12} />}
        >
          Sync failed
        </Badge>
      </Tooltip>
    );
  }

  if (syncInfo.status === 'synced') {
    // Show provider-specific icon
    if (syncInfo.provider === 'notion') {
      return (
        <Tooltip label={`Synced to Notion on ${syncInfo.syncedAt ? new Date(syncInfo.syncedAt).toLocaleDateString() : 'unknown date'}`}>
          <IconBrandNotion size={16} style={{ color: 'var(--mantine-color-gray-5)' }} />
        </Tooltip>
      );
    }
    // Fallback for other providers
    return (
      <Tooltip label={`Synced to ${syncInfo.provider} on ${syncInfo.syncedAt ? new Date(syncInfo.syncedAt).toLocaleDateString() : 'unknown date'}`}>
        <IconCloudCheck size={16} style={{ color: 'var(--mantine-color-green-5)' }} />
      </Tooltip>
    );
  }

  return null;
};

export function ActionList({
  viewName,
  actions,
  selectedActionIds = new Set(),
  onSelectionChange,
  showCheckboxes = true,
  showProject = false,
  enableBulkEditForOverdue = false,
  onOverdueBulkAction,
  onOverdueBulkReschedule,
  enableBulkEditForProject = false,
  onProjectBulkDelete,
  onProjectBulkAssignProject,
  enableBulkEditForFocus = false,
  onFocusBulkDelete,
  onFocusBulkReschedule,
  enableBulkEditForInbox = false,
  onInboxBulkSchedule,
  onInboxBulkDelete,
  onInboxBulkAssignProject,
  enableBulkEditForAll = false,
  onAllBulkDelete,
  onAllBulkReschedule,
  onAllBulkAssignProject,
  schedulingSuggestions,
  schedulingSuggestionsLoading = false,
  _schedulingSuggestionsError,
  _calendarConnected = true,
  onApplySchedulingSuggestion,
  onDismissSchedulingSuggestion,
  applyingSuggestionId,
  isLoading = false,
  deepLinkActionId,
  onActionOpen,
  onActionClose,
  onTagClick,
}: {
  viewName: string,
  actions: Action[],
  selectedActionIds?: Set<string>,
  onSelectionChange?: (ids: Set<string>) => void,
  showCheckboxes?: boolean,
  showProject?: boolean,
  enableBulkEditForOverdue?: boolean,
  onOverdueBulkAction?: (action: 'delete', actionIds: string[]) => void,
  onOverdueBulkReschedule?: (date: Date | null, actionIds: string[]) => void,
  enableBulkEditForProject?: boolean,
  onProjectBulkDelete?: (actionIds: string[]) => void,
  onProjectBulkAssignProject?: (projectId: string, actionIds: string[]) => Promise<void>,
  enableBulkEditForFocus?: boolean,
  onFocusBulkDelete?: (actionIds: string[]) => void,
  onFocusBulkReschedule?: (date: Date | null, actionIds: string[]) => void,
  enableBulkEditForInbox?: boolean,
  onInboxBulkSchedule?: (date: Date | null, actionIds: string[]) => Promise<void>,
  onInboxBulkDelete?: (actionIds: string[]) => Promise<void>,
  onInboxBulkAssignProject?: (projectId: string, actionIds: string[]) => Promise<void>,
  enableBulkEditForAll?: boolean,
  onAllBulkDelete?: (actionIds: string[]) => Promise<void>,
  onAllBulkReschedule?: (date: Date | null, actionIds: string[]) => Promise<void>,
  onAllBulkAssignProject?: (projectId: string, actionIds: string[]) => Promise<void>,
  // AI Scheduling suggestions props
  schedulingSuggestions?: Map<string, SchedulingSuggestionData>,
  schedulingSuggestionsLoading?: boolean,
  _schedulingSuggestionsError?: string | null,
  _calendarConnected?: boolean,
  onApplySchedulingSuggestion?: (actionId: string, suggestedDate: string, suggestedTime: string) => void,
  onDismissSchedulingSuggestion?: (actionId: string) => void,
  applyingSuggestionId?: string | null,
  isLoading?: boolean,
  // Deep linking props
  deepLinkActionId?: string | null,
  onActionOpen?: (id: string) => void,
  onActionClose?: () => void,
  onTagClick?: (tagId: string) => void,
}) {
  const [filter, setFilter] = useState<"ACTIVE" | "COMPLETED">("ACTIVE");
  const [selectedAction, setSelectedAction] = useState<Action | null>(null);
  const [editModalOpened, setEditModalOpened] = useState(false);
  const [assignModalOpened, setAssignModalOpened] = useState(false);
  const [assignSelectedAction, setAssignSelectedAction] = useState<Action | null>(null);
  const [bulkEditOverdueMode, setBulkEditOverdueMode] = useState(false);
  const [selectedOverdueActionIds, setSelectedOverdueActionIds] = useState<Set<string>>(new Set());
  const [bulkEditProjectMode, setBulkEditProjectMode] = useState(false);
  const [selectedProjectActionIds, setSelectedProjectActionIds] = useState<Set<string>>(new Set());
  const [selectedProjectBulkProjectId, setSelectedProjectBulkProjectId] = useState<string | null>(null);
  const [bulkEditFocusMode, setBulkEditFocusMode] = useState(false);
  const [selectedFocusActionIds, setSelectedFocusActionIds] = useState<Set<string>>(new Set());
  const [bulkEditInboxMode, setBulkEditInboxMode] = useState(false);
  const [selectedInboxActionIds, setSelectedInboxActionIds] = useState<Set<string>>(new Set());
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [bulkEditAllMode, setBulkEditAllMode] = useState(false);
  const [selectedAllActionIds, setSelectedAllActionIds] = useState<Set<string>>(new Set());
  const [selectedAllProjectId, setSelectedAllProjectId] = useState<string | null>(null);
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const utils = api.useUtils();

  // Deep link: fetch action by ID when URL has ?action=<id> and it's not in the current list
  const deepLinkHandled = useRef(false);
  const { data: deepLinkedAction } = api.action.getById.useQuery(
    { id: deepLinkActionId! },
    { enabled: !!deepLinkActionId && !deepLinkHandled.current },
  );

  // Auto-open modal when deep link action is available
  useEffect(() => {
    if (!deepLinkActionId || deepLinkHandled.current) return;

    // First check if the action exists in the current list
    const actionInList = actions.find(a => a.id === deepLinkActionId);
    if (actionInList) {
      setSelectedAction(actionInList);
      setEditModalOpened(true);
      deepLinkHandled.current = true;
      return;
    }

    // Otherwise use the fetched action
    if (deepLinkedAction) {
      setSelectedAction(deepLinkedAction as Action);
      setEditModalOpened(true);
      deepLinkHandled.current = true;
    }
  }, [deepLinkActionId, actions, deepLinkedAction]);

  // Reset deep link tracking when the action ID changes
  useEffect(() => {
    deepLinkHandled.current = false;
  }, [deepLinkActionId]);

  // Fetch projects for bulk assignment dropdown (when inbox or general bulk edit is enabled)
  const projectsQuery = api.project.getAll.useQuery(undefined, {
    enabled: enableBulkEditForInbox || enableBulkEditForAll || enableBulkEditForProject,
  });
  
  const updateAction = api.action.update.useMutation({
    onMutate: async ({ id, status }) => {
      // Cancel outgoing refetches
      await Promise.all([
        utils.action.getAll.cancel(),
        utils.action.getToday.cancel()
      ]);
      
      // Snapshot the previous values
      const previousState = {
        actions: utils.action.getAll.getData(),
        todayActions: utils.action.getToday.getData()
      };
      
      // Helper function to update action in the getAll list (with syncs)
      const updateActionInGetAllList = (old: ActionWithSyncs[] | undefined): ActionWithSyncs[] => {
        if (!old) return [];
        return old.map((action) =>
          action.id === id 
            ? { ...action, status: status as string } 
            : action
        );
      };

      // Helper function to update action in the getToday list (without syncs)
      const updateActionInGetTodayList = (old: ActionWithoutSyncs[] | undefined): ActionWithoutSyncs[] => {
        if (!old) return [];
        return old.map((action) =>
          action.id === id 
            ? { ...action, status: status as string } 
            : action
        );
      };

      // Optimistically update both caches
      utils.action.getAll.setData(undefined, updateActionInGetAllList);
      utils.action.getToday.setData(undefined, updateActionInGetTodayList);
      
      return previousState;
    },
    
    onError: (err: any, _variables: any, context: any) => {
      if (!context) return;
      // Restore both caches on error
      utils.action.getAll.setData(undefined, context.actions);
      utils.action.getToday.setData(undefined, context.todayActions);
    },
    
    onSettled: (data) => {
      // Invalidate queries after mutation finishes (non-blocking for faster UI)
      const projectId = data?.projectId;
      if (viewName === 'transcription-actions') {
        void utils.action.getByTranscription.invalidate();
      } else if (viewName.toLowerCase() === 'today') {
        void utils.action.getToday.invalidate();
      } else if (projectId) {
        void utils.action.getProjectActions.invalidate({ projectId });
      } else {
        void utils.action.getAll.invalidate();
      }
      // Also invalidate scoring queries for productivity updates
      void utils.scoring.getTodayScore.invalidate();
      void utils.scoring.getProductivityStats.invalidate();
    },
  });;

  // Lists feature - fetch workspace lists and mutations
  const { workspaceId } = useWorkspace();
  const { data: workspaceLists } = api.list.list.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId }
  );

  const addToList = api.list.addAction.useMutation({
    onSettled: async () => {
      await Promise.all([
        utils.action.getAll.invalidate(),
        utils.view.getViewActions.invalidate(),
        utils.list.list.invalidate(),
      ]);
    },
  });

  const removeFromList = api.list.removeAction.useMutation({
    onSettled: async () => {
      await Promise.all([
        utils.action.getAll.invalidate(),
        utils.view.getViewActions.invalidate(),
        utils.list.list.invalidate(),
      ]);
    },
  });

  const handleCheckboxChange = (actionId: string, checked: boolean) => {
    const action = actions.find(a => a.id === actionId);
    const newStatus = checked ? "COMPLETED" : "ACTIVE";
    
    // Prepare the update payload
    const updatePayload: any = {
      id: actionId,
      status: newStatus,
    };
    
    // If action is in a project and we're completing it, update kanban status to DONE
    if (action?.projectId && checked) {
      updatePayload.kanbanStatus = "DONE";
    }
    // If action is in a project and we're unchecking it, revert to TODO
    else if (action?.projectId && !checked) {
      updatePayload.kanbanStatus = "TODO";
    }
    
    updateAction.mutate(updatePayload);
  };

  const handleActionClick = (action: Action) => {
    if (onActionOpen) {
      onActionOpen(action.id);
    } else {
      setSelectedAction(action);
      setEditModalOpened(true);
    }
  };

  // --- Filtering Logic --- 
  console.log("[ActionList] Initial Actions Prop:", actions);
  console.log("[ActionList] ViewName Prop:", viewName);
  console.log("[ActionList] Filter State:", filter);

  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalize today to the start of the day

  // Find overdue actions (scheduled before today, status ACTIVE)
  const overdueActions = actions.filter(action => {
    if (!action.scheduledStart || action.status !== 'ACTIVE') return false;
    const normalizedScheduledDate = new Date(action.scheduledStart);
    normalizedScheduledDate.setHours(0, 0, 0, 0);
    return normalizedScheduledDate < today;
  }).sort(sortByPriority);
  console.log("[ActionList] Calculated Overdue Actions:", overdueActions);
  
  // Debug log for overdue actions with selection context
  console.log('🔧 [SELECTION DEBUG] Overdue actions analysis:', {
    viewName,
    totalActions: actions.length,
    overdueCount: overdueActions.length,
    bulkEditEnabled: enableBulkEditForOverdue,
    hasRescheduleCallback: !!onOverdueBulkReschedule,
    overdueActions: overdueActions.map(action => ({
      id: action.id,
      name: action.name,
      dueDate: action.dueDate?.toISOString(),
      priority: action.priority
    })),
    currentSelection: Array.from(selectedOverdueActionIds)
  });

  // Create a Set of overdue action IDs for quick lookup
  const overdueActionIds = new Set(overdueActions.map(a => a.id));

  // Filter the main list actions
  const filteredActions = (() => {
    
    // Initial filter based on viewName (excluding items already in the overdue list)
    const viewFilteredPreStatus = actions.filter(action => 
      !overdueActionIds.has(action.id) // Exclude actions already marked as overdue
    ).filter(action => {
      // Normalize action scheduled date for comparison if it exists
      let normalizedScheduledDate: Date | null = null;
      if (action.scheduledStart) {
        normalizedScheduledDate = new Date(action.scheduledStart);
        normalizedScheduledDate.setHours(0, 0, 0, 0);
      }

      // Calculate tomorrow for filtering
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      switch (viewName.toLowerCase()) {
        case 'inbox':
          // Show untriaged actions (no due date, no scheduled start, AND no project assigned)
          return !action.dueDate && !action.scheduledStart && !action.projectId;
        case 'today':
          // Check if the action is scheduled for today
          return normalizedScheduledDate?.getTime() === today.getTime();
        case 'tomorrow':
          // Check if the action is scheduled for tomorrow
          return normalizedScheduledDate?.getTime() === tomorrow.getTime();
        case 'upcoming':
          // Check if the action is scheduled after tomorrow
          return normalizedScheduledDate && normalizedScheduledDate > tomorrow;
        default:
          if (viewName.startsWith('project-')) {
            // Extract project ID by splitting from the last hyphen (more robust)
            // This handles both old format (name-1-id) and new format (name_1-id)
            const parts = viewName.split('-');
            const projectId = parts[parts.length - 1]; // Get the last part (the actual project ID)
            return action.projectId === projectId;
          }
          return true; // Show all non-overdue if viewName doesn't match known types
      }
    });
    console.log("[ActionList] View Filtered (Pre-Status):", viewFilteredPreStatus);

    // Then filter by status (ACTIVE/COMPLETED) and sort accordingly
    const finalFiltered = viewFilteredPreStatus
      .filter((action) => action.status === filter)
      .sort((a, b) => {
        // For completed actions, sort by completion date (most recent first)
        if (filter === "COMPLETED") {
          const aCompletedAt = (a as any).completedAt;
          const bCompletedAt = (b as any).completedAt;

          // Handle null/undefined completion dates
          if (!aCompletedAt && !bCompletedAt) return a.id.localeCompare(b.id);
          if (!aCompletedAt) return 1; // Push items without completion date to the end
          if (!bCompletedAt) return -1;

          // Sort by completion date descending (most recent first)
          return new Date(bCompletedAt).getTime() - new Date(aCompletedAt).getTime();
        }

        // For active actions, sort by priority
        return sortByPriority(a, b);
      });
    console.log("[ActionList] Final Filtered Actions:", finalFiltered);
    return finalFiltered;
  })();
  // --- End Filtering Logic ---

  // Helper functions for overdue bulk operations
  const handleSelectAllOverdue = () => {
    const allOverdueIds = overdueActions.map(action => action.id);
    console.log('🔧 [SELECTION DEBUG] Select All Overdue clicked:', {
      overdueCount: overdueActions.length,
      overdueIds: allOverdueIds,
      previousSelectionSize: selectedOverdueActionIds.size
    });
    
    setSelectedOverdueActionIds(new Set(allOverdueIds));
  };

  const handleSelectNoneOverdue = () => {
    console.log('🔧 [SELECTION DEBUG] Select None Overdue clicked:', {
      previousSelectionSize: selectedOverdueActionIds.size,
      clearedIds: Array.from(selectedOverdueActionIds)
    });
    
    setSelectedOverdueActionIds(new Set());
  };

  const handleOverdueBulkDelete = () => {
    if (selectedOverdueActionIds.size === 0 || !onOverdueBulkAction) return;
    
    if (window.confirm(`Are you sure you want to delete ${selectedOverdueActionIds.size} overdue actions?`)) {
      onOverdueBulkAction('delete', Array.from(selectedOverdueActionIds));
      setSelectedOverdueActionIds(new Set());
    }
  };

  const handleOverdueBulkReschedule = (date: Date | null) => {
    console.log('🔧 [SELECTION DEBUG] handleOverdueBulkReschedule called:', {
      date: date?.toISOString() || null,
      selectedCount: selectedOverdueActionIds.size,
      selectedIds: Array.from(selectedOverdueActionIds),
      hasCallback: !!onOverdueBulkReschedule,
      timestamp: new Date().toISOString()
    });

    if (selectedOverdueActionIds.size === 0) {
      console.log('🔧 [SELECTION DEBUG] No actions selected - returning early');
      return;
    }

    if (!onOverdueBulkReschedule) {
      console.log('🔧 [SELECTION DEBUG] No onOverdueBulkReschedule callback provided - returning early');
      return;
    }

    // Log the actual actions being rescheduled
    const selectedActions = overdueActions.filter(action => selectedOverdueActionIds.has(action.id));
    console.log('🔧 [SELECTION DEBUG] Selected actions details:', {
      selectedActions: selectedActions.map(action => ({
        id: action.id,
        name: action.name,
        currentDueDate: action.dueDate?.toISOString() || null,
        priority: action.priority
      }))
    });
    
    console.log('🔧 [SELECTION DEBUG] Calling onOverdueBulkReschedule...');
    onOverdueBulkReschedule(date, Array.from(selectedOverdueActionIds));
    
    console.log('🔧 [SELECTION DEBUG] Clearing selection state');
    setSelectedOverdueActionIds(new Set());
  };

  // Helper functions for project bulk operations
  const handleSelectAllProject = () => {
    const allProjectIds = filteredActions.map(action => action.id);
    setSelectedProjectActionIds(new Set(allProjectIds));
  };

  const handleSelectNoneProject = () => {
    setSelectedProjectActionIds(new Set());
  };

  const handleProjectBulkDelete = () => {
    if (selectedProjectActionIds.size === 0 || !onProjectBulkDelete) return;

    if (window.confirm(`Are you sure you want to delete ${selectedProjectActionIds.size} actions?`)) {
      onProjectBulkDelete(Array.from(selectedProjectActionIds));
      setSelectedProjectActionIds(new Set());
      setBulkEditProjectMode(false);
    }
  };

  const handleProjectBulkAssignProject = async () => {
    if (selectedProjectActionIds.size === 0 || !selectedProjectBulkProjectId || !onProjectBulkAssignProject) return;

    await onProjectBulkAssignProject(selectedProjectBulkProjectId, Array.from(selectedProjectActionIds));
    setSelectedProjectActionIds(new Set());
    setSelectedProjectBulkProjectId(null);
    setBulkEditProjectMode(false);
  };

  // Helper functions for focus view bulk operations (today, this week, this month)
  const handleSelectAllFocus = () => {
    const allFocusIds = filteredActions.map(action => action.id);
    setSelectedFocusActionIds(new Set(allFocusIds));
  };

  const handleSelectNoneFocus = () => {
    setSelectedFocusActionIds(new Set());
  };

  const handleFocusBulkDelete = () => {
    if (selectedFocusActionIds.size === 0 || !onFocusBulkDelete) return;

    if (window.confirm(`Are you sure you want to delete ${selectedFocusActionIds.size} actions?`)) {
      onFocusBulkDelete(Array.from(selectedFocusActionIds));
      setSelectedFocusActionIds(new Set());
      setBulkEditFocusMode(false);
    }
  };

  const handleFocusBulkReschedule = (date: Date | null) => {
    if (selectedFocusActionIds.size === 0 || !onFocusBulkReschedule) return;

    onFocusBulkReschedule(date, Array.from(selectedFocusActionIds));
    setSelectedFocusActionIds(new Set());
  };

  // Helper functions for inbox bulk operations
  const handleSelectAllInbox = () => {
    const inboxActionIds = filteredActions
      .filter(a => !a.dueDate && !a.projectId)
      .map(a => a.id);
    setSelectedInboxActionIds(new Set(inboxActionIds));
  };

  const handleSelectNoneInbox = () => {
    setSelectedInboxActionIds(new Set());
  };

  const handleInboxBulkDelete = async () => {
    if (selectedInboxActionIds.size === 0 || !onInboxBulkDelete) return;

    if (window.confirm(`Are you sure you want to delete ${selectedInboxActionIds.size} actions?`)) {
      await onInboxBulkDelete(Array.from(selectedInboxActionIds));
      setSelectedInboxActionIds(new Set());
      setBulkEditInboxMode(false);
    }
  };

  const handleInboxBulkSchedule = async (date: Date | null) => {
    if (selectedInboxActionIds.size === 0 || !onInboxBulkSchedule) return;

    await onInboxBulkSchedule(date, Array.from(selectedInboxActionIds));
    setSelectedInboxActionIds(new Set());
  };

  const handleInboxBulkAssignProject = async () => {
    if (selectedInboxActionIds.size === 0 || !selectedProjectId || !onInboxBulkAssignProject) return;

    await onInboxBulkAssignProject(selectedProjectId, Array.from(selectedInboxActionIds));
    setSelectedInboxActionIds(new Set());
    setSelectedProjectId(null);
    setBulkEditInboxMode(false);
  };

  // Helper functions for general bulk operations (actions page)
  const handleSelectAllGeneral = () => {
    const allIds = filteredActions.map(action => action.id);
    setSelectedAllActionIds(new Set(allIds));
  };

  const handleSelectNoneGeneral = () => {
    setSelectedAllActionIds(new Set());
  };

  const handleAllBulkDelete = async () => {
    if (selectedAllActionIds.size === 0 || !onAllBulkDelete) return;

    if (window.confirm(`Are you sure you want to delete ${selectedAllActionIds.size} actions?`)) {
      await onAllBulkDelete(Array.from(selectedAllActionIds));
      setSelectedAllActionIds(new Set());
      setBulkEditAllMode(false);
    }
  };

  const handleAllBulkReschedule = async (date: Date | null) => {
    if (selectedAllActionIds.size === 0 || !onAllBulkReschedule) return;

    await onAllBulkReschedule(date, Array.from(selectedAllActionIds));
    setSelectedAllActionIds(new Set());
  };

  const handleAllBulkAssignProject = async () => {
    if (selectedAllActionIds.size === 0 || !selectedAllProjectId || !onAllBulkAssignProject) return;

    await onAllBulkAssignProject(selectedAllProjectId, Array.from(selectedAllActionIds));
    setSelectedAllActionIds(new Set());
    setSelectedAllProjectId(null);
    setBulkEditAllMode(false);
  };

  // Helper to render a single action item (used for both lists)
  const renderActionItem = (action: Action, isOverdue: boolean) => (
    <Paper
      key={action.id}
      py="sm"
      className="transition-all hover:shadow-md cursor-pointer mb-3 border-b border-border-primary rounded-none"
      style={{
        background: 'transparent',
        marginBottom: '0',
      }}
      onClick={(e) => {
        // Only open modal if we didn't click the checkbox
        if (!(e.target as HTMLElement).closest('.checkbox-wrapper') && 
            !(e.target as HTMLElement).closest('.bulk-checkbox-wrapper') &&
            !(e.target as HTMLElement).closest('.overdue-bulk-checkbox-wrapper')) {
          handleActionClick(action);
        }
      }}
    >
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group gap="md" wrap="nowrap" className="min-w-0 flex-1">
          {/* Bulk selection checkbox for regular actions */}
          {onSelectionChange && showCheckboxes && !isOverdue && (
            <div className="bulk-checkbox-wrapper">
              <Checkbox
                size="sm"
                checked={selectedActionIds.has(action.id)}
                onChange={(event) => {
                  const newSelected = new Set(selectedActionIds);
                  if (event.currentTarget.checked) {
                    newSelected.add(action.id);
                  } else {
                    newSelected.delete(action.id);
                  }
                  onSelectionChange(newSelected);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
          {/* Bulk selection checkbox for overdue actions when bulk edit is enabled */}
          {isOverdue && bulkEditOverdueMode && enableBulkEditForOverdue && (
            <div className="overdue-bulk-checkbox-wrapper">
              <Checkbox
                size="sm"
                checked={selectedOverdueActionIds.has(action.id)}
                onChange={(event) => {
                  const isChecked = event.currentTarget.checked;
                  console.log(`🔧 [SELECTION DEBUG] Checkbox changed for action ${action.id}:`, {
                    actionId: action.id,
                    actionName: action.name,
                    isChecked,
                    previouslySelected: selectedOverdueActionIds.has(action.id),
                    currentSelectionSize: selectedOverdueActionIds.size
                  });

                  const newSelected = new Set(selectedOverdueActionIds);
                  if (isChecked) {
                    newSelected.add(action.id);
                    console.log(`🔧 [SELECTION DEBUG] Added ${action.id} to selection`);
                  } else {
                    newSelected.delete(action.id);
                    console.log(`🔧 [SELECTION DEBUG] Removed ${action.id} from selection`);
                  }

                  console.log(`🔧 [SELECTION DEBUG] Selection updated:`, {
                    previousSize: selectedOverdueActionIds.size,
                    newSize: newSelected.size,
                    selectedIds: Array.from(newSelected)
                  });

                  setSelectedOverdueActionIds(newSelected);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
          {/* Bulk selection checkbox for project actions when bulk edit is enabled */}
          {!isOverdue && bulkEditProjectMode && enableBulkEditForProject && (
            <div className="bulk-checkbox-wrapper">
              <Checkbox
                size="sm"
                checked={selectedProjectActionIds.has(action.id)}
                onChange={(event) => {
                  const newSelected = new Set(selectedProjectActionIds);
                  if (event.currentTarget.checked) {
                    newSelected.add(action.id);
                  } else {
                    newSelected.delete(action.id);
                  }
                  setSelectedProjectActionIds(newSelected);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
          {/* Bulk selection checkbox for focus view actions when bulk edit is enabled */}
          {!isOverdue && bulkEditFocusMode && enableBulkEditForFocus && (
            <div className="bulk-checkbox-wrapper">
              <Checkbox
                size="sm"
                checked={selectedFocusActionIds.has(action.id)}
                onChange={(event) => {
                  const newSelected = new Set(selectedFocusActionIds);
                  if (event.currentTarget.checked) {
                    newSelected.add(action.id);
                  } else {
                    newSelected.delete(action.id);
                  }
                  setSelectedFocusActionIds(newSelected);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
          {/* Bulk selection checkbox for inbox actions when bulk edit is enabled */}
          {!isOverdue && bulkEditInboxMode && enableBulkEditForInbox && !action.dueDate && (
            <div className="bulk-checkbox-wrapper">
              <Checkbox
                size="sm"
                checked={selectedInboxActionIds.has(action.id)}
                onChange={(event) => {
                  const newSelected = new Set(selectedInboxActionIds);
                  if (event.currentTarget.checked) {
                    newSelected.add(action.id);
                  } else {
                    newSelected.delete(action.id);
                  }
                  setSelectedInboxActionIds(newSelected);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
          {/* Bulk selection checkbox for general actions page when bulk edit is enabled */}
          {!isOverdue && bulkEditAllMode && enableBulkEditForAll && (
            <div className="bulk-checkbox-wrapper">
              <Checkbox
                size="sm"
                checked={selectedAllActionIds.has(action.id)}
                onChange={(event) => {
                  const newSelected = new Set(selectedAllActionIds);
                  if (event.currentTarget.checked) {
                    newSelected.add(action.id);
                  } else {
                    newSelected.delete(action.id);
                  }
                  setSelectedAllActionIds(newSelected);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
          <div className="checkbox-wrapper pl-1"> {/* Added padding for alignment */}
            <Checkbox
              size="md"
              radius="xl"
              checked={action.status === "COMPLETED"}
              onChange={(event) => {
                handleCheckboxChange(action.id, event.currentTarget.checked);
              }}
              disabled={updateAction.isPending}
              styles={{
                input: {
                  borderColor: action.priority === '1st Priority' ? 'var(--mantine-color-red-filled)' :
                    action.priority === '2nd Priority' ? 'var(--mantine-color-orange-filled)' :
                    action.priority === '3rd Priority' ? 'var(--mantine-color-yellow-filled)' :
                    action.priority === '4th Priority' ? 'var(--mantine-color-green-filled)' :
                    action.priority === '5th Priority' ? 'var(--mantine-color-blue-filled)' :
                    action.priority === 'Quick' ? 'var(--mantine-color-violet-filled)' :
                    action.priority === 'Scheduled' ? 'var(--mantine-color-pink-filled)' :
                    action.priority === 'Errand' ? 'var(--mantine-color-cyan-filled)' :
                    action.priority === 'Remember' ? 'var(--mantine-color-indigo-filled)' :
                    action.priority === 'Watch' ? 'var(--mantine-color-grape-filled)' :
                    'var(--color-border-primary)', // Default checkbox border
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  flexShrink: 0,
                },
              }}
            />
          </div>
          <div className="truncate flex-grow">
            <HTMLContent html={action.name} className="text-text-primary" />
            <Group gap="xs" align="center" className="mt-1">
              {action.dueDate && (
                <Group gap={4} align="center" className={`text-xs ${isOverdue ? 'text-red-500' : 'text-text-muted'}`}>
                  <IconCalendar size={12} />
                  <span>{formatDate(action.dueDate)}</span>
                </Group>
              )}
              {/* Scheduled time indicator */}
              {(() => {
                const actionWithSchedule = action as typeof action & { scheduledStart?: Date | null; duration?: number | null };
                if (actionWithSchedule.scheduledStart) {
                  return (
                    <Tooltip label={`Scheduled${actionWithSchedule.duration ? ` for ${actionWithSchedule.duration} min` : ''}`}>
                      <Badge
                        size="sm"
                        variant="light"
                        color="blue"
                        leftSection={<IconClock size={10} />}
                      >
                        {formatScheduledTime(actionWithSchedule.scheduledStart)}
                      </Badge>
                    </Tooltip>
                  );
                }
                return null;
              })()}
              <SyncStatusIndicator action={action} />

              {/* Tags */}
              {(() => {
                const actionWithTags = action as typeof action & {
                  tags?: Array<{ tag: { id: string; name: string; slug: string; color: string } }>;
                };
                if (actionWithTags.tags && actionWithTags.tags.length > 0) {
                  return (
                    <TagBadgeList
                      tags={actionWithTags.tags.map(t => t.tag)}
                      maxDisplay={2}
                      size="xs"
                      onTagClick={onTagClick}
                    />
                  );
                }
                return null;
              })()}

              {/* Project badge */}
              {showProject && action.project && (
                <Badge size="sm" variant="light" color="gray">
                  {action.project.name}
                </Badge>
              )}

              {/* Show "From [Creator]" indicator if task was created by someone else */}
              {currentUserId && action.createdById !== currentUserId && action.createdBy && (
                <HoverCard width={200} shadow="md">
                  <HoverCard.Target>
                    <Badge
                      size="sm"
                      variant="light"
                      color="blue"
                      leftSection={<IconUserShare size={12} />}
                      className="cursor-pointer"
                    >
                      From {action.createdBy.name?.split(' ')[0] ?? 'Unknown'}
                    </Badge>
                  </HoverCard.Target>
                  <HoverCard.Dropdown>
                    <Group gap="sm">
                      <Avatar
                        src={action.createdBy.image}
                        alt={action.createdBy.name ?? 'User'}
                        radius="xl"
                        size="md"
                        styles={{
                          root: {
                            backgroundColor: action.createdBy.image ? undefined : getAvatarColor(getColorSeed(action.createdBy.name, action.createdBy.email)),
                            color: action.createdBy.image ? undefined : getTextColor(getAvatarColor(getColorSeed(action.createdBy.name, action.createdBy.email))),
                            fontWeight: 600,
                          }
                        }}
                      >
                        {!action.createdBy.image && getInitial(action.createdBy.name, action.createdBy.email)}
                      </Avatar>
                      <div>
                        <Text size="sm" fw={500}>
                          {action.createdBy.name ?? "Unknown User"}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Assigned this to you
                        </Text>
                      </div>
                    </Group>
                  </HoverCard.Dropdown>
                </HoverCard>
              )}

              {/* Assignees */}
              {action.assignees && action.assignees.length > 0 && (
                <Avatar.Group spacing="xs">
                  {action.assignees.slice(0, 2).map((assignee: any) => {
                    const colorSeed = getColorSeed(assignee.user.name, assignee.user.email);
                    const backgroundColor = assignee.user.image ? undefined : getAvatarColor(colorSeed);
                    const textColor = backgroundColor ? getTextColor(backgroundColor) : 'white';
                    const initial = getInitial(assignee.user.name, assignee.user.email);
                    
                    return (
                      <HoverCard key={assignee.user.id} width={200} shadow="md">
                        <HoverCard.Target>
                          <Avatar
                            size="sm"
                            src={assignee.user.image}
                            alt={assignee.user.name || assignee.user.email || 'User'}
                            radius="xl"
                            className="cursor-pointer"
                            styles={{
                              root: {
                                backgroundColor: backgroundColor,
                                color: textColor,
                                fontWeight: 600,
                                fontSize: '12px',
                              }
                            }}
                          >
                            {!assignee.user.image && initial}
                          </Avatar>
                        </HoverCard.Target>
                      <HoverCard.Dropdown>
                        <Group gap="sm">
                          <Avatar
                            src={assignee.user.image}
                            alt={assignee.user.name || assignee.user.email || 'User'}
                            radius="xl"
                            styles={{
                              root: {
                                backgroundColor: backgroundColor,
                                color: textColor,
                                fontWeight: 600,
                                fontSize: '14px',
                              }
                            }}
                          >
                            {!assignee.user.image && initial}
                          </Avatar>
                          <div>
                            <Text size="sm" fw={500}>
                              {assignee.user.name || "Unknown User"}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {assignee.user.email}
                            </Text>
                          </div>
                        </Group>
                      </HoverCard.Dropdown>
                    </HoverCard>
                  );
                })}
                  {action.assignees.length > 2 && (
                    <Tooltip label={`${action.assignees.length - 2} more assignees`}>
                      <Avatar 
                        size="sm" 
                        radius="xl" 
                        className="cursor-pointer"
                        color="gray"
                        styles={{
                          root: {
                            backgroundColor: 'var(--mantine-color-gray-6)',
                            color: 'white',
                            fontWeight: 600,
                            fontSize: '10px',
                          }
                        }}
                      >
                        +{action.assignees.length - 2}
                      </Avatar>
                    </Tooltip>
                  )}
                </Avatar.Group>
              )}
            </Group>
          </div>
        </Group>
        
        {/* Action Menu */}
        <Menu shadow="md" width={200} position="bottom-end">
          <Menu.Target>
            <ActionIcon
              variant="subtle"
              size="sm"
              aria-label="Open action menu"
              onClick={(e) => e.stopPropagation()}
            >
              <IconDots size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconEdit size={16} />}>
              Edit
            </Menu.Item>
            <Menu.Item
              onClick={(e) => {
                e.stopPropagation();
                setAssignSelectedAction(action);
                setAssignModalOpened(true);
              }}
            >
              Assign
            </Menu.Item>
            <Menu.Divider />
            <Menu.Label>Lists</Menu.Label>
            {workspaceLists?.map((list) => {
              const isInList = action.lists?.some(
                (al) => al.listId === list.id
              );
              return (
                <Menu.Item
                  key={list.id}
                  leftSection={<IconList size={14} />}
                  rightSection={isInList ? <IconCheck size={14} /> : null}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isInList) {
                      removeFromList.mutate({ listId: list.id, actionId: action.id });
                    } else {
                      addToList.mutate({ listId: list.id, actionId: action.id });
                    }
                  }}
                >
                  {list.name}
                </Menu.Item>
              );
            })}
            {(!workspaceLists || workspaceLists.length === 0) && (
              <Menu.Item disabled>No lists yet</Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
      </Group>

      {/* AI Scheduling Suggestion - only shown for overdue actions with suggestions */}
      {isOverdue && schedulingSuggestions?.has(action.id) && onApplySchedulingSuggestion && onDismissSchedulingSuggestion && (
        <SchedulingSuggestion
          suggestion={schedulingSuggestions.get(action.id)!}
          onApply={onApplySchedulingSuggestion}
          onDismiss={onDismissSchedulingSuggestion}
          isApplying={applyingSuggestionId === action.id}
        />
      )}
    </Paper>
  );

  return (
    <>
      {/* Overdue Section - hidden for inbox view since inbox shows untriaged (no date) items */}
      {overdueActions.length > 0 && viewName.toLowerCase() !== 'inbox' && (
        <Accordion 
          defaultValue="overdue" 
          radius="md" 
          className="mb-4"
          chevronPosition="left"
          classNames={{
            root: 'bg-surface-secondary',
            item: 'bg-surface-secondary border-border-primary',
            control: 'bg-surface-secondary text-text-primary hover:bg-surface-hover',
            panel: 'bg-surface-secondary'
          }}
        >
          <Accordion.Item value="overdue" className="border-none">
            <Group justify="space-between" wrap="nowrap" className="pr-2">
              <Accordion.Control className="flex-1">
                <Group gap="xs">
                  <Text fw={500}>Overdue</Text>
                  <Badge variant="filled" color="red" size="sm">
                    {overdueActions.length}
                  </Badge>
                  {/* AI Scheduling indicator */}
                  {schedulingSuggestionsLoading && (
                    <Badge variant="light" color="blue" size="xs">
                      AI analyzing...
                    </Badge>
                  )}
                  {!schedulingSuggestionsLoading && schedulingSuggestions && schedulingSuggestions.size > 0 && (
                    <Tooltip label="AI scheduling suggestions available">
                      <Badge variant="light" color="green" size="xs">
                        {schedulingSuggestions.size} AI suggestions
                      </Badge>
                    </Tooltip>
                  )}
                </Group>
              </Accordion.Control>
              {/* Show bulk edit toggle for overdue actions - outside Accordion.Control to avoid nested buttons */}
              {enableBulkEditForOverdue && (
                <Button
                  size="xs"
                  variant={bulkEditOverdueMode ? "filled" : "light"}
                  color={bulkEditOverdueMode ? "blue" : "gray"}
                  leftSection={<IconEdit size={12} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    setBulkEditOverdueMode(!bulkEditOverdueMode);
                    if (bulkEditOverdueMode) {
                      setSelectedOverdueActionIds(new Set());
                    }
                  }}
                >
                  {bulkEditOverdueMode ? 'Exit' : 'Bulk reschedule'}
                </Button>
              )}
            </Group>
            <Accordion.Panel p={0}>
              {/* Bulk actions for overdue items */}
              {bulkEditOverdueMode && enableBulkEditForOverdue && (
                <Paper p="md" mb="md" className="bg-surface-secondary border-b border-border-primary">
                  <Group justify="space-between" align="center">
                    <Group gap="md">
                      <Button
                        size="xs"
                        variant="light"
                        onClick={handleSelectAllOverdue}
                      >
                        Select All
                      </Button>
                      <Button
                        size="xs"
                        variant="light"
                        onClick={handleSelectNoneOverdue}
                      >
                        Select None
                      </Button>
                      {selectedOverdueActionIds.size > 0 && (
                        <Badge variant="filled" color="blue">
                          {selectedOverdueActionIds.size} selected
                        </Badge>
                      )}
                    </Group>
                    {selectedOverdueActionIds.size > 0 && (
                      <Group gap="xs">
                        <UnifiedDatePicker
                          value={null}
                          onChange={(date) => {
                            handleOverdueBulkReschedule(date);
                          }}
                          mode="bulk"
                          selectedCount={selectedOverdueActionIds.size}
                          triggerText="Reschedule Selected"
                          notificationContext="action"
                          disabled={selectedOverdueActionIds.size === 0}
                        />
                        <Button
                          size="xs"
                          variant="filled"
                          color="red"
                          onClick={handleOverdueBulkDelete}
                          leftSection={<IconTrash size={12} />}
                        >
                          Delete Selected
                        </Button>
                      </Group>
                    )}
                  </Group>
                </Paper>
              )}
              {overdueActions.map(action => renderActionItem(action, true))}
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      )}

      {/* Main Action List (Today/Upcoming/Inbox/Project) */}
      <Group justify="space-between" mb="md" className="flex-col sm:flex-row gap-4">
        {/* Consider making the title dynamic based on viewName */}
        {/* <h2 className="text-xl font-semibold capitalize">{viewName.startsWith('project-') ? viewName.split('-')[1] : viewName} View</h2>  */}
        <button
          onClick={() => setFilter(filter === "ACTIVE" ? "COMPLETED" : "ACTIVE")}
          className="text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          Show: {filter === "ACTIVE" ? "Active" : "Completed"}
        </button>
        {(enableBulkEditForProject || enableBulkEditForFocus || enableBulkEditForInbox || enableBulkEditForAll) && (
          <Button
            size="xs"
            variant="subtle"
            onClick={() => {
              if (enableBulkEditForAll) {
                setBulkEditAllMode(!bulkEditAllMode);
                setSelectedAllActionIds(new Set());
              } else if (enableBulkEditForProject) {
                setBulkEditProjectMode(!bulkEditProjectMode);
                setSelectedProjectActionIds(new Set());
              } else if (enableBulkEditForFocus) {
                setBulkEditFocusMode(!bulkEditFocusMode);
                setSelectedFocusActionIds(new Set());
              } else if (enableBulkEditForInbox) {
                setBulkEditInboxMode(!bulkEditInboxMode);
                setSelectedInboxActionIds(new Set());
              }
            }}
          >
            {(bulkEditProjectMode || bulkEditFocusMode || bulkEditInboxMode || bulkEditAllMode) ? "Exit" : "Bulk edit"}
          </Button>
        )}
      </Group>

      {/* Bulk actions toolbar for project tasks */}
      {bulkEditProjectMode && enableBulkEditForProject && (
        <Group mb="md" gap="sm" wrap="wrap">
          <Button size="xs" variant="light" onClick={handleSelectAllProject}>
            Select All
          </Button>
          <Button size="xs" variant="light" onClick={handleSelectNoneProject}>
            Select None
          </Button>
          <Badge>{selectedProjectActionIds.size} selected</Badge>
          <Select
            placeholder="Move to project"
            size="xs"
            data={projectsQuery.data?.map((p) => ({ value: p.id, label: p.name })) ?? []}
            value={selectedProjectBulkProjectId}
            onChange={setSelectedProjectBulkProjectId}
            disabled={selectedProjectActionIds.size === 0}
            clearable
            searchable
            w={180}
          />
          {selectedProjectBulkProjectId && selectedProjectActionIds.size > 0 && (
            <Button
              size="xs"
              variant="filled"
              onClick={() => void handleProjectBulkAssignProject()}
            >
              Move
            </Button>
          )}
          <Button
            size="xs"
            variant="filled"
            color="red"
            leftSection={<IconTrash size={12} />}
            disabled={selectedProjectActionIds.size === 0}
            onClick={handleProjectBulkDelete}
          >
            Delete Selected
          </Button>
        </Group>
      )}

      {/* Bulk actions toolbar for focus view tasks (today, this week, this month) */}
      {bulkEditFocusMode && enableBulkEditForFocus && (
        <Group mb="md" gap="sm">
          <Button size="xs" variant="light" onClick={handleSelectAllFocus}>
            Select All
          </Button>
          <Button size="xs" variant="light" onClick={handleSelectNoneFocus}>
            Select None
          </Button>
          <Badge>{selectedFocusActionIds.size} selected</Badge>
          <UnifiedDatePicker
            value={null}
            onChange={(date) => handleFocusBulkReschedule(date)}
            mode="bulk"
            selectedCount={selectedFocusActionIds.size}
            triggerText="Reschedule"
            notificationContext="action"
            disabled={selectedFocusActionIds.size === 0}
          />
          <Button
            size="xs"
            variant="filled"
            color="red"
            leftSection={<IconTrash size={12} />}
            disabled={selectedFocusActionIds.size === 0}
            onClick={handleFocusBulkDelete}
          >
            Delete Selected
          </Button>
        </Group>
      )}

      {/* Bulk actions toolbar for inbox tasks */}
      {bulkEditInboxMode && enableBulkEditForInbox && (
        <Group mb="md" gap="sm">
          <Button size="xs" variant="light" onClick={handleSelectAllInbox}>
            Select All
          </Button>
          <Button size="xs" variant="light" onClick={handleSelectNoneInbox}>
            Select None
          </Button>
          <Badge>{selectedInboxActionIds.size} selected</Badge>
          <Select
            placeholder="Assign to project"
            size="xs"
            data={projectsQuery.data?.map((p) => ({ value: p.id, label: p.name })) ?? []}
            value={selectedProjectId}
            onChange={setSelectedProjectId}
            disabled={selectedInboxActionIds.size === 0}
            clearable
            searchable
            w={180}
          />
          {selectedProjectId && selectedInboxActionIds.size > 0 && (
            <Button
              size="xs"
              variant="filled"
              onClick={() => void handleInboxBulkAssignProject()}
            >
              Assign
            </Button>
          )}
          <UnifiedDatePicker
            value={null}
            onChange={(date) => void handleInboxBulkSchedule(date)}
            mode="bulk"
            selectedCount={selectedInboxActionIds.size}
            triggerText="Schedule"
            notificationContext="action"
            disabled={selectedInboxActionIds.size === 0}
          />
          <Button
            size="xs"
            variant="filled"
            color="red"
            leftSection={<IconTrash size={12} />}
            disabled={selectedInboxActionIds.size === 0}
            onClick={() => void handleInboxBulkDelete()}
          >
            Delete Selected
          </Button>
        </Group>
      )}

      {/* Bulk actions toolbar for general actions page */}
      {bulkEditAllMode && enableBulkEditForAll && (
        <Group mb="md" gap="sm" wrap="wrap">
          <Button size="xs" variant="light" onClick={handleSelectAllGeneral}>
            Select All
          </Button>
          <Button size="xs" variant="light" onClick={handleSelectNoneGeneral}>
            Select None
          </Button>
          <Badge>{selectedAllActionIds.size} selected</Badge>
          <Select
            placeholder="Assign to project"
            size="xs"
            data={projectsQuery.data?.map((p) => ({ value: p.id, label: p.name })) ?? []}
            value={selectedAllProjectId}
            onChange={setSelectedAllProjectId}
            disabled={selectedAllActionIds.size === 0}
            clearable
            searchable
            w={180}
          />
          {selectedAllProjectId && selectedAllActionIds.size > 0 && (
            <Button
              size="xs"
              variant="filled"
              onClick={() => void handleAllBulkAssignProject()}
            >
              Assign
            </Button>
          )}
          <UnifiedDatePicker
            value={null}
            onChange={(date) => void handleAllBulkReschedule(date)}
            mode="bulk"
            selectedCount={selectedAllActionIds.size}
            triggerText="Reschedule"
            notificationContext="action"
            disabled={selectedAllActionIds.size === 0}
          />
          <Button
            size="xs"
            variant="filled"
            color="red"
            leftSection={<IconTrash size={12} />}
            disabled={selectedAllActionIds.size === 0}
            onClick={() => void handleAllBulkDelete()}
          >
            Delete Selected
          </Button>
        </Group>
      )}

      {filteredActions.length > 0
        ? filteredActions.map(action => renderActionItem(action, false))
        : viewName.toLowerCase() === 'inbox' && filter === 'ACTIVE' && !isLoading
          ? <InboxZeroCelebration />
          : isLoading
            ? <Text c="dimmed" ta="center" mt="lg">Loading...</Text>
            : <Text c="dimmed" ta="center" mt="lg">No {filter.toLowerCase()} actions in this view.</Text>
      }

      <EditActionModal
        action={selectedAction}
        opened={editModalOpened}
        onClose={() => {
          setEditModalOpened(false);
          setSelectedAction(null);
          onActionClose?.();
        }}
      />
      
      {assignSelectedAction && (
        <AssignActionModal
          opened={assignModalOpened}
          onClose={() => {
            setAssignModalOpened(false);
            setAssignSelectedAction(null);
          }}
          actionId={assignSelectedAction.id}
          actionName={assignSelectedAction.name}
          projectId={assignSelectedAction.projectId}
          currentAssignees={assignSelectedAction.assignees || []}
        />
      )}
    </>
  );
} 