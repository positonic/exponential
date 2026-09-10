/**
 * Draft-decision extraction for one recorded meeting (ADR-0060 decision 4).
 *
 * Mirrors `TranscriptionProcessingService.generateDraftActions`: access
 * check, idempotent short-circuits, notes first and transcript second, then
 * `reviewState: DRAFT` rows that a person confirms or rejects. Nothing here
 * ever confirms a decision, at any confidence (ADR-0007, ADR-0060).
 *
 * Idempotency per meeting:
 * - existing drafts → returned as-is (`alreadyDrafted`), no model call;
 * - confirmed decisions from this meeting → `alreadyPublished`, no model call.
 */

import type { PrismaClient } from "@prisma/client";
import { parseTranscript, type TranscriptTurn } from "~/lib/transcript";
import { parseFirefliesSummary } from "~/lib/fireflies-summary";
import { canEditTranscription, getTranscriptionAccess } from "~/server/services/access";
import { recordActivity } from "~/server/services/activity/recordActivity";
import {
  DecisionExtractionService,
  extractNotesDecisionItems,
  filterNearDuplicateDecisions,
  findSupportingTurns,
  normalizeDecisionStatement,
  type DecisionCandidate,
  type OpenDecisionRef,
} from "~/server/services/DecisionExtractionService";
import { createDraftDecision, type DecisionDeciderInput } from "./decisionService";

export interface DraftDecisionsResult {
  success: boolean;
  /** The meeting already has confirmed decisions; nothing was extracted. */
  alreadyPublished: boolean;
  /** The meeting already had drafts; they were returned, not regenerated. */
  alreadyDrafted: boolean;
  /** Drafts now awaiting review (existing or just created). */
  draftCount: number;
  draftsCreated: number;
  /** Candidates dropped because no transcript turn supported them. */
  discardedWithoutEvidence: number;
  errors: string[];
}

interface ParticipantRow {
  userId: string | null;
  name: string | null;
  email: string | null;
  speakerLabel: string | null;
}

/**
 * Map the names the model heard onto the meeting's participants. A name
 * matches a participant on the full name, the speaker label, or the first
 * name (case-insensitive); unmatched names are kept as external deciders.
 * No names at all falls back to every participant, as manual logging does.
 */
export function resolveDeciders(
  deciderNames: string[],
  participants: ParticipantRow[],
): DecisionDeciderInput[] {
  const toDecider = (p: ParticipantRow): DecisionDeciderInput => ({
    userId: p.userId,
    name: p.name ?? p.email ?? "Unknown",
    email: p.email,
  });
  if (deciderNames.length === 0) return participants.map(toDecider);

  const out: DecisionDeciderInput[] = [];
  const used = new Set<number>();
  for (const raw of deciderNames) {
    const wanted = raw.trim().toLowerCase();
    if (!wanted) continue;
    const index = participants.findIndex((p, i) => {
      if (used.has(i)) return false;
      const candidates = [p.name, p.speakerLabel]
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .map((v) => v.trim().toLowerCase());
      return candidates.some(
        (c) => c === wanted || c.split(/\s+/)[0] === wanted || wanted.split(/\s+/)[0] === c,
      );
    });
    if (index === -1) {
      out.push({ name: raw.trim() });
      continue;
    }
    used.add(index);
    out.push(toDecider(participants[index]!));
  }
  return out;
}

/**
 * The curated text of a stored summary: the Fireflies-shaped JSON's themed
 * breakdown, bullets and overview joined as one document, or the plain
 * string as-is. The summary prompts ask for "Decision:" / "Agreed:"
 * callouts and a "Key Decisions" section, which is exactly what the
 * deterministic notes parser reads.
 */
export function summaryDecisionText(summary: string | null | undefined): string {
  if (!summary?.trim()) return "";
  const parsed = parseFirefliesSummary(summary);
  if (!parsed) return summary;
  const parts = [
    parsed.detailed_breakdown ?? "",
    (parsed.shorthand_bullet ?? []).map((line) => (/^\s*[-*•]/.test(line) ? line : `- ${line}`)).join("\n"),
    parsed.overview ?? "",
  ];
  return parts.filter((part) => part.trim().length > 0).join("\n\n");
}

/** The draft's Markdown body, with the ADR headings the detail page renders. */
export function candidateBody(candidate: DecisionCandidate): string | null {
  const sections: string[] = [];
  if (candidate.rationale) sections.push(`## Context\n${candidate.rationale}`);
  if (candidate.alternatives) sections.push(`## Alternatives considered\n${candidate.alternatives}`);
  return sections.length > 0 ? sections.join("\n\n") : null;
}

export async function generateDraftDecisions(
  db: PrismaClient,
  transcriptionSessionId: string,
  userId: string,
): Promise<DraftDecisionsResult> {
  const result: DraftDecisionsResult = {
    success: false,
    alreadyPublished: false,
    alreadyDrafted: false,
    draftCount: 0,
    draftsCreated: 0,
    discardedWithoutEvidence: 0,
    errors: [],
  };

  try {
    const meeting = await db.transcriptionSession.findUnique({
      where: { id: transcriptionSessionId },
      select: {
        id: true,
        title: true,
        userId: true,
        projectId: true,
        workspaceId: true,
        occurrenceId: true,
        meetingDate: true,
        transcription: true,
        sentencesJson: true,
        notes: true,
        summary: true,
        participants: { select: { userId: true, name: true, email: true, speakerLabel: true } },
      },
    });
    if (!meeting) {
      result.errors.push("Meeting not found");
      return result;
    }

    // Drafts are visible only to the meeting's editors, so producing them
    // takes the same bar (the transcription resolver, ADR-0014).
    const access = await getTranscriptionAccess(db, userId, meeting);
    if (!canEditTranscription(access)) {
      result.errors.push("You do not have edit access to this meeting");
      return result;
    }
    if (!meeting.workspaceId) {
      result.errors.push("This meeting is not in a workspace, so it has no decision sequence");
      return result;
    }
    const workspaceId = meeting.workspaceId;

    const meetingRows = await db.decision.findMany({
      where: { transcriptionSessionId: meeting.id },
      select: { id: true, reviewState: true, statement: true },
    });
    const existingDraftCount = meetingRows.filter((r) => r.reviewState === "DRAFT").length;
    if (existingDraftCount > 0) {
      console.log(`[generateDraftDecisions] ${meeting.id} already has ${existingDraftCount} draft(s)`);
      result.success = true;
      result.alreadyDrafted = true;
      result.draftCount = existingDraftCount;
      return result;
    }
    if (meetingRows.some((r) => r.reviewState === "CONFIRMED")) {
      console.log(`[generateDraftDecisions] ${meeting.id} already has confirmed decisions`);
      result.success = true;
      result.alreadyPublished = true;
      return result;
    }

    const turns: TranscriptTurn[] = parseTranscript({
      transcription: meeting.transcription,
      sentencesJson: meeting.sentencesJson,
      participants: meeting.participants,
    });
    const notesText = meeting.notes?.trim() ?? "";
    if (turns.length === 0 && !notesText) {
      result.success = true;
      return result;
    }

    // De-duplication input: the workspace's confirmed decisions (newest
    // first, bounded) — a decision restated in a later meeting is not a new
    // decision. The open/proposed subset is also what the extractor may
    // resolve rather than duplicate.
    const workspaceDecisions = await db.decision.findMany({
      where: { workspaceId, reviewState: "CONFIRMED" },
      select: { id: true, number: true, statement: true, status: true },
      orderBy: { number: "desc" },
      take: 200,
    });
    // A draft someone rejected from this meeting is not proposed again.
    const rejectedStatements = meetingRows
      .filter((r) => r.reviewState === "REJECTED")
      .map((r) => r.statement);
    const existingStatements = [...workspaceDecisions.map((d) => d.statement), ...rejectedStatements];
    const openDecisions: OpenDecisionRef[] = workspaceDecisions
      .filter((d): d is typeof d & { status: "OPEN" | "PROPOSED" } => d.status === "OPEN" || d.status === "PROPOSED")
      .map((d) => ({
        id: d.id,
        label: `D-${String(d.number).padStart(4, "0")}`,
        statement: d.statement,
        status: d.status,
      }));

    // Notes first: human-curated, near-verbatim. Then the stored summary's
    // explicit decision callouts (deterministic, no model — the summary is
    // itself model output, so only its "Decision:" / "Key Decisions" markup
    // is trusted). Each curated candidate must still be backed by a
    // transcript turn, found deterministically; a candidate nothing in the
    // transcript supports is discarded.
    const notesCandidates: DecisionCandidate[] = [];
    const backWithEvidence = (raw: DecisionCandidate[], label: string) => {
      const already = [...existingStatements, ...notesCandidates.map((c) => c.statement)];
      for (const candidate of filterNearDuplicateDecisions(raw, already)) {
        if (notesCandidates.length >= 15) break;
        const evidence = findSupportingTurns(candidate.statement, turns);
        if (evidence.length === 0) {
          result.discardedWithoutEvidence++;
          console.log(`[generateDraftDecisions] ${label} candidate without supporting turn discarded: "${candidate.statement}"`);
          continue;
        }
        notesCandidates.push({ ...candidate, evidence });
      }
    };
    if (notesText) {
      backWithEvidence(
        await DecisionExtractionService.extractFromNotes(notesText, { existingStatements }),
        "Notes",
      );
    }
    const summaryText = summaryDecisionText(meeting.summary);
    if (summaryText) {
      backWithEvidence(extractNotesDecisionItems(summaryText), "Summary");
    }

    // Transcript second: told what notes and the log already hold.
    let transcriptCandidates: DecisionCandidate[] = [];
    if (turns.length > 0) {
      const alreadyCaptured = [...existingStatements, ...notesCandidates.map((c) => c.statement)];
      try {
        const raw = await DecisionExtractionService.extractFromTranscript(turns, {
          existingStatements: alreadyCaptured,
          openDecisions,
        });
        transcriptCandidates = filterNearDuplicateDecisions(raw, alreadyCaptured);
      } catch (error) {
        console.error("[generateDraftDecisions] transcript extraction failed, continuing with notes:", error);
        result.errors.push(error instanceof Error ? error.message : "Transcript extraction failed");
      }
    }

    // Notes win on exact restatement; the extractor already dropped the rest.
    const seen = new Set<string>();
    const candidates: DecisionCandidate[] = [];
    for (const candidate of [...notesCandidates, ...transcriptCandidates]) {
      const key = normalizeDecisionStatement(candidate.statement);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      candidates.push(candidate);
    }

    for (const candidate of candidates) {
      const draft = await createDraftDecision(db, {
        workspaceId,
        createdById: userId,
        transcriptionSessionId: meeting.id,
        statement: candidate.statement,
        body: candidateBody(candidate),
        status: "ACCEPTED",
        decidedAt: meeting.meetingDate ?? null,
        occurrenceId: meeting.occurrenceId,
        projectId: meeting.projectId,
        deciders: resolveDeciders(candidate.deciderNames, meeting.participants),
        evidence: candidate.evidence,
        resolvesDecisionId: candidate.resolvesDecisionId ?? null,
      });
      console.log(`[generateDraftDecisions] Draft ${draft.number} "${draft.statement}" (${candidate.origin})`);
      result.draftsCreated++;
    }
    result.draftCount = result.draftsCreated;
    result.success = true;

    // One meeting-level event per extraction run. Drafts have no events of
    // their own: they are invisible outside the meeting's editors.
    if (result.draftsCreated > 0) {
      await recordActivity(db, {
        workspaceId,
        userId,
        entityType: "meeting",
        entityId: meeting.id,
        action: "updated",
        metadata: {
          title: meeting.title ?? undefined,
          kind: "decisions_extracted",
          draftDecisionCount: result.draftsCreated,
        },
      });
    }
    return result;
  } catch (error) {
    console.error("[generateDraftDecisions] failed:", error);
    result.errors.push(error instanceof Error ? error.message : "Unknown error");
    return result;
  }
}
