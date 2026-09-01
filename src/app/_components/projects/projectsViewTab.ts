"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Last-used view tab for the projects page family, remembered per workspace.
 * Visiting a view saves it; landing on the bare canonical URL (`/projects`,
 * no query) bounces to the saved view. A URL that carries any query params is
 * treated as a deliberate deep link and never redirected.
 */

export type ProjectsViewTab = "table" | "projects-tasks" | "timeline";

const TAB_STORAGE_PREFIX = "exponential.viewTab";

const TAB_PATHS: Record<ProjectsViewTab, string> = {
  table: "/projects",
  "projects-tasks": "/projects-tasks",
  timeline: "/timeline",
};

function tabStorageKey(pathname: string): string {
  const match = /^\/w\/([^/]+)/.exec(pathname);
  return `${TAB_STORAGE_PREFIX}.${match?.[1] ?? "global"}.projects`;
}

export function saveProjectsViewTab(
  pathname: string,
  tab: ProjectsViewTab,
): void {
  try {
    window.localStorage.setItem(tabStorageKey(pathname), tab);
  } catch {
    // Storage unavailable — the tab simply won't be remembered.
  }
}

/**
 * For the non-canonical views (tasks, timeline): being on the view makes it
 * the last-used tab.
 */
export function useSaveProjectsViewTab(tab: ProjectsViewTab): void {
  const pathname = usePathname();
  useEffect(() => {
    saveProjectsViewTab(pathname, tab);
  }, [pathname, tab]);
}

/**
 * For the canonical `/projects` (table) view only. Redirects a bare visit to
 * the remembered tab. The tab links save their destination on click, so
 * deliberately clicking "Projects" from another view lands here with the
 * memory already set to "table" — no bounce-back loop.
 */
export function useProjectsViewTabRedirect(): void {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const attemptedRef = useRef(false);

  const hasParams = searchParams.toString().length > 0;

  useEffect(() => {
    if (attemptedRef.current) return;
    attemptedRef.current = true;

    // A URL with query params is a deep link someone composed — respect it,
    // and don't let merely following it overwrite the saved tab either.
    if (hasParams) return;

    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(tabStorageKey(pathname));
    } catch {
      return;
    }

    if (saved === "projects-tasks" || saved === "timeline") {
      const prefix = /^\/w\/[^/]+/.exec(pathname)?.[0] ?? "";
      router.replace(`${prefix}${TAB_PATHS[saved]}`);
    } else {
      saveProjectsViewTab(pathname, "table");
    }
  }, [router, pathname, hasParams]);
}
