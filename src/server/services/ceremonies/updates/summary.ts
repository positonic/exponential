/**
 * The merged async summary for an occurrence (ADR-0059, V3): every
 * participant's update side by side, in participant order, with the people
 * who haven't answered yet still listed.
 *
 * Showing the silent participants is the point — a standup summary that only
 * lists the people who wrote something reads as complete when half the team
 * hasn't spoken, and the skip proposal in action 4 depends on knowing the
 * difference between "nobody is blocked" and "nobody has said".
 */
import type { PrismaClient } from "@prisma/client";
import { perPersonQuestions, readAnswers } from "./questions";
import type { OccurrenceUpdateScope } from "./occurrenceUpdates";

export interface ParticipantUpdate {
  userId: string;
  name: string | null;
  email: string | null;
  image: string | null;
  answers: Record<string, string>;
  submittedAt: Date | null;
  flaggedBlocker: boolean;
}

export interface OccurrenceSummary {
  questions: ReturnType<typeof perPersonQuestions>;
  participants: ParticipantUpdate[];
  submittedCount: number;
  /** Participants who have submitted and said they are blocked. */
  blockedCount: number;
}

export async function getOccurrenceSummary(
  db: PrismaClient,
  scope: OccurrenceUpdateScope,
): Promise<OccurrenceSummary> {
  const questions = perPersonQuestions(scope.kind);
  if (questions.length === 0 || scope.participantUserIds.length === 0) {
    return { questions, participants: [], submittedCount: 0, blockedCount: 0 };
  }

  const [users, rows] = await Promise.all([
    db.user.findMany({
      where: { id: { in: scope.participantUserIds } },
      select: { id: true, name: true, email: true, image: true },
    }),
    db.ceremonyOccurrenceUpdate.findMany({
      where: { occurrenceId: scope.occurrenceId, userId: { in: scope.participantUserIds } },
    }),
  ]);

  const rowByUser = new Map(rows.map((r) => [r.userId, r]));
  const participants = users
    .map<ParticipantUpdate>((user) => {
      const row = rowByUser.get(user.id);
      return {
        userId: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        // An unsubmitted draft is nobody's business but the author's, so the
        // summary only ever carries answers someone chose to submit.
        answers: row?.submittedAt ? readAnswers(row.answers, scope.kind) : {},
        submittedAt: row?.submittedAt ?? null,
        flaggedBlocker: Boolean(row?.submittedAt && row.flaggedBlocker),
      };
    })
    .sort((a, b) => (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""));

  return {
    questions,
    participants,
    submittedCount: participants.filter((p) => p.submittedAt).length,
    blockedCount: participants.filter((p) => p.flaggedBlocker).length,
  };
}
