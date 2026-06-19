import { type PrismaClient } from "@prisma/client";

import { slugify } from "~/utils/slugify";

/**
 * Pure: given a base slug and the set of slugs already taken in a workspace,
 * return the first free slug (appending `_2`, `_3`, … like the Project router).
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

/** Resolve a unique slug for a Form within its workspace. */
export async function uniqueFormSlug(
  db: PrismaClient,
  workspaceId: string,
  name: string,
  excludeId?: string,
): Promise<string> {
  const base = slugify(name) || "form";
  const existing = await db.form.findMany({
    where: {
      workspaceId,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { slug: true },
  });
  return nextAvailableSlug(base, new Set(existing.map((f) => f.slug)));
}