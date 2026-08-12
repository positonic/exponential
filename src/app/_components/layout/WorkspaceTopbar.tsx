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
  products: 'Products',
  today: 'Today',
  inbox: 'Inbox',
};

/**
 * The section crumb: the label for the area we're in, plus where it links.
 *
 * `href` is null when there is nowhere to go — either we're already on the
 * section's own index (the crumb is the current page), or we're on a global
 * route like `/recording/{id}`, where the leading segment isn't guaranteed to
 * have an index page to land on. Every `/w/{slug}/{segment}` does have one.
 */
function getSectionCrumb(
  pathname: string,
  workspaceSlug: string,
): { label: string; href: string | null } {
  const prefix = `/w/${workspaceSlug}/`;
  // The workspace root redirects onwards, so it has no section of its own —
  // without this it would parse as the segment "w" and render a "W" crumb.
  if (pathname === `/w/${workspaceSlug}`) return { label: '', href: null };

  const underWorkspace = pathname.startsWith(prefix);
  const rest = underWorkspace
    ? pathname.slice(prefix.length)
    : // Global routes like /today, /inbox: take the first non-empty segment.
      pathname.replace(/^\//, '');

  const parts = rest.split('/').filter(Boolean);
  const segment = parts[0] ?? '';
  if (!segment) return { label: '', href: null };

  const label =
    PAGE_LABELS[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1);
  const href =
    underWorkspace && parts.length > 1 ? `${prefix}${segment}` : null;

  return { label, href };
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

  const section = getSectionCrumb(pathname, workspaceSlug);

  return (
    <div className={styles.topbar}>
      <div className={styles.crumb}>
        <IconFolder size={14} stroke={1.75} style={{ color: 'var(--color-text-muted)' }} />
        <Link href={`/w/${workspaceSlug}`} className={styles.crumbRoot}>
          {workspace.name}
        </Link>
        {section.label && (
          <>
            <span className={styles.crumbSep}>/</span>
            {section.href ? (
              <Link href={section.href} className={styles.crumbLink}>
                {section.label}
              </Link>
            ) : (
              <span>{section.label}</span>
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
