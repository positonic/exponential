'use client';

import { usePathname } from 'next/navigation';
import { IconFolder } from '@tabler/icons-react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
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

export function WorkspaceTopbar() {
  const { workspace, workspaceSlug } = useWorkspace();
  const pathname = usePathname();

  if (!workspace || !workspaceSlug) return null;

  const pageLabel = getCurrentPageLabel(pathname, workspaceSlug);

  return (
    <div className={styles.topbar}>
      <div className={styles.crumb}>
        <IconFolder size={14} stroke={1.75} style={{ color: 'var(--color-text-muted)' }} />
        <span className={styles.crumbCurrent}>{workspace.name}</span>
        {pageLabel && (
          <>
            <span className={styles.crumbSep}>/</span>
            <span>{pageLabel}</span>
          </>
        )}
      </div>
    </div>
  );
}
