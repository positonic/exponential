/** The Person page of a user (`/people/<userId>`). */
export function personHref(userId: string): string {
  return `/people/${encodeURIComponent(userId)}`;
}
