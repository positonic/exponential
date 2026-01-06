'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import {
  IconUsers,
  IconBuilding,
  IconLayoutDashboard,
  IconMail,
} from '@tabler/icons-react';

const crmNavigation = [
  {
    title: null,
    items: [
      { title: 'Dashboard', href: '', icon: IconLayoutDashboard },
      { title: 'Contacts', href: '/contacts', icon: IconUsers },
      { title: 'Organizations', href: '/organizations', icon: IconBuilding },
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
  const basePath = workspace ? `/w/${workspace.slug}/crm` : '';

  return (
    <div className="-m-4 flex min-h-screen lg:-m-8">
      {/* CRM Sidebar */}
      <nav className="w-64 shrink-0 border-r border-border-primary bg-background-primary">
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
                  const isActive = href !== null && (
                    pathname === href ||
                    (item.href !== '' && pathname.startsWith(href))
                  );
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
      <main className="flex-1 overflow-auto p-6">
        {children}
      </main>
    </div>
  );
}
