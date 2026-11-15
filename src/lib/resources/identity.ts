/**
 * A Resource's two addresses (ADR-0082; the **Resource** entry in CONTEXT.md).
 *
 * - Its **identity** answers "is this page already saved?" and nothing else:
 *   the URL the page declares for itself when that can be trusted, else the
 *   URL visited, normalised so two visits to one page compare equal.
 * - The **address it was last saved from** is what its link opens: the URL
 *   visited with tracking parameters removed and nothing else changed, so a
 *   listing reopens priced for the dates it was saved with.
 *
 * Pure, with no imports, on purpose. The Chrome extension computes the same
 * identity in the browser (`shared/page-identity.js` in alpha-chrome-plugin)
 * so it can say "already saved" without sending the server the pages you
 * visit, and the migration that gave existing rows an identity
 * (`20261115130000_resource_identity`) restates the rule in SQL. Change the
 * rule here and both must change; the example table in
 * `__tests__/identity.test.ts` is the contract between the three.
 */

const TRACKING_PARAMS = new Set(['fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid', 'igshid']);

/**
 * A query parameter that says how the visitor arrived, not what the page is.
 * A short denylist: anything not on it is kept, because it may be meaningful
 * (dates, guests, a search). A wrong guess here costs a duplicate, never a
 * merge of two different pages.
 */
export function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith('utm_') || lower.endsWith('_impression_id') || TRACKING_PARAMS.has(lower);
}

/** The name of one `name=value` piece of a query string, as written. */
function paramName(part: string): string {
  const eq = part.indexOf('=');
  return eq === -1 ? part : part.slice(0, eq);
}

function parseWebUrl(url: string | null | undefined): URL | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The address a Resource's link opens: the visited URL with tracking
 * parameters removed and nothing else changed (parameter order, fragment and
 * case are kept). Null when the URL is not a web address.
 */
export function savedAddress(visitedUrl: string): string | null {
  if (!parseWebUrl(visitedUrl)) return null;
  const url = visitedUrl.trim();
  const hashAt = url.indexOf('#');
  const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : url.slice(hashAt);
  const queryAt = beforeHash.indexOf('?');
  if (queryAt === -1) return url;

  const parts = beforeHash.slice(queryAt + 1).split('&');
  const kept = parts.filter((part) => !isTrackingParam(paramName(part)));
  if (kept.length === parts.length) return url;
  const query = kept.length > 0 ? `?${kept.join('&')}` : '';
  return `${beforeHash.slice(0, queryAt)}${query}${hash}`;
}

function withoutWww(host: string): string {
  return host.startsWith('www.') ? host.slice(4) : host;
}

function withoutTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/**
 * The identity of the page at `visitedUrl`, or null when it is not a web
 * address.
 *
 * The declared URL (`og:url` or a canonical link) is used only when it names
 * the same host as the visited URL, ignoring a leading `www.`, and the same
 * path, ignoring a trailing slash. That guard is what keeps two searches
 * apart on a site that declares one generic address for every search.
 *
 * The chosen URL is then normalised: scheme and host lowercased, fragment
 * dropped, a trailing slash dropped from a non-root path, tracking parameters
 * removed, and the rest sorted by name (repeated names keep their order).
 * Path case is kept.
 */
export function pageIdentity(visitedUrl: string, declaredUrl?: string | null): string | null {
  const visited = parseWebUrl(visitedUrl);
  if (!visited) return null;
  const declared = parseWebUrl(declaredUrl);
  const chosen =
    declared &&
    withoutWww(declared.host) === withoutWww(visited.host) &&
    withoutTrailingSlash(declared.pathname) === withoutTrailingSlash(visited.pathname)
      ? declared
      : visited;

  const params = chosen.search
    .slice(1)
    .split('&')
    .filter((part) => part !== '' && !isTrackingParam(paramName(part)))
    .map((part, index) => ({ part, index, name: paramName(part) }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.index - b.index))
    .map(({ part }) => part);
  const query = params.length > 0 ? `?${params.join('&')}` : '';

  return `${chosen.protocol}//${chosen.host}${withoutTrailingSlash(chosen.pathname)}${query}`;
}

/**
 * Both addresses for a save. A URL that is not a web address (`mailto:`, a
 * custom scheme) is kept as written and is its own identity, so saving it
 * again still matches.
 */
export function resourceAddresses(
  visitedUrl: string,
  declaredUrl?: string | null,
): { url: string; identity: string } {
  const url = savedAddress(visitedUrl) ?? visitedUrl.trim();
  return { url, identity: pageIdentity(visitedUrl, declaredUrl) ?? url };
}
