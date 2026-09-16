/**
 * Every authenticated page the perf harness measures: all of
 * `(sidemenu)/w/[workspaceSlug]/**` plus the top-level `(sidemenu)` routes.
 *
 * Patterns use the app-router segment names verbatim; `resolveRoutes` fills
 * them from `PerfParams` (looked up from the seeded fixture DB in
 * global-setup). A route whose params can't be filled is reported as skipped
 * with the reason, never silently dropped.
 *
 * `group` shards the run (PERF_GROUP) — groups are sized so each is a
 * reasonable single measurement batch.
 */

export type PerfGroup =
  | "ws-core"
  | "ws-crm"
  | "ws-products"
  | "ws-product-detail"
  | "ws-meta"
  | "top-daily"
  | "top-other";

export interface RouteSpec {
  pattern: string;
  group: PerfGroup;
  /** Why this route is not measured (e.g. admin-only for the fixture user). */
  skip?: string;
}

export const ROUTES: RouteSpec[] = [
  // ---- workspace: core work surfaces ----
  { pattern: "/w/[workspaceSlug]", group: "ws-core" },
  { pattern: "/w/[workspaceSlug]/home", group: "ws-core" },
  { pattern: "/w/[workspaceSlug]/actions", group: "ws-core" },
  { pattern: "/w/[workspaceSlug]/actions/[actionId]", group: "ws-core" },
  { pattern: "/w/[workspaceSlug]/projects", group: "ws-core" },
  { pattern: "/w/[workspaceSlug]/projects/[slug]", group: "ws-core" },
  { pattern: "/w/[workspaceSlug]/projects/[slug]/project-details", group: "ws-core" },
  { pattern: "/w/[workspaceSlug]/projects-tasks", group: "ws-core" },
  { pattern: "/w/[workspaceSlug]/goals", group: "ws-core" },
  { pattern: "/w/[workspaceSlug]/goals/[goalId]", group: "ws-core" },
  { pattern: "/w/[workspaceSlug]/okrs", group: "ws-core" },
  { pattern: "/w/[workspaceSlug]/okr-checkin", group: "ws-core" },
  { pattern: "/w/[workspaceSlug]/meetings", group: "ws-core" },
  { pattern: "/w/[workspaceSlug]/weekly-plan", group: "ws-core" },
  { pattern: "/w/[workspaceSlug]/timeline", group: "ws-core" },
  { pattern: "/w/[workspaceSlug]/views", group: "ws-core" },
  { pattern: "/w/[workspaceSlug]/activity", group: "ws-core" },

  // ---- workspace: CRM ----
  { pattern: "/w/[workspaceSlug]/crm", group: "ws-crm" },
  { pattern: "/w/[workspaceSlug]/crm/contacts", group: "ws-crm" },
  { pattern: "/w/[workspaceSlug]/crm/contacts/[contactId]", group: "ws-crm" },
  { pattern: "/w/[workspaceSlug]/crm/organizations", group: "ws-crm" },
  { pattern: "/w/[workspaceSlug]/crm/organizations/[organizationId]", group: "ws-crm" },
  { pattern: "/w/[workspaceSlug]/crm/pipeline", group: "ws-crm" },
  { pattern: "/w/[workspaceSlug]/crm/pipeline/settings", group: "ws-crm" },
  { pattern: "/w/[workspaceSlug]/crm/lists", group: "ws-crm" },
  { pattern: "/w/[workspaceSlug]/crm/lists/[collectionId]", group: "ws-crm" },
  { pattern: "/w/[workspaceSlug]/crm/forms", group: "ws-crm" },
  { pattern: "/w/[workspaceSlug]/crm/forms/[formId]", group: "ws-crm" },
  { pattern: "/w/[workspaceSlug]/crm/automations", group: "ws-crm" },
  { pattern: "/w/[workspaceSlug]/crm/automations/[automationId]", group: "ws-crm" },
  { pattern: "/w/[workspaceSlug]/crm/broadcasts", group: "ws-crm" },

  // ---- workspace: products (lists + product-level pages) ----
  { pattern: "/w/[workspaceSlug]/products", group: "ws-products" },
  { pattern: "/w/[workspaceSlug]/products/new", group: "ws-products" },
  { pattern: "/w/[workspaceSlug]/products-grid", group: "ws-products" },
  { pattern: "/w/[workspaceSlug]/products-projects", group: "ws-products" },
  { pattern: "/w/[workspaceSlug]/products-roadmap", group: "ws-products" },
  { pattern: "/w/[workspaceSlug]/products/[productSlug]", group: "ws-products" },
  { pattern: "/w/[workspaceSlug]/products/[productSlug]/tickets", group: "ws-products" },
  { pattern: "/w/[workspaceSlug]/products/[productSlug]/tickets/new", group: "ws-products" },
  { pattern: "/w/[workspaceSlug]/products/[productSlug]/features", group: "ws-products" },
  { pattern: "/w/[workspaceSlug]/products/[productSlug]/cycles", group: "ws-products" },
  { pattern: "/w/[workspaceSlug]/products/[productSlug]/cycles/new", group: "ws-products" },
  { pattern: "/w/[workspaceSlug]/products/[productSlug]/epics", group: "ws-products" },
  { pattern: "/w/[workspaceSlug]/products/[productSlug]/insights", group: "ws-products" },
  { pattern: "/w/[workspaceSlug]/products/[productSlug]/problems", group: "ws-products" },
  { pattern: "/w/[workspaceSlug]/products/[productSlug]/research", group: "ws-products" },
  { pattern: "/w/[workspaceSlug]/products/[productSlug]/research/new", group: "ws-products" },
  { pattern: "/w/[workspaceSlug]/products/[productSlug]/retrospectives", group: "ws-products" },
  { pattern: "/w/[workspaceSlug]/products/[productSlug]/retrospectives/new", group: "ws-products" },
  { pattern: "/w/[workspaceSlug]/products/[productSlug]/graph", group: "ws-products" },
  { pattern: "/w/[workspaceSlug]/products/[productSlug]/decisions", group: "ws-products" },
  { pattern: "/w/[workspaceSlug]/products/[productSlug]/decisions/graph", group: "ws-products" },
  { pattern: "/w/[workspaceSlug]/products/[productSlug]/settings", group: "ws-products" },

  // ---- workspace: product entity detail pages ----
  { pattern: "/w/[workspaceSlug]/products/[productSlug]/tickets/[ticketId]", group: "ws-product-detail" },
  { pattern: "/w/[workspaceSlug]/products/[productSlug]/features/[featureId]", group: "ws-product-detail" },
  { pattern: "/w/[workspaceSlug]/products/[productSlug]/features/[featureId]/scopes/[scopeId]", group: "ws-product-detail" },
  { pattern: "/w/[workspaceSlug]/products/[productSlug]/cycles/[cycleId]", group: "ws-product-detail" },
  { pattern: "/w/[workspaceSlug]/products/[productSlug]/epics/[epicId]", group: "ws-product-detail" },
  { pattern: "/w/[workspaceSlug]/products/[productSlug]/insights/[insightId]", group: "ws-product-detail" },
  { pattern: "/w/[workspaceSlug]/products/[productSlug]/research/[researchId]", group: "ws-product-detail" },
  { pattern: "/w/[workspaceSlug]/products/[productSlug]/retrospectives/[retroId]", group: "ws-product-detail" },
  { pattern: "/w/[workspaceSlug]/ceremonies/[ceremonyId]", group: "ws-product-detail" },
  { pattern: "/w/[workspaceSlug]/ceremonies/[ceremonyId]/[occurrenceId]", group: "ws-product-detail" },
  { pattern: "/w/[workspaceSlug]/decisions", group: "ws-product-detail" },
  { pattern: "/w/[workspaceSlug]/decisions/graph", group: "ws-product-detail" },
  { pattern: "/w/[workspaceSlug]/decisions/d/[decisionId]", group: "ws-product-detail" },
  { pattern: "/w/[workspaceSlug]/decisions/[adrId]", group: "ws-product-detail" },

  // ---- workspace: knowledge, agent, settings, misc ----
  { pattern: "/w/[workspaceSlug]/knowledge-base", group: "ws-meta" },
  { pattern: "/w/[workspaceSlug]/pages", group: "ws-meta" },
  { pattern: "/w/[workspaceSlug]/pages/[pageId]", group: "ws-meta" },
  { pattern: "/w/[workspaceSlug]/agent", group: "ws-meta" },
  { pattern: "/w/[workspaceSlug]/alignment", group: "ws-meta" },
  { pattern: "/w/[workspaceSlug]/content", group: "ws-meta" },
  { pattern: "/w/[workspaceSlug]/metrics", group: "ws-meta" },
  { pattern: "/w/[workspaceSlug]/workspace", group: "ws-meta" },
  { pattern: "/w/[workspaceSlug]/weekly-team-checkin", group: "ws-meta" },
  { pattern: "/w/[workspaceSlug]/weekly-team-checkin/settings", group: "ws-meta" },
  { pattern: "/w/[workspaceSlug]/settings", group: "ws-meta" },
  { pattern: "/w/[workspaceSlug]/settings/ceremonies", group: "ws-meta" },
  { pattern: "/w/[workspaceSlug]/settings/decisions", group: "ws-meta" },
  { pattern: "/w/[workspaceSlug]/settings/plugins", group: "ws-meta" },
  { pattern: "/w/[workspaceSlug]/voice-debug", group: "ws-meta" },

  // ---- top-level: daily-use surfaces ----
  { pattern: "/today", group: "top-daily" },
  { pattern: "/inbox", group: "top-daily" },
  { pattern: "/upcoming", group: "top-daily" },
  { pattern: "/calendar", group: "top-daily" },
  { pattern: "/home", group: "top-daily" },
  { pattern: "/act", group: "top-daily" },
  { pattern: "/actions", group: "top-daily" },
  { pattern: "/daily-plan", group: "top-daily" },
  { pattern: "/plan", group: "top-daily" },
  { pattern: "/days", group: "top-daily" },
  { pattern: "/days/[date]", group: "top-daily" },
  { pattern: "/journal", group: "top-daily" },
  { pattern: "/habits", group: "top-daily" },
  { pattern: "/time", group: "top-daily" },
  { pattern: "/timeline", group: "top-daily" },
  { pattern: "/weekly-plan", group: "top-daily" },
  { pattern: "/weekly-plan/history", group: "top-daily" },
  { pattern: "/weekly-plan/settings", group: "top-daily" },
  { pattern: "/startup-routine", group: "top-daily" },
  { pattern: "/wind-down", group: "top-daily" },
  { pattern: "/projects", group: "top-daily" },
  { pattern: "/projects/[slug]", group: "top-daily" },
  { pattern: "/projects-tasks", group: "top-daily" },
  { pattern: "/goals", group: "top-daily" },
  { pattern: "/meetings", group: "top-daily" },
  { pattern: "/recordings", group: "top-daily" },
  { pattern: "/recording/[recordingId]", group: "top-daily" },
  { pattern: "/wiki", group: "top-daily" },
  { pattern: "/wiki/[...path]", group: "top-daily" },

  // ---- top-level: everything else ----
  { pattern: "/activity", group: "top-other" },
  { pattern: "/agent", group: "top-other" },
  { pattern: "/ai-automation", group: "top-other" },
  { pattern: "/ai-history", group: "top-other" },
  { pattern: "/ai-sales-blog", group: "top-other" },
  { pattern: "/ai-sales-demo", group: "top-other" },
  { pattern: "/ai-sales-feedback", group: "top-other" },
  { pattern: "/alignment", group: "top-other" },
  { pattern: "/connections", group: "top-other" },
  { pattern: "/docs", group: "top-other" },
  { pattern: "/docs/[...docPath]", group: "top-other" },
  { pattern: "/features", group: "top-other" },
  { pattern: "/github-integration", group: "top-other" },
  { pattern: "/google-access", group: "top-other" },
  { pattern: "/integrations", group: "top-other" },
  { pattern: "/integrations/whatsapp/[whatsappId]", group: "top-other" },
  { pattern: "/knowledge-base", group: "top-other" },
  { pattern: "/onboarding", group: "top-other" },
  { pattern: "/privacy", group: "top-other" },
  { pattern: "/productivity", group: "top-other" },
  { pattern: "/productivity-methods/team-weekly-planning", group: "top-other" },
  { pattern: "/productivity-methods/weekly-plan", group: "top-other" },
  { pattern: "/quotes", group: "top-other" },
  { pattern: "/roadmap", group: "top-other" },
  { pattern: "/settings", group: "top-other" },
  { pattern: "/settings/agents", group: "top-other" },
  { pattern: "/settings/ai-history", group: "top-other" },
  { pattern: "/settings/ai-tools", group: "top-other" },
  { pattern: "/settings/api-keys", group: "top-other" },
  { pattern: "/settings/appearance", group: "top-other" },
  { pattern: "/settings/assistant", group: "top-other" },
  { pattern: "/settings/integrations", group: "top-other" },
  { pattern: "/settings/notifications", group: "top-other" },
  { pattern: "/settings/profile", group: "top-other" },
  { pattern: "/simli", group: "top-other" },
  { pattern: "/slack-messages", group: "top-other" },
  { pattern: "/teams", group: "top-other" },
  { pattern: "/teams/[teamSlug]", group: "top-other" },
  { pattern: "/teams/[teamSlug]/members/[userId]/weekly-plan", group: "top-other" },
  { pattern: "/terms", group: "top-other" },
  { pattern: "/video/[videoSlug]", group: "top-other" },
  { pattern: "/videos", group: "top-other" },
  { pattern: "/welcome", group: "top-other" },
  { pattern: "/wheel-of-life", group: "top-other" },
  { pattern: "/wheel-of-life/assessment", group: "top-other" },
  { pattern: "/wheel-of-life/coach", group: "top-other" },
  { pattern: "/workflows", group: "top-other" },
  { pattern: "/workflows/elevator-pitch", group: "top-other" },
  { pattern: "/workflows/monday", group: "top-other" },
  { pattern: "/workflows/notion", group: "top-other" },
  { pattern: "/workspaces", group: "top-other" },
  { pattern: "/workspaces/new", group: "top-other" },

  // ---- admin: the fixture user is not a site admin ----
  { pattern: "/admin", group: "top-other", skip: "admin-only (fixture user is not a site admin)" },
  { pattern: "/admin/ai-interactions", group: "top-other", skip: "admin-only (fixture user is not a site admin)" },
  { pattern: "/admin/feature-requests", group: "top-other", skip: "admin-only (fixture user is not a site admin)" },
  { pattern: "/admin/feedback", group: "top-other", skip: "admin-only (fixture user is not a site admin)" },
  { pattern: "/admin/users", group: "top-other", skip: "admin-only (fixture user is not a site admin)" },
  { pattern: "/admin/whatsapp", group: "top-other", skip: "admin-only (fixture user is not a site admin)" },
];

/** Segment name → concrete value, resolved from the seeded DB. */
export type PerfParams = Record<string, string | undefined>;

export interface ResolvedRoute extends RouteSpec {
  /** Concrete app-relative path, or null when a param couldn't be resolved. */
  path: string | null;
}

export function resolveRoutes(params: PerfParams): ResolvedRoute[] {
  return ROUTES.map((route) => {
    if (route.skip) return { ...route, path: null };
    const missing: string[] = [];
    const path = route.pattern.replace(/\[(?:\.\.\.)?([A-Za-z]+)\]/g, (_, name: string) => {
      const value = params[name];
      if (!value) missing.push(name);
      return value ?? "";
    });
    return missing.length > 0
      ? { ...route, path: null, skip: `no seeded entity for ${missing.join(", ")}` }
      : { ...route, path };
  });
}

/** Stable filename-safe id for a route pattern. */
export function routeId(pattern: string): string {
  return pattern.replace(/^\//, "").replace(/\[\.{3}/g, "[").replace(/[[\]]/g, "").replace(/\//g, "__") || "root";
}
