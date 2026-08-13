import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { PUBLIC_PREFIXES, isPublicPath } from '~/lib/publicRoutes';

/**
 * Whether a page needs a session is decided by two layers, and this file
 * guards both:
 *
 *   1. `config.matcher` — does the middleware run for this path at all?
 *   2. `isPublicPath()` — once it runs, is the path on the allowlist?
 *
 * Three ways that goes wrong.
 *
 * 1. A /public asset that the matcher *does* match gets a 307 to /signin for
 *    logged-out visitors, so the marketing pages render their images as alt
 *    text. That is the bug this suite was written for.
 * 2. An exclusion loose enough to also cover a page route un-gates that page.
 *    `/docs/[...slug]` and `/wiki/[...path]` are catch-alls, so a pattern like
 *    `.*\.png$` would serve them to anyone.
 * 3. A page built as public documentation never reaches the allowlist, so
 *    crawlers following its own canonical URL land on /signin. That was `/docs`
 *    until it was added to PUBLIC_PREFIXES.
 *
 * The matcher has to stay a static literal in `export const config` for
 * Next.js to analyse it at build time, so it can't be imported — importing
 * middleware.ts would also drag next-auth into a unit test. Read the shipped
 * literal out of the source instead. The allowlist has no such constraint and
 * is imported from `~/lib/publicRoutes` directly.
 */

const REPO_ROOT = path.resolve(__dirname, '../..');
const PUBLIC_DIR = path.join(REPO_ROOT, 'public');

/**
 * Every entry in `config.matcher`, not just the first — Next.js runs the
 * middleware when *any* of them matches, so a suite that read only the first
 * would quietly stop covering the rest the day a second entry is added.
 */
function readMatchers(): string[] {
  const source = readFileSync(path.join(REPO_ROOT, 'src/middleware.ts'), 'utf8');
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  const open = /matcher:\s*\[/.exec(withoutComments);
  if (!open) {
    throw new Error('could not find config.matcher in src/middleware.ts');
  }

  // Scan rather than regex to the closing bracket: the patterns contain `]`
  // themselves (`[^/]`), so a non-greedy `\[([\s\S]*?)\]` stops inside the
  // first character class and silently parses nothing.
  const entries: string[] = [];
  let current: string | null = null;
  for (let i = open.index + open[0].length; i < withoutComments.length; i++) {
    const char = withoutComments[i]!;
    if (current !== null) {
      if (char === '\\') {
        current += char + withoutComments[++i]!;
      } else if (char === "'") {
        // Source-level string, so its escapes are still doubled.
        entries.push(current.replace(/\\\\/g, '\\'));
        current = null;
      } else {
        current += char;
      }
    } else if (char === "'") {
      current = '';
    } else if (char === ']') {
      break;
    }
  }

  if (entries.length === 0) {
    throw new Error('config.matcher parsed to zero entries');
  }
  return entries;
}

/**
 * Models how Next.js compiles this matcher shape: the whole path is one
 * anonymous path-to-regexp group whose body is used verbatim.
 */
const matchers = readMatchers().map((entry) => new RegExp(`^${entry}$`));

/** True when the middleware runs for this path at all (layer 1). */
const matcherCovers = (pathname: string) =>
  matchers.some((re) => re.test(pathname));

/** True when a logged-out visitor is redirected to /signin (both layers). */
const requiresSession = (pathname: string) =>
  matcherCovers(pathname) && !isPublicPath(pathname);

/**
 * Top-level URL segments under src/app, seeing through `(group)` directories,
 * mapped to their immediate child directory names.
 */
function routeChildren(dir: string, depth: number): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    const full = path.join(dir, entry.name);
    if (entry.name.startsWith('(')) {
      // Route groups are transparent in the URL — don't consume a level.
      for (const [k, v] of routeChildren(full, depth)) found.set(k, v);
    } else if (depth === 0) {
      found.set(
        entry.name,
        readdirSync(full, { withFileTypes: true })
          .filter((child) => child.isDirectory())
          .map((child) => child.name),
      );
    }
  }
  return found;
}

const routes = routeChildren(path.join(REPO_ROOT, 'src/app'), 0);

function publicAssetPaths(): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    });

  return walk(PUBLIC_DIR).map(
    (file) => `/${path.relative(PUBLIC_DIR, file).split(path.sep).join('/')}`,
  );
}

describe('middleware matcher', () => {
  describe('never gates a real /public asset', () => {
    const assets = publicAssetPaths();

    it('finds assets to check', () => {
      expect(assets.length).toBeGreaterThan(0);
    });

    it.each(assets)('%s is served without a session', (asset) => {
      expect(matcherCovers(asset)).toBe(false);
    });

    it('also covers the URL-encoded form of names containing spaces', () => {
      for (const asset of assets.filter((a) => a.includes(' '))) {
        expect(matcherCovers(encodeURI(asset))).toBe(false);
      }
    });
  });

  describe('still gates page routes', () => {
    it.each([
      '/home',
      '/w/syntrofi/projects',
      '/w/syntrofi/products/exponential/tickets/abc123',
      '/wiki/some/nested/page',
      '/projects/my-project',
      '/teams/core/members/user_1',
      // Bare /features is the app's own page; only /features/ is marketing.
      '/features',
    ])('%s requires a session', (route) => {
      expect(requiresSession(route)).toBe(true);
    });

    /**
     * The regression PR-Agent caught on the first cut of this fix: a
     * depth-agnostic `.*\.ext$` exclusion un-gates any protected page whose
     * last segment ends in an asset extension.
     *
     * This asserts the matcher layer only — `/docs/*` is separately public via
     * the allowlist, but the exclusion must not be what lets it through, or
     * re-gating /docs later would silently leave the bypass behind.
     */
    it.each([
      '/wiki/anything.png',
      '/docs/a/b.png',
      '/w/syntrofi/pages/secret.png',
      '/w/syntrofi/products/exponential/tickets/leak.map',
      '/teams/core/members/user_1.js',
      // The doc screenshots live in /public/doc-assets precisely so that
      // `docs` stays out of the exclusion — /docs is a catch-all page route.
      '/docs/secret.png',
      '/docs/getting-started.map',
    ])('%s does not slip through the asset exclusion', (route) => {
      expect(matcherCovers(route)).toBe(true);
    });

    /**
     * The exclusion allows one directory segment, so an asset directory that
     * is *also* a route with a dynamic child re-opens the bypass for that
     * route: `/<dir>/<slug>.png` would match the exclusion and render the
     * page unauthenticated. This is what forced /public/docs to become
     * /public/doc-assets — `/docs/[...slug]` is exactly that shape.
     *
     * A shared name alone is fine (`/integrations` has only static children,
     * so `/integrations/x.png` resolves to nothing); a dynamic child is not.
     */
    it('shares no asset directory with a route that has a dynamic child', () => {
      const assetDirs = readdirSync(PUBLIC_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);

      // Sanity: the walk must actually see routes nested inside route groups,
      // or this assertion passes vacuously.
      expect([...routes.keys()]).toEqual(expect.arrayContaining(['docs', 'wiki']));

      const colliding = assetDirs.filter((dir) =>
        (routes.get(dir) ?? []).some((child) => child.startsWith('[')),
      );
      expect(colliding).toEqual([]);
    });
  });

  describe('leaves Next.js internals and public pages alone', () => {
    it.each(['/_next/static/chunk.js', '/_next/image', '/favicon.ico', '/api/trpc/x'])(
      '%s is not gated',
      (route) => {
        expect(matcherCovers(route)).toBe(false);
      },
    );
  });

  describe('serves allowlisted public sections without a session', () => {
    it.each([
      // Docs are built as public documentation: robots.ts allows /docs, the
      // sitemap lists it, and each page emits its own canonical + OG tags. The
      // catch-all under it must be public too, or a crawler following that
      // canonical URL gets a 307 to /signin.
      '/docs',
      '/docs/getting-started',
      '/docs/features/fireflies',
      '/blog',
      '/explore',
      '/features/some-marketing-page',
      '/p/published-page',
      '/f/intake-form',
      '/',
      '/privacy',
      '/robots.txt',
      '/sitemap.xml',
    ])('%s renders for anonymous visitors', (route) => {
      expect(requiresSession(route)).toBe(false);
    });

    /**
     * A prefix with no trailing slash opens every path that merely *starts*
     * with it, so it must not be a string prefix of a different top-level
     * route: `/f/` is slash-terminated precisely so it doesn't also open
     * `/features`, and bare `/docs` is only safe while no other segment starts
     * with "docs". Adding such a route later would silently un-gate it, so
     * fail here instead.
     */
    it('has no bare prefix that also opens an unrelated route', () => {
      const bare = PUBLIC_PREFIXES.filter((prefix) => !prefix.endsWith('/'));
      const leaked = bare.flatMap((prefix) =>
        [...routes.keys()]
          .filter((segment) => `/${segment}`.startsWith(prefix) && `/${segment}` !== prefix)
          .map((segment) => `${prefix} also opens /${segment}`),
      );
      expect(leaked).toEqual([]);
    });
  });
});
