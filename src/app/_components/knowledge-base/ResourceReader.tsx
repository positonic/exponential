'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Group, Loader, Skeleton, Text } from '@mantine/core';
import {
  IconArchive,
  IconArrowBackUp,
  IconArrowLeft,
  IconCheck,
  IconExternalLink,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { MarkdownRenderer } from '~/app/_components/shared/MarkdownRenderer';
import {
  isSummaryPending,
  isVideoArticle,
  knowledgeHref,
  readerContent,
  safeSourceUrl,
  sourceLinkLabel,
  SUMMARY_POLL_MS,
} from '~/lib/resources/reader';
import { youtubeVideoId } from '~/utils/youtube';
import styles from './ResourceReader.module.css';

interface ResourceReaderProps {
  resourceId: string;
  workspaceSlug?: string | null;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** "6 min read" at ~230 words a minute, the same sum the iOS reader does. */
function readingTime(words: number | null): string | null {
  return words ? `${Math.max(1, Math.round(words / 230))} min read` : null;
}

/**
 * One saved Resource, read inside Exponential: the Knowledge page's titles land
 * here for every link type. The summary leads when there is one, with the full
 * text folded under it; otherwise the full text is the page. A link to the
 * original is always on hand. Opening an unread item marks it `reading`;
 * marking it read is explicit (D-0031), as on the iOS reader.
 */
export function ResourceReader({ resourceId, workspaceSlug }: ResourceReaderProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const backHref = knowledgeHref(workspaceSlug);

  const { data, isLoading, error } = api.resource.get.useQuery(
    { id: resourceId },
    {
      retry: false,
      refetchInterval: (query) => {
        const resource = query.state.data?.resource;
        return resource && isSummaryPending(resource) ? SUMMARY_POLL_MS : false;
      },
    },
  );
  const resource = data?.resource;

  const refreshLists = () => {
    void utils.resource.list.invalidate();
    void utils.resource.get.invalidate({ id: resourceId });
  };
  const setReadStatus = api.resource.setReadStatus.useMutation({ onSuccess: refreshLists });
  const archive = api.resource.archive.useMutation({
    onSuccess: () => {
      void utils.resource.list.invalidate();
      router.push(backHref);
    },
  });

  // Once per resource: a refetch must not re-mark an item the user just put back.
  const markedOpened = useRef<string | null>(null);
  const { mutate: mutateReadStatus } = setReadStatus;
  useEffect(() => {
    if (!resource || markedOpened.current === resource.id) return;
    markedOpened.current = resource.id;
    if (resource.readStatus === 'to_read') {
      mutateReadStatus({ id: resource.id, readStatus: 'reading' });
    }
  }, [resource, mutateReadStatus]);

  const title = resource?.title;
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} · Knowledge`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  const backLink = (
    <Link href={backHref} className={styles.back}>
      <IconArrowLeft size={14} stroke={1.75} />
      Knowledge
    </Link>
  );

  if (isLoading) {
    return (
      <div className={styles.stage}>
        <div className={styles.column}>
          {backLink}
          <Skeleton height={32} mt="md" mb="sm" width="70%" radius="sm" />
          <Skeleton height={14} mb="xl" width="40%" radius="sm" />
          <Skeleton height={160} radius="sm" />
        </div>
      </div>
    );
  }

  if (!resource) {
    return (
      <div className={styles.stage}>
        <div className={styles.column}>
          {backLink}
          <Text className={styles.notice}>
            {error?.data?.code === 'NOT_FOUND'
              ? 'This item is not in your Reading list.'
              : "Couldn't load this item. Refresh to try again."}
          </Text>
        </div>
      </div>
    );
  }

  const { summary, body, bodyFormat, bodyLabel, transcript, isEmpty } = readerContent(resource);
  const sourceUrl = safeSourceUrl(resource.url);
  const sourceLabel = sourceLinkLabel(sourceUrl);
  const isRead = resource.readStatus === 'read';
  const host = sourceUrl ? hostOf(sourceUrl) : null;
  const byline = [
    // A bare link's title is its hostname until it's enriched; don't say it twice.
    host === resource.title ? null : host,
    resource.author,
    resource.publishedAt ? new Date(resource.publishedAt).toLocaleDateString() : null,
    // A transcript's length isn't a reading time; an article's is.
    resource.contentType === 'video' && !isVideoArticle(resource) ? null : readingTime(resource.wordCount),
  ].filter(Boolean);

  return (
    <div className={styles.stage}>
      <article className={styles.column}>
        {backLink}

        <header className={styles.header}>
          <h1 className={styles.title}>{resource.title}</h1>
          {byline.length > 0 && <Text className={styles.byline}>{byline.join(' · ')}</Text>}
          <Group gap="xs" mt="md">
            {sourceUrl && (
              <Button
                component="a"
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                size="xs"
                variant="light"
                leftSection={<IconExternalLink size={14} stroke={1.75} />}
              >
                {sourceLabel}
              </Button>
            )}
            {isRead ? (
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                leftSection={<IconArrowBackUp size={14} stroke={1.75} />}
                onClick={() => setReadStatus.mutate({ id: resource.id, readStatus: 'to_read' })}
              >
                Mark unread
              </Button>
            ) : (
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                leftSection={<IconCheck size={14} stroke={1.75} />}
                onClick={() =>
                  setReadStatus.mutate(
                    { id: resource.id, readStatus: 'read' },
                    { onSuccess: () => router.push(backHref) },
                  )
                }
              >
                Mark read
              </Button>
            )}
            {!resource.archivedAt && (
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                leftSection={<IconArchive size={14} stroke={1.75} />}
                onClick={() => archive.mutate({ id: resource.id })}
              >
                Archive
              </Button>
            )}
          </Group>
        </header>

        {summary && (
          <section className={styles.summary} aria-label="Summary">
            <MarkdownRenderer content={summary} variant="prose" />
          </section>
        )}

        <div className={styles.articleBody}>
          {body &&
            (summary ? (
              <details className={styles.fullText}>
                <summary>{bodyLabel}</summary>
                <MarkdownRenderer content={body} variant="prose" format={bodyFormat} />
              </details>
            ) : (
              <MarkdownRenderer content={body} variant="prose" format={bodyFormat} />
            ))}

          {transcript && (
            <details className={styles.fullText}>
              <summary>Transcript</summary>
              {/* Captions, so never HTML; soft breaks keep each timed line apart. */}
              <MarkdownRenderer content={transcript} variant="prose" format="markdown" softBreaks />
            </details>
          )}
        </div>

        {isEmpty &&
          (isSummaryPending(resource) ? (
            <Group gap="sm" className={styles.notice}>
              <Loader size="xs" />
              <Text inherit>Writing the article. A long video can take a few minutes.</Text>
            </Group>
          ) : (
            <Text className={styles.notice}>
              {!sourceUrl
                ? 'Nothing saved in this one but its title.'
                : youtubeVideoId(resource.url)
                  ? 'No article for this video yet.'
                  : 'Only the link was saved for this page.'}
            </Text>
          ))}
      </article>
    </div>
  );
}
