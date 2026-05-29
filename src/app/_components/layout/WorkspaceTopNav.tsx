'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IconHome,
  IconStack2,
  IconBook,
  IconMessageChatbot,
  IconMicrophone,
  IconUsers,
  IconTarget,
  IconCalendar,
  IconSettings,
} from '@tabler/icons-react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import styles from './WorkspaceTopNav.module.css';

type NavItem = {
  readonly label: string;
  readonly icon: typeof IconHome;
  readonly segment: string;
  readonly href?: string;
  readonly matchSegments?: readonly string[];
};

const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Home', icon: IconHome, segment: 'home' },
  {
    label: 'Goals',
    icon: IconTarget,
    segment: 'goals',
    href: 'goals?tab=okrs',
    matchSegments: ['goals', 'okrs'],
  },
  { label: 'Projects', icon: IconStack2, segment: 'projects' },
  { label: 'Agent', icon: IconMessageChatbot, segment: 'agent' },
  { label: 'Knowledge', icon: IconBook, segment: 'knowledge-base' },
  { label: 'Meetings', icon: IconMicrophone, segment: 'meetings' },
  { label: 'CRM', icon: IconUsers, segment: 'crm' },
  { label: 'Calendar', icon: IconCalendar, segment: 'timeline' },
  { label: 'Settings', icon: IconSettings, segment: 'settings' },
] as const;

// Guests (project-only members) see only Projects. Every other workspace-wide
// surface is hidden; the corresponding routes silently redirect (see oos3).
const GUEST_VISIBLE_SEGMENTS: ReadonlySet<string> = new Set(['projects']);

export function WorkspaceTopNav() {
  const { workspaceSlug, userRole } = useWorkspace();
  const pathname = usePathname();

  if (!workspaceSlug) return null;

  const isGuest = userRole === 'guest';
  const visibleNavItems = isGuest
    ? NAV_ITEMS.filter((item) => GUEST_VISIBLE_SEGMENTS.has(item.segment))
    : NAV_ITEMS;

  return (
    <nav className={styles.strip}>
      {visibleNavItems.map(({ label, icon: Icon, segment, href, matchSegments }) => {
        const linkHref = `/w/${workspaceSlug}/${href ?? segment}`;
        const segmentsToMatch = matchSegments ?? [segment];
        const isActive = segmentsToMatch.some((s) =>
          pathname.startsWith(`/w/${workspaceSlug}/${s}`),
        );
        return (
          <Link
            key={segment}
            href={linkHref}
            className={styles.chip}
            data-active={isActive ? 'true' : 'false'}
          >
            <Icon size={13} stroke={1.75} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
