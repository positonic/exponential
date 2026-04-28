'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconInbox,
  IconCalendar,
  IconHome,
  IconUsers,
  IconClock,
  IconChartBar,
} from "@tabler/icons-react";
import { InboxCount } from "./InboxCount";
import { TodayCount } from "./TodayCount";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { usePluginNavigation } from "~/hooks/usePluginNavigation";
import { api } from "~/trpc/react";

// Icon map for plugin navigation items in main nav
const mainNavIconMap = {
  IconUsers,
  IconHome,
} as const;

type MainNavIconKey = keyof typeof mainNavIconMap;

// Reusable NavLink component
export function NavLink({ href, icon: Icon, children, count }: {
  href: string;
  icon?: React.ComponentType<any>;
  children: React.ReactNode;
  count?: React.ReactNode;
}) {
  const pathname = usePathname();
  const hrefPath = href.split("?")[0];
  const isActive = pathname === hrefPath;

  return (
    <Link
      href={href}
      className={`sb-nav-item ${isActive ? 'sb-nav-item--active' : ''}`}
      aria-current={isActive ? 'page' : undefined}
    >
      {Icon && (
        <span className="sb-nav-item__icon">
          <Icon size={16} />
        </span>
      )}
      <span className="sb-nav-item__label">{children}</span>
      {count && <span className="sb-nav-item__count empty:hidden">{count}</span>}
    </Link>
  );
}

export function NavLinks() {
  const { workspaceSlug } = useWorkspace();
  const { itemsBySection } = usePluginNavigation();
  const { data: preferences } = api.navigationPreference.getPreferences.useQuery();

  // Home always goes to /home regardless of workspace context
  const homePath = '/home';

  // Helper to get icon component from name
  const getIcon = (iconName: string) => {
    if (iconName in mainNavIconMap) {
      return mainNavIconMap[iconName as MainNavIconKey];
    }
    return IconUsers; // Default fallback
  };

  // Get plugin items for "main" section, filtered by workspace availability
  const mainPluginItems = itemsBySection.main
    ?.filter((item) => !item.workspaceScoped || !!workspaceSlug)
    .sort((a, b) => a.order - b.order) ?? [];

  return (
    <>
      <NavLink href={homePath} icon={IconHome}>
        Home
      </NavLink>
      <NavLink href="/inbox" icon={IconInbox} count={<InboxCount />}>
        Inbox
      </NavLink>
      <NavLink href="/today" icon={IconClock} count={<TodayCount />}>
        Today
      </NavLink>
      {/* Plugin navigation items for main section */}
      {mainPluginItems.map((item) => {
        const IconComponent = getIcon(item.icon);
        return (
          <NavLink key={item.id} href={item.href} icon={IconComponent}>
            {item.label}
          </NavLink>
        );
      })}
      {preferences?.showGamification !== false && (
        <NavLink href="/productivity" icon={IconChartBar}>
          Productivity
        </NavLink>
      )}
      <NavLink href="/calendar" icon={IconCalendar}>
        Calendar
      </NavLink>
    </>
  );
}