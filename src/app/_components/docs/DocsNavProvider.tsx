"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { DocNavSection, DocSearchEntry } from "~/lib/docs/types";

interface DocsNavContextValue {
  nav: DocNavSection[];
  searchIndex: DocSearchEntry[];
  isSearchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
}

const DocsNavContext = createContext<DocsNavContextValue | null>(null);

/**
 * Carries the frontmatter-derived sidebar and the search index (both built
 * on the server in the docs layout) to the client components that render
 * the sidebar, breadcrumb, prev/next footer and search dialog.
 */
export function DocsNavProvider({
  nav,
  searchIndex,
  children,
}: {
  nav: DocNavSection[];
  searchIndex: DocSearchEntry[];
  children: ReactNode;
}) {
  const [isSearchOpen, setSearchOpen] = useState(false);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const value = useMemo(
    () => ({ nav, searchIndex, isSearchOpen, openSearch, closeSearch }),
    [nav, searchIndex, isSearchOpen, openSearch, closeSearch],
  );
  return <DocsNavContext.Provider value={value}>{children}</DocsNavContext.Provider>;
}

export function useDocsNav(): DocsNavContextValue {
  const ctx = useContext(DocsNavContext);
  if (!ctx) {
    throw new Error("useDocsNav must be used inside <DocsNavProvider> (the docs layout)");
  }
  return ctx;
}
