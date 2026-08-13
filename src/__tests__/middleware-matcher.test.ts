import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import path from 'path';

/**
 * The middleware matcher is default-deny: every path it matches requires a
 * session. Two ways that goes wrong, and this file guards both.
 *
 * 1. A /public asset that the matcher *does* match gets a 307 to /signin for
 *    logged-out visitors, so the marketing pages render their images as alt
 *    text. That is the bug this suite was written for.
 * 2. An exclusion loose enough to also cover a page route un-gates that page.
 *    `/docs/[...slug]` and `/wiki/[...path]` are catch-alls, so a pattern like
 *    `.*\.png$` would serve them to anyone.
 *
 * The matcher has to stay a static literal in `export const config` for
 * Next.js to analyse it at build time, so it can't be imported — importing
 * middleware.ts would also drag next-auth into a unit test. Read the shipped
 * literal out of the source instead.
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

/** True when middleware runs for this path — i.e. the path is auth-gated. */
const isGated = (pathname: string) => matchers.some((re) => re.test(pathname));

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
      expect(isGated(asset)).toBe(false);
    });

    it('also covers the URL-encoded form of names containing spaces', () => {
      for (const asset of assets.filter((a) => a.includes(' '))) {
        expect(isGated(encodeURI(asset))).toBe(false);
      }
    });
  });

  describe('still gates page routes', () => {
    it.each([
      '/home',
      '/w/syntrofi/projects',
      '/w/syntrofi/products/exponential/tickets/abc123',
      '/docs/getting-started',
      '/wiki/some/nested/page',
      '/projects/my-project',
      '/teams/core/members/user_1',
    ])('%s requires a session', (route) => {
      expect(isGated(route)).toBe(true);
    });

    /**
     * The regression PR-Agent caught on the first cut of this fix: a
     * depth-agnostic `.*\.ext$` exclusion un-gates any protected page whose
     * last segment ends in an asset extension.
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
      expect(isGated(route)).toBe(true);
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
      /** Top-level route segments, seeing through `(group)` directories. */
      const routeChildren = (dir: string, depth: number): Map<string, string[]> => {
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
      };

      const routes = routeChildren(path.join(REPO_ROOT, 'src/app'), 0);
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
        expect(isGated(route)).toBe(false);
      },
    );
  });
});
