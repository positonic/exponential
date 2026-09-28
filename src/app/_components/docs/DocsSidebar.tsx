"use client";

import { useSession } from "next-auth/react";
import { DocsSidebarNav } from "./DocsSidebarNav";

/**
 * Desktop sidebar column. Hidden below `lg`, where `DocsMobileBar` provides
 * the same navigation in a drawer.
 */
export function DocsSidebar() {
  const { status } = useSession();
  const isLoggedIn = status === "authenticated";

  return (
    <nav
      aria-label="Docs sections"
      className="hidden w-64 shrink-0 border-r border-border-primary bg-background-primary lg:block"
    >
      <div
        className={`sticky overflow-y-auto ${
          isLoggedIn ? "top-0 h-screen p-4" : "top-16 h-[calc(100vh-4rem)] px-4 pb-4 pt-10"
        }`}
      >
        <DocsSidebarNav />
      </div>
    </nav>
  );
}
