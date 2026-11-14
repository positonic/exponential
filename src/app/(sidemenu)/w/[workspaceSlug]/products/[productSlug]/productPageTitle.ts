/**
 * Pure derivation of the browser-tab title for any page in the Products
 * section, kept free of React so it can be unit-tested. The most specific
 * thing on screen leads, because a narrow tab only shows its first few words:
 *
 *   /products/clear              → "CLEAR"
 *   /products/clear/tickets      → "Backlog · CLEAR"
 *   /products/clear/tickets/42   → "Fix the login loop · CLEAR"
 *   /products/clear/tickets/new  → "New ticket · CLEAR"
 *
 * A detail route shows its entity's name once the page has loaded it
 * (`detailLabel`), and its section's label until then.
 */

interface ProductSection {
  /** Listing label, also the stand-in on a detail route still loading. */
  label: string;
  /** Label for the section's `/new` create route, when it has one. */
  newLabel?: string;
}

// Keyed by the first path segment after the product base. Mirrors the tab
// strip's labels, plus the routes reached from it (epics, problems, research)
// and Settings, which renders outside the tab layout.
const PRODUCT_SECTIONS: Record<string, ProductSection> = {
  tickets: { label: "Backlog", newLabel: "New ticket" },
  features: { label: "Features" },
  graph: { label: "Graph" },
  cycles: { label: "Cycles", newLabel: "New cycle" },
  insights: { label: "Insights" },
  decisions: { label: "Decisions" },
  retrospectives: { label: "Retros", newLabel: "New retro" },
  epics: { label: "Epics" },
  problems: { label: "Problems" },
  research: { label: "Research", newLabel: "New research" },
  settings: { label: "Settings" },
};

/** Fixed sub-routes that aren't an entity id (`/decisions/graph`). */
const FIXED_SUBROUTES: Record<string, Record<string, string>> = {
  decisions: { graph: "Decision graph" },
};

export function buildProductPageTitle(args: {
  pathname: string;
  workspaceSlug: string;
  productSlug: string;
  /** Null while the product is still loading. */
  productName: string | null | undefined;
  /** The entity a detail route shows (a ticket's title, a cycle's name). */
  detailLabel?: string | null;
}): string | null {
  const { pathname, workspaceSlug, productSlug } = args;
  const productName = args.productName?.trim() ?? "";
  const detailLabel = args.detailLabel?.trim() ?? "";

  const base = `/w/${workspaceSlug}/products/${productSlug}`;
  const rest = pathname.startsWith(base)
    ? pathname.slice(base.length).replace(/^\/+|\/+$/g, "")
    : "";
  const [segment = "", subroute] = rest ? rest.split("/") : [];

  const section = PRODUCT_SECTIONS[segment];
  let primary: string | null = null;
  if (section) {
    if (!subroute) primary = section.label;
    else if (subroute === "new" && section.newLabel) primary = section.newLabel;
    else primary = FIXED_SUBROUTES[segment]?.[subroute] ?? (detailLabel || section.label);
  }

  const parts = [primary, productName].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(" · ") : null;
}
