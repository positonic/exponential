'use client';

import { ActionIcon, Button, Group, Loader, Tooltip } from '@mantine/core';
import {
  IconBookmark,
  IconFolderMinus,
  IconPin,
  IconPinnedFilled,
  IconTrash,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { EmptyState } from '~/app/_components/ui';
import { resourceReaderHref } from '~/lib/resources/reader';
import { RowMain, SourceLink, shortDate } from './ResourceRowParts';
import styles from './KnowledgeBaseContent.module.css';

interface ProjectResourcesTabProps {
  projectId: string;
  workspaceSlug?: string | null;
  /** The viewer can edit the Project, so they may unfile what others filed under it. */
  canEdit: boolean;
}

/**
 * The Resources filed under a Project: where its members look for what any of
 * them saved (ADR-0082). The title opens the reader and a separate link goes
 * to the address the Resource was last saved from.
 *
 * What each person can do follows who owns the Resource. Its owner gets the
 * controls they have on the Knowledge page, and may unfile it. Someone who can
 * edit the Project may unfile a Resource they do not own, and nothing more.
 * Everyone else opens and reads. Read state is the owner's alone, so none is
 * shown here for anyone.
 */
export function ProjectResourcesTab({ projectId, workspaceSlug, canEdit }: ProjectResourcesTabProps) {
  const utils = api.useUtils();
  const list = api.resource.list.useInfiniteQuery(
    { projectId, limit: 50 },
    { getNextPageParam: (page) => page.nextCursor },
  );
  const refresh = () => void utils.resource.list.invalidate();
  const unfile = api.resource.unfile.useMutation({ onSuccess: refresh });
  const setPinned = api.resource.setPinned.useMutation({ onSuccess: refresh });
  const remove = api.resource.delete.useMutation({ onSuccess: refresh });

  if (list.isLoading) {
    return (
      <Group justify="center" p="xl">
        <Loader size="sm" />
      </Group>
    );
  }

  if (list.error) {
    return <EmptyState icon={IconBookmark} message="Resources for this project are only visible to its members." />;
  }

  const resources = list.data?.pages.flatMap((page) => page.resources) ?? [];

  if (resources.length === 0) {
    return (
      <EmptyState
        icon={IconBookmark}
        title="No pages filed under this project yet"
        message="Open a page in your browser and save it from the Chrome extension's Resources tab with this project selected. Everyone in the project will see it here."
      />
    );
  }

  return (
    <div>
      {resources.map((resource) => {
        const savedBy = resource.isMine ? 'you' : (resource.owner.name ?? 'a teammate');
        return (
          <div key={resource.id} className={styles.row}>
            <RowMain href={resourceReaderHref(resource.id, workspaceSlug)}>
              <IconBookmark size={14} stroke={1.75} className={styles.rowIcon} />
              <span className={styles.rowTitle}>{resource.title}</span>
              {resource.isMine && resource.pinnedAsContext && (
                <Tooltip label="Pinned: added to every agent chat">
                  <IconPinnedFilled size={12} style={{ color: 'var(--brand-400)', flexShrink: 0 }} />
                </Tooltip>
              )}
            </RowMain>
            <span className={styles.rowLabel}>
              Saved by {savedBy} · {shortDate(resource.createdAt)}
            </span>
            <SourceLink url={resource.url} />
            <div className={styles.rowActions}>
              {resource.isMine && (
                <Tooltip label={resource.pinnedAsContext ? 'Unpin from agent chats' : 'Pin to every agent chat'}>
                  <ActionIcon
                    variant="subtle"
                    color={resource.pinnedAsContext ? 'brand' : 'gray'}
                    size="sm"
                    aria-label={resource.pinnedAsContext ? 'Unpin' : 'Pin'}
                    onClick={() => setPinned.mutate({ id: resource.id, pinned: !resource.pinnedAsContext })}
                  >
                    {resource.pinnedAsContext ? <IconPinnedFilled size={14} /> : <IconPin size={14} />}
                  </ActionIcon>
                </Tooltip>
              )}
              {(resource.isMine || canEdit) && (
                <Tooltip
                  label={
                    resource.isMine
                      ? 'Unfile: take it out of this project. Only you will see it.'
                      : `Unfile: take it out of this project. It goes back to ${savedBy}.`
                  }
                >
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label="Unfile"
                    loading={unfile.isPending && unfile.variables?.id === resource.id}
                    onClick={() => unfile.mutate({ id: resource.id })}
                  >
                    <IconFolderMinus size={14} />
                  </ActionIcon>
                </Tooltip>
              )}
              {resource.isMine && (
                <Tooltip label="Delete">
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label="Delete"
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this resource?')) {
                        remove.mutate({ id: resource.id });
                      }
                    }}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Tooltip>
              )}
            </div>
          </div>
        );
      })}
      {list.hasNextPage && (
        <Group justify="center" mt="md">
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            loading={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            Show more
          </Button>
        </Group>
      )}
    </div>
  );
}
