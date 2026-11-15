import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * A person's Personal workspace — the one `ensurePersonalWorkspace` creates at
 * onboarding (`type: "personal"`, owned by them). Their Assistant is a member
 * there automatically (CONTEXT.md, **Assistant**); everywhere else it joins
 * only when they add it. Null for a person not yet onboarded.
 */
export async function findPersonalWorkspaceId(db: Db, userId: string): Promise<string | null> {
  const personal = await db.workspace.findFirst({
    where: { type: "personal", ownerId: userId },
    select: { id: true },
  });
  return personal?.id ?? null;
}
