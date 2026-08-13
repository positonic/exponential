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

function readMatcher(): string {
  const source = readFileSync(path.join(REPO_ROOT, 'src/middleware.ts'), 'utf8');
  const match = /matcher:\s*\[\s*(?:\/\*[\s\S]*?\*\/\s*)?'([^']+)'/.exec(source);
  if (!match?.[1]) {
    throw new Error('could not find the matcher literal in src/middleware.ts');
  }
  // The literal is a source-level string, so escapes are still doubled.
  return match[1].replace(/\\\\/g, '\\');
}

/**
 * Models how Next.js compiles this matcher shape: the whole path is one
 * anonymous path-to-regexp group whose body is used verbatim.
 */
const matcher = new RegExp(`^${readMatcher()}$`);

/** True when middleware runs for this path — i.e. the path is auth-gated. */
const isGated = (pathname: string) => matcher.test(pathname);

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
    ])('%s does not slip through the asset exclusion', (route) => {
      expect(isGated(route)).toBe(true);
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
