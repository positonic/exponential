import type { PrismaClient } from "@prisma/client";

/**
 * The workspace's newsletter List, if the configured id still names one of its
 * contact Lists. The config holds a plain id, so a deleted List leaves a
 * dangling value behind: everything that offers or completes a signup checks
 * through here rather than trusting the id.
 */
export async function findNewsletterList(
  db: PrismaClient,
  workspaceId: string,
  collectionId: string | null,
): Promise<{ id: string } | null> {
  if (!collectionId) return null;
  const list = await db.collection.findFirst({
    where: { id: collectionId, workspaceId, memberType: "crm_contact" },
    select: { id: true },
  });
  return list ?? null;
}
