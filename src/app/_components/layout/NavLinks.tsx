'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconInbox,
  IconClock,
  IconTarget,
  IconStack2,
  IconLayoutGrid,
  IconUsers,
  IconMessageChatbot,
  IconMicrophone,
  IconBook,
  IconRoute,
  IconBriefcase,
  type Icon,
} from "@tabler/icons-react";
import { InboxCount } from "./InboxCount";
import { TodayCount } from "./TodayCount";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { parseNavLayout, NAV_ITEM_CONFIG } from "~/lib/navLayout";

const ITEM_ICONS: Record<string, Icon> = {
  goals: IconTarget,
  alignment: IconRoute,
  actions: IconBriefcase,
  projects: IconStack2,
  products: IconLayoutGrid,
  crm: IconUsers,
  agents: IconMessageChatbot,
  meetings: IconMicrophone,
  knowledge: IconBook,
};

interface NavLinkProps {
  href: string;
  icon?: Icon;
  children: React.ReactNode;
  count?: React.ReactNode;
  /**
   * Route segments (matched after the `/w/:workspaceSlug` prefix) that also
   * mark this link active, e.g. `['goals', 'okrs']`. When omitted, activeness
   * falls back to an exact/prefix match on `href`.
   */
  matchSegments?: string[];
}

/**
 * A single sidebar navigation link. Highlights itself as active when the
 * current pathname matches `href` (exact or prefix) or, when provided, any of
 * `matchSegments` as a whole route segment after the workspace prefix.
 */
export function NavLink({ href, icon: Icon, children, count, matchSegments }: NavLinkProps): React.ReactElement {
  const pathname = usePathname();
  const hrefPath = href.split("?")[0] ?? href;

  // Compare whole route segments after the `/w/:workspaceSlug` prefix so a
  // workspace slug that overlaps a nav segment (e.g. `/w/goals/projects`)
  // doesn't wrongly activate an unrelated item.
  const pathnameSegments = pathname.split("/").filter(Boolean);
  const routeSegments =
    pathnameSegments[0] === "w" ? pathnameSegments.slice(2) : pathnameSegments;
  const isHrefActive = pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);

  const isActive = matchSegments
    ? isHrefActive || matchSegments.some((segment) => routeSegments.includes(segment))
    : isHrefActive;

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="sb-section-label">{children}</div>;
}

function SectionDivider() {
  return <div className="sb-divider" />;
}

/**
 * Renders the workspace sidebar navigation from the user's persisted
 * `navLayout` preference: global items (Inbox/Today) followed by the
 * configurable sections/items, with plugin gating and a reduced guest view.
 */
export function NavLinks(): React.ReactElement {
  const { workspaceSlug, workspaceId, userRole } = useWorkspace();
  const isGuest = userRole === 'guest';

  const { data: preferences } = api.navigationPreference.getPreferences.useQuery(
    undefined,
    { staleTime: 30 * 1000 },
  );
  const { data: enabledPlugins } = api.pluginConfig.getEnabled.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId && !isGuest, staleTime: 5 * 60 * 1000 },
  );

  const layout = parseNavLayout(preferences?.navLayout ?? null);

  return (
    <>
      {/* Global items - always visible */}
      <NavLink href="/inbox" icon={IconInbox} count={<InboxCount />}>
        Inbox
      </NavLink>
      <NavLink href="/today" icon={IconClock} count={<TodayCount />}>
        Today
      </NavLink>

      {workspaceSlug && !isGuest && (
        <>
          {layout.map((section) => {
            if (section.hidden) return null;

            const visibleItems = section.items.filter((item) => {
              if (item.hidden) return false;
              const config = NAV_ITEM_CONFIG[item.id];
              if (!config) return false;
              if (config.requiresPlugin && !enabledPlugins?.includes(config.requiresPlugin)) return false;
              return true;
            });

            if (visibleItems.length === 0) return null;

            return (
              <div key={section.id}>
                <SectionDivider />
                <SectionLabel>{section.name}</SectionLabel>
                {visibleItems.map((item) => {
                  const config = NAV_ITEM_CONFIG[item.id];
                  if (!config) return null;
                  const Icon = ITEM_ICONS[item.id];
                  return (
                    <NavLink
                      key={item.id}
                      href={config.href(workspaceSlug)}
                      icon={Icon}
                      matchSegments={config.matchSegments}
                    >
                      {config.label}
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </>
      )}

      {/* Guest: only projects */}
      {workspaceSlug && isGuest && (
        <>
          <SectionDivider />
          <NavLink href={`/w/${workspaceSlug}/projects`} icon={IconStack2}>
            Projects
          </NavLink>
        </>
      )}
    </>
  );
}
