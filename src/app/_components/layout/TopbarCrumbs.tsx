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
  section?: TopbarCrumb;
}

const NO_CRUMBS: TopbarCrumb[] = [];

const TopbarCrumbsContext = createContext<{
  crumbs: TopbarCrumb[];
  section: TopbarCrumb | null;
  register: (id: string, registration: Registration) => void;
  unregister: (id: string) => void;
}>({ crumbs: NO_CRUMBS, section: null, register: () => undefined, unregister: () => undefined });

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

  const { crumbs, section } = useMemo(() => {
    if (registrations.size === 0) return { crumbs: NO_CRUMBS, section: null };
    const ordered = [...registrations.values()].sort((a, b) => a.level - b.level);
    return {
      crumbs: ordered.flatMap((r) => r.crumbs),
      // The deepest registrant that names a section wins.
      section: ordered.reduce<TopbarCrumb | null>((found, r) => r.section ?? found, null),
    };
  }, [registrations]);

  const value = useMemo(() => ({ crumbs, section, register, unregister }), [crumbs, section, register, unregister]);
  return <TopbarCrumbsContext.Provider value={value}>{children}</TopbarCrumbsContext.Provider>;
}

/** The crumbs registered by the mounted pages, outermost first (read by WorkspaceTopbar). */
export function useTopbarCrumbs(): TopbarCrumb[] {
  return useContext(TopbarCrumbsContext).crumbs;
}

/** A page's replacement for the URL-derived section crumb, if one is mounted. */
export function useTopbarSectionOverride(): TopbarCrumb | null {
  return useContext(TopbarCrumbsContext).section;
}

/**
 * Adds this component's crumbs to the topbar while it is mounted. Pass `null`
 * while the entity is loading. `level` orders nested registrants — a layout
 * registers at 0, a detail page under it at 1 — since effect order can't
 * (parents' effects run after their children's).
 *
 * `section` replaces the section crumb the topbar derives from the URL, for a
 * page whose path doesn't say what it is to the reader — a one-off meeting
 * lives under `/ceremonies/…` but is never called a ceremony.
 */
export function useRegisterTopbarCrumbs(
  crumbs: TopbarCrumb[] | null,
  options?: { level?: number; section?: TopbarCrumb },
) {
  const { register, unregister } = useContext(TopbarCrumbsContext);
  const id = useId();
  const level = options?.level ?? 0;
  // Keyed on content, not identity, so callers can pass fresh literals.
  const key = crumbs ? JSON.stringify({ crumbs, section: options?.section }) : null;

  useEffect(() => {
    if (key === null) return;
    const parsed = JSON.parse(key) as { crumbs: TopbarCrumb[]; section?: TopbarCrumb };
    register(id, { level, crumbs: parsed.crumbs, section: parsed.section });
    return () => unregister(id);
  }, [id, key, level, register, unregister]);
}
