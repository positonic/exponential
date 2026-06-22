/**
 * Pure derivation of a "page" favourite target for any page in the Products
 * section. Kept free of React so it can be unit-tested in isolation: given the
 * current pathname + workspace/product slugs + product name, it returns the
 * workspace-relative path (the favourite's entityId), a snapshot label, and an
 * icon name the sidebar maps to a glyph.
 *
 * Nested detail routes (e.g. a specific ticket) resolve to their parent tab's
 * label — accurate path, tab-level label — per the products favourites design.
 */

interface ProductTab {
  /** First path segment after the product base ("" = overview). */
  segment: string;
  /** Label suffix; null for the overview (which uses the bare product name). */
  label: string | null;
  /** Icon name persisted on the favourite and mapped by the sidebar. */
  icon: string;
}

// Canonical product sub-pages. Includes Settings (which renders outside the
// shared tab layout) so the helper covers the whole section in one place.
const PRODUCT_TABS: ProductTab[] = [
  { segment: "", label: null, icon: "product" },
  { segment: "problems", label: "Problems", icon: "problems" },
  { segment: "tickets", label: "Backlog", icon: "backlog" },
  { segment: "features", label: "Features", icon: "features" },
  { segment: "graph", label: "Graph", icon: "graph" },
  { segment: "cycles", label: "Cycles", icon: "cycles" },
  { segment: "research", label: "Insights", icon: "research" },
  { segment: "retrospectives", label: "Retro", icon: "retro" },
  { segment: "settings", label: "Settings", icon: "settings" },
];

export interface ProductFavoriteTarget {
  /** Workspace-relative path, e.g. "products/acme/features". */
  entityId: string;
  /** Snapshot display label, e.g. "Acme · Features" (or "Acme" for overview). */
  label: string;
  /** Icon name, mapped to a glyph by the sidebar. */
  icon: string;
}

export function buildProductFavoriteTarget(args: {
  pathname: string;
  workspaceSlug: string;
  productSlug: string;
  productName: string;
}): ProductFavoriteTarget {
  const { pathname, workspaceSlug, productSlug, productName } = args;

  // Workspace-relative path (strip the /w/<slug>/ prefix).
  const wsPrefix = `/w/${workspaceSlug}/`;
  const entityId = pathname.startsWith(wsPrefix)
    ? pathname.slice(wsPrefix.length)
    : pathname.replace(/^\//, "");

  // First segment after the product base determines the tab.
  const base = `/w/${workspaceSlug}/products/${productSlug}`;
  const rest = pathname.startsWith(base)
    ? pathname.slice(base.length).replace(/^\//, "")
    : "";
  const segment = rest.split("/")[0] ?? "";

  const tab =
    PRODUCT_TABS.find((t) => t.segment === segment) ?? PRODUCT_TABS[0]!;
  const label = tab.label ? `${productName} · ${tab.label}` : productName;

  return { entityId, label, icon: tab.icon };
}
