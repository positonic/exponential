import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  buildDecisionAccessWhere,
  canEditDecision,
  canEditTranscription,
  canViewDecision,
  canViewTranscription,
  getDecisionAccess,
  getTranscriptionAccess,
  requireWorkspaceMembership,
} from "~/server/services/access";
import {
  confirmDraft,
  createDecision,
  decisionDetailInclude,
  deleteDraft,
  linkEntity,
  listForAdr,
  listForMeeting,
  listForWorkspace,
  rejectDraft,
  setStatus,
  unlinkEntity,
  updateDecision,
} from "~/server/services/decisions/decisionService";
import { formatDecisionLabel } from "~/lib/decision-label";
import { reportHandledErrorServer } from "~/server/utils/reportHandledErrorServer";
import { parseTranscript, type TranscriptTurn } from "~/lib/transcript";
import type { DecisionEvidenceTurn } from "~/lib/decision-evidence";

/**
 * Decisions router (ADR-0060) — the writable half of the Decision Log.
 *
 * Gating:
 * - `protectedProcedure`, deliberately NOT human-only: Zoe logs decisions
 *   through the same service seam (ADR-0016). The `adr` router stays
 *   human-only and read-only; nothing here touches ADR content.
 * - reads gate at workspace `view` (viewers may read what the resolver lets
 *   them see); writes gate at workspace `edit` plus the per-row resolver
 *   check (meeting edit access for meeting-linked rows).
 * - visibility is the resolver's, never inline: every bulk read goes
 *   through `buildDecisionAccessWhere`, every row read through
 *   `getDecisionAccess`.
 */

const decisionStatusSchema = z.enum([
  "OPEN",
  "PROPOSED",
  "ACCEPTED",
  "SUPERSEDED",
  "DEPRECATED",
]);
const decisionSourceSchema = z.enum(["MEETING", "MANUAL", "AGENT"]);

const evidenceTurnSchema = z.object({
  turnIndex: z.number().int().min(0),
  speaker: z.string().nullable().optional(),
  startTime: z.number().nullable().optional(),
  text: z.string().min(1).max(4000),
});

const deciderSchema = z.object({
  userId: z.string().nullable().optional(),
  name: z.string().min(1).max(200),
  email: z.string().email().nullable().optional(),
});

/** The subject columns the resolver needs, loaded once per row read. */
const accessSubjectSelect = {
  id: true,
  workspaceId: true,
  projectId: true,
  reviewState: true,
  transcriptionSession: {
    select: { id: true, userId: true, projectId: true, workspaceId: true },
  },
} as const;

async function loadDecisionSubject(
  db: PrismaClient,
  workspaceId: string,
  decisionId: string,
) {
  const decision = await db.decision.findFirst({
    where: { id: decisionId, workspaceId },
    select: accessSubjectSelect,
  });
  if (!decision) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Decision not found" });
  }
  return decision;
}

/** Throwing wrapper around the decision resolver for one row. */
async function ensureDecisionAccess(
  db: PrismaClient,
  userId: string,
  decision: Awaited<ReturnType<typeof loadDecisionSubject>>,
  permission: "view" | "edit",
) {
  const access = await getDecisionAccess(db, userId, decision);
  const allowed =
    permission === "view" ? canViewDecision(access) : canEditDecision(access);
  if (allowed) return access;
  throw new TRPCError({
    code: permission === "view" ? "NOT_FOUND" : "FORBIDDEN",
    message:
      permission === "view"
        ? "Decision not found"
        : "You do not have edit access to this decision",
  });
}

/**
 * A decision logged from a meeting inherits the meeting's visibility, so
 * logging one requires edit access to that meeting (the same bar as
 * confirming draft Actions from it).
 */
/**
 * Keep only evidence turns that resolve to a real turn of the meeting's
 * transcript, and stamp each with that turn's own speaker and timestamp.
 *
 * Evidence is rendered to a reader as a verbatim transcript quote with a turn
 * index they can click through to, which is the whole reason it is worth
 * having. `source: AGENT` writes arrive from a model that can invent both the
 * index and the words, so the claim has to be checked here rather than
 * trusted — the extraction pipeline already discards candidates whose indices
 * do not resolve, and this closes the same hole on the API.
 *
 * Unresolvable turns are dropped, not fatal: a decision worth logging should
 * not be lost because one quote was wrong.
 */
function validateEvidenceAgainstTranscript(
  evidence: Array<{ turnIndex: number; speaker?: string | null; startTime?: number | null; text: string }>,
  turns: TranscriptTurn[],
): { kept: DecisionEvidenceTurn[]; dropped: number } {
  const kept: DecisionEvidenceTurn[] = [];
  let dropped = 0;
  const seen = new Set<number>();
  for (const turn of evidence) {
    const actual = turns[turn.turnIndex];
    if (!actual || seen.has(turn.turnIndex)) {
      dropped += 1;
      continue;
    }
    // The words must be the transcript's, not the model's recollection of
    // them. Compared loosely (case, punctuation and whitespace) so a quote
    // that is genuinely from this turn survives normalisation differences.
    if (!quoteMatchesTurn(turn.text, actual.text)) {
      dropped += 1;
      continue;
    }
    seen.add(turn.turnIndex);
    kept.push({
      turnIndex: turn.turnIndex,
      // Attribution comes from the transcript, never from the caller.
      speaker: actual.speaker,
      startTime: actual.startTime,
      text: actual.text,
    });
  }
  return { kept, dropped };
}

/** Loose containment: normalised quote must appear in the normalised turn. */
function quoteMatchesTurn(quote: string, turnText: string): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      // Apostrophes vanish rather than splitting a word, so "Let's" and
      // "lets" compare equal; other punctuation becomes a boundary.
      .replace(/['\u2018\u2019]/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  const q = normalize(quote);
  const t = normalize(turnText);
  if (q.length === 0) return false;
  if (t.includes(q)) return true;
  // The reverse direction lets a quote spanning several turns cite the first
  // of them, but a very short turn ("yeah", "no") appears inside almost any
  // sentence — matching on that would attach a real but unsupporting turn as
  // evidence. Require enough of the turn to be meaningful.
  const MIN_REVERSE_MATCH_CHARS = 12;
  return t.length >= MIN_REVERSE_MATCH_CHARS && q.includes(t);
}

async function ensureMeetingEditable(
  db: PrismaClient,
  userId: string,
  workspaceId: string,
  transcriptionSessionId: string,
) {
  const meeting = await db.transcriptionSession.findUnique({
    where: { id: transcriptionSessionId },
    select: { id: true, userId: true, projectId: true, workspaceId: true },
  });
  if (!meeting || meeting.workspaceId !== workspaceId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
  }
  const access = await getTranscriptionAccess(db, userId, meeting);
  if (!canEditTranscription(access)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have edit access to this meeting",
    });
  }
  return meeting;
}

export const decisionRouter = createTRPCRouter({
  /**
   * Confirmed decisions the caller may read, for the Decision Log. Drafts
   * are never included (the resolver's WHERE matches CONFIRMED only).
   */
  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        statuses: z.array(decisionStatusSchema).optional(),
        sources: z.array(decisionSourceSchema).optional(),
        /** A product id, or "workspace" for decisions with no product. */
        productId: z.string().optional(),
        /** With a real productId: ALSO include null-product decisions. */
        includeWorkspaceWide: z.boolean().optional(),
        projectId: z.string().optional(),
        search: z.string().max(200).optional(),
        /** One decision by its workspace sequence number — `D-0003` → 3. */
        number: z.number().int().min(1).optional(),
        /** Bound the page. Unset returns the resolver-visible set uncapped. */
        limit: z.number().int().min(1).max(500).optional(),
      }),
    )
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      return listForWorkspace(
        ctx.db,
        buildDecisionAccessWhere(ctx.session.user.id, input.workspaceId),
        {
          statuses: input.statuses,
          sources: input.sources,
          productId: input.productId,
          includeWorkspaceWide: input.includeWorkspaceWide,
          projectId: input.projectId,
          search: input.search,
          number: input.number,
          limit: input.limit,
        },
      );
    }),

  /** One decision with evidence, deciders, chain and links, for the detail page. */
  get: protectedProcedure
    .input(z.object({ workspaceId: z.string(), decisionId: z.string() }))
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      const subject = await loadDecisionSubject(ctx.db, input.workspaceId, input.decisionId);
      const access = await ensureDecisionAccess(
        ctx.db,
        ctx.session.user.id,
        subject,
        "view",
      );
      const decision = await ctx.db.decision.findUniqueOrThrow({
        where: { id: subject.id },
        include: decisionDetailInclude,
      });
      return {
        ...decision,
        label: formatDecisionLabel(decision.number),
        supersededBy: decision.supersededBy
          ? { ...decision.supersededBy, label: formatDecisionLabel(decision.supersededBy.number) }
          : null,
        supersedes: decision.supersedes.map((d) => ({
          ...d,
          label: formatDecisionLabel(d.number),
        })),
        canEdit: canEditDecision(access),
      };
    }),

  /**
   * Decisions logged from one meeting, for the summary tab. Confirmed rows
   * for anyone who may view the meeting; drafts added for people who may
   * edit it. Also reports whether the caller may log a new one.
   */
  listForMeeting: protectedProcedure
    .input(z.object({ transcriptionSessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const meeting = await ctx.db.transcriptionSession.findUnique({
        where: { id: input.transcriptionSessionId },
        select: { id: true, userId: true, projectId: true, workspaceId: true },
      });
      if (!meeting) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
      }
      const access = await getTranscriptionAccess(ctx.db, ctx.session.user.id, meeting);
      if (!canViewTranscription(access)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
      }
      const canEdit = canEditTranscription(access);
      const decisions = await listForMeeting(ctx.db, meeting.id, {
        includeDrafts: canEdit,
      });
      return {
        decisions,
        // A meeting without a workspace has no sequence to log against.
        canLogDecision: canEdit && meeting.workspaceId !== null,
        workspaceId: meeting.workspaceId,
      };
    }),

  /**
   * Log a confirmed decision — by hand from the Decision Log or a meeting
   * page, or by Zoe (source AGENT). Meeting-linked decisions need edit
   * access to the meeting; the label comes from the workspace sequence.
   */
  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        statement: z.string().trim().min(1).max(500),
        body: z.string().max(20_000).nullable().optional(),
        status: decisionStatusSchema.optional(),
        source: decisionSourceSchema.optional(),
        decidedAt: z.coerce.date().nullable().optional(),
        ownerId: z.string().nullable().optional(),
        transcriptionSessionId: z.string().nullable().optional(),
        occurrenceId: z.string().nullable().optional(),
        productId: z.string().nullable().optional(),
        projectId: z.string().nullable().optional(),
        goalId: z.number().int().nullable().optional(),
        keyResultId: z.string().nullable().optional(),
        deciders: z.array(deciderSchema).max(50).optional(),
        evidence: z.array(evidenceTurnSchema).max(50).optional(),
      }),
    )
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      if (input.transcriptionSessionId) {
        await ensureMeetingEditable(
          ctx.db,
          ctx.session.user.id,
          input.workspaceId,
          input.transcriptionSessionId,
        );
      }
      // Supersession and deprecation are status transitions on existing
      // rows (`setStatus`), never a birth state.
      if (input.status === "SUPERSEDED" || input.status === "DEPRECATED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A new decision cannot start as superseded or deprecated",
        });
      }
      let evidence: DecisionEvidenceTurn[] | undefined;
      if (input.evidence?.length) {
        if (!input.transcriptionSessionId) {
          // Nothing to resolve the indices against, so nothing can be
          // verified. Reject rather than store an uncheckable quote.
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Evidence turns need a transcriptionSessionId — they are quotes from that meeting's transcript",
          });
        }
        const session = await ctx.db.transcriptionSession.findUnique({
          where: { id: input.transcriptionSessionId },
          select: {
            transcription: true,
            sentencesJson: true,
            participants: { select: { name: true, speakerLabel: true, isHost: true } },
          },
        });
        const turns = session
          ? parseTranscript({
              transcription: session.transcription,
              sentencesJson: session.sentencesJson,
              participants: session.participants,
            })
          : [];
        const checked = validateEvidenceAgainstTranscript(input.evidence, turns);
        if (checked.dropped > 0) {
          console.warn(
            `[decision.create] dropped ${checked.dropped} evidence turn(s) that do not match the transcript`,
            { transcriptionSessionId: input.transcriptionSessionId, source: input.source },
          );
        }
        // Every quote rejected is not routine: the caller cited a transcript
        // and none of it was there, which is what a fabricated citation looks
        // like. Surface it instead of letting the decision quietly lose its
        // evidence (a partial drop stays a log line).
        if (checked.kept.length === 0) {
          reportHandledErrorServer(
            new Error("Every evidence turn failed transcript verification"),
            {
              area: "decision.create.evidence",
              context: {
                transcriptionSessionId: input.transcriptionSessionId,
                source: input.source ?? "MANUAL",
                provided: String(input.evidence.length),
                transcriptTurns: String(turns.length),
              },
            },
          );
        }
        evidence = checked.kept.length > 0 ? checked.kept : undefined;
      }
      const decision = await createDecision(ctx.db, {
        ...input,
        evidence,
        createdById: ctx.session.user.id,
      });
      return { ...decision, label: formatDecisionLabel(decision.number) };
    }),

  /** Edit content and scope. Status changes go through `setStatus`. */
  update: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        decisionId: z.string(),
        statement: z.string().trim().min(1).max(500).optional(),
        body: z.string().max(20_000).nullable().optional(),
        decidedAt: z.coerce.date().nullable().optional(),
        ownerId: z.string().nullable().optional(),
        productId: z.string().nullable().optional(),
        projectId: z.string().nullable().optional(),
        goalId: z.number().int().nullable().optional(),
        keyResultId: z.string().nullable().optional(),
        adrDocumentId: z.string().nullable().optional(),
      }),
    )
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, decisionId, ...patch } = input;
      const subject = await loadDecisionSubject(ctx.db, workspaceId, decisionId);
      await ensureDecisionAccess(ctx.db, ctx.session.user.id, subject, "edit");
      const decision = await updateDecision(ctx.db, {
        decisionId: subject.id,
        workspaceId,
        userId: ctx.session.user.id,
        patch,
      });
      return { ...decision, label: formatDecisionLabel(decision.number) };
    }),

  /** Decisions formalised as one ADR, for the ADR page's "Decided in" row. */
  listForAdr: protectedProcedure
    .input(z.object({ workspaceId: z.string(), adrDocumentId: z.string() }))
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      return listForAdr(
        ctx.db,
        buildDecisionAccessWhere(ctx.session.user.id, input.workspaceId),
        input.adrDocumentId,
      );
    }),

  /** "Implemented by": link a ticket from this workspace's products. */
  linkTicket: protectedProcedure
    .input(z.object({ workspaceId: z.string(), decisionId: z.string(), ticketId: z.string() }))
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      const subject = await loadDecisionSubject(ctx.db, input.workspaceId, input.decisionId);
      await ensureDecisionAccess(ctx.db, ctx.session.user.id, subject, "edit");
      const ticket = await ctx.db.ticket.findFirst({
        where: { id: input.ticketId, product: { workspaceId: input.workspaceId } },
        select: { id: true },
      });
      if (!ticket) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
      }
      return linkEntity(ctx.db, {
        decisionId: subject.id,
        userId: ctx.session.user.id,
        ticketId: ticket.id,
      });
    }),

  /** "Implemented by": link a feature from this workspace's products. */
  linkFeature: protectedProcedure
    .input(z.object({ workspaceId: z.string(), decisionId: z.string(), featureId: z.string() }))
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      const subject = await loadDecisionSubject(ctx.db, input.workspaceId, input.decisionId);
      await ensureDecisionAccess(ctx.db, ctx.session.user.id, subject, "edit");
      const feature = await ctx.db.feature.findFirst({
        where: { id: input.featureId, product: { workspaceId: input.workspaceId } },
        select: { id: true },
      });
      if (!feature) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Feature not found" });
      }
      return linkEntity(ctx.db, {
        decisionId: subject.id,
        userId: ctx.session.user.id,
        featureId: feature.id,
      });
    }),

  /** Remove one implemented-by link. */
  unlink: protectedProcedure
    .input(z.object({ workspaceId: z.string(), linkId: z.string() }))
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      const link = await ctx.db.decisionLink.findFirst({
        where: { id: input.linkId, decision: { workspaceId: input.workspaceId } },
        select: { id: true, decisionId: true },
      });
      if (!link) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Link not found" });
      }
      const subject = await loadDecisionSubject(ctx.db, input.workspaceId, link.decisionId);
      await ensureDecisionAccess(ctx.db, ctx.session.user.id, subject, "edit");
      return unlinkEntity(ctx.db, { linkId: link.id, workspaceId: input.workspaceId });
    }),

  /**
   * Lifecycle transition. SUPERSEDED requires `supersededById`, which must
   * be a decision the caller may read in the same workspace.
   */
  setStatus: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        decisionId: z.string(),
        status: decisionStatusSchema,
        supersededById: z.string().nullable().optional(),
      }),
    )
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      const subject = await loadDecisionSubject(ctx.db, input.workspaceId, input.decisionId);
      await ensureDecisionAccess(ctx.db, ctx.session.user.id, subject, "edit");
      if (input.status === "SUPERSEDED" && input.supersededById) {
        const successor = await loadDecisionSubject(
          ctx.db,
          input.workspaceId,
          input.supersededById,
        );
        await ensureDecisionAccess(ctx.db, ctx.session.user.id, successor, "view");
      }
      const decision = await setStatus(ctx.db, {
        decisionId: subject.id,
        workspaceId: input.workspaceId,
        userId: ctx.session.user.id,
        status: input.status,
        supersededById: input.supersededById ?? null,
      });
      return { ...decision, label: formatDecisionLabel(decision.number) };
    }),

  /** Publish a draft into the log (the seam V2's review card will call). */
  confirmDraft: protectedProcedure
    .input(z.object({ workspaceId: z.string(), decisionId: z.string() }))
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      const subject = await loadDecisionSubject(ctx.db, input.workspaceId, input.decisionId);
      await ensureDecisionAccess(ctx.db, ctx.session.user.id, subject, "edit");
      const decision = await confirmDraft(ctx.db, {
        decisionId: subject.id,
        workspaceId: input.workspaceId,
        userId: ctx.session.user.id,
      });
      return { ...decision, label: formatDecisionLabel(decision.number) };
    }),

  /** Reject a draft. Confirmed decisions are deprecated, never rejected. */
  rejectDraft: protectedProcedure
    .input(z.object({ workspaceId: z.string(), decisionId: z.string() }))
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      const subject = await loadDecisionSubject(ctx.db, input.workspaceId, input.decisionId);
      await ensureDecisionAccess(ctx.db, ctx.session.user.id, subject, "edit");
      return rejectDraft(ctx.db, { decisionId: subject.id, workspaceId: input.workspaceId, userId: ctx.session.user.id });
    }),

  /**
   * Hard-delete a draft or rejected row only. A confirmed decision is never
   * deleted (ADR-0060) — the service refuses.
   */
  deleteDraft: protectedProcedure
    .input(z.object({ workspaceId: z.string(), decisionId: z.string() }))
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      const subject = await loadDecisionSubject(ctx.db, input.workspaceId, input.decisionId);
      await ensureDecisionAccess(ctx.db, ctx.session.user.id, subject, "edit");
      return deleteDraft(ctx.db, { decisionId: subject.id, workspaceId: input.workspaceId });
    }),
});
