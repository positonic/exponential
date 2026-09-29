'use client';

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from 'react';

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

interface Registration {
  level: number;
  crumbs: TopbarCrumb[];
}

const NO_CRUMBS: TopbarCrumb[] = [];

const TopbarCrumbsContext = createContext<{
  crumbs: TopbarCrumb[];
  register: (id: string, registration: Registration) => void;
  unregister: (id: string) => void;
}>({ crumbs: NO_CRUMBS, register: () => undefined, unregister: () => undefined });

/**
 * Each registrant owns its own entry, keyed by a stable id, and removes only
 * that entry on unmount. A single shared slot would not do: a detail page's
 * crumb unmounting would wipe the product layout's crumb, and the layout (whose
 * inputs didn't change) would never re-register it — the trap
 * `useRegisterPageContext` documents for its own shared slot.
 */
export function TopbarCrumbsProvider({ children }: { children: React.ReactNode }) {
  const [registrations, setRegistrations] = useState<ReadonlyMap<string, Registration>>(
    () => new Map(),
  );

  const register = useCallback((id: string, registration: Registration) => {
    setRegistrations((prev) => new Map(prev).set(id, registration));
  }, []);

  const unregister = useCallback((id: string) => {
    setRegistrations((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const crumbs = useMemo(() => {
    if (registrations.size === 0) return NO_CRUMBS;
    return [...registrations.values()]
      .sort((a, b) => a.level - b.level)
      .flatMap((r) => r.crumbs);
  }, [registrations]);

  const value = useMemo(() => ({ crumbs, register, unregister }), [crumbs, register, unregister]);
  return <TopbarCrumbsContext.Provider value={value}>{children}</TopbarCrumbsContext.Provider>;
}

/** The crumbs registered by the mounted pages, outermost first (read by WorkspaceTopbar). */
export function useTopbarCrumbs(): TopbarCrumb[] {
  return useContext(TopbarCrumbsContext).crumbs;
}

/**
 * Adds this component's crumbs to the topbar while it is mounted. Pass `null`
 * while the entity is loading. `level` orders nested registrants — a layout
 * registers at 0, a detail page under it at 1 — since effect order can't
 * (parents' effects run after their children's).
 */
export function useRegisterTopbarCrumbs(
  crumbs: TopbarCrumb[] | null,
  options?: { level?: number },
) {
  const { register, unregister } = useContext(TopbarCrumbsContext);
  const id = useId();
  const level = options?.level ?? 0;
  // Keyed on content, not identity, so callers can pass a fresh array literal.
  const key = crumbs ? JSON.stringify(crumbs) : null;

  useEffect(() => {
    if (key === null) return;
    register(id, { level, crumbs: JSON.parse(key) as TopbarCrumb[] });
    return () => unregister(id);
  }, [id, key, level, register, unregister]);
}
