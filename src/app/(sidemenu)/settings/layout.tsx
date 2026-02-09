'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IconUser,
  IconLayoutSidebar,
  IconPalette,
  IconPlug,
  IconKey,
  IconBrain,
  IconSparkles,
  IconRobot,
} from '@tabler/icons-react';
import { type Icon as TablerIcon } from '@tabler/icons-react';

const SETTINGS_TABS = [
  { label: 'Profile', href: '/settings/profile', icon: IconUser },
  { label: 'Navigation', href: '/settings', icon: IconLayoutSidebar },
  { label: 'Appearance', href: '/settings/appearance', icon: IconPalette },
  { label: 'Integrations', href: '/settings/integrations', icon: IconPlug },
  { label: 'API Keys', href: '/settings/api-keys', icon: IconKey },
  { label: 'AI History', href: '/settings/ai-history', icon: IconBrain },
  { label: 'AI Tools', href: '/settings/ai-tools', icon: IconSparkles },
  { label: 'AI Assistant', href: '/settings/assistant', icon: IconRobot },
] as const;

function SettingsNavLink({
  href,
  icon: Icon,
  label,
  isActive,
}: {
  href: string;
  icon: TablerIcon;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group relative flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
        isActive
          ? 'bg-surface-secondary text-text-primary'
          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
      }`}
    >
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-brand-primary rounded-r-full" />
      )}
      <Icon
        className={`mr-3 h-4 w-4 transition-colors duration-200 ${
          isActive
            ? 'text-brand-primary'
            : 'text-text-muted group-hover:text-text-secondary'
        }`}
        size={18}
      />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isTabActive = (href: string) => {
    if (href === '/settings') {
      return pathname === '/settings';
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="flex flex-col md:flex-row min-h-full">
      {/* Left nav - horizontal on mobile, vertical on desktop */}
      <nav className="w-full md:w-60 flex-shrink-0 border-b md:border-b-0 md:border-r border-border-primary bg-background-secondary md:min-h-screen">
        <div className="px-4 pt-6 pb-2 hidden md:block">
          <h1 className="text-lg font-semibold text-text-primary">Settings</h1>
        </div>
        {/* Mobile: horizontal scroll */}
        <div className="flex md:hidden overflow-x-auto gap-1 px-3 py-2">
          {SETTINGS_TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isTabActive(tab.href)
                  ? 'bg-surface-secondary text-text-primary'
                  : 'text-text-secondary hover:bg-surface-hover'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </Link>
          ))}
        </div>
        {/* Desktop: vertical nav */}
        <div className="hidden md:flex flex-col gap-0.5 px-3 py-2">
          {SETTINGS_TABS.map((tab) => (
            <SettingsNavLink
              key={tab.href}
              href={tab.href}
              icon={tab.icon}
              label={tab.label}
              isActive={isTabActive(tab.href)}
            />
          ))}
        </div>
      </nav>

      {/* Content area */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
