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

const NAV_ITEMS = [
  { label: 'Home', icon: IconHome, segment: 'home' },
  { label: 'Projects', icon: IconStack2, segment: 'projects' },
  { label: 'Knowledge', icon: IconBook, segment: 'knowledge-base' },
  { label: 'Meetings', icon: IconMicrophone, segment: 'meetings' },
  { label: 'CRM', icon: IconUsers, segment: 'crm' },
  { label: 'OKRs', icon: IconTarget, segment: 'okrs' },
  { label: 'Calendar', icon: IconCalendar, segment: 'timeline' },
  { label: 'Settings', icon: IconSettings, segment: 'settings' },
] as const;

export function WorkspaceTopNav() {
  const { workspaceSlug } = useWorkspace();
  const pathname = usePathname();

  if (!workspaceSlug) return null;

  return (
    <nav className={styles.strip}>
      {NAV_ITEMS.map(({ label, icon: Icon, segment }) => {
        const href = `/w/${workspaceSlug}/${segment}`;
        const isActive = pathname.startsWith(href);
        return (
          <Link
            key={segment}
            href={href}
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
