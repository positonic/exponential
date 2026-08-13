import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '~/server/auth';
import { isPublicPath } from '~/lib/publicRoutes';

/**
 * Route gating is DEFAULT-DENY (ticket foggy.carp): every page the matcher
 * below covers requires a session unless `~/lib/publicRoutes` lists it. That
 * allowlist lives in its own module so the guard test can import it; see the
 * rationale for the shape there.
 */

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
     * For the same reason no directory named here may collide with a route:
     * a one-segment exclusion under a directory that is *also* a page route
     * re-opens the hole for that route. This is why the doc screenshots live
     * in /public/doc-assets and not /public/docs — `/docs` is a page route,
     * so `/docs/anything.png` would have bypassed the gate.
     *
     * Keeping this list in step with /public is enforced by
     * `src/__tests__/middleware-matcher.test.ts`, which fails if any real
     * asset stops being excluded. Add the directory or extension there and
     * here together — a miss is the same 307-on-assets bug as above.
     */
    '/((?!api|monitoring|_next/static|_next/image|favicon.ico|signin|(?:(?:banners|doc-assets|icons|integrations|product-shots)/)?[^/]+\\.(?:png|jpe?g|gif|svg|ico|webp|avif|css|js|map|woff2?|ttf|otf|mp4|webm)$).*)',
  ],
};
