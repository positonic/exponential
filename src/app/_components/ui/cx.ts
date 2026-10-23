/**
 * Join class names, dropping falsy entries. The primitives in this folder
 * are deliberately dependency-free (no clsx, no tailwind-merge): a caller's
 * `className` is appended after the primitive's own classes, so a caller
 * cannot *override* a token the primitive owns (radius, border, surface),
 * only add to it. That is the point of the primitives.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
