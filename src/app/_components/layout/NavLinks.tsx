'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconInbox,
  IconClock,
  IconHourglass,
  IconTarget,
  IconStack2,
  IconLayoutGrid,
  IconUsers,
  IconMessageChatbot,
  IconMicrophone,
  IconBook,
  IconBook2,
  IconGavel,
  IconBriefcase,
  IconFileText,
  IconChartBar,
  IconGitMerge,
  IconChevronDown,
  IconChevronRight,
  type Icon,
} from "@tabler/icons-react";
import { InboxCount } from "./InboxCount";
import { TodayCount } from "./TodayCount";
import { useSidebarMode } from "./sidebarMode";
import { useStoredBoolean } from "~/hooks/useStoredBoolean";
import { useLocalWikiAvailable } from "~/lib/wiki/useWikiBridge";
import { WIKI_ROUTE } from "~/lib/wiki/wikiLinks";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { parseNavLayout, NAV_ITEM_CONFIG, type NavSection } from "~/lib/navLayout";

const ITEM_ICONS: Record<string, Icon> = {
  goals: IconTarget,
  decisions: IconGavel,
  actions: IconBriefcase,
  projects: IconStack2,
  products: IconLayoutGrid,
  metrics: IconChartBar,
  shipped: IconGitMerge,
  pages: IconFileText,
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
  /**
   * Native tooltip. Defaults to the label when it is a string, which is what
   * the icon-only rail and any truncated row need to stay readable.
   */
  title?: string;
  /** A disclosed child row: smaller, no icon, indented under its parent. */
  variant?: 'child';
  /** Match only the exact path, not its sub-routes (for a parent whose children are also listed). */
  exact?: boolean;
}

/**
 * A single sidebar navigation link. Highlights itself as active when the
 * current pathname matches `href` (exact or prefix) or, when provided, any of
 * `matchSegments` as a whole route segment after the workspace prefix.
 */
export function NavLink({ href, icon: Icon, children, count, matchSegments, title, variant, exact }: NavLinkProps): React.ReactElement {
  const pathname = usePathname();
  const hrefPath = href.split("?")[0] ?? href;

  // Compare whole route segments after the `/w/:workspaceSlug` prefix so a
  // workspace slug that overlaps a nav segment (e.g. `/w/goals/projects`)
  // doesn't wrongly activate an unrelated item.
  const pathnameSegments = pathname.split("/").filter(Boolean);
  const routeSegments =
    pathnameSegments[0] === "w" ? pathnameSegments.slice(2) : pathnameSegments;
  const isHrefActive = exact
    ? pathname === hrefPath
    : pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);

  const isActive = matchSegments
    ? isHrefActive || matchSegments.some((segment) => routeSegments.includes(segment))
    : isHrefActive;

  const resolvedTitle = title ?? (typeof children === 'string' ? children : undefined);

  return (
    <Link
      href={href}
      className={`sb-nav-item ${variant === 'child' ? 'sb-nav-item--child' : ''} ${isActive ? 'sb-nav-item--active' : ''}`}
      aria-current={isActive ? 'page' : undefined}
      title={resolvedTitle}
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

/** A section heading that cannot fold (Favourites, Recents). */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="sb-section-label">{children}</div>;
}

/**
 * A nav row that discloses a few of its entities underneath — the active
 * projects under Projects, the active goals under Goals — so the most-used
 * destinations are one click away without the sidebar becoming a tree.
 * Folded by default; the fold is remembered per device, and the children
 * are only fetched while it is open.
 */
function DisclosableNavLink({
  itemId,
  href,
  icon,
  label,
  matchSegments,
  workspaceId,
  workspaceSlug,
}: {
  itemId: 'projects' | 'goals';
  href: string;
  icon?: Icon;
  label: string;
  matchSegments?: string[];
  workspaceId: string;
  workspaceSlug: string;
}): React.ReactElement {
  const [expanded, setExpanded] = useStoredBoolean(`sb-disclose:${itemId}`, false);
  const mode = useSidebarMode();
  const isOpen = expanded && mode === 'full';

  const projects = api.project.navChildren.useQuery(
    { workspaceId },
    { enabled: isOpen && itemId === 'projects', staleTime: 60 * 1000 },
  );
  const goals = api.goal.navChildren.useQuery(
    { workspaceId },
    { enabled: isOpen && itemId === 'goals', staleTime: 60 * 1000 },
  );

  const children: Array<{ key: string; href: string; title: string }> =
    itemId === 'projects'
      ? (projects.data ?? []).map((p) => ({
          key: p.id,
          href: `/w/${workspaceSlug}/projects/${p.slug}`,
          title: p.name,
        }))
      : (goals.data ?? []).map((g) => ({
          key: String(g.id),
          href: `/w/${workspaceSlug}/goals/${g.id}`,
          title: g.title,
        }));
  const isLoading = itemId === 'projects' ? projects.isLoading : goals.isLoading;
  const childrenId = `sb-children-${itemId}`;

  return (
    <div className="sb-nav-row sb-nav-row--disclosable">
      <NavLink href={href} icon={icon} matchSegments={matchSegments}>
        {label}
      </NavLink>
      <button
        type="button"
        className="sb-row-action sb-row-action--disclose"
        aria-expanded={isOpen}
        aria-controls={childrenId}
        aria-label={`${isOpen ? 'Hide' : 'Show'} active ${label.toLowerCase()}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <IconChevronRight size={12} />
      </button>
      {isOpen && (
        <div id={childrenId} className="sb-nav-children">
          {isLoading && <span className="sb-nav-item sb-nav-item--child sb-nav-item--muted">Loading…</span>}
          {!isLoading && children.length === 0 && (
            <span className="sb-nav-item sb-nav-item--child sb-nav-item--muted">
              No active {label.toLowerCase()}
            </span>
          )}
          {children.map((child) => (
            <NavLink key={child.key} href={child.href} variant="child">
              {child.title}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One configurable section: a heading that folds the items under it, the
 * fold persisted on the user's nav layout so it follows them between
 * devices. A section with a single item shows no heading at all — the
 * label would cost more than it tells. The rail ignores folds and headings
 * and shows every icon.
 */
function NavSectionBlock({
  section,
  items,
  onToggleCollapsed,
  workspaceId,
  workspaceSlug,
}: {
  section: NavSection;
  items: string[];
  onToggleCollapsed: (sectionId: string) => void;
  workspaceId: string;
  workspaceSlug: string;
}): React.ReactElement {
  const mode = useSidebarMode();
  const showHeading = mode === 'full' && items.length > 1;
  const collapsed = mode === 'full' && items.length > 1 && (section.collapsed ?? false);
  const itemsId = `sb-section-${section.id}`;

  return (
    <div className="sb-section">
      {showHeading && (
        <button
          type="button"
          className="sb-section-header"
          aria-expanded={!collapsed}
          aria-controls={itemsId}
          onClick={() => onToggleCollapsed(section.id)}
        >
          <span className="sb-section-header__label">{section.name}</span>
          <span className="sb-section-header__chevron" aria-hidden="true">
            <IconChevronDown size={12} />
          </span>
        </button>
      )}
      {!collapsed && (
        <div id={itemsId} className="sb-group">
          {items.map((itemId) => {
            const config = NAV_ITEM_CONFIG[itemId];
            if (!config) return null;
            const Icon = ITEM_ICONS[itemId];
            if (itemId === 'projects' || itemId === 'goals') {
              return (
                <DisclosableNavLink
                  key={itemId}
                  itemId={itemId}
                  href={config.href(workspaceSlug)}
                  icon={Icon}
                  label={config.label}
                  matchSegments={config.matchSegments}
                  workspaceId={workspaceId}
                  workspaceSlug={workspaceSlug}
                />
              );
            }
            return (
              <NavLink
                key={itemId}
                href={config.href(workspaceSlug)}
                icon={Icon}
                matchSegments={config.matchSegments}
              >
                {config.label}
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * The global rows every signed-in person gets: Inbox, Today, Time, and the
 * local wiki in the desktop shell.
 */
export function GlobalNavLinks(): React.ReactElement {
  const localWikiAvailable = useLocalWikiAvailable();
  return (
    <div className="sb-group">
      <NavLink href="/inbox" icon={IconInbox} count={<InboxCount />}>
        Inbox
      </NavLink>
      <NavLink href="/today" icon={IconClock} count={<TodayCount />}>
        Today
      </NavLink>
      <NavLink href="/time" icon={IconHourglass}>
        Time
      </NavLink>
      {/* Desktop shell only, and global — the wiki belongs to the device, not
          to a workspace. Absent in a browser, where its IPC doesn't exist. */}
      {localWikiAvailable && (
        <NavLink href={WIKI_ROUTE} icon={IconBook2}>
          Local wiki
        </NavLink>
      )}
    </div>
  );
}

/**
 * Renders the workspace sidebar navigation from the user's persisted
 * `navLayout` preference: the configurable sections/items, with plugin
 * gating and a reduced guest view. The global rows (Inbox/Today/Time) are
 * {@link GlobalNavLinks}, so the shell can place Favourites and Recents
 * between the two.
 */
export function NavLinks(): React.ReactElement {
  const { workspaceSlug, workspaceId, userRole } = useWorkspace();
  const isGuest = userRole === 'guest';
  const utils = api.useUtils();

  const { data: preferences } = api.navigationPreference.getPreferences.useQuery(
    undefined,
    { staleTime: 30 * 1000 },
  );
  const { data: enabledPlugins } = api.pluginConfig.getEnabled.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId && !isGuest, staleTime: 5 * 60 * 1000 },
  );

  const layout = parseNavLayout(preferences?.navLayout ?? null);

  // Folding a section writes the whole layout back, the same way the settings
  // editor does, with the cache updated first so the fold is instant.
  const updateNavLayout = api.navigationPreference.updateNavLayout.useMutation({
    onSuccess: () => utils.navigationPreference.getPreferences.invalidate(),
  });
  const toggleCollapsed = (sectionId: string) => {
    const next = layout.map((s) =>
      s.id === sectionId ? { ...s, collapsed: !(s.collapsed ?? false) } : s,
    );
    utils.navigationPreference.getPreferences.setData(undefined, (old) =>
      old ? { ...old, navLayout: next } : old,
    );
    updateNavLayout.mutate(next);
  };

  if (!workspaceSlug) return <></>;

  // Guest: only projects
  if (isGuest) {
    return (
      <div className="sb-section">
        <div className="sb-group">
          <NavLink href={`/w/${workspaceSlug}/projects`} icon={IconStack2}>
            Projects
          </NavLink>
        </div>
      </div>
    );
  }

  return (
    <>
      {layout.map((section) => {
        if (section.hidden) return null;

        const visibleItems = section.items
          .filter((item) => {
            if (item.hidden) return false;
            const config = NAV_ITEM_CONFIG[item.id];
            if (!config) return false;
            if (config.requiresPlugin && !enabledPlugins?.includes(config.requiresPlugin)) return false;
            return true;
          })
          .map((item) => item.id);

        if (visibleItems.length === 0) return null;

        return (
          <NavSectionBlock
            key={section.id}
            section={section}
            items={visibleItems}
            onToggleCollapsed={toggleCollapsed}
            workspaceId={workspaceId ?? ''}
            workspaceSlug={workspaceSlug}
          />
        );
      })}
    </>
  );
}
