'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IconHome,
  IconStack2,
  IconBook,
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
  { label: 'Projects', icon: IconStack2, segment: 'projects' },
  { label: 'Knowledge', icon: IconBook, segment: 'knowledge-base' },
  { label: 'Meetings', icon: IconMicrophone, segment: 'meetings' },
  { label: 'CRM', icon: IconUsers, segment: 'crm' },
  {
    label: 'OKRs',
    icon: IconTarget,
    segment: 'goals',
    href: 'goals?tab=okrs',
    matchSegments: ['goals', 'okrs'],
  },
  { label: 'Calendar', icon: IconCalendar, segment: 'timeline' },
  { label: 'Settings', icon: IconSettings, segment: 'settings' },
] as const;

export function WorkspaceTopNav() {
  const { workspaceSlug } = useWorkspace();
  const pathname = usePathname();

  if (!workspaceSlug) return null;

  return (
    <nav className={styles.strip}>
      {NAV_ITEMS.map(({ label, icon: Icon, segment, href, matchSegments }) => {
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
