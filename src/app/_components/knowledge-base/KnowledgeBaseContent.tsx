'use client';

import {
  Container,
  Title,
  Card,
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
} from '@tabler/icons-react';
import { useState, useRef } from 'react';
import { api } from '~/trpc/react';
import { useDisclosure } from '@mantine/hooks';

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

interface KnowledgeBaseContentProps {
  workspaceId?: string;
  isLoading?: boolean;
}

export function KnowledgeBaseContent({ workspaceId, isLoading: externalLoading }: KnowledgeBaseContentProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const [activeTab, setActiveTab] = useState<string | null>('resources');
  const [searchQuery, setSearchQuery] = useState('');

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
    {},
    { enabled: true }
  );

  const { data: resourcesData, isLoading: resourcesLoading, refetch: refetchResources } = api.resource.list.useQuery(
    { limit: 50, workspaceId },
    { enabled: true }
  );

  // Use unified search that includes both transcriptions AND resources
  const searchMutation = api.mastra.queryMeetingContext.useMutation();

  // Trigger search when query changes
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.length > 2) {
      searchMutation.mutate({ query, topK: 10 });
    }
  };

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
          backfillMutation.mutate({ limit: 20, skipExisting: true });
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

  const handleBackfill = () => {
    // Start batch processing
    isBackfillingRef.current = true;
    setBackfillProgress({ isRunning: true, totalProcessed: 0, totalFailed: 0 });
    backfillMutation.mutate({ limit: 20, skipExisting: true });
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

  return (
    <Container size="lg" className="py-8">
      <Group justify="space-between" mb="xl">
        <div>
          <Title order={1} className="text-3xl font-bold text-text-primary">
            Knowledge Base
          </Title>
          <Text className="text-text-secondary mt-1">
            {subtitle}
          </Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} color="brand" onClick={open}>
          Add Resource
        </Button>
      </Group>

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
                    ? `Processing batch ${Math.floor(backfillProgress.totalProcessed / 20) + 1}... (up to 60 seconds per batch)`
                    : 'Preparing next batch...'}
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
          <Tabs.Tab value="search" leftSection={<IconSearch size={16} />}>
            Search
          </Tabs.Tab>
        </Tabs.List>

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
              onChange={(e) => handleSearch(e.currentTarget.value)}
              className="mb-4"
              classNames={{
                input: 'bg-surface-primary border-border-primary text-text-primary',
              }}
            />

            {searchMutation.isPending ? (
              <Stack gap="md">
                <Skeleton height={60} />
                <Skeleton height={60} />
                <Skeleton height={60} />
              </Stack>
            ) : searchMutation.data?.results && searchMutation.data.results.length > 0 ? (
              <Stack gap="md">
                {searchMutation.data.results.map((result, idx) => {
                  if (!result) return null;
                  const contentType = 'contentType' in result ? result.contentType : undefined;
                  return (
                    <Card key={idx} className="bg-surface-primary border-border-primary" withBorder p="sm">
                      <Group justify="space-between" mb="xs">
                        <Group gap="xs">
                          <Badge size="sm" variant="light" color={result.sourceType === 'transcription' ? 'blue' : 'green'}>
                            {result.sourceType === 'transcription' ? 'Meeting' : (contentType ?? 'Resource')}
                          </Badge>
                          {result.sourceTitle && (
                            <Text size="xs" className="text-text-muted">
                              {result.sourceTitle}
                            </Text>
                          )}
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
                })}
              </Stack>
            ) : searchQuery.length > 2 && !searchMutation.isPending ? (
              <Text className="text-text-secondary text-center py-4">
                No results found for &quot;{searchQuery}&quot;
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
