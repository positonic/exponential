'use client';

import {
  Container,
  Title,
  Text,
  Button,
  Group,
  Stack,
  Skeleton,
  SimpleGrid,
  ActionIcon,
  Tooltip,
  TextInput,
  Textarea,
  Select,
  Modal,
  UnstyledButton,
  Box,
} from '@mantine/core';
import {
  IconSearch,
  IconSparkles,
  IconMicrophone,
  IconFileText,
  IconBook,
  IconLink,
  IconBookmark,
  IconNote,
  IconPlus,
  IconCheck,
  IconArrowBackUp,
  IconArchive,
  IconTrash,
  IconPin,
  IconPinnedFilled,
  IconInfoCircle,
  IconX,
} from '@tabler/icons-react';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { useDebouncedValue, useDisclosure } from '@mantine/hooks';
import { keepPreviousData } from '@tanstack/react-query';
import styles from './KnowledgeBaseContent.module.css';
import { classifyQuickSave } from './quickSave';
import { MarkdownRenderer } from '~/app/_components/shared/MarkdownRenderer';

const contentTypeIcons = {
  web_page: IconLink,
  document: IconFileText,
  pdf: IconFileText,
  bookmark: IconBookmark,
  note: IconNote,
};

const contentTypeLabels = {
  web_page: 'Web page',
  document: 'Document',
  pdf: 'PDF',
  bookmark: 'Bookmark',
  note: 'Note',
};

type ContentType = keyof typeof contentTypeLabels;

// Search filter chips. Each maps to the Knowledge index source types it
// covers; uploaded documents sit with Resources (both are saved, not authored).
type Filter = 'all' | 'meetings' | 'pages' | 'resources';
type SourceType = 'transcription' | 'page' | 'resource' | 'document';

const FILTERS: { id: Filter; label: string; icon: React.ElementType; sourceTypes?: SourceType[] }[] = [
  { id: 'all', label: 'All', icon: IconSparkles },
  { id: 'meetings', label: 'Meetings', icon: IconMicrophone, sourceTypes: ['transcription'] },
  { id: 'pages', label: 'Pages', icon: IconFileText, sourceTypes: ['page'] },
  { id: 'resources', label: 'Resources', icon: IconBook, sourceTypes: ['resource', 'document'] },
];

const LIST_LIMIT = 8;

/** Hostname for a row's label, or null when the URL does not parse. */
function hostnameOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function shortDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * The row's title: a link when there is somewhere to go (external URLs open
 * in a new tab), a button that opens the reader for a url-less row (a note),
 * plain text otherwise.
 */
function RowMain({
  href,
  external,
  onOpen,
  children,
}: {
  href: string | null;
  external?: boolean;
  onOpen?: () => void;
  children: React.ReactNode;
}) {
  if (!href && onOpen) {
    return (
      <button type="button" className={styles.rowMain} onClick={onOpen}>
        {children}
      </button>
    );
  }
  if (!href) return <div className={styles.rowMain}>{children}</div>;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={styles.rowMain}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={styles.rowMain}>
      {children}
    </Link>
  );
}

function RowSkeletons() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} height={30} mb={8} radius="sm" />
      ))}
    </>
  );
}

interface KnowledgeBaseContentProps {
  workspaceId?: string;
  isLoading?: boolean;
}

export function KnowledgeBaseContent({ workspaceId, isLoading: externalLoading }: KnowledgeBaseContentProps) {
  const { workspace, workspaceSlug } = useWorkspace();
  const [opened, { open, close }] = useDisclosure(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  // Reading list: a filtered view over Resources by read state. "unread"
  // is the queue (to_read + reading); "read" is the history.
  const [readingView, setReadingView] = useState<'unread' | 'read'>('unread');
  const [isSavingLink, setIsSavingLink] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');
  // The url-less Resource (a note) open in the reader modal.
  const [readingId, setReadingId] = useState<string | null>(null);

  // Form state for new resource
  const [newResource, setNewResource] = useState({
    title: '',
    url: '',
    content: '',
    contentType: 'web_page' as ContentType,
    description: '',
  });

  // Queries
  const {
    data: recentData,
    isLoading: recentLoading,
    refetch: refetchRecent,
  } = api.resource.list.useQuery({ limit: LIST_LIMIT, workspaceId });

  const {
    data: readingData,
    isLoading: readingLoading,
    refetch: refetchReading,
  } = api.resource.list.useQuery(
    { limit: LIST_LIMIT, workspaceId, readStatus: readingView },
    { placeholderData: keepPreviousData }
  );

  // Debounce the typed query so we only search after the user pauses,
  // and use placeholderData so previous results stay visible during refetch
  // (prevents the results region from collapsing on every keystroke).
  const [debouncedQuery] = useDebouncedValue(searchQuery, 300);
  const isSearching = debouncedQuery.trim().length > 2;
  // workspaceId is required by queryMeetingContext (server-side guard).
  // Only enable the query once we know which workspace to scope to.
  const searchEnabled = isSearching && Boolean(workspaceId);
  const activeFilter = FILTERS.find((f) => f.id === filter);
  const searchQueryResult = api.mastra.queryMeetingContext.useQuery(
    {
      query: debouncedQuery,
      // Results are chunks; ask for more than we show so de-duplicating to
      // one row per source still leaves a full list.
      topK: 24,
      workspaceId: workspaceId ?? '',
      sourceTypes: activeFilter?.sourceTypes,
    },
    {
      enabled: searchEnabled,
      placeholderData: keepPreviousData,
      staleTime: 30_000,
    },
  );

  const readerQuery = api.resource.get.useQuery(
    { id: readingId ?? '' },
    { enabled: Boolean(readingId) },
  );
  const readerResource = readingId ? readerQuery.data?.resource : undefined;
  const readerBody = (readerResource?.content ?? readerResource?.description ?? '').trim();

  // Mutations
  const refetchAllResources = () => {
    void refetchRecent();
    void refetchReading();
  };

  const createResourceMutation = api.resource.create.useMutation({
    onSuccess: () => {
      refetchAllResources();
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

  const saveLinkMutation = api.resource.create.useMutation({
    onSuccess: () => {
      refetchAllResources();
      setLinkDraft('');
      setIsSavingLink(false);
      setReadingView('unread');
    },
  });

  const deleteResourceMutation = api.resource.delete.useMutation({
    onSuccess: refetchAllResources,
  });

  const setPinnedMutation = api.resource.setPinned.useMutation({
    onSuccess: refetchAllResources,
  });

  const setReadStatusMutation = api.resource.setReadStatus.useMutation({
    onSuccess: refetchAllResources,
  });

  const archiveResourceMutation = api.resource.archive.useMutation({
    onSuccess: refetchAllResources,
  });

  const handleSaveLink = () => {
    const draft = classifyQuickSave(linkDraft);
    if (!draft || saveLinkMutation.isPending) return;
    if (draft.kind === 'link') {
      // A bare link has no body, so there is nothing to embed: the Reading
      // list is findable by title and URL, never by semantic search, until a
      // URL fetcher exists (follow-up to ticket pink.grape).
      saveLinkMutation.mutate({
        title: hostnameOf(draft.url) ?? draft.url,
        url: draft.url,
        contentType: 'bookmark',
        readStatus: 'to_read',
        generateEmbeddings: false,
        workspaceId,
      });
      return;
    }
    // Pasted text or markdown: the text is the body, so index it.
    saveLinkMutation.mutate({
      title: draft.title,
      content: draft.content,
      contentType: 'note',
      mimeType: 'text/markdown',
      readStatus: 'to_read',
      generateEmbeddings: true,
      workspaceId,
    });
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
      <Container size="sm" className="py-16">
        <Skeleton height={40} width={360} mx="auto" mb="xl" />
        <Skeleton height={58} mb="lg" />
        <Skeleton height={300} />
      </Container>
    );
  }

  const eyebrow = workspace?.name ? `${workspace.name} · Knowledge` : 'Knowledge · All workspaces';

  const visibilityNote = workspaceId
    ? 'Only you see what you save here. Search covers this workspace: your meetings, the pages you can open, and your resources.'
    : 'Only you see what you save here. Open a workspace to search its meetings and pages.';

  // One row per source: the first (most relevant) chunk wins.
  // The keyword fallback returns a narrower shape (no url/contentType) and
  // may contain nulls; normalise to one row type.
  const seenSources = new Set<string>();
  const searchResults = (searchQueryResult.data?.results ?? [])
    .flatMap((result) =>
      result
        ? [{
            ...result,
            url: 'url' in result ? result.url : undefined,
            contentType: 'contentType' in result ? result.contentType : undefined,
          }]
        : [],
    )
    .filter((result) => {
      const key = `${result.sourceType}:${result.sourceId}`;
      if (seenSources.has(key)) return false;
      seenSources.add(key);
      return true;
    })
    .slice(0, 12);

  const readingRows = readingData?.resources ?? [];
  const recentRows = recentData?.resources ?? [];

  const renderSearchResults = () => {
    if (!workspaceId) {
      return <div className={styles.empty}>Open a workspace to search its knowledge.</div>;
    }
    if (searchQueryResult.isLoading) return <RowSkeletons />;
    // An error is not "no matches" — say search failed so nobody concludes
    // the content isn't there.
    if (searchQueryResult.isError && searchResults.length === 0) {
      return <div className={styles.empty}>Search failed. Try again in a moment.</div>;
    }
    if (searchResults.length === 0) {
      return searchQueryResult.isFetching ? (
        <RowSkeletons />
      ) : (
        <div className={styles.empty}>No matches for &ldquo;{debouncedQuery}&rdquo;.</div>
      );
    }
    return (
      <div style={{ opacity: searchQueryResult.isFetching ? 0.6 : 1, transition: 'opacity 150ms ease' }}>
        {searchResults.map((result) => {
          const contentType = result.contentType as ContentType | undefined;
          const isExternal = result.sourceType === 'resource' && !!result.url;
          // Meetings → recording page; Pages → the page; Resources → their
          // source URL. Notes without a URL have no detail page yet.
          const href =
            result.sourceType === 'transcription'
              ? `/recording/${result.sourceId}`
              : result.sourceType === 'page'
                ? (workspaceSlug ? `/w/${workspaceSlug}/pages/${result.sourceId}` : null)
                : (result.url ?? null);
          const Icon =
            result.sourceType === 'transcription'
              ? IconMicrophone
              : result.sourceType === 'page'
                ? IconFileText
                : (contentType ? contentTypeIcons[contentType] : undefined) ?? IconBook;
          const label =
            result.sourceType === 'transcription'
              ? `Meeting${result.meetingDate ? ` · ${shortDate(result.meetingDate)}` : ''}`
              : result.sourceType === 'page'
                ? 'Page'
                : (contentType ? contentTypeLabels[contentType] : undefined) ?? 'Resource';
          return (
            <div key={`${result.sourceType}:${result.sourceId}`} className={styles.row}>
              <RowMain href={href} external={isExternal}>
                <Icon size={14} stroke={1.75} className={styles.rowIcon} />
                <span className={styles.rowTitle}>{result.sourceTitle.trim() ? result.sourceTitle : 'Untitled'}</span>
                <span className={styles.rowSnippet}>{result.content}</span>
              </RowMain>
              <span className={styles.rowLabel}>{label}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderReadingColumn = () => (
    <div>
      <div className={styles.colHeading}>
        <span>{readingView === 'unread' ? 'Up next to read' : 'Read'}</span>
        <Group gap={12} wrap="nowrap">
          <button
            type="button"
            className={styles.headingAction}
            data-active={readingView === 'read'}
            onClick={() => setReadingView(readingView === 'unread' ? 'read' : 'unread')}
          >
            {readingView === 'unread' ? 'History' : 'Up next'}
          </button>
          <button
            type="button"
            className={styles.headingAction}
            onClick={() => setIsSavingLink((v) => !v)}
          >
            <IconPlus size={12} stroke={2} />
            Save
          </button>
        </Group>
      </div>

      {isSavingLink && (
        <Textarea
          autoFocus
          autosize
          minRows={1}
          maxRows={8}
          size="sm"
          mb={6}
          placeholder="Paste a link, text or markdown and press Enter"
          description="Shift+Enter for a new line"
          aria-label="Link, text or markdown to read later"
          value={linkDraft}
          onChange={(e) => {
            setLinkDraft(e.currentTarget.value);
            if (saveLinkMutation.isError) saveLinkMutation.reset();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSaveLink();
            }
            if (e.key === 'Escape') {
              setIsSavingLink(false);
              setLinkDraft('');
            }
          }}
          error={saveLinkMutation.isError ? "Couldn't save that. Try again." : undefined}
          disabled={saveLinkMutation.isPending}
          rightSection={
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="Cancel"
              onClick={() => {
                setIsSavingLink(false);
                setLinkDraft('');
              }}
            >
              <IconX size={14} />
            </ActionIcon>
          }
        />
      )}

      {readingLoading ? (
        <RowSkeletons />
      ) : readingRows.length === 0 ? (
        <div className={styles.empty}>
          {readingView === 'unread'
            ? 'Nothing queued. Save a link or a note to read it later.'
            : 'Nothing marked as read yet.'}
        </div>
      ) : (
        readingRows.map((resource) => {
          const isRead = resource.readStatus === 'read';
          const host = hostnameOf(resource.url);
          const ReadingIcon = contentTypeIcons[resource.contentType as ContentType] ?? IconBookmark;
          return (
            <div key={resource.id} className={styles.row}>
              <RowMain href={resource.url} external onOpen={() => setReadingId(resource.id)}>
                <ReadingIcon size={14} stroke={1.75} className={styles.rowIcon} />
                <span className={styles.rowTitle}>{resource.title}</span>
              </RowMain>
              <span className={styles.rowLabel}>
                {isRead && resource.readAt
                  ? `Read ${shortDate(resource.readAt)}`
                  : host && host !== resource.title
                    ? host
                    : `Saved ${shortDate(resource.createdAt)}`}
              </span>
              <div className={styles.rowActions}>
                <Tooltip label={isRead ? 'Mark as unread' : 'Mark as read'}>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label={isRead ? 'Mark as unread' : 'Mark as read'}
                    onClick={() =>
                      setReadStatusMutation.mutate({ id: resource.id, readStatus: isRead ? 'to_read' : 'read' })
                    }
                  >
                    {isRead ? <IconArrowBackUp size={14} /> : <IconCheck size={14} />}
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Archive">
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label="Archive"
                    onClick={() => archiveResourceMutation.mutate({ id: resource.id })}
                  >
                    <IconArchive size={14} />
                  </ActionIcon>
                </Tooltip>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  const renderRecentColumn = () => (
    <div>
      <div className={styles.colHeading}>
        <span>Recently added</span>
        <button type="button" className={styles.headingAction} onClick={open}>
          <IconPlus size={12} stroke={2} />
          Add
        </button>
      </div>

      {recentLoading ? (
        <RowSkeletons />
      ) : recentRows.length === 0 ? (
        <div className={styles.empty}>Nothing saved yet. Add a note, document or web page.</div>
      ) : (
        recentRows.map((resource) => {
          const contentType = resource.contentType as ContentType;
          const Icon = contentTypeIcons[contentType] ?? IconFileText;
          return (
            <div key={resource.id} className={styles.row}>
              <RowMain href={resource.url} external onOpen={() => setReadingId(resource.id)}>
                <Icon size={14} stroke={1.75} className={styles.rowIcon} />
                <span className={styles.rowTitle}>{resource.title}</span>
                {resource.pinnedAsContext && (
                  <Tooltip label="Pinned: added to every agent chat">
                    <IconPinnedFilled size={12} style={{ color: 'var(--brand-400)', flexShrink: 0 }} />
                  </Tooltip>
                )}
              </RowMain>
              <span className={styles.rowLabel}>
                {contentTypeLabels[contentType] ?? resource.contentType} · {shortDate(resource.createdAt)}
              </span>
              <div className={styles.rowActions}>
                <Tooltip label={resource.pinnedAsContext ? 'Unpin from agent chats' : 'Pin to every agent chat'}>
                  <ActionIcon
                    variant="subtle"
                    color={resource.pinnedAsContext ? 'brand' : 'gray'}
                    size="sm"
                    aria-label={resource.pinnedAsContext ? 'Unpin' : 'Pin'}
                    onClick={() =>
                      setPinnedMutation.mutate({ id: resource.id, pinned: !resource.pinnedAsContext })
                    }
                  >
                    {resource.pinnedAsContext ? <IconPinnedFilled size={14} /> : <IconPin size={14} />}
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Delete">
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label="Delete"
                    onClick={() => handleDeleteResource(resource.id)}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Tooltip>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <div className={styles.stage}>
      <Text
        size="xs"
        tt="uppercase"
        style={{
          letterSpacing: '0.04em',
          color: 'var(--color-text-muted)',
          marginBottom: 20,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {eyebrow}
        <Tooltip label={visibilityNote} multiline w={300} withArrow>
          <IconInfoCircle
            size={13}
            stroke={1.75}
            aria-label="Who can see this"
            style={{ flexShrink: 0, cursor: 'help' }}
          />
        </Tooltip>
      </Text>

      <Title
        order={1}
        ta="center"
        style={{
          fontSize: 38,
          fontWeight: 500,
          letterSpacing: '-0.02em',
          marginBottom: 28,
          color: 'var(--color-text-primary)',
        }}
      >
        What do you want to <span style={{ color: 'var(--brand-400)' }}>find?</span>
      </Title>

      <div className={styles.inputWrap}>
        <TextInput
          placeholder="Search meetings, pages and resources…"
          aria-label="Search knowledge"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setSearchQuery('');
          }}
          leftSection={
            <IconSearch size={18} stroke={1.75} style={{ color: 'var(--color-text-muted)' }} />
          }
          rightSection={
            searchQuery ? (
              <ActionIcon variant="subtle" color="gray" aria-label="Clear search" onClick={() => setSearchQuery('')}>
                <IconX size={16} />
              </ActionIcon>
            ) : null
          }
          classNames={{ input: styles.input }}
          styles={{
            input: {
              height: 58,
              borderRadius: 'var(--radius-xl)',
              fontSize: 16,
              paddingLeft: 52,
              backgroundColor: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border-primary)',
              color: 'var(--color-text-primary)',
            },
          }}
        />
      </div>

      <Group gap={6} mt={16} justify="center" wrap="wrap">
        {FILTERS.map(({ id, label, icon: Icon }) => (
          <UnstyledButton
            key={id}
            className={styles.chip}
            data-active={filter === id}
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            <Icon size={12} stroke={1.75} />
            {label}
          </UnstyledButton>
        ))}
      </Group>

      <Container size={860} w="100%" mt={56} px={0}>
        {isSearching ? (
          <div>
            <div className={styles.colHeading}>
              <span>Results</span>
            </div>
            {renderSearchResults()}
          </div>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={32}>
            {renderReadingColumn()}
            {renderRecentColumn()}
          </SimpleGrid>
        )}
      </Container>

      {/* Reader for url-less Resources (notes) */}
      <Modal
        opened={Boolean(readingId)}
        onClose={() => setReadingId(null)}
        title={readerResource?.title ?? ''}
        size="lg"
        classNames={{
          header: 'bg-surface-secondary border-b border-border-primary',
          body: 'bg-surface-secondary',
          title: 'text-text-primary font-semibold',
        }}
      >
        {readerQuery.isLoading ? (
          <Stack gap="xs" pt="md">
            <Skeleton height={14} />
            <Skeleton height={14} />
            <Skeleton height={14} width="60%" />
          </Stack>
        ) : readerQuery.isError ? (
          <Text size="sm" pt="md" className="text-text-muted">
            Couldn&apos;t load this. Try again.
          </Text>
        ) : readerBody ? (
          <Box pt="md">
            <MarkdownRenderer content={readerBody} variant="prose" />
          </Box>
        ) : (
          <Text size="sm" pt="md" className="text-text-muted">
            Nothing saved in this one but its title.
          </Text>
        )}
        {readerResource && readerResource.readStatus !== 'read' && (
          <Group justify="flex-end" mt="lg">
            <Button
              color="brand"
              leftSection={<IconCheck size={14} />}
              loading={setReadStatusMutation.isPending}
              onClick={() =>
                setReadStatusMutation.mutate(
                  { id: readerResource.id, readStatus: 'read' },
                  { onSuccess: () => setReadingId(null) },
                )
              }
            >
              Mark as read
            </Button>
          </Group>
        )}
      </Modal>

      {/* Add Resource Modal */}
      <Modal
        opened={opened}
        onClose={close}
        title="Add to knowledge"
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
              { value: 'web_page', label: 'Web page' },
              { value: 'document', label: 'Document' },
              { value: 'note', label: 'Note' },
              { value: 'bookmark', label: 'Bookmark' },
            ]}
            value={newResource.contentType}
            onChange={(value) => setNewResource({ ...newResource, contentType: (value ?? 'web_page') as ContentType })}
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
            description="Pasted content is indexed, so search can find it by meaning."
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
              Add
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}
