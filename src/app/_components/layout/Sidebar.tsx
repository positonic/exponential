"use client";

import { NavLinks } from "./NavLinks";
import { FavouritesNav } from "./FavouritesNav";
import { IconMenu2, IconAdjustmentsHorizontal } from "@tabler/icons-react";
import { useState, useEffect, useRef } from 'react';
import { Menu } from "@mantine/core";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { SidebarCustomizePanel } from "./SidebarCustomizePanel";
import { themes, type ValidDomain } from "~/config/themes";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { UserMenu } from "./UserMenu";
import { GlobalAddTaskButton } from "./GlobalAddTaskButton";
import { ActiveTimerWidget } from "./ActiveTimerWidget";
import "./sidebar.css";

export default function Sidebar({ session, domain = 'forceflow.com' }: { session: any; domain?: ValidDomain }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false); // Default to closed
  const theme = themes[domain] ?? themes['forceflow.com']; // Fallback to default theme
  const { workspaceId, userRole } = useWorkspace();
  const canCustomize = !!workspaceId && userRole !== 'guest';

  // Right-click anywhere in the nav opens a small context menu whose only
  // entry switches the sidebar into customise mode (ADR-0073). The menu is
  // anchored to an invisible target placed at the pointer.
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const asideRef = useRef<HTMLElement>(null);

  const handleContextMenu = (event: React.MouseEvent) => {
    if (!canCustomize || isCustomizing) return;
    // Leave the native menu alone on editable fields and on links that open
    // outside the app (custom shortcuts), where "Copy link address" matters.
    // In-app nav items take the customise menu, as in Notion.
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, [contenteditable="true"], a[target="_blank"]')) return;
    event.preventDefault();
    const rect = asideRef.current?.getBoundingClientRect();
    setContextMenu({
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    });
  };

  // Switching or leaving the workspace closes the editor, so an open panel
  // never silently starts editing a different workspace's layout.
  useEffect(() => {
    setIsCustomizing(false);
  }, [workspaceId, canCustomize]);

  // Auto-open sidebar on desktop only
  useEffect(() => {
    const isDesktop = window.matchMedia('(min-width: 640px)').matches;
    if (isDesktop) {
      setIsMenuOpen(true);
    }
  }, []);

  // Sync sidebar state to <html> so CSS can offset the main content
  useEffect(() => {
    document.documentElement.setAttribute('data-sidebar', isMenuOpen ? 'open' : 'closed');
    return () => {
      document.documentElement.removeAttribute('data-sidebar');
    };
  }, [isMenuOpen]);

  if (!session?.user) {
    return null;
  }

  return (
    <>
      {/* Menu Button - visible when sidebar is closed (both mobile and desktop) */}
      <button
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className={`
          sb-toggle fixed left-3 z-[100] p-1.5 rounded-md
          hover:bg-surface-hover transition-all duration-200
          ${isMenuOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}
        `}
        aria-label="Open sidebar"
      >
        <IconMenu2 size={20} className="text-text-secondary" />
      </button>

      {/* Backdrop for mobile */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 sm:hidden z-[90]" 
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      <aside
        ref={asideRef}
        onContextMenu={handleContextMenu}
        className={`
        app-sidebar
        w-screen sm:w-[220px] flex flex-col
        h-screen
        fixed inset-y-0 left-0 z-[95]
        transform transition-all duration-300 ease-in-out
        ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>

        <Menu
          opened={contextMenu !== null}
          onChange={(opened) => { if (!opened) setContextMenu(null); }}
          position="bottom-start"
          offset={2}
          shadow="md"
          width={190}
          withinPortal
        >
          <Menu.Target>
            <div
              aria-hidden
              style={{ position: 'absolute', left: contextMenu?.x ?? 0, top: contextMenu?.y ?? 0, width: 1, height: 1 }}
            />
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconAdjustmentsHorizontal size={16} />}
              onClick={() => { setContextMenu(null); setIsCustomizing(true); }}
            >
              Customize sidebar
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>

        {/* Header with workspace switcher and collapse button */}
        <div className="sb-workspace-divider flex-shrink-0 h-14 flex items-center mt-12 lg:mt-0">
          <WorkspaceSwitcher
            theme={theme}
            onCollapse={() => setIsMenuOpen(false)}
          />
        </div>

        {isCustomizing ? (
          <SidebarCustomizePanel onDone={() => setIsCustomizing(false)} />
        ) : (
          <>
            {/* Scrollable content area */}
            <nav className="flex-1 overflow-y-auto pt-3 pb-2">
              <ActiveTimerWidget />

              <div className="px-2.5 pb-1">
                <GlobalAddTaskButton variant="sidebar" />
              </div>

              <div className="sb-group">
                <NavLinks />
              </div>

              <FavouritesNav />
            </nav>

            <UserMenu session={session} onClose={() => setIsMenuOpen(false)} />
          </>
        )}
      </aside>
    </>
  );
}