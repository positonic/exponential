import { z } from "zod";

/**
 * Returns the URL when it is an absolute http(s) URL, else null. Used
 * wherever a stored, user-settable link is rendered as an `href`, so a
 * `javascript:` or `data:` value can never become a click-to-run link
 * (React 18 only warns on those; it does not strip them).
 */
export function httpUrlOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/** Zod schema for a user-settable link: absolute http(s) only, bounded. */
export const httpUrlSchema = z
  .string()
  .max(500)
  .refine((v) => httpUrlOrNull(v) !== null, {
    message: "Must be an http(s) URL",
  });
