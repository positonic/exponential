"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Drawer } from "@mantine/core";
import { IconMenu2, IconSearch } from "@tabler/icons-react";
import { getCurrentSection } from "~/lib/docs/navigation";
import { useDocsNav } from "./DocsNavProvider";
import { DocsSidebarNav } from "./DocsSidebarNav";

/**
 * Below `lg` the sidebar column is hidden; this sticky bar opens it as a
 * drawer and exposes search. Closes itself on navigation.
 */
export function DocsMobileBar() {
  const [opened, setOpened] = useState(false);
  const pathname = usePathname();
  const { nav, openSearch } = useDocsNav();
  const { status } = useSession();
  const isLoggedIn = status === "authenticated";
  const section = getCurrentSection(nav, pathname);

  useEffect(() => {
    setOpened(false);
  }, [pathname]);

  return (
    <>
      <div
        className={`sticky z-20 flex items-center gap-2 border-b border-border-primary bg-background-primary px-4 py-2 lg:hidden ${
          isLoggedIn ? "top-0 ml-12" : "top-16"
        }`}
      >
        <button
          type="button"
          onClick={() => setOpened(true)}
          aria-label="Open docs navigation"
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          <IconMenu2 size={18} />
          <span>{section ?? "Docs"}</span>
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={openSearch}
          aria-label="Search the docs"
          className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          <IconSearch size={18} />
        </button>
      </div>

      <Drawer
        opened={opened}
        onClose={() => setOpened(false)}
        title="Documentation"
        size="min(85vw, 320px)"
        padding="md"
        zIndex={300}
      >
        <DocsSidebarNav onNavigate={() => setOpened(false)} />
      </Drawer>
    </>
  );
}
