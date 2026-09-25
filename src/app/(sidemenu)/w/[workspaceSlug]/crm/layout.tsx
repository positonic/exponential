'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import {
  IconUsers,
  IconBuilding,
  IconLayoutDashboard,
  IconLayoutKanban,
  IconMail,
  IconBolt,
  IconForms,
  IconListDetails,
  IconBroadcast,
} from '@tabler/icons-react';
import type { Icon as TablerIcon } from '@tabler/icons-react';

interface CrmNavItem {
  title: string;
  href: string | null;
  icon: TablerIcon;
}

interface CrmNavSection {
  title: string | null;
  items: CrmNavItem[];
}

const crmNavigation: CrmNavSection[] = [
  {
    title: null,
    items: [
      { title: 'Dashboard', href: '', icon: IconLayoutDashboard },
      { title: 'Pipeline', href: '/pipeline', icon: IconLayoutKanban },
      { title: 'Contacts', href: '/contacts', icon: IconUsers },
      { title: 'Organizations', href: '/organizations', icon: IconBuilding },
      { title: 'Automations', href: '/automations', icon: IconBolt },
      { title: 'Lists', href: '/lists', icon: IconListDetails },
      { title: 'Broadcasts', href: '/broadcasts', icon: IconBroadcast },
      { title: 'Forms', href: '/forms', icon: IconForms },
    ],
  },
  {
    title: 'Coming Soon',
    items: [
      { title: 'Communications', href: null, icon: IconMail },
    ],
  },
];

export default function CRMLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { workspace } = useWorkspace();
  if (!workspace) return null;
  const basePath = `/w/${workspace.slug}/crm`;

  // Dashboard (empty href) should only be active on exact match
  const isItemActive = (itemHref: string, href: string) =>
    itemHref === ''
      ? pathname === href
      : pathname === href || pathname.startsWith(href + '/');

  return (
    <div className="flex flex-col lg:flex-row">
      {/* Mobile / tablet CRM nav: a horizontally scrolling tab strip replaces
          the sidebar, which would otherwise eat most of a phone's width. */}
      <nav
        aria-label="CRM"
        className="border-b border-border-primary bg-background-primary lg:hidden"
      >
        <ul className="flex gap-1 overflow-x-auto px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {crmNavigation.flatMap((section) => section.items).map((item) => {
            if (item.href === null) return null;
            const href = `${basePath}${item.href}`;
            const isActive = isItemActive(item.href, href);
            const Icon = item.icon;
            return (
              <li key={item.title} className="shrink-0">
                <Link
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-surface-secondary font-medium text-text-primary'
                      : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                  }`}
                >
                  <Icon
                    size={16}
                    className={`shrink-0 ${isActive ? 'text-blue-500' : 'text-text-muted'}`}
                  />
                  {item.title}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* CRM Sidebar */}
      <nav className="hidden w-64 shrink-0 border-r border-border-primary bg-background-primary lg:block">
        <div className="sticky top-0 h-screen overflow-y-auto p-4">
          {/* CRM Header */}
          <div className="mb-6 px-3">
            <h2 className="text-lg font-semibold text-text-primary">CRM</h2>
          </div>

          {crmNavigation.map((section, sectionIndex) => (
            <div key={section.title ?? `section-${sectionIndex}`} className="mb-6">
              {/* Section header */}
              {section.title && (
                <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  {section.title}
                </h3>
              )}

              {/* Section items */}
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const href = item.href !== null ? `${basePath}${item.href}` : null;
                  const isActive = href !== null && item.href !== null && isItemActive(item.href, href);
                  const Icon = item.icon;

                  return (
                    <li key={item.title}>
                      {href ? (
                        <Link
                          href={href}
                          className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 ${
                            isActive
                              ? 'bg-surface-secondary font-medium text-text-primary'
                              : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                          }`}
                        >
                          {isActive && (
                            <div className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-blue-500" />
                          )}
                          <Icon
                            size={16}
                            className={`shrink-0 transition-colors duration-200 ${
                              isActive
                                ? 'text-blue-500'
                                : 'text-text-muted group-hover:text-text-secondary'
                            }`}
                          />
                          <span className="truncate">{item.title}</span>
                        </Link>
                      ) : (
                        <span className="flex items-center gap-3 px-3 py-2 text-sm text-text-muted">
                          <Icon size={16} className="shrink-0 text-text-muted" />
                          <span className="truncate">{item.title}</span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="min-w-0 flex-1 overflow-auto p-4 md:p-6">
        {children}
      </main>
    </div>
  );
}
