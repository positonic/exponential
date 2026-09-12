/**
 * The async-first update flow for one occurrence (ADR-0059, V3): draft a
 * participant's answers from their activity, let them edit, let them submit.
 *
 * One row per participant per occurrence (`CeremonyOccurrenceUpdate`). The
 * draft and the answers are kept apart deliberately — re-drafting must never
 * overwrite what someone has already written, and a submitted update is
 * closed to re-drafting until they reopen it.
 */
import { TRPCError } from "@trpc/server";
import type { CeremonyOccurrenceUpdate, PrismaClient } from "@prisma/client";
import { buildDraftAnswers } from "./draftAnswers";
import { perPersonQuestions, readAnswers, supportsAsyncUpdates } from "./questions";
import { resolveParticipantUserIds } from "../participants";

export interface OccurrenceUpdateScope {
  occurrenceId: string;
  workspaceId: string;
  ceremonyId: string;
  kind: Parameters<typeof perPersonQuestions>[0];
  projectId: string | null;
  scheduledStart: Date;
  /** Start of the previous occurrence, or null for the first one. */
  previousStart: Date | null;
  participantUserIds: string[];
}

/** Loads everything the update flow needs about an occurrence, in one place. */
export async function loadUpdateScope(
  db: PrismaClient,
  occurrenceId: string,
  workspaceId: string,
): Promise<OccurrenceUpdateScope> {
  const occurrence = await db.ceremonyOccurrence.findFirst({
    where: { id: occurrenceId, workspaceId },
    select: {
      id: true,
      workspaceId: true,
      ceremonyId: true,
      scheduledStart: true,
      ceremony: {
        select: { id: true, kind: true, teamId: true, projectId: true, participants: { select: { userId: true } } },
      },
    },
  });
  if (!occurrence) throw new TRPCError({ code: "NOT_FOUND", message: "Occurrence not found" });

  const previous = await db.ceremonyOccurrence.findFirst({
    where: { ceremonyId: occurrence.ceremonyId, scheduledStart: { lt: occurrence.scheduledStart } },
    orderBy: { scheduledStart: "desc" },
    select: { scheduledStart: true },
  });

  return {
    occurrenceId: occurrence.id,
    workspaceId: occurrence.workspaceId,
    ceremonyId: occurrence.ceremonyId,
    kind: occurrence.ceremony.kind,
    projectId: occurrence.ceremony.projectId,
    scheduledStart: occurrence.scheduledStart,
    previousStart: previous?.scheduledStart ?? null,
    participantUserIds: await resolveParticipantUserIds(db, occurrence.ceremony),
  };
}

function assertParticipates(scope: OccurrenceUpdateScope, userId: string) {
  if (!scope.participantUserIds.includes(userId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You are not a participant in this ceremony" });
  }
}

function assertAsync(scope: OccurrenceUpdateScope) {
  if (!supportsAsyncUpdates(scope.kind)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This ceremony has no async update format" });
  }
}

/**
 * The caller's own row, with its answers shaped by the current question set.
 * Never creates a row: opening an occurrence page you have nothing to say on
 * shouldn't leave a trail.
 */
export async function getMyUpdate(db: PrismaClient, scope: OccurrenceUpdateScope, userId: string) {
  const row = await db.ceremonyOccurrenceUpdate.findUnique({
    where: { occurrenceId_userId: { occurrenceId: scope.occurrenceId, userId } },
  });
  return shape(row, scope);
}

function shape(row: CeremonyOccurrenceUpdate | null, scope: OccurrenceUpdateScope) {
  const questions = perPersonQuestions(scope.kind);
  return {
    questions,
    draftAnswers: row ? readAnswers(row.draftAnswers, scope.kind) : {},
    answers: row ? readAnswers(row.answers, scope.kind) : {},
    draftedAt: row?.draftedAt ?? null,
    submittedAt: row?.submittedAt ?? null,
    flaggedBlocker: row?.flaggedBlocker ?? false,
  };
}

/**
 * Draft (or re-draft) the caller's answers from their activity since the
 * previous occurrence. Answers they have already written are left alone — the
 * draft is a suggestion beside their text, not a replacement for it.
 */
export async function draftMyUpdate(db: PrismaClient, scope: OccurrenceUpdateScope, userId: string) {
  assertAsync(scope);
  assertParticipates(scope, userId);
  const questions = perPersonQuestions(scope.kind);
  const { answers: draftAnswers } = await buildDraftAnswers(db, {
    workspaceId: scope.workspaceId,
    userId,
    questions,
    since: scope.previousStart,
    until: scope.scheduledStart,
    projectId: scope.projectId,
  });

  const existing = await db.ceremonyOccurrenceUpdate.findUnique({
    where: { occurrenceId_userId: { occurrenceId: scope.occurrenceId, userId } },
  });
  if (existing?.submittedAt) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Reopen your update before re-drafting it" });
  }
  // First draft seeds the answers so there is something to edit; later drafts
  // only refresh the suggestion, because by then the answers are theirs.
  const seedAnswers = existing ? undefined : draftAnswers;
  const row = await db.ceremonyOccurrenceUpdate.upsert({
    where: { occurrenceId_userId: { occurrenceId: scope.occurrenceId, userId } },
    create: {
      occurrenceId: scope.occurrenceId,
      userId,
      draftAnswers,
      answers: seedAnswers ?? {},
      draftedAt: new Date(),
    },
    update: { draftAnswers, draftedAt: new Date() },
  });
  return shape(row, scope);
}

export interface SaveMyUpdateInput {
  answers: Record<string, string>;
  flaggedBlocker?: boolean;
  /** Submit in the same write, so "Save" and "Submit" are one round trip. */
  submit?: boolean;
}

export async function saveMyUpdate(
  db: PrismaClient,
  scope: OccurrenceUpdateScope,
  userId: string,
  input: SaveMyUpdateInput,
) {
  assertAsync(scope);
  assertParticipates(scope, userId);
  const answers = readAnswers(input.answers, scope.kind);
  const submittedAt = input.submit ? new Date() : null;
  const row = await db.ceremonyOccurrenceUpdate.upsert({
    where: { occurrenceId_userId: { occurrenceId: scope.occurrenceId, userId } },
    create: {
      occurrenceId: scope.occurrenceId,
      userId,
      answers,
      flaggedBlocker: input.flaggedBlocker ?? false,
      submittedAt,
    },
    update: {
      answers,
      ...(input.flaggedBlocker === undefined ? {} : { flaggedBlocker: input.flaggedBlocker }),
      ...(input.submit === undefined ? {} : { submittedAt }),
    },
  });
  return shape(row, scope);
}
