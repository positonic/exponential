'use client';

import Link from 'next/link';
import { ActionIcon, Tooltip } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { safeSourceUrl, sourceLinkLabel } from '~/lib/resources/reader';
import styles from './KnowledgeBaseContent.module.css';

/**
 * The parts of a Resource's row that every list of Resources shares: the
 * Knowledge page and a Project's Resources view. One rule on every client and
 * for every link type: the title opens Exponential's reader, and a separate
 * link goes to the original.
 */

export function shortDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * The row's title: a link when there is somewhere to go (external URLs open
 * in a new tab), plain text otherwise. A Resource's title always goes to the
 * reader; `SourceLink` is the way to the original.
 */
export function RowMain({
  href,
  external,
  children,
}: {
  href: string | null;
  external?: boolean;
  children: React.ReactNode;
}) {
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

/**
 * The way to the original, beside a title that opens the reader. Always takes
 * its slot, so labels line up down a column whether or not a row has a URL.
 */
export function SourceLink({ url, onOpen }: { url: string | null | undefined; onOpen?: () => void }) {
  const href = safeSourceUrl(url);
  const label = sourceLinkLabel(href);
  return (
    <span className={styles.sourceSlot}>
      {href && (
        <Tooltip label={label}>
          <ActionIcon
            component="a"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={label}
            onClick={onOpen}
          >
            <IconExternalLink size={14} stroke={1.75} />
          </ActionIcon>
        </Tooltip>
      )}
    </span>
  );
}
