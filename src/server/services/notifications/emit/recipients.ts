import { NOTIFICATION_CATEGORIES } from "./constants";
import { resolveMentionRecipients } from "./mention";
import type { EmitNotificationInput } from "./types";

/**
 * Resolve the recipient user ids for an emit, per the category's fixed recipient
 * rule (CONTEXT: Notification category). The actor is excluded and access is
 * filtered by the caller (`emitNotification`), not here.
 */
export async function resolveRecipients(
  input: EmitNotificationInput,
): Promise<string[]> {
  switch (input.category) {
    case NOTIFICATION_CATEGORIES.ASSIGNMENT:
      // Assignment → the users just assigned. De-duplicate defensively.
      return Promise.resolve(Array.from(new Set(input.subject.assignedUserIds)));
    case NOTIFICATION_CATEGORIES.MENTION:
      // Mention → parsed, membership-filtered mentioned users.
      return resolveMentionRecipients(input);
    case NOTIFICATION_CATEGORIES.DUE_DATE:
      // Due-date → the single owner the cron computed the crossing for.
      return Promise.resolve([input.subject.ownerUserId]);
    case NOTIFICATION_CATEGORIES.SUMMARY:
      // Summary → the subject user their digest was built for.
      return Promise.resolve([input.subject.userId]);
    case NOTIFICATION_CATEGORIES.MEETING_PARTICIPANT_ADDED:
      // Meeting participant added → the members just linked. De-dup defensively.
      return Promise.resolve(
        Array.from(new Set(input.subject.participantUserIds)),
      );
    case NOTIFICATION_CATEGORIES.MEETING_READY: {
      // Meeting notes ready → the meeting's team-member (userId) participants.
      // CRM-contact / free-text participants have no User account and are skipped.
      const rows = await input.db.transcriptionSessionParticipant.findMany({
        where: {
          transcriptionSessionId: input.subject.sessionId,
          userId: { not: null },
        },
        select: { userId: true },
      });
      return Array.from(
        new Set(
          rows
            .map((r) => r.userId)
            .filter((id): id is string => id !== null),
        ),
      );
    }
    case NOTIFICATION_CATEGORIES.AGENDA_READY: {
      // Agenda ready → the ceremony's explicit participants plus everyone on
      // its team (ADR-0059); the owner is a participant like any other.
      const occurrence = await input.db.ceremonyOccurrence.findUnique({
        where: { id: input.subject.occurrenceId },
        select: {
          workspaceId: true,
          ceremony: {
            select: {
              ownerId: true,
              teamId: true,
              participants: { select: { userId: true } },
            },
          },
        },
      });
      if (!occurrence) return [];
      const ids = new Set<string>(occurrence.ceremony.participants.map((p) => p.userId));
      ids.add(occurrence.ceremony.ownerId);
      if (occurrence.ceremony.teamId) {
        const members = await input.db.teamUser.findMany({
          where: { teamId: occurrence.ceremony.teamId },
          select: { userId: true },
        });
        for (const m of members) ids.add(m.userId);
      }
      if (ids.size === 0) return [];
      // `CeremonyParticipant` and `TeamUser` rows survive someone being
      // removed from the workspace, and `filterRecipientsByAccess` has no
      // resource to gate this category on, so the intersection has to happen
      // here — otherwise an offboarded member keeps receiving the ceremony's
      // name, cadence and a deep link indefinitely.
      const members = await input.db.workspaceUser.findMany({
        where: { workspaceId: occurrence.workspaceId, userId: { in: Array.from(ids) } },
        select: { userId: true },
      });
      return members.map((m) => m.userId);
    }
    default:
      return Promise.resolve([]);
  }
}
