import type { PrismaClient } from "@prisma/client";
import { NOTIFICATION_CATEGORIES } from "./constants";
import { buildMentionContent } from "./mention";
import type { EmitNotificationInput, NotificationContent } from "./types";

/**
 * Resolve the workspace an action belongs to — directly, or inherited via its
 * project. Mirrors the resolution the legacy assignment path used.
 */
async function resolveActionWorkspace(
  db: PrismaClient,
  actionId: string,
): Promise<{ workspaceId: string; workspaceSlug: string; workspaceName: string } | null> {
  const action = await db.action.findUnique({
    where: { id: actionId },
    include: {
      workspace: { select: { id: true, slug: true, name: true } },
      project: {
        include: { workspace: { select: { id: true, slug: true, name: true } } },
      },
    },
  });
  const ws = action?.workspace ?? action?.project?.workspace;
  if (!ws) return null;
  return { workspaceId: ws.id, workspaceSlug: ws.slug, workspaceName: ws.name };
}

/**
 * Render the channel-agnostic content for one recipient. Returns null when the
 * subject can't be resolved (e.g. deleted action, no workspace) — the emit is
 * then skipped for that recipient.
 */
export async function buildContent(
  input: EmitNotificationInput,
  recipientId: string,
): Promise<NotificationContent | null> {
  const { db } = input;

  switch (input.category) {
    case NOTIFICATION_CATEGORIES.ASSIGNMENT: {
      const { actionId } = input.subject;

      const [action, actor, ws] = await Promise.all([
        db.action.findUnique({ where: { id: actionId }, select: { name: true } }),
        input.actorUserId
          ? db.user.findUnique({
              where: { id: input.actorUserId },
              select: { name: true, email: true },
            })
          : Promise.resolve(null),
        resolveActionWorkspace(db, actionId),
      ]);

      if (!action || !ws) return null;

      const assignerName = actor?.name ?? actor?.email ?? "Someone";

      return {
        category: NOTIFICATION_CATEGORIES.ASSIGNMENT,
        title: `${assignerName} assigned you a task`,
        message: action.name,
        deeplink: `/w/${ws.workspaceSlug}/actions/${actionId}`,
        metadata: {
          actionId,
          workspaceId: ws.workspaceId,
          workspaceSlug: ws.workspaceSlug,
          workspaceName: ws.workspaceName,
          assignerName,
        },
        workspaceId: ws.workspaceId,
        dedupeKey: `assignment:${actionId}:${recipientId}`,
      };
    }
    case NOTIFICATION_CATEGORIES.DUE_DATE: {
      const { actionId, actionName, offsetMinutes, workspaceSlug, workspaceId } =
        input.subject;
      return {
        category: NOTIFICATION_CATEGORIES.DUE_DATE,
        title: `Reminder: ${actionName}`,
        message: `Due ${dueLabel(offsetMinutes)}`,
        deeplink: `/w/${workspaceSlug}/actions/${actionId}`,
        metadata: {
          actionId,
          workspaceId,
          workspaceSlug,
          offsetMinutes,
          dueDate: input.subject.dueDate.toISOString(),
        },
        workspaceId,
        // Per (action, offset); combined with the recipient (owner) via the
        // unique (dedupeKey, userId) index → one reminder per action/offset/owner.
        dedupeKey: `due_date:${actionId}:${offsetMinutes}`,
      };
    }
    case NOTIFICATION_CATEGORIES.SUMMARY: {
      // The cron pre-rendered the digest; a summary is personal, not
      // workspace-scoped, so no per-workspace email override applies.
      return {
        category: NOTIFICATION_CATEGORIES.SUMMARY,
        title: input.subject.title,
        message: input.subject.message,
        metadata: {
          kind: input.subject.kind,
          periodKey: input.subject.periodKey,
        },
        workspaceId: "",
        dedupeKey: `summary:${input.subject.kind}:${input.subject.periodKey}`,
      };
    }
    case NOTIFICATION_CATEGORIES.MEETING_PARTICIPANT_ADDED: {
      const { sessionId } = input.subject;

      const [session, actor] = await Promise.all([
        db.transcriptionSession.findUnique({
          where: { id: sessionId },
          select: {
            title: true,
            workspace: { select: { id: true, slug: true, name: true } },
          },
        }),
        input.actorUserId
          ? db.user.findUnique({
              where: { id: input.actorUserId },
              select: { name: true, email: true },
            })
          : Promise.resolve(null),
      ]);

      // Participants require a workspace (see createManualTranscription), so a
      // meeting with none can't have members to notify — skip if it's gone.
      if (!session?.workspace) return null;

      const adderName = actor?.name ?? actor?.email ?? "Someone";
      const meetingTitle = session.title ?? "a meeting";

      return {
        category: NOTIFICATION_CATEGORIES.MEETING_PARTICIPANT_ADDED,
        title: `${adderName} added you to a meeting`,
        message: meetingTitle,
        deeplink: `/recording/${sessionId}`,
        metadata: {
          sessionId,
          // Mirrors the notificationDeepLink metadata shape used elsewhere.
          transcriptionId: sessionId,
          workspaceId: session.workspace.id,
          workspaceSlug: session.workspace.slug,
          workspaceName: session.workspace.name,
          adderName,
        },
        workspaceId: session.workspace.id,
        dedupeKey: `meeting_participant_added:${sessionId}:${recipientId}`,
      };
    }
    case NOTIFICATION_CATEGORIES.MEETING_READY: {
      const { sessionId } = input.subject;

      const session = await db.transcriptionSession.findUnique({
        where: { id: sessionId },
        select: {
          title: true,
          workspace: { select: { id: true, slug: true, name: true } },
        },
      });
      if (!session?.workspace) return null;

      const meetingTitle = session.title ?? "a meeting";

      return {
        category: NOTIFICATION_CATEGORIES.MEETING_READY,
        title: "Meeting notes are ready",
        message: meetingTitle,
        deeplink: `/recording/${sessionId}`,
        metadata: {
          sessionId,
          transcriptionId: sessionId,
          workspaceId: session.workspace.id,
          workspaceSlug: session.workspace.slug,
          workspaceName: session.workspace.name,
        },
        workspaceId: session.workspace.id,
        dedupeKey: `meeting_ready:${sessionId}:${recipientId}`,
      };
    }
    case NOTIFICATION_CATEGORIES.MENTION:
      return buildMentionContent(input, recipientId);
    default:
      return null;
  }
}

/** Human label for a reminder offset, e.g. 60 → "in 1 hour". */
function dueLabel(offsetMinutes: number): string {
  if (offsetMinutes <= 0) return "now";
  if (offsetMinutes < 60) return `in ${offsetMinutes} minutes`;
  if (offsetMinutes < 1440) {
    const hours = Math.round(offsetMinutes / 60);
    return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const days = Math.round(offsetMinutes / 1440);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}
