"use client";

import { NavLinks } from "./NavLinks";
import { SidebarContent } from "./SidebarContent";
import { IconMenu2 } from "@tabler/icons-react";
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { themes, type ValidDomain } from "~/config/themes";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { UserMenu } from "./UserMenu";

export default function Sidebar({ session, domain = 'forceflow.com' }: { session: any; domain?: ValidDomain }) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false); // Default to closed
  const theme = themes[domain] ?? themes['forceflow.com']; // Fallback to default theme

  // Auto-open sidebar on desktop only
  useEffect(() => {
    const isDesktop = window.matchMedia('(min-width: 640px)').matches;
    if (isDesktop) {
      setIsMenuOpen(true);
    }
  }, []);

  if (!session?.user || pathname.startsWith('/onboarding')) {
    return null;
  }

  return (
    <>
      {/* Menu Button - visible when sidebar is closed (both mobile and desktop) */}
      <button
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className={`
          fixed top-[calc(0.5rem+env(safe-area-inset-top))] left-3 z-[100] p-1.5 rounded-md
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

      <aside className={`
        w-screen sm:w-64 border-r border-border-primary flex flex-col 
        h-screen
        bg-background-secondary
        fixed sm:static inset-y-0 left-0 z-[95]
        transform transition-all duration-300 ease-in-out
        ${isMenuOpen ? 'translate-x-0' : 'translate-x-[-100%] sm:translate-x-0 sm:ml-[-16rem]'}
        `}>
        
        {/* Header with workspace switcher and collapse button */}
        <div className="flex-shrink-0 bg-background-secondary h-12 flex items-center border-b border-border-primary mt-12 lg:mt-0">
          <WorkspaceSwitcher
            theme={theme}
            onCollapse={() => setIsMenuOpen(false)}
          />
        </div>

        {/* Scrollable content area */}
        <nav className="flex-1 overflow-y-auto px-1 py-4 space-y-6">
          <div className="space-y-2">
            <NavLinks />
          </div>

          <SidebarContent />
        </nav>

        <UserMenu session={session} onClose={() => setIsMenuOpen(false)} />
      </aside>
    </>
  );
}