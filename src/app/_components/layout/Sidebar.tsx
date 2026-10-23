"use client";

import { NavLinks, GlobalNavLinks } from "./NavLinks";
import { FavouritesNav } from "./FavouritesNav";
import { RecentsNav, RecentsRecorder } from "./RecentsNav";
import { SidebarModeProvider, type SidebarMode } from "./sidebarMode";
import { IconMenu2, IconSearch } from "@tabler/icons-react";
import { useState, useEffect } from 'react';
import { themes, type ValidDomain } from "~/config/themes";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { UserMenu } from "./UserMenu";
import { GlobalAddTaskButton } from "./GlobalAddTaskButton";
import { ActiveTimerWidget } from "./ActiveTimerWidget";
import { useStoredBoolean } from "~/hooks/useStoredBoolean";
import { useModKey } from "~/hooks/useModKey";
import { openCommandPalette } from "~/lib/commandPalette";
import "./sidebar.css";

const DESKTOP_QUERY = '(min-width: 640px)';

/**
 * The app's left nav. On desktop it is always on screen, either full width
 * or folded to an icon rail (remembered per device); on mobile it is a
 * drawer over a backdrop. The state is mirrored onto `<html data-sidebar>`
 * so the main column and topbars can offset themselves in CSS.
 */
export default function Sidebar({ session, domain = 'forceflow.com' }: { session: any; domain?: ValidDomain }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false); // Default to closed
  const [isDesktop, setIsDesktop] = useState(false);
  const [rail, setRail] = useStoredBoolean('sb-rail', false);
  const mod = useModKey();
  const theme = themes[domain] ?? themes['forceflow.com']; // Fallback to default theme

  // Auto-open sidebar on desktop only
  useEffect(() => {
    const desktop = window.matchMedia(DESKTOP_QUERY).matches;
    setIsDesktop(desktop);
    if (desktop) {
      setIsMenuOpen(true);
    }
  }, []);

  const mode: SidebarMode = isDesktop && rail ? 'rail' : 'full';

  // Sync sidebar state to <html> so CSS can offset the main content
  useEffect(() => {
    const state = !isMenuOpen ? 'closed' : mode === 'rail' ? 'rail' : 'open';
    document.documentElement.setAttribute('data-sidebar', state);
    return () => {
      document.documentElement.removeAttribute('data-sidebar');
    };
  }, [isMenuOpen, mode]);

  if (!session?.user) {
    return null;
  }

  // Desktop folds to the rail; mobile closes the drawer.
  const collapse = () => {
    if (isDesktop) setRail(true);
    else setIsMenuOpen(false);
  };

  return (
    <SidebarModeProvider value={mode}>
      {/* Menu Button - visible when sidebar is closed (mobile) */}
      <button
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className={`
          sb-toggle fixed left-3 z-[100] flex items-center justify-center rounded-md
          hover:bg-surface-hover transition-all duration-200
          ${isMenuOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}
        `}
        aria-label="Open sidebar"
      >
        <IconMenu2 size={18} stroke={1.75} className="text-text-secondary" />
      </button>

      {/* Backdrop for mobile */}
      {isMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 sm:hidden z-[90]"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      <aside className={`
        app-sidebar ${mode === 'rail' ? 'app-sidebar--rail' : ''}
        flex flex-col
        h-screen
        fixed inset-y-0 left-0 z-[95]
        transform transition-all duration-300 ease-in-out
        ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>

        {/* Header with workspace switcher and collapse button */}
        <div className={`sb-workspace-divider flex-shrink-0 flex items-center mt-12 lg:mt-0 ${mode === 'rail' ? 'py-1' : 'h-14'}`}>
          <WorkspaceSwitcher
            theme={theme}
            compact={mode === 'rail'}
            onCollapse={collapse}
            onExpand={() => setRail(false)}
          />
        </div>

        {/* Scrollable content area */}
        <nav className="flex-1 overflow-y-auto pt-3 pb-2">
          <div className="sb-rail-hide">
            <ActiveTimerWidget />
          </div>

          <div className="px-2.5 pb-1 flex flex-col gap-1.5">
            <button
              type="button"
              className="sb-search"
              onClick={openCommandPalette}
              aria-label="Search"
              title={`Search (${mod.label}K)`}
              aria-keyshortcuts={`${mod.aria}+K`}
            >
              <span className="sb-search__icon">
                <IconSearch size={14} />
              </span>
              <span className="sb-search__label">Search or ask…</span>
              <span className="sb-search__kbd">{mod.label}K</span>
            </button>
            <GlobalAddTaskButton variant="sidebar" />
          </div>

          <GlobalNavLinks />
          <FavouritesNav />
          <RecentsNav />
          <NavLinks />
          <RecentsRecorder />
        </nav>

        <UserMenu session={session} onClose={() => setIsMenuOpen(false)} />
      </aside>
    </SidebarModeProvider>
  );
}
