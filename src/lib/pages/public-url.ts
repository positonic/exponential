/**
 * Pure helpers for the Published-page URL scheme (ADR-0038):
 * `/p/{publicSlug}-{publicId}` where the immutable 8-char `publicId` alone
 * resolves the page and the slug is cosmetic. Isomorphic — no Node APIs — so
 * the share popover and the public route share one source of truth.
 */

export const PUBLIC_ID_LENGTH = 8;
export const PUBLIC_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

const PUBLIC_SLUG_MAX_LENGTH = 80;

/**
 * Derive a URL slug from a page title: lowercase, ASCII-folded, hyphen-joined.
 * Never returns an empty string — an untitled/emoji-only title yields
 * "untitled" so the public URL always has a readable segment before the id.
 */
export function slugifyPageTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, PUBLIC_SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
  return slug || "untitled";
}

export function buildPublicPagePath(publicSlug: string, publicId: string): string {
  return `/p/${publicSlug}-${publicId}`;
}

const PARAM_PATTERN = new RegExp(
  `^(?:(.+)-)?([${PUBLIC_ID_ALPHABET}]{${PUBLIC_ID_LENGTH}})$`,
);

/**
 * Split a `/p/[slugId]` route param into its cosmetic slug and the resolving
 * `publicId` (the segment after the last hyphen). The slug may be "" (bare-id
 * URL) or stale — the route compares it against the canonical slug and 301s.
 * Returns null when the param can't contain a well-formed id.
 */
export function parsePublicPageParam(
  param: string,
): { slug: string; publicId: string } | null {
  const match = PARAM_PATTERN.exec(param);
  if (!match) return null;
  return { slug: match[1] ?? "", publicId: match[2]! };
}
