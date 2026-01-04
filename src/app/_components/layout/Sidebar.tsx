"use client";

import Link from "next/link";
import { NavLinks } from "./NavLinks";
import { SidebarContent } from "./SidebarContent";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { IconMenu2, IconX } from "@tabler/icons-react";
import { useState, useEffect } from 'react';
import { themes, type ValidDomain } from "~/config/themes";
import { LogoDisplay } from "./LogoDisplay";
import { ThemeToggle } from "../ThemeToggle";

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

  console.log('domain', domain);
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
          />
          
          {/* Close button */}
          <button
            onClick={() => setIsMenuOpen(false)}
            className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
          >
            <IconX size={20} className="text-text-secondary hover:text-text-primary" />
          </button>
        </div>
        
        {/* Workspace Switcher */}
        <WorkspaceSwitcher />

        {/* Scrollable content area */}
        <nav className="flex-1 overflow-y-auto px-1 py-4 space-y-6">
          <div className="space-y-2">
            <NavLinks />
          </div>

          <SidebarContent />
        </nav>

        {/* Fixed bottom section */}
        <div className="flex-shrink-0 flex flex-col gap-2 border-t border-border-primary pt-4 px-4 pb-4">
          <div className="flex items-center justify-between px-3 py-2">
            <Link
              href="https://github.com/positonic/ai-todo"
              onClick={() => setIsMenuOpen(false)}
              className="text-text-secondary hover:text-text-primary transition-colors"
            >
              <GithubIcon className="h-6 w-6" />
            </Link>
            <ThemeToggle />
          </div>
          <Link
            href={session ? "/api/auth/signout" : "/signin"}
            onClick={() => setIsMenuOpen(false)}
            className="flex w-full items-center rounded-lg px-3 py-3 sm:py-2 text-text-secondary hover:bg-surface-hover active:bg-surface-active sm:active:bg-transparent"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="mr-2 h-5 w-5"
            >
              <path
                fillRule="evenodd"
                d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z"
                clipRule="evenodd"
              />
              <path
                fillRule="evenodd"
                d="M19 10a.75.75 0 00-.75-.75H8.704l1.048-.943a.75.75 0 10-1.004-1.114l-2.5 2.25a.75.75 0 000 1.114l2.5 2.25a.75.75 0 101.004-1.114l-1.048-.943h9.546A.75.75 0 0019 10z"
                clipRule="evenodd"
              />
            </svg>
            {session ? "Sign out" : "Sign in"}
          </Link>
        </div>
      </aside>
    </>
  );
}

function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}