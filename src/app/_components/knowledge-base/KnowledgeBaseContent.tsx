'use client';

import {
  Container,
  Title,
  Card,
  SegmentedControl,
  Text,
  Button,
  Group,
  Stack,
  Skeleton,
  Badge,
  Table,
  ActionIcon,
  Tooltip,
  Progress,
  TextInput,
  Textarea,
  Select,
  Modal,
  Tabs,
  Alert,
} from '@mantine/core';
import {
  IconDatabase,
  IconRefresh,
  IconTrash,
  IconPlus,
  IconSearch,
  IconFileText,
  IconLink,
  IconBookmark,
  IconNote,
  IconAlertCircle,
  IconCheck,
  IconPin,
  IconPinnedFilled,
  IconInfoCircle,
  IconBook,
  IconArchive,
  IconExternalLink,
} from '@tabler/icons-react';
import { useState, useRef } from 'react';
import Link from 'next/link';
import { api } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { useDebouncedValue, useDisclosure } from '@mantine/hooks';
import { keepPreviousData } from '@tanstack/react-query';

const contentTypeIcons = {
  web_page: IconLink,
  document: IconFileText,
  pdf: IconFileText,
  bookmark: IconBookmark,
  note: IconNote,
};

const contentTypeLabels = {
  web_page: 'Web Page',
  document: 'Document',
  pdf: 'PDF',
  bookmark: 'Bookmark',
  note: 'Note',
};

/** Hostname for a reading-list row, or null when the URL does not parse. */
function hostnameOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

interface KnowledgeBaseContentProps {
  workspaceId?: string;
  isLoading?: boolean;
}

export function KnowledgeBaseContent({ workspaceId, isLoading: externalLoading }: KnowledgeBaseContentProps) {
  const { workspaceSlug } = useWorkspace();
  const [opened, { open, close }] = useDisclosure(false);
  const [activeTab, setActiveTab] = useState<string | null>('resources');
  const [searchQuery, setSearchQuery] = useState('');

  // Reading list: a filtered view over Resources by read state. "unread"
  // is the queue (to_read + reading); "read" is the history.
  const [readingView, setReadingView] = useState<'unread' | 'read'>('unread');
  const [quickAdd, setQuickAdd] = useState({ url: '', title: '', note: '' });

  // Backfill progress tracking
  const [backfillProgress, setBackfillProgress] = useState<{
    isRunning: boolean;
    totalProcessed: number;
    totalFailed: number;
  }>({ isRunning: false, totalProcessed: 0, totalFailed: 0 });
  const isBackfillingRef = useRef(false);

  // Form state for new resource
  const [newResource, setNewResource] = useState({
    title: '',
    url: '',
    content: '',
    contentType: 'web_page' as const,
    description: '',
  });

  // Queries
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = api.mastra.getEmbeddingStats.useQuery(
    { workspaceId },
    { enabled: true }
  );

  const { data: resourcesData, isLoading: resourcesLoading, refetch: refetchResources } = api.resource.list.useQuery(
    { limit: 50, workspaceId },
    { enabled: true }
  );

  const {
    data: readingData,
    isLoading: readingLoading,
    refetch: refetchReading,
  } = api.resource.list.useQuery(
    { limit: 100, workspaceId, readStatus: readingView },
    // Only fetch while the Reading tab is showing; a mutation's refetch is a
    // no-op while hidden and the query refires on the next tab switch.
    { enabled: activeTab === 'reading', placeholderData: keepPreviousData }
  );

  // Debounce the typed query so we only search after the user pauses,
  // and use placeholderData so previous results stay visible during refetch
  // (prevents the results region from collapsing on every keystroke).
  const [debouncedQuery] = useDebouncedValue(searchQuery, 300);
  // workspaceId is required by queryMeetingContext (server-side guard).
  // Only enable the query once we know which workspace to scope to.
  const searchEnabled = debouncedQuery.length > 2 && Boolean(workspaceId);
  const searchQueryResult = api.mastra.queryMeetingContext.useQuery(
    { query: debouncedQuery, topK: 10, workspaceId: workspaceId ?? "" },
    {
      enabled: searchEnabled,
      placeholderData: keepPreviousData,
      staleTime: 30_000,
    },
  );

  // Mutations
  const backfillMutation = api.mastra.backfillTranscriptionEmbeddings.useMutation({
    onSuccess: async (data) => {
      console.log('[Backfill] Batch complete:', {
        processed: data.processed,
        successful: data.successful,
        failed: data.failed,
        isBackfillingRef: isBackfillingRef.current,
      });

      // Update progress
      setBackfillProgress(prev => ({
        ...prev,
        totalProcessed: prev.totalProcessed + data.successful,
        totalFailed: prev.totalFailed + data.failed,
      }));

      // Refetch stats to check if more remain
      const result = await refetchStats();
      const pending = result.data?.transcriptions.pendingEmbeddings ?? 0;

      console.log('[Backfill] Stats refreshed:', {
        pending,
        isBackfillingRef: isBackfillingRef.current,
        shouldContinue: isBackfillingRef.current && pending > 0 && data.processed > 0,
      });

      // If still running and more pending, continue processing
      if (isBackfillingRef.current && pending > 0 && data.processed > 0) {
        console.log('[Backfill] Scheduling next batch in 500ms...');
        // Small delay to avoid hammering the API
        setTimeout(() => {
          console.log('[Backfill] Starting next batch...');
          backfillMutation.mutate({ limit: 1, skipExisting: true });
        }, 500);
      } else {
        console.log('[Backfill] Stopping:', {
          reason: !isBackfillingRef.current ? 'user stopped' : pending === 0 ? 'no more pending' : 'no items processed',
        });
        // Done - reset state
        isBackfillingRef.current = false;
        setBackfillProgress(prev => ({ ...prev, isRunning: false }));
      }
    },
    onError: (error) => {
      console.error('[Backfill] Error:', error);
      isBackfillingRef.current = false;
      setBackfillProgress(prev => ({ ...prev, isRunning: false }));
    },
  });

  const createResourceMutation = api.resource.create.useMutation({
    onSuccess: () => {
      void refetchResources();
      void refetchStats();
      close();
      setNewResource({
        title: '',
        url: '',
        content: '',
        contentType: 'web_page',
        description: '',
      });
    },
  });

  const deleteResourceMutation = api.resource.delete.useMutation({
    onSuccess: () => {
      void refetchResources();
      void refetchStats();
    },
  });

  const regenerateEmbeddingsMutation = api.resource.regenerateEmbeddings.useMutation({
    onSuccess: () => {
      void refetchStats();
    },
  });

  const setPinnedMutation = api.resource.setPinned.useMutation({
    onSuccess: () => {
      void refetchResources();
    },
  });

  const refetchAllResources = () => {
    void refetchResources();
    void refetchReading();
    void refetchStats();
  };

  const quickAddMutation = api.resource.create.useMutation({
    onSuccess: () => {
      refetchAllResources();
      setQuickAdd({ url: '', title: '', note: '' });
    },
  });

  const setReadStatusMutation = api.resource.setReadStatus.useMutation({
    onSuccess: refetchAllResources,
  });

  const archiveResourceMutation = api.resource.archive.useMutation({
    onSuccess: refetchAllResources,
  });

  const quickAddUrlValid = (() => {
    try {
      const parsed = new URL(quickAdd.url.trim());
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  })();

  const handleQuickAdd = () => {
    if (!quickAddUrlValid) return;
    const url = quickAdd.url.trim();
    // A bare link has no body, so there is nothing to embed: the Reading
    // list is findable by title and URL, never by semantic search, until a
    // URL fetcher exists (follow-up to ticket pink.grape).
    quickAddMutation.mutate({
      title: quickAdd.title.trim() || (hostnameOf(url) ?? url),
      url,
      description: quickAdd.note.trim() || undefined,
      contentType: 'bookmark',
      readStatus: 'to_read',
      generateEmbeddings: false,
      workspaceId,
    });
  };

  const handleBackfill = () => {
    // Start batch processing
    isBackfillingRef.current = true;
    setBackfillProgress({ isRunning: true, totalProcessed: 0, totalFailed: 0 });
    backfillMutation.mutate({ limit: 1, skipExisting: true });
  };

  const handleStopBackfill = () => {
    isBackfillingRef.current = false;
    setBackfillProgress(prev => ({ ...prev, isRunning: false }));
  };

  const handleCreateResource = () => {
    if (!newResource.title) return;
    createResourceMutation.mutate({
      title: newResource.title,
      url: newResource.url || undefined,
      content: newResource.content || undefined,
      contentType: newResource.contentType,
      description: newResource.description || undefined,
      generateEmbeddings: true,
      workspaceId,
      // The modal is for reference material you already have, not a queue.
      readStatus: 'read',
    });
  };

  const handleDeleteResource = (id: string) => {
    if (confirm('Are you sure you want to delete this resource?')) {
      deleteResourceMutation.mutate({ id });
    }
  };

  if (externalLoading) {
    return (
      <Container size="lg" className="py-8">
        <Skeleton height={40} width={300} mb="xl" />
        <Skeleton height={200} mb="lg" />
        <Skeleton height={400} />
      </Container>
    );
  }

  const transcriptionProgress = stats
    ? (stats.transcriptions.withEmbeddings / Math.max(stats.transcriptions.total, 1)) * 100
    : 0;
  const resourceProgress = stats
    ? (stats.resources.withEmbeddings / Math.max(stats.resources.total, 1)) * 100
    : 0;

  const subtitle = workspaceId
    ? 'Manage documents, web pages, and meeting transcriptions for this workspace'
    : 'Manage documents, web pages, and meeting transcriptions across all workspaces';

  const permissionsTooltipLabel = workspaceId
    ? "You only see your own content scoped to this workspace. Legacy items that pre-date workspace assignment are also included. Other workspace members' content is not visible to you."
    : "You only see your own content. Results span every workspace you belong to — switch into a workspace to filter.";

  return (
    <Container size="lg" className="py-8">
      <Group justify="space-between" mb="md">
        <div>
          <Group gap="xs" align="center">
            <Title order={1} className="text-3xl font-bold text-text-primary">
              Knowledge Base
            </Title>
            <Tooltip label={permissionsTooltipLabel} multiline w={320} withArrow>
              <ActionIcon variant="subtle" color="gray" size="lg" aria-label="How permissions work">
                <IconInfoCircle size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
          <Text className="text-text-secondary mt-1">
            {subtitle}
          </Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} color="brand" onClick={open}>
          Add Resource
        </Button>
      </Group>

      <Alert
        icon={<IconInfoCircle size={16} />}
        color="blue"
        variant="light"
        mb="xl"
        className="border-border-primary"
      >
        <Text size="sm" className="text-text-primary">
          The Knowledge Base indexes your meeting transcriptions and saved resources (web pages,
          notes, documents) so you can search them by meaning, not just keywords. Search runs
          semantic similarity over stored embeddings; if that fails, it falls back to a basic
          keyword match across transcripts.
        </Text>
        <Text size="xs" className="text-text-muted mt-2">
          What it does: full-text + semantic search, pin resources for AI agent context, backfill embeddings for old meetings.
          What it doesn&apos;t do: edit transcripts in-place, preview internal notes (links open the source URL only), or share results with other users.
        </Text>
      </Alert>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card className="bg-surface-secondary border-border-primary" withBorder>
          <Group justify="space-between" mb="xs">
            <Text className="text-text-muted text-sm">Transcriptions</Text>
            <IconDatabase size={20} className="text-text-muted" />
          </Group>
          {statsLoading ? (
            <Skeleton height={24} />
          ) : (
            <>
              <Text className="text-2xl font-bold text-text-primary">
                {stats?.transcriptions.withEmbeddings ?? 0} / {stats?.transcriptions.total ?? 0}
              </Text>
              <Progress value={transcriptionProgress} size="sm" color="brand" mt="xs" />
              <Text size="xs" className="text-text-muted mt-1">
                {stats?.transcriptions.pendingEmbeddings ?? 0} pending
              </Text>
            </>
          )}
        </Card>

        <Card className="bg-surface-secondary border-border-primary" withBorder>
          <Group justify="space-between" mb="xs">
            <Text className="text-text-muted text-sm">Resources</Text>
            <IconFileText size={20} className="text-text-muted" />
          </Group>
          {statsLoading ? (
            <Skeleton height={24} />
          ) : (
            <>
              <Text className="text-2xl font-bold text-text-primary">
                {stats?.resources.withEmbeddings ?? 0} / {stats?.resources.total ?? 0}
              </Text>
              <Progress value={resourceProgress} size="sm" color="blue" mt="xs" />
              <Text size="xs" className="text-text-muted mt-1">
                {stats?.resources.pendingEmbeddings ?? 0} pending
              </Text>
            </>
          )}
        </Card>

        <Card className="bg-surface-secondary border-border-primary" withBorder>
          <Group justify="space-between" mb="xs">
            <Text className="text-text-muted text-sm">Total Chunks</Text>
            <IconDatabase size={20} className="text-text-muted" />
          </Group>
          {statsLoading ? (
            <Skeleton height={24} />
          ) : (
            <Text className="text-2xl font-bold text-text-primary">
              {stats?.totalChunks ?? 0}
            </Text>
          )}
          <Text size="xs" className="text-text-muted mt-3">
            Searchable text segments
          </Text>
        </Card>
      </div>

      {/* Backfill Alert - Show when pending and not currently running */}
      {stats && stats.transcriptions.pendingEmbeddings > 0 && !backfillProgress.isRunning && (
        <Alert
          icon={<IconAlertCircle size={16} />}
          color="yellow"
          className="mb-6"
          title="Transcriptions need indexing"
        >
          <Group justify="space-between" align="center">
            <Text size="sm">
              {stats.transcriptions.pendingEmbeddings} transcriptions haven&apos;t been indexed for semantic search yet.
            </Text>
            <Button
              size="xs"
              leftSection={<IconRefresh size={14} />}
              onClick={handleBackfill}
            >
              Index All
            </Button>
          </Group>
        </Alert>
      )}

      {/* Backfill Progress - Show during processing */}
      {backfillProgress.isRunning && (
        <Alert
          icon={<IconRefresh size={16} className="animate-spin" />}
          color="blue"
          className="mb-6"
          title="Indexing in progress..."
        >
          <Stack gap="xs">
            <Group justify="space-between" align="center">
              <Stack gap={2}>
                <Text size="sm">
                  Processed {backfillProgress.totalProcessed} transcriptions
                  {backfillProgress.totalFailed > 0 && ` (${backfillProgress.totalFailed} failed)`}
                  {stats && ` • ${stats.transcriptions.pendingEmbeddings} remaining`}
                </Text>
                <Text size="xs" className="text-blue-400 h-4">
                  {backfillMutation.isPending
                    ? `Embedding transcription ${backfillProgress.totalProcessed + backfillProgress.totalFailed + 1}...`
                    : 'Preparing next transcription...'}
                </Text>
              </Stack>
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                onClick={handleStopBackfill}
              >
                Stop
              </Button>
            </Group>
            {stats && (
              <Progress
                value={(backfillProgress.totalProcessed / (backfillProgress.totalProcessed + stats.transcriptions.pendingEmbeddings)) * 100}
                size="sm"
                color="blue"
                animated
              />
            )}
          </Stack>
        </Alert>
      )}

      {/* Backfill Results - Show when completed (not running and has processed) */}
      {!backfillProgress.isRunning && backfillProgress.totalProcessed > 0 && (
        <Alert
          icon={<IconCheck size={16} />}
          color="green"
          className="mb-6"
          title="Indexing Complete"
          withCloseButton
          onClose={() => setBackfillProgress({ isRunning: false, totalProcessed: 0, totalFailed: 0 })}
        >
          <Text size="sm">
            Processed {backfillProgress.totalProcessed} transcriptions.
            {backfillProgress.totalFailed > 0 && ` (${backfillProgress.totalFailed} failed)`}
          </Text>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List className="mb-4">
          <Tabs.Tab value="resources" leftSection={<IconFileText size={16} />}>
            Resources
          </Tabs.Tab>
          <Tabs.Tab value="reading" leftSection={<IconBook size={16} />}>
            Reading
          </Tabs.Tab>
          <Tabs.Tab value="search" leftSection={<IconSearch size={16} />}>
            Search
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="reading">
          <Card className="bg-surface-secondary border-border-primary mb-4" withBorder>
            <Text size="sm" fw={500} className="text-text-primary mb-2">
              Save something to read
            </Text>
            <Group align="flex-start" gap="sm" wrap="wrap">
              <TextInput
                placeholder="https://…"
                aria-label="URL"
                value={quickAdd.url}
                onChange={(e) => setQuickAdd({ ...quickAdd, url: e.currentTarget.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleQuickAdd();
                }}
                className="flex-1 min-w-[16rem]"
                classNames={{ input: 'bg-surface-primary border-border-primary text-text-primary' }}
                error={quickAdd.url.trim().length > 0 && !quickAddUrlValid ? 'Enter a full http(s) link' : undefined}
              />
              <TextInput
                placeholder="Title (optional)"
                aria-label="Title"
                value={quickAdd.title}
                onChange={(e) => setQuickAdd({ ...quickAdd, title: e.currentTarget.value })}
                className="flex-1 min-w-[12rem]"
                classNames={{ input: 'bg-surface-primary border-border-primary text-text-primary' }}
              />
              <TextInput
                placeholder="Note (optional)"
                aria-label="Note"
                value={quickAdd.note}
                onChange={(e) => setQuickAdd({ ...quickAdd, note: e.currentTarget.value })}
                className="flex-1 min-w-[12rem]"
                classNames={{ input: 'bg-surface-primary border-border-primary text-text-primary' }}
              />
              <Button
                color="brand"
                leftSection={<IconPlus size={16} />}
                onClick={handleQuickAdd}
                loading={quickAddMutation.isPending}
                disabled={!quickAddUrlValid}
              >
                Save
              </Button>
            </Group>
            <Text size="xs" className="text-text-muted mt-2">
              Saved links are listed here by title and link. They are not indexed for search until they have content.
            </Text>
          </Card>

          <Card className="bg-surface-secondary border-border-primary" withBorder>
            <Group justify="space-between" mb="md">
              <SegmentedControl
                size="xs"
                value={readingView}
                onChange={(value) => setReadingView(value as 'unread' | 'read')}
                data={[
                  { value: 'unread', label: 'To read' },
                  { value: 'read', label: 'Read' },
                ]}
              />
              {readingData?.resources && (
                <Text size="xs" className="text-text-muted">
                  {readingData.resources.length} {readingData.resources.length === 1 ? 'item' : 'items'}
                </Text>
              )}
            </Group>

            {readingLoading ? (
              <Stack gap="md">
                <Skeleton height={40} />
                <Skeleton height={40} />
                <Skeleton height={40} />
              </Stack>
            ) : readingData?.resources && readingData.resources.length > 0 ? (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th className="text-text-muted">Title</Table.Th>
                    <Table.Th className="text-text-muted">Source</Table.Th>
                    <Table.Th className="text-text-muted">{readingView === 'read' ? 'Read' : 'Saved'}</Table.Th>
                    <Table.Th className="text-text-muted">Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {readingData.resources.map((resource) => {
                    const host = hostnameOf(resource.url);
                    const isRead = resource.readStatus === 'read';
                    const whenLabel = isRead && resource.readAt
                      ? new Date(resource.readAt).toLocaleDateString()
                      : new Date(resource.createdAt).toLocaleDateString();
                    return (
                      <Table.Tr key={resource.id}>
                        <Table.Td>
                          <div>
                            {resource.url ? (
                              <a
                                href={resource.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-text-primary no-underline hover:underline inline-flex items-center gap-1"
                              >
                                <Text size="sm" component="span">{resource.title}</Text>
                                <IconExternalLink size={12} className="text-text-muted" />
                              </a>
                            ) : (
                              <Text size="sm" className="text-text-primary">{resource.title}</Text>
                            )}
                            {resource.description && (
                              <Text size="xs" className="text-text-muted line-clamp-2 max-w-md">
                                {resource.description}
                              </Text>
                            )}
                          </div>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" className="text-text-secondary">{host ?? '-'}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" className="text-text-secondary">{whenLabel}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <Tooltip label={isRead ? 'Mark as unread' : 'Mark as read'}>
                              <ActionIcon
                                variant={isRead ? 'subtle' : 'light'}
                                color={isRead ? 'gray' : 'brand'}
                                aria-label={isRead ? 'Mark as unread' : 'Mark as read'}
                                onClick={() =>
                                  setReadStatusMutation.mutate({
                                    id: resource.id,
                                    readStatus: isRead ? 'to_read' : 'read',
                                  })
                                }
                                loading={setReadStatusMutation.isPending && setReadStatusMutation.variables?.id === resource.id}
                              >
                                {isRead ? <IconBook size={16} /> : <IconCheck size={16} />}
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Archive">
                              <ActionIcon
                                variant="subtle"
                                color="gray"
                                aria-label="Archive"
                                onClick={() => archiveResourceMutation.mutate({ id: resource.id })}
                                loading={archiveResourceMutation.isPending && archiveResourceMutation.variables?.id === resource.id}
                              >
                                <IconArchive size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            ) : (
              <Stack align="center" py="xl">
                <IconBook size={48} className="text-text-muted" />
                <Text className="text-text-secondary">
                  {readingView === 'read' ? 'Nothing marked as read yet' : 'Nothing to read. Paste a link above to save one.'}
                </Text>
              </Stack>
            )}
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="resources">
          <Card className="bg-surface-secondary border-border-primary" withBorder>
            {resourcesLoading ? (
              <Stack gap="md">
                <Skeleton height={40} />
                <Skeleton height={40} />
                <Skeleton height={40} />
              </Stack>
            ) : resourcesData?.resources && resourcesData.resources.length > 0 ? (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th className="text-text-muted">Title</Table.Th>
                    <Table.Th className="text-text-muted">Type</Table.Th>
                    <Table.Th className="text-text-muted">Words</Table.Th>
                    <Table.Th className="text-text-muted">Context</Table.Th>
                    <Table.Th className="text-text-muted">Created</Table.Th>
                    <Table.Th className="text-text-muted">Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {resourcesData.resources.map((resource) => {
                    const TypeIcon = contentTypeIcons[resource.contentType as keyof typeof contentTypeIcons] ?? IconFileText;
                    return (
                      <Table.Tr key={resource.id}>
                        <Table.Td>
                          <Group gap="sm">
                            <TypeIcon size={16} className="text-text-muted" />
                            <div>
                              <Text size="sm" className="text-text-primary">
                                {resource.title}
                              </Text>
                              {resource.url && (
                                <Text size="xs" className="text-text-muted truncate max-w-xs">
                                  {resource.url}
                                </Text>
                              )}
                            </div>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Badge variant="light" size="sm">
                            {contentTypeLabels[resource.contentType as keyof typeof contentTypeLabels] ?? resource.contentType}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" className="text-text-secondary">
                            {resource.wordCount ?? '-'}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Tooltip label={resource.pinnedAsContext ? 'Always injected into agent chat' : 'Pin to inject into every agent chat'}>
                            <ActionIcon
                              variant={resource.pinnedAsContext ? 'filled' : 'subtle'}
                              color={resource.pinnedAsContext ? 'brand' : 'gray'}
                              onClick={() => setPinnedMutation.mutate({ id: resource.id, pinned: !resource.pinnedAsContext })}
                              loading={setPinnedMutation.isPending}
                            >
                              {resource.pinnedAsContext ? <IconPinnedFilled size={16} /> : <IconPin size={16} />}
                            </ActionIcon>
                          </Tooltip>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" className="text-text-secondary">
                            {new Date(resource.createdAt).toLocaleDateString()}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <Tooltip label="Regenerate embeddings">
                              <ActionIcon
                                variant="subtle"
                                onClick={() => regenerateEmbeddingsMutation.mutate({ id: resource.id })}
                                loading={regenerateEmbeddingsMutation.isPending}
                              >
                                <IconRefresh size={16} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Delete">
                              <ActionIcon
                                variant="subtle"
                                color="red"
                                onClick={() => handleDeleteResource(resource.id)}
                                loading={deleteResourceMutation.isPending}
                              >
                                <IconTrash size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            ) : (
              <Stack align="center" py="xl">
                <IconDatabase size={48} className="text-text-muted" />
                <Text className="text-text-secondary">No resources yet</Text>
                <Button variant="light" leftSection={<IconPlus size={16} />} onClick={open}>
                  Add your first resource
                </Button>
              </Stack>
            )}
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="search">
          <Card className="bg-surface-secondary border-border-primary" withBorder>
            <TextInput
              placeholder="Search transcriptions and resources..."
              leftSection={<IconSearch size={16} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.currentTarget.value)}
              className="mb-4"
              classNames={{
                input: 'bg-surface-primary border-border-primary text-text-primary',
              }}
            />

            {searchEnabled && searchQueryResult.isLoading ? (
              <Stack gap="md">
                <Skeleton height={60} />
                <Skeleton height={60} />
                <Skeleton height={60} />
              </Stack>
            ) : searchQueryResult.data?.results && searchQueryResult.data.results.length > 0 ? (
              <Stack gap="md" style={{ opacity: searchQueryResult.isFetching ? 0.6 : 1, transition: 'opacity 150ms ease' }}>
                {searchQueryResult.data.results.map((result, idx) => {
                  if (!result) return null;
                  const contentType = 'contentType' in result ? result.contentType : undefined;
                  // Transcriptions → internal recording detail page.
                  // Resources → external source URL when present (web pages, bookmarks).
                  // Notes/documents without a URL stay non-clickable for now (no detail page yet).
                  const href =
                    result.sourceType === 'transcription'
                      ? `/recording/${result.sourceId}`
                      : result.sourceType === 'page'
                        ? (workspaceSlug
                            ? `/w/${workspaceSlug}/pages/${result.sourceId}`
                            : null)
                        : (result.url ?? null);
                  const isExternal = result.sourceType === 'resource' && !!result.url;

                  const card = (
                    <Card
                      className={`bg-surface-primary border-border-primary ${href ? 'hover:bg-surface-hover hover:border-border-focus transition-colors cursor-pointer' : ''}`}
                      withBorder
                      p="sm"
                    >
                      <Group justify="space-between" mb="xs">
                        <Group gap="xs">
                          <Badge size="sm" variant="light" color={result.sourceType === 'transcription' ? 'blue' : result.sourceType === 'page' ? 'violet' : 'green'}>
                            {result.sourceType === 'transcription' ? 'Meeting' : result.sourceType === 'page' ? 'Page' : (contentType ?? 'Resource')}
                          </Badge>
                          {result.sourceTitle && (
                            <Text size="xs" className="text-text-muted">
                              {result.sourceTitle}
                            </Text>
                          )}
                          {isExternal && <IconLink size={12} className="text-text-muted" />}
                        </Group>
                        <Text size="xs" className="text-text-muted">
                          {((result.relevanceScore ?? 0) * 100).toFixed(1)}% match
                        </Text>
                      </Group>
                      <Text size="sm" className="text-text-primary line-clamp-3">
                        {result.content}
                      </Text>
                      {result.meetingDate && (
                        <Text size="xs" className="text-text-muted mt-1">
                          {new Date(result.meetingDate).toLocaleDateString()}
                        </Text>
                      )}
                    </Card>
                  );

                  if (!href) {
                    return <div key={idx}>{card}</div>;
                  }
                  if (isExternal) {
                    return (
                      <a
                        key={idx}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block no-underline text-inherit"
                      >
                        {card}
                      </a>
                    );
                  }
                  return (
                    <Link key={idx} href={href} className="block no-underline text-inherit">
                      {card}
                    </Link>
                  );
                })}
              </Stack>
            ) : searchEnabled && !searchQueryResult.isFetching ? (
              <Text className="text-text-secondary text-center py-4">
                No results found for &quot;{debouncedQuery}&quot;
              </Text>
            ) : (
              <Text className="text-text-muted text-center py-4">
                Enter at least 3 characters to search transcriptions and resources
              </Text>
            )}
          </Card>
        </Tabs.Panel>
      </Tabs>

      {/* Add Resource Modal */}
      <Modal
        opened={opened}
        onClose={close}
        title="Add Resource"
        size="lg"
        classNames={{
          header: 'bg-surface-secondary border-b border-border-primary',
          body: 'bg-surface-secondary',
          title: 'text-text-primary font-semibold',
        }}
      >
        <Stack gap="md">
          <TextInput
            label="Title"
            placeholder="Enter a title"
            required
            value={newResource.title}
            onChange={(e) => setNewResource({ ...newResource, title: e.currentTarget.value })}
            classNames={{
              input: 'bg-surface-primary border-border-primary text-text-primary',
              label: 'text-text-secondary',
            }}
          />

          <Select
            label="Type"
            data={[
              { value: 'web_page', label: 'Web Page' },
              { value: 'document', label: 'Document' },
              { value: 'note', label: 'Note' },
              { value: 'bookmark', label: 'Bookmark' },
            ]}
            value={newResource.contentType}
            onChange={(value) => setNewResource({ ...newResource, contentType: value as 'web_page' })}
            classNames={{
              input: 'bg-surface-primary border-border-primary text-text-primary',
              label: 'text-text-secondary',
            }}
          />

          {(newResource.contentType === 'web_page' || newResource.contentType === 'bookmark') && (
            <TextInput
              label="URL"
              placeholder="https://..."
              value={newResource.url}
              onChange={(e) => setNewResource({ ...newResource, url: e.currentTarget.value })}
              classNames={{
                input: 'bg-surface-primary border-border-primary text-text-primary',
                label: 'text-text-secondary',
              }}
            />
          )}

          <Textarea
            label="Description"
            placeholder="Brief description (optional)"
            value={newResource.description}
            onChange={(e) => setNewResource({ ...newResource, description: e.currentTarget.value })}
            classNames={{
              input: 'bg-surface-primary border-border-primary text-text-primary',
              label: 'text-text-secondary',
            }}
          />

          <Textarea
            label="Content"
            placeholder="Paste or type content here..."
            minRows={6}
            value={newResource.content}
            onChange={(e) => setNewResource({ ...newResource, content: e.currentTarget.value })}
            classNames={{
              input: 'bg-surface-primary border-border-primary text-text-primary',
              label: 'text-text-secondary',
            }}
          />

          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={close} className="text-text-secondary">
              Cancel
            </Button>
            <Button
              color="brand"
              onClick={handleCreateResource}
              loading={createResourceMutation.isPending}
              disabled={!newResource.title}
            >
              Add Resource
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
