import type { PrismaClient } from "@prisma/client";

/**
 * ticketSync/resolvers — map the merge core's relational field values
 * (cycle name, assignee email) onto real rows.
 *
 * Cycles auto-create by name (the old importer's warn-and-leave-unassigned
 * behavior is retired); assignees only match existing workspace members —
 * an unmatched email is the caller's warning to surface, never a new user.
 */

/** Same slug rule as the cycle router so lookups hit `[workspaceId, slug]`. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function resolveCycleIdByName(
  db: PrismaClient,
  params: { workspaceId: string; name: string; createdById: string },
): Promise<{ cycleId: string; created: boolean }> {
  const existing = await db.list.findFirst({
    where: {
      workspaceId: params.workspaceId,
      listType: "SPRINT",
      name: { equals: params.name, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existing) return { cycleId: existing.id, created: false };

  const base = slugify(params.name) || "cycle";
  let slug = base;
  for (let suffix = 2; ; suffix++) {
    const clash = await db.list.findUnique({
      where: { workspaceId_slug: { workspaceId: params.workspaceId, slug } },
      select: { id: true },
    });
    if (!clash) break;
    slug = `${base}-${suffix}`;
  }

  const cycle = await db.list.create({
    data: {
      name: params.name,
      slug,
      listType: "SPRINT",
      workspaceId: params.workspaceId,
      createdById: params.createdById,
    },
    select: { id: true },
  });
  return { cycleId: cycle.id, created: true };
}

export async function resolveAssigneeIdByEmail(
  db: PrismaClient,
  params: { workspaceId: string; email: string },
): Promise<string | null> {
  const member = await db.workspaceUser.findFirst({
    where: {
      workspaceId: params.workspaceId,
      user: { email: { equals: params.email, mode: "insensitive" } },
    },
    select: { userId: true },
  });
  return member?.userId ?? null;
}
