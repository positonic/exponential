'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconFolder } from '@tabler/icons-react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';
import styles from './WorkspaceTopbar.module.css';

const PAGE_LABELS: Record<string, string> = {
  home: 'Home',
  projects: 'Projects',
  'knowledge-base': 'Knowledge',
  meetings: 'Meetings',
  crm: 'CRM',
  okrs: 'OKRs',
  timeline: 'Calendar',
  settings: 'Settings',
  goals: 'Goals',
  outcomes: 'Outcomes',
  products: 'Products',
  today: 'Today',
  inbox: 'Inbox',
};

function getCurrentPageLabel(pathname: string, workspaceSlug: string): string {
  const prefix = `/w/${workspaceSlug}/`;
  let segment = '';
  if (pathname.startsWith(prefix)) {
    segment = pathname.slice(prefix.length).split('/')[0] ?? '';
  } else {
    // Global routes like /today, /inbox: take the first non-empty path segment.
    segment = pathname.replace(/^\//, '').split('/')[0] ?? '';
  }
  if (!segment) return '';
  return PAGE_LABELS[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1);
}

/** Extract the page id when on a page-detail route (`/w/{slug}/pages/{id}`). */
function getPageDetailId(pathname: string, workspaceSlug: string): string | null {
  const prefix = `/w/${workspaceSlug}/`;
  if (!pathname.startsWith(prefix)) return null;
  const parts = pathname.slice(prefix.length).split('/');
  return parts[0] === 'pages' && parts[1] ? parts[1] : null;
}

export function WorkspaceTopbar() {
  const { workspace, workspaceSlug } = useWorkspace();
  const pathname = usePathname();

  const pageDetailId = workspaceSlug
    ? getPageDetailId(pathname, workspaceSlug)
    : null;

  // Reverse-lookup the linking ("parent") page, only on a page-detail route.
  const { data: parent } = api.page.parentCrumb.useQuery(
    { id: pageDetailId ?? '' },
    { enabled: !!pageDetailId },
  );

  if (!workspace || !workspaceSlug) return null;

  const pageLabel = getCurrentPageLabel(pathname, workspaceSlug);

  return (
    <div className={styles.topbar}>
      <div className={styles.crumb}>
        <IconFolder size={14} stroke={1.75} style={{ color: 'var(--color-text-muted)' }} />
        <Link href={`/w/${workspaceSlug}`} className={styles.crumbRoot}>
          {workspace.name}
        </Link>
        {pageLabel && (
          <>
            <span className={styles.crumbSep}>/</span>
            {pageDetailId ? (
              <Link href={`/w/${workspaceSlug}/pages`} className={styles.crumbLink}>
                {pageLabel}
              </Link>
            ) : (
              <span>{pageLabel}</span>
            )}
          </>
        )}
        {parent && (
          <>
            <span className={styles.crumbSep}>/</span>
            <Link
              href={`/w/${workspaceSlug}/pages/${parent.id}`}
              className={styles.crumbLink}
            >
              {parent.title}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
