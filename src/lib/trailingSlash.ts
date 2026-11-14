/**
 * Canonical (slash-less) form of a page path, or null when it already is.
 *
 * `next.config.js` sets `skipTrailingSlashRedirect` because PostHog's
 * ingestion endpoints behind the `/ingest` proxy need their trailing slashes.
 * That switches off Next's own `/foo/` → `/foo` redirect everywhere, so the
 * middleware restores it for every page path it covers. It matters for
 * security, not just tidiness: the public-route allowlist distinguishes
 * `/features/` (marketing prefix) from `/features` (a gated app page), so an
 * un-redirected `/features/` would render the app page without a session.
 */
export function trailingSlashRedirectPath(pathname: string): string | null {
  if (pathname === "/" || !pathname.endsWith("/")) return null;
  const stripped = pathname.replace(/\/+$/, "");
  return stripped === "" ? "/" : stripped;
}
