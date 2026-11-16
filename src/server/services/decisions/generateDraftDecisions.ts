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
import { summaryDecisionText } from "~/server/services/decisions/summaryDecisionText";
import { buildDecisionAccessWhere, canEditTranscription, getTranscriptionAccess } from "~/server/services/access";
import { recordActivity } from "~/server/services/activity/recordActivity";
import {
  DEFAULT_MAX_DECISIONS,
  DecisionExtractionService,
  TRANSCRIPT_DECISION_RESERVE,
  extractNotesDecisionItems,
  filterNearDuplicateCandidates,
  findSupportingTurns,
  normalizeDecisionStatement,
  type ActionCandidate,
  type DecisionCandidate,
  type OpenDecisionRef,
} from "~/server/services/DecisionExtractionService";
import {
  createDraftDecisionInTx,
  reserveDecisionNumbers,
  type DecisionDeciderInput,
} from "./decisionService";
import { emitNotification } from "~/server/services/notifications/emit/emitNotification";
import { NOTIFICATION_CATEGORIES } from "~/server/services/notifications/emit/constants";
import { reportHandledErrorServer } from "~/server/utils/reportHandledErrorServer";
import { classifyProviderError } from "~/server/services/ai/providerError";

/**
 * Budget for the all-or-nothing draft write. Prisma's defaults (5 s / 2 s)
 * are sized for a local database; this runs against a managed one from a
 * serverless function.
 */
const DRAFT_WRITE_TIMEOUT_MS = 20_000;
const DRAFT_WRITE_MAX_WAIT_MS = 10_000;

export interface GenerateDraftDecisionsOptions {
  /**
   * Who asked. `manual` is a person on the meeting page or in the drawer
   * (they see the drafts at once, so they are the notification's actor and
   * are not told); `post_summary` is the opt-in hook after a summary lands
   * and `auto_extract` the ceremony's auto-extract sweep (nobody is looking
   * in either case, so the owner is notified).
   */
  trigger?: "manual" | "post_summary" | "auto_extract";
  /**
   * A re-extract: read the meeting again and put the new drafts in place of
   * the unreviewed ones. Confirmed and rejected rows are never touched, and
   * are told to the model as already captured. The old drafts go in the same
   * transaction that writes the new ones, so a run that fails leaves them.
   */
  replaceDrafts?: boolean;
}

export interface DraftDecisionsResult {
  success: boolean;
  /** The meeting already has confirmed decisions; nothing was extracted. */
  alreadyPublished: boolean;
  /** The meeting already had drafts; they were returned, not regenerated. */
  alreadyDrafted: boolean;
  /** Drafts now awaiting review (existing or just created). */
  draftCount: number;
  draftsCreated: number;
  /** Unreviewed drafts a re-extract removed to make way for the new ones. */
  draftsReplaced: number;
  /** Candidates dropped because no transcript turn supported them. */
  discardedWithoutEvidence: number;
  errors: string[];
  /**
   * Things the caller should know that are not failures — partial transcript
   * coverage, most of all. Kept apart from `errors` because the router throws
   * on errors, and a run that produced drafts from five of six sections is a
   * success with a caveat, not a failure.
   */
  warnings: string[];
  /**
   * Action items the transcript pass told apart from the decisions, for the
   * caller to draft as Actions (the meeting page's "Extract outputs" run).
   * Undefined when no transcript pass ran or every section of it failed —
   * "no reading", which the caller must not mistake for "no actions".
   */
  actionItems?: ActionCandidate[];
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

// Kept in a module of its own so the offline eval can use it without loading
// the database client; re-exported here for existing callers.
export { summaryDecisionText };

/** The draft's Markdown body, with the ADR headings the detail page renders. */
/**
 * Compose the draft's Markdown body from the extractor's bullet lists.
 *
 * Fixed ADR headings (context, alternatives, consequences) and one bullet per
 * point: a decision body is read inside a list of decisions, so it has to be
 * scannable at a glance rather than a paragraph to wade through.
 */
export function candidateBody(candidate: DecisionCandidate): string | null {
  const sections: string[] = [];
  const add = (heading: string, points: string[] | undefined) => {
    if (!points || points.length === 0) return;
    sections.push(`## ${heading}\n${points.map((p) => `- ${p}`).join("\n")}`);
  };
  add("Context", candidate.context);
  add("Alternatives considered", candidate.alternatives);
  add("Consequences", candidate.consequences);
  return sections.length > 0 ? sections.join("\n\n") : null;
}

export async function generateDraftDecisions(
  db: PrismaClient,
  transcriptionSessionId: string,
  userId: string,
  options: GenerateDraftDecisionsOptions = {},
): Promise<DraftDecisionsResult> {
  const trigger = options.trigger ?? "manual";
  const result: DraftDecisionsResult = {
    success: false,
    alreadyPublished: false,
    alreadyDrafted: false,
    draftsReplaced: 0,
    draftCount: 0,
    draftsCreated: 0,
    discardedWithoutEvidence: 0,
    errors: [],
    warnings: [],
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
      select: { id: true, reviewState: true, statement: true, status: true },
    });
    const existingDraftCount = meetingRows.filter((r) => r.reviewState === "DRAFT").length;
    if (existingDraftCount > 0 && !options.replaceDrafts) {
      console.log(`[generateDraftDecisions] ${meeting.id} already has ${existingDraftCount} draft(s)`);
      result.success = true;
      result.alreadyDrafted = true;
      result.draftCount = existingDraftCount;
      return result;
    }
    // A re-extract (`replaceDrafts`) reads the meeting again even when it
    // already has confirmed decisions: those, and the rejected ones, are told
    // to the model as already captured, so only what is new comes back.
    if (!options.replaceDrafts && meetingRows.some((r) => r.reviewState === "CONFIRMED")) {
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
    // Scoped to what the acting user may actually read. These statements go
    // into the model prompt and a matched row's statement is rendered back in
    // the review card, so an unscoped read would both ship a restricted
    // corpus to OpenAI and surface it to someone without access.
    const accessWhere = buildDecisionAccessWhere(userId, workspaceId);
    // Open questions are queried separately and unbounded: there are few by
    // definition, and a `take: 200` ordered by number silently hid an older
    // one from BOTH the resolvable set and the dedupe set — so every meeting
    // that touched it minted a fresh duplicate, the exact outcome ADR-0060
    // decision 4 exists to prevent.
    const [openRows, recentConfirmed] = await Promise.all([
      db.decision.findMany({
        where: { AND: [accessWhere, { reviewState: "CONFIRMED" }, { status: { in: ["OPEN", "PROPOSED"] } }] },
        select: { id: true, number: true, statement: true, status: true },
        orderBy: { number: "desc" },
      }),
      db.decision.findMany({
        where: { AND: [accessWhere, { reviewState: "CONFIRMED" }, { status: { notIn: ["OPEN", "PROPOSED"] } }] },
        select: { id: true, number: true, statement: true, status: true },
        orderBy: { number: "desc" },
        take: 200,
      }),
    ]);
    const workspaceDecisions = [...openRows, ...recentConfirmed];
    // A draft someone rejected from this meeting is not proposed again.
    // On a re-extract the meeting's own confirmed rows count too: the
    // workspace read above is bounded, and an older one could fall outside it.
    const rejectedRows = meetingRows.filter(
      (r) => r.reviewState === "REJECTED" || (options.replaceDrafts === true && r.reviewState === "CONFIRMED"),
    );
    // Split by kind (an open question is a Decision in OPEN): a captured item
    // only suppresses candidates of its own kind, so a decision on a topic
    // cannot hide the open question about it, nor an open question the
    // decision that answers it.
    const capturedRows = [...workspaceDecisions, ...rejectedRows];
    const existingStatements = capturedRows.filter((r) => r.status !== "OPEN").map((r) => r.statement);
    const existingQuestions = capturedRows.filter((r) => r.status === "OPEN").map((r) => r.statement);
    const openDecisions: OpenDecisionRef[] = openRows
      .filter((d): d is typeof d & { status: "OPEN" | "PROPOSED" } => d.status === "OPEN" || d.status === "PROPOSED")
      .map((d) => ({
        id: d.id,
        label: `D-${String(d.number).padStart(4, "0")}`,
        statement: d.statement,
        status: d.status,
      }));

    // Notes first: human-curated, near-verbatim. Then the stored summary's
    // explicit callouts (deterministic, no model — the summary is itself
    // model output, so only its "Decision:" / "Key Decisions" and open-question
    // markup is trusted, and "Agreed: to explore X" is read as the open
    // question it is). Each curated candidate must still be backed by a
    // transcript turn, found deterministically; a candidate nothing in the
    // transcript supports is discarded.
    const notesCandidates: DecisionCandidate[] = [];
    const capturedSoFar = () => ({
      decisions: [...existingStatements, ...notesCandidates.filter((c) => !c.isOpenQuestion).map((c) => c.statement)],
      questions: [...existingQuestions, ...notesCandidates.filter((c) => c.isOpenQuestion).map((c) => c.statement)],
    });
    const backWithEvidence = (raw: DecisionCandidate[], label: string) => {
      for (const candidate of raw) {
        if (notesCandidates.length >= DEFAULT_MAX_DECISIONS) break;
        // Recomputed per candidate: snapshotting the comparison set before
        // the loop let two rewordings from the SAME source both through.
        if (filterNearDuplicateCandidates([candidate], capturedSoFar()).length === 0) continue;
        // A meeting with notes but no transcript is explicitly allowed
        // through above. `findSupportingTurns` over zero turns can only
        // return nothing, so requiring evidence there discarded 100% of
        // candidates after paying for the model call. A human-curated notes
        // list is itself the evidence when there is no transcript to cite.
        if (turns.length === 0) {
          notesCandidates.push({ ...candidate, evidence: [] });
          continue;
        }
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
        await DecisionExtractionService.extractFromNotes(notesText, { existingStatements, existingQuestions }),
        "Notes",
      );
    }
    const summaryText = summaryDecisionText(meeting.summary);
    if (summaryText) {
      backWithEvidence(extractNotesDecisionItems(summaryText), "Summary");
    }

    // Notes and summaries label loosely (most are model-written), and the
    // passes above copy them near-verbatim. Hold each to the transcript
    // pass's definition before it can become a draft: follow-up tasks,
    // status updates and general intentions go, an unagreed proposal becomes
    // the open question it is. Only with a transcript: without one there is
    // nothing to check the notes against, and they are the only source.
    let notesOverflow: DecisionCandidate[] = [];
    if (turns.length > 0 && notesCandidates.length > 0) {
      const review = await DecisionExtractionService.reviewCuratedCandidates(notesCandidates);
      for (const { candidate, reason } of review.dropped) {
        console.log(`[generateDraftDecisions] Notes candidate dropped on review (${reason}): "${candidate.statement}"`);
      }
      // A proposal the review reworded as a question was only ever checked
      // against the log as a decision: check it again as what it now is, so
      // it cannot restate a question already captured or already rejected.
      const kept = filterNearDuplicateCandidates(review.kept, {
        decisions: existingStatements,
        questions: existingQuestions,
      });
      // The transcript is always read: it keeps a share of the budget. What
      // the notes hold beyond their share waits, and takes any slot the
      // transcript pass leaves unused (it found little, or could not run).
      const curatedShare = DEFAULT_MAX_DECISIONS - TRANSCRIPT_DECISION_RESERVE;
      notesCandidates.splice(0, notesCandidates.length, ...kept.slice(0, curatedShare));
      notesOverflow = kept.slice(curatedShare);
    }

    // Transcript second: told what notes and the log already hold.
    let transcriptCandidates: DecisionCandidate[] = [];
    // One budget across both passes: the notes pass and the transcript pass
    // each used to cap at 15 independently, so a single meeting could mint 30
    // drafts and burn 30 labels from the workspace sequence.
    const remainingBudget = Math.max(0, DEFAULT_MAX_DECISIONS - notesCandidates.length);
    if (turns.length > 0 && remainingBudget > 0) {
      const alreadyCaptured = capturedSoFar();
      try {
        const run = await DecisionExtractionService.extractFromTranscript(turns, {
          existingStatements: alreadyCaptured.decisions,
          existingQuestions: alreadyCaptured.questions,
          openDecisions,
          maxDecisions: remainingBudget,
        });
        transcriptCandidates = filterNearDuplicateCandidates(run.candidates, alreadyCaptured);
        // Hand the action items over only from a full reading. This pass is
        // capped at MAX_TRANSCRIPT_CHUNKS sections and the dedicated action
        // pass is not, so a truncated run would silently drop every task
        // stated after the cap; the caller falls back to that pass instead.
        if (run.chunksSkipped === 0 && run.chunksFailed < run.chunksTotal) {
          result.actionItems = run.actionItems;
        }
        if (run.chunksSkipped > 0) {
          result.warnings.push(
            `The transcript was longer than one extraction pass covers, so the last ${run.chunksSkipped} of its ${run.chunksTotal} sections were not read. Decisions made only in those sections will be missing.`,
          );
        }
        // Every chunk failing looks exactly like "no decisions here" to the
        // caller unless we say otherwise.
        if (run.chunksFailed > 0 && run.candidates.length === 0) {
          const message = `All ${run.chunksFailed} transcript section(s) failed to extract`;
          result.errors.push(message);
          // The reasons are what make this actionable: a provider auth or
          // billing failure is an ops fix (rotate the key, top up), a timeout
          // or parse failure is ours. Context, not the message, so recurrences
          // still dedupe onto one ticket.
          const reasons = run.failureReasons ?? [];
          const firstReason = reasons[0];
          reportHandledErrorServer(new Error(message), {
            area: "generateDraftDecisions: transcript decision extraction failed",
            context: {
              transcriptionSessionId: meeting.id,
              chunksFailed: String(run.chunksFailed),
              ...(firstReason
                ? {
                    failureReasons: reasons.join(" | "),
                    providerErrorKind: classifyProviderError(firstReason),
                  }
                : {}),
            },
          });
        }
      } catch (error) {
        console.error("[generateDraftDecisions] transcript extraction failed, continuing with notes:", error);
        result.errors.push(error instanceof Error ? error.message : "Transcript extraction failed");
        reportHandledErrorServer(error, {
          area: "generateDraftDecisions: transcript decision extraction failed",
          context: { transcriptionSessionId: meeting.id },
        });
      }
    }

    // Notes win on exact restatement; the extractor already dropped the rest.
    const seen = new Set<string>();
    const candidates: DecisionCandidate[] = [];
    const spareSlots = Math.max(0, DEFAULT_MAX_DECISIONS - notesCandidates.length - transcriptCandidates.length);
    const notesTopUp = filterNearDuplicateCandidates(notesOverflow, {
      decisions: transcriptCandidates.filter((c) => !c.isOpenQuestion).map((c) => c.statement),
      questions: transcriptCandidates.filter((c) => c.isOpenQuestion).map((c) => c.statement),
    }).slice(0, spareSlots);
    for (const candidate of [...notesCandidates, ...notesTopUp, ...transcriptCandidates]) {
      const normalized = normalizeDecisionStatement(candidate.statement);
      if (!normalized) continue;
      const key = `${candidate.isOpenQuestion ? "q" : "d"}:${normalized}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(candidate);
    }

    // All or nothing. The short-circuit above treats ANY existing draft as
    // "this meeting is done", so a run killed part-way through a per-candidate
    // loop left a partial set that every retry reported as complete — with no
    // way back short of rejecting them all.
    const replacingDrafts = options.replaceDrafts === true && existingDraftCount > 0;
    if (replacingDrafts && result.errors.length > 0) {
      // Part of the reading failed. The drafts already there came from a
      // reading that did not, so they stay rather than be replaced by less.
      result.alreadyDrafted = true;
      result.draftCount = existingDraftCount;
      return result;
    }
    if (candidates.length > 0 || replacingDrafts) {
      await db.$transaction(
        async (tx) => {
          if (replacingDrafts) {
            const { count } = await tx.decision.deleteMany({
              where: { transcriptionSessionId: meeting.id, workspaceId, reviewState: "DRAFT" },
            });
            result.draftsReplaced = count;
          }
          if (candidates.length === 0) return;
          // One statement for the whole block of labels, so the transaction is
          // N round trips rather than 2N (see reserveDecisionNumbers).
          const numbers = await reserveDecisionNumbers(tx, workspaceId, candidates.length);
          for (const [index, candidate] of candidates.entries()) {
            const draft = await createDraftDecisionInTx(tx, {
              workspaceId,
              number: numbers[index]!,
              createdById: userId,
              transcriptionSessionId: meeting.id,
              statement: candidate.statement,
              body: candidateBody(candidate),
              // An open question is a Decision in OPEN status, not a separate
              // entity (ADR-0060) — the meeting page splits the two by status.
              status: candidate.isOpenQuestion ? "OPEN" : "ACCEPTED",
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
        },
        {
          // Prisma's 5 s default is a local-database number. This writes up to
          // DEFAULT_MAX_DECISIONS rows against a production database a region
          // away, and it is all-or-nothing by design, so give it room rather
          // than let a slow link roll back an extraction that already spent
          // real money on the model.
          timeout: DRAFT_WRITE_TIMEOUT_MS,
          maxWait: DRAFT_WRITE_MAX_WAIT_MS,
        },
      );
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
      // Tell the meeting owner there are drafts to review (the meeting-ready
      // category's draft variant, ADR-0045). Awaited: the extraction has
      // already spent seconds on the model, and a void'd promise does not
      // survive a Vercel response ending. `emitNotification` never throws.
      await emitNotification({
        db,
        category: NOTIFICATION_CATEGORIES.MEETING_READY,
        actorUserId: trigger === "manual" ? userId : null,
        subject: { sessionId: meeting.id, draftDecisionCount: result.draftsCreated },
      });
    }
    return result;
  } catch (error) {
    console.error("[generateDraftDecisions] failed:", error);
    result.errors.push(error instanceof Error ? error.message : "Unknown error");
    reportHandledErrorServer(error, {
      area: "generateDraftDecisions: draft decision extraction failed",
      context: { transcriptionSessionId },
    });
    return result;
  }
}
