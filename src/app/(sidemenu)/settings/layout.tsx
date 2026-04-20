'use client';

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
  IconBell,
  IconSettings,
} from '@tabler/icons-react';
import {
  SettingsShell,
  SettingsHero,
  SettingsLayout,
  SettingsSidebar,
  type SidebarGroup,
} from '~/app/_components/settings/SettingsShell';

const GROUPS: SidebarGroup<string>[] = [
  {
    title: 'Account',
    items: [
      { id: '/settings/profile', label: 'Profile', icon: IconUser, href: '/settings/profile' },
      { id: '/settings/notifications', label: 'Notifications', icon: IconBell, href: '/settings/notifications' },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { id: '/settings', label: 'Navigation', icon: IconLayoutSidebar, href: '/settings' },
      { id: '/settings/appearance', label: 'Appearance', icon: IconPalette, href: '/settings/appearance' },
    ],
  },
  {
    title: 'Integrations',
    items: [
      { id: '/settings/integrations', label: 'Integrations', icon: IconPlug, href: '/settings/integrations' },
      { id: '/settings/api-keys', label: 'API keys', icon: IconKey, href: '/settings/api-keys' },
    ],
  },
  {
    title: 'AI',
    items: [
      { id: '/settings/ai-history', label: 'AI history', icon: IconBrain, href: '/settings/ai-history' },
      { id: '/settings/ai-tools', label: 'AI tools', icon: IconSparkles, href: '/settings/ai-tools' },
      { id: '/settings/assistant', label: 'AI assistant', icon: IconRobot, href: '/settings/assistant' },
    ],
  },
];

export default function SettingsRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const activeId = (() => {
    // Exact match for /settings (Navigation tab), otherwise longest prefix.
    if (pathname === '/settings') return '/settings';
    const candidate = GROUPS.flatMap((g) => g.items)
      .map((i) => i.href ?? '')
      .filter((h) => h !== '/settings' && pathname.startsWith(h))
      .sort((a, b) => b.length - a.length)[0];
    return candidate ?? pathname;
  })();

  return (
    <SettingsShell>
      <SettingsHero
        eyebrow="Account · Settings"
        icon={IconSettings}
        title="Settings"
        description="Your personal preferences across every workspace. Navigation, notifications, appearance, and connected accounts."
      />

      <SettingsLayout
        sidebar={<SettingsSidebar groups={GROUPS} activeId={activeId} />}
      >
        {children}
      </SettingsLayout>
    </SettingsShell>
  );
}
