import type { PrismaClient } from "@prisma/client";
import { NOTIFICATION_CATEGORIES } from "./constants";
import type { EmitNotificationInput, NotificationContent } from "./types";

/** Parse mentions in `@[Name](userId)` (or legacy `@[Name]`) form. */
const MENTION_WITH_ID_REGEX = /@\[([^\]]+)\](?:\(([^)]+)\))?/g;

/**
 * Extract mentioned user ids from comment content. `@[Name](id)` yields the id
 * directly; legacy `@[Name]` (no id) is resolved by name against workspace
 * members. Non-member ids are NOT filtered here — the resolver does that.
 */
async function extractMentionedUserIds(
  db: PrismaClient,
  content: string,
  workspaceId: string,
): Promise<string[]> {
  const userIds: string[] = [];
  const namesToResolve: string[] = [];

  const regex = new RegExp(MENTION_WITH_ID_REGEX.source, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const id = match[2];
    if (id) {
      userIds.push(id);
    } else if (match[1]) {
      namesToResolve.push(match[1]);
    }
  }

  if (namesToResolve.length > 0) {
    const members = await db.workspaceUser.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, name: true } } },
    });
    for (const name of namesToResolve) {
      const member = members.find(
        (m) => m.user.name?.toLowerCase() === name.toLowerCase(),
      );
      if (member) userIds.push(member.userId);
    }
  }

  return [...new Set(userIds)];
}

/**
 * Mention recipients: parsed mentioned ids, minus anyone already mentioned in
 * the pre-edit body, restricted to users who actually belong to the workspace
 * (directly or via a linked team). Crafted `@[Name](id)` markup naming a
 * non-member or an agent never matches and is silently dropped — comment
 * content never leaks outside the workspace. (Actor exclusion is applied by
 * `emitNotification`.)
 */
export async function resolveMentionRecipients(
  input: EmitNotificationInput & { category: typeof NOTIFICATION_CATEGORIES.MENTION },
): Promise<string[]> {
  const { db, subject } = input;

  const mentioned = await extractMentionedUserIds(
    db,
    subject.commentContent,
    subject.workspaceId,
  );
  if (mentioned.length === 0) return [];

  const previouslyMentioned = subject.previousContent
    ? new Set(
        await extractMentionedUserIds(db, subject.previousContent, subject.workspaceId),
      )
    : null;

  const candidates = mentioned.filter((id) => !previouslyMentioned?.has(id));
  if (candidates.length === 0) return [];

  const members = await db.user.findMany({
    where: {
      id: { in: candidates },
      OR: [
        { workspaceMemberships: { some: { workspaceId: subject.workspaceId } } },
        { teams: { some: { team: { workspaceId: subject.workspaceId } } } },
      ],
    },
    select: { id: true },
  });

  return members.map((m) => m.id);
}

/** Render the mention notification content for one recipient. */
export async function buildMentionContent(
  input: EmitNotificationInput & { category: typeof NOTIFICATION_CATEGORIES.MENTION },
  recipientId: string,
): Promise<NotificationContent | null> {
  const { db, actorUserId, subject } = input;

  const author = actorUserId
    ? await db.user.findUnique({
        where: { id: actorUserId },
        select: { name: true, email: true },
      })
    : null;
  const authorName = author?.name ?? author?.email ?? "Someone";

  const clean = subject.commentContent.replace(
    /@\[([^\]]+)\](?:\([^)]+\))?/g,
    "@$1",
  );
  const preview = clean.length > 200 ? `${clean.substring(0, 200)}...` : clean;

  return {
    category: NOTIFICATION_CATEGORIES.MENTION,
    title: `${authorName} mentioned you in ${subject.targetName}`,
    message: preview,
    deeplink: subject.targetPath,
    metadata: {
      commentId: subject.commentId,
      workspaceId: subject.workspaceId,
      workspaceSlug: subject.workspaceSlug,
      workspaceName: subject.workspaceName,
      targetName: subject.targetName,
    },
    workspaceId: subject.workspaceId,
    dedupeKey: `mention:${subject.commentId}:${recipientId}`,
  };
}
