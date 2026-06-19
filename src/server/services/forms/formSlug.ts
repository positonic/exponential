import { type PrismaClient } from "@prisma/client";

import { slugify } from "~/utils/slugify";

/**
 * Pure: given a base slug and the set of slugs already taken, return the first
 * free slug (appending `_2`, `_3`, … like the Project router).
 */
export function nextAvailableSlug(
  base: string,
  taken: ReadonlySet<string>,
): string {
  const safeBase = base || "form";
  if (!taken.has(safeBase)) return safeBase;
  let i = 2;
  while (taken.has(`${safeBase}_${i}`)) i++;
  return `${safeBase}_${i}`;
}

/**
 * Resolve a globally-unique slug for a Form. Slugs are unique across all
 * workspaces (the public `/f/[slug]` route carries no workspace), so dedupe
 * against every existing form, not just the current workspace's.
 */
export async function uniqueFormSlug(
  db: PrismaClient,
  name: string,
  excludeId?: string,
): Promise<string> {
  const base = slugify(name) || "form";
  const existing = await db.form.findMany({
    where: excludeId ? { NOT: { id: excludeId } } : undefined,
    select: { slug: true },
  });
  return nextAvailableSlug(base, new Set(existing.map((f) => f.slug)));
}