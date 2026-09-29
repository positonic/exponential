'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Extra breadcrumbs a page adds after the workspace topbar's section crumb,
 * e.g. the product name on every `/products/{slug}/...` route. The topbar only
 * knows what the URL tells it (workspace, section); an entity's display name
 * has to come from the page that loaded it.
 */
export interface TopbarCrumb {
  label: string;
  /** Omit on the current page's own crumb. */
  href?: string;
}

const NO_CRUMBS: TopbarCrumb[] = [];

const TopbarCrumbsContext = createContext<{
  crumbs: TopbarCrumb[];
  setCrumbs: (crumbs: TopbarCrumb[]) => void;
}>({ crumbs: NO_CRUMBS, setCrumbs: () => undefined });

export function TopbarCrumbsProvider({ children }: { children: React.ReactNode }) {
  const [crumbs, setCrumbs] = useState<TopbarCrumb[]>(NO_CRUMBS);
  const value = useMemo(() => ({ crumbs, setCrumbs }), [crumbs]);
  return <TopbarCrumbsContext.Provider value={value}>{children}</TopbarCrumbsContext.Provider>;
}

/** The crumbs registered by the current page (read by WorkspaceTopbar). */
export function useTopbarCrumbs(): TopbarCrumb[] {
  return useContext(TopbarCrumbsContext).crumbs;
}

/**
 * Registers this page's crumbs while it is mounted. Pass `null` while the
 * entity is loading. One registrant at a time: the latest mount wins, and
 * unmounting clears the slot.
 */
export function useRegisterTopbarCrumbs(crumbs: TopbarCrumb[] | null) {
  const { setCrumbs } = useContext(TopbarCrumbsContext);
  // Keyed on content, not identity, so callers can pass a fresh array literal.
  const key = crumbs ? JSON.stringify(crumbs) : null;

  useEffect(() => {
    if (key === null) return;
    setCrumbs(JSON.parse(key) as TopbarCrumb[]);
    return () => setCrumbs(NO_CRUMBS);
  }, [key, setCrumbs]);
}
