import type { DocBreadcrumb, DocNavItem, DocNavSection } from "./types";

/**
 * Pure helpers over a sidebar built by `buildDocsNavigation`. The sidebar
 * itself comes from page frontmatter — nothing is hand-listed here.
 */

export function flattenNavigation(nav: DocNavSection[]): DocNavItem[] {
  const flat: DocNavItem[] = [];
  for (const section of nav) {
    for (const item of section.items) {
      flat.push({ title: item.title, href: item.href });
      for (const child of item.children ?? []) {
        flat.push({ title: child.title, href: child.href });
      }
    }
  }
  return flat;
}

export function getCurrentSection(nav: DocNavSection[], pathname: string): string | null {
  for (const section of nav) {
    for (const item of section.items) {
      if (item.href === pathname) return section.title;
      if (item.children?.some((c) => c.href === pathname)) return section.title;
    }
  }
  return null;
}

export function getPrevNextPages(
  nav: DocNavSection[],
  pathname: string,
): { prev: DocNavItem | null; next: DocNavItem | null } {
  const flat = flattenNavigation(nav);
  const i = flat.findIndex((item) => item.href === pathname);
  if (i === -1) return { prev: null, next: null };
  return {
    prev: i > 0 ? (flat[i - 1] ?? null) : null,
    next: i < flat.length - 1 ? (flat[i + 1] ?? null) : null,
  };
}

export function getBreadcrumbs(nav: DocNavSection[], pathname: string): DocBreadcrumb[] {
  const crumbs: DocBreadcrumb[] = [{ title: "Docs", href: "/docs" }];
  for (const section of nav) {
    for (const item of section.items) {
      if (item.href === pathname) {
        crumbs.push({ title: section.title });
        return crumbs;
      }
      if (item.children?.some((c) => c.href === pathname)) {
        crumbs.push({ title: section.title });
        crumbs.push({ title: item.title, href: item.href });
        return crumbs;
      }
    }
  }
  return crumbs;
}
