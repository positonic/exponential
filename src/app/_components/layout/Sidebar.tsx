"use client";

import { NavLinks } from "./NavLinks";
import { SidebarContent } from "./SidebarContent";
import { IconMenu2, IconX } from "@tabler/icons-react";
import { useState, useEffect } from 'react';
import { themes, type ValidDomain } from "~/config/themes";
import { LogoDisplay } from "./LogoDisplay";
import { UserMenu } from "./UserMenu";

export default function Sidebar({ session, domain = 'forceflow.com' }: { session: any; domain?: ValidDomain }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false); // Default to closed
  const theme = themes[domain] ?? themes['forceflow.com']; // Fallback to default theme

  // Auto-open sidebar on desktop only
  useEffect(() => {
    const isDesktop = window.matchMedia('(min-width: 640px)').matches;
    if (isDesktop) {
      setIsMenuOpen(true);
    }
  }, []);

  if (!session?.user) {
    return null;
  }

  return (
    <>
      {/* Menu Button - visible when sidebar is closed (both mobile and desktop) */}
      <button
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className={`
          fixed top-4 left-4 z-[100] p-2 rounded-lg bg-surface-secondary
          transition-transform duration-200
          ${isMenuOpen ? 'translate-x-[-100%]' : 'translate-x-0'}
        `}
      >
        <IconMenu2 size={24} className="text-text-secondary" />
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
        ${isMenuOpen ? 'translate-x-0' : 'translate-x-[-100%]'}
        `}>
        
        {/* Header with logo and close button */}
        <div className="flex-shrink-0 bg-background-secondary px-4 py-4 flex items-center justify-between border-b border-border-primary mt-12 lg:mt-0">
          <LogoDisplay 
            theme={theme} 
            href="/" 
            onClick={() => setIsMenuOpen(false)}
            className="text"
            imageSize={40}
          />
          
          {/* Close button */}
          <button
            onClick={() => setIsMenuOpen(false)}
            className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
          >
            <IconX size={20} className="text-text-secondary hover:text-text-primary" />
          </button>
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