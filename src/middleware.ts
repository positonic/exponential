import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '~/server/auth';

/**
 * Route gating is DEFAULT-DENY (ticket foggy.carp): every page requires a
 * session unless its path is enumerated below. The previous shape — an
 * allowlist of *protected* prefixes — went stale the moment workspace-scoped
 * routing (`/w/[workspaceSlug]/...`) shipped without being added to it, which
 * left logged-out visitors on a broken app shell full of failing queries.
 * A deny-by-default list cannot rot that way: a new authenticated route is
 * gated the day it is added, and forgetting to list a new *public* route
 * fails loudly (a redirect to /signin) instead of silently.
 *
 * This is first-impression gating, not the security boundary: data access is
 * enforced by tRPC `protectedProcedure`, `/admin` re-checks `isAdmin` in its
 * own server layout, and a signed-in member visiting a workspace they don't
 * belong to is redirected out by WorkspaceProvider's FORBIDDEN/NOT_FOUND
 * handling.
 */

/** Public pages matched exactly. */
const PUBLIC_EXACT = new Set([
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

/** Public sections matched by prefix (note trailing slashes: `/f/` must not
 * open up `/features`). */
const PUBLIC_PREFIXES = [
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
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  // For testing different themes in development
  const requestHeaders = new Headers(request.headers);
  const testDomain = request.nextUrl.searchParams.get('theme');

  if (testDomain) {
    requestHeaders.set('host', `${testDomain}`);
  }

  const { pathname } = request.nextUrl;

  if (!isPublicPath(pathname)) {
    const session = await auth();

    if (!session?.user) {
      const loginUrl = new URL('/signin', request.url);
      // Preserve the query string so e.g. a shared filtered view survives
      // the round-trip through sign-in.
      loginUrl.searchParams.set(
        'callbackUrl',
        pathname + request.nextUrl.search,
      );
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes gate themselves: auth(), HMAC, CRON_SECRET)
     * - monitoring (Sentry browser-event tunnel)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - signin (login page)
     *
     * ...and any request for a static asset in /public. Those are not pages,
     * so default-deny gating them only breaks them: a logged-out visitor to
     * the marketing home got a 307 to /signin for `/expo-logo-20.png`, so the
     * header logo rendered as alt text. `/_next/image` is excluded above, but
     * the optimizer fetches the source path back through the deployment, so
     * it inherited the same redirect. Serving public bytes to anonymous users
     * is intended — the whole directory is CDN-cached and unauthenticated by
     * design.
     *
     * The asset exclusion is deliberately shaped like /public's real layout
     * (root-level files, plus one level of known asset directories) rather
     * than a loose `.*\.ext$`. A depth-agnostic pattern would un-gate any
     * protected page whose final segment happens to end in an asset
     * extension — `/docs/[...slug]` and `/wiki/[...path]` are catch-alls, so
     * `/wiki/anything.png` would have rendered to anonymous visitors.
     *
     * Keeping this list in step with /public is enforced by
     * `src/__tests__/middleware-matcher.test.ts`, which fails if any real
     * asset stops being excluded. Add the directory or extension there and
     * here together — a miss is the same 307-on-assets bug as above.
     */
    '/((?!api|monitoring|_next/static|_next/image|favicon.ico|signin|(?:(?:banners|docs|icons|integrations|product-shots)/)?[^/]+\\.(?:png|jpe?g|gif|svg|ico|webp|avif|css|js|map|woff2?|ttf|otf|mp4|webm)$).*)',
  ],
};
