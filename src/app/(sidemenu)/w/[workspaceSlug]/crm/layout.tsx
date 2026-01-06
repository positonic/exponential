'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import {
  IconUsers,
  IconBuilding,
  IconLayoutDashboard,
  IconMail
} from '@tabler/icons-react';

const navItems = [
  { label: 'Dashboard', href: '', icon: IconLayoutDashboard },
  { label: 'Contacts', href: '/contacts', icon: IconUsers },
  { label: 'Organizations', href: '/organizations', icon: IconBuilding },
  { label: 'Communications', href: '/communications', icon: IconMail, disabled: true },
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
    <div className="flex h-full">
      {/* CRM Sidebar */}
      <aside className="w-56 border-r border-border-primary bg-surface-secondary flex-shrink-0">
        <div className="p-4">
          <h2 className="text-lg font-semibold text-text-primary mb-4">CRM</h2>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const href = `${basePath}${item.href}`;
              const isActive = pathname === href ||
                (item.href !== '' && pathname.startsWith(href));
              const Icon = item.icon;

              if (item.disabled) {
                return (
                  <div
                    key={item.label}
                    className="flex items-center gap-3 px-3 py-2 rounded-md text-text-muted cursor-not-allowed opacity-50"
                  >
                    <Icon size={18} />
                    <span className="text-sm">{item.label}</span>
                    <span className="text-xs ml-auto">Soon</span>
                  </div>
                );
              }

              return (
                <Link
                  key={item.label}
                  href={href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                    isActive
                      ? 'bg-brand-primary/10 text-brand-primary'
                      : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                  }`}
                >
                  <Icon size={18} />
                  <span className="text-sm">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
