/**
 * The allowlist of paths that render without a session, and the predicate the
 * middleware gates on. Kept in its own module — with no next-auth import — so
 * that `src/__tests__/middleware-matcher.test.ts` can exercise the real lists
 * instead of re-declaring them and drifting.
 *
 * Route gating is DEFAULT-DENY (ticket foggy.carp): every page the middleware
 * matcher covers requires a session unless its path is enumerated here. The
 * previous shape — an allowlist of *protected* prefixes — went stale the moment
 * workspace-scoped routing (`/w/[workspaceSlug]/...`) shipped without being
 * added to it, which left logged-out visitors on a broken app shell full of
 * failing queries. A deny-by-default list cannot rot that way: a new
 * authenticated route is gated the day it is added, and forgetting to list a
 * new *public* route fails loudly (a redirect to /signin) instead of silently.
 *
 * This is first-impression gating, not the security boundary: data access is
 * enforced by tRPC `protectedProcedure`, `/admin` re-checks `isAdmin` in its
 * own server layout, and a signed-in member visiting a workspace they don't
 * belong to is redirected out by WorkspaceProvider's FORBIDDEN/NOT_FOUND
 * handling.
 */

/** Public pages matched exactly. */
export const PUBLIC_EXACT = new Set([
  '/', // marketing home
  '/signin', // also excluded by the matcher; kept for clarity
  '/web3', // wallet sign-in
  '/desktop-auth', // desktop-shell auth handoff renders its own signed-out state
  '/privacy',
  '/terms',
  '/roadmap', // public product roadmap (embeds Loom)
  // File conventions served through the middleware matcher.
  '/llms.txt',
  '/robots.txt',
  '/sitemap.xml',
  '/manifest.webmanifest',
]);

/**
 * Public sections matched by prefix.
 *
 * A slash-terminated entry (`/f/`) is a plain string prefix. A bare entry
 * (`/blog`) opens the section index *and* everything under it, but is matched
 * on a segment boundary — see `isPublicPath` — so it cannot leak into a
 * sibling route that merely starts with the same letters.
 */
export const PUBLIC_PREFIXES = [
  '/p/', // published Knowledge Pages (ADR-0038)
  '/f/', // public forms intake (ADR-0029)
  '/auth/verify-request', // sign-in code redemption happens logged-out
  '/invite/', // token pages render their own signed-out state
  '/team-invite/',
  // Marketing pages from the (home) route group.
  '/blog',
  '/explore',
  '/learn',
  '/product-timeline',
  '/features/', // marketing feature pages — bare /features is the app's
  /**
   * Product documentation. Bare, because `/docs` is itself a public index
   * (it is the URL listed in sitemap.ts). The docs route lives in the
   * (sidemenu) group but is built as public documentation — robots.ts allows
   * it, the page emits a canonical URL and OpenGraph tags, and both
   * `docs/layout.tsx` and `Layout` have explicit signed-out branches. It was
   * simply never listed here, so crawlers and anonymous readers got a 307 to
   * /signin.
   */
  '/docs',
];

/**
 * True when the path renders without a session.
 *
 * Bare prefixes match on a segment boundary rather than as raw strings, so
 * `/docs` opens `/docs` and `/docs/...` but never a sibling like
 * `/docs-internal`. Doing this structurally matters because the allowlist
 * outlives the routes around it: a plain `startsWith` silently un-gates any
 * route added later whose name merely begins with an entry here, and nothing
 * about adding that route would prompt anyone to come and check this file.
 * Slash-terminated entries are already unambiguous and stay plain prefixes.
 */
export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) =>
    prefix.endsWith('/')
      ? pathname.startsWith(prefix)
      : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
