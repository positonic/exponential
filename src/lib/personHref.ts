/**
 * The Person page of a user: `/people/<handle>` when their handle is known,
 * otherwise `/people/<userId>`. An id link always works; the page replaces it
 * with the handle URL on arrival, so callers need not look the handle up.
 */
export function personHref(userId: string, handle?: string | null): string {
  return `/people/${encodeURIComponent(handle ?? userId)}`;
}
