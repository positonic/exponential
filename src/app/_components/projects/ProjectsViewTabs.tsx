'use client';

import { usePathname } from 'next/navigation';
import { IconLayoutList, IconTable, IconTimeline } from '@tabler/icons-react';
import { ListPageViewTabs } from '~/app/_components/listPage';
import type { ListPageViewTab } from '~/app/_components/listPage';
import { saveProjectsViewTab } from './projectsViewTab';
import type { ProjectsViewTab } from './projectsViewTab';

const VIEW_TABS: readonly (Omit<ListPageViewTab<ProjectsViewTab>, 'href'> & { path: string })[] = [
  { value: 'table', label: 'Projects', icon: IconTable, path: '/projects' },
  { value: 'projects-tasks', label: 'Projects & Tasks', icon: IconLayoutList, path: '/projects-tasks' },
  { value: 'timeline', label: 'Timeline', icon: IconTimeline, path: '/timeline' },
];

/**
 * The Projects / Projects & Tasks / Timeline switcher shared by the projects
 * page family. Carries the current filter query across views and remembers
 * the clicked view as the workspace's last-used tab.
 */
export function ProjectsViewTabs({
  linkPrefix,
  viewParamsQueryString,
}: {
  /** `/w/<slug>`, or '' for the all-workspaces routes. */
  linkPrefix: string;
  viewParamsQueryString: string;
}) {
  const pathname = usePathname();
  const active: ProjectsViewTab = pathname.includes('/projects-tasks')
    ? 'projects-tasks'
    : pathname.includes('/timeline')
      ? 'timeline'
      : 'table';
  const query = viewParamsQueryString ? `?${viewParamsQueryString}` : '';

  return (
    <ListPageViewTabs
      tabs={VIEW_TABS.map(({ path, ...tab }) => ({ ...tab, href: `${linkPrefix}${path}${query}` }))}
      active={active}
      onTabClick={(value) => saveProjectsViewTab(pathname, value)}
    />
  );
}
