import { db } from "~/server/db";
import {
  FeatureExtractionService,
  type ExtractFeaturesOptions,
} from "./FeatureExtractionService";
import {
  getProjectAccess,
  hasProjectAccess as userHasProjectAccess,
} from "./access";

export interface DraftFeaturesResult {
  success: boolean;
  /** Drafts written by THIS call (0 when an existing set was surfaced). */
  featuresCreated: number;
  /** Drafts now awaiting review for this meeting, however they got there. */
  draftCount: number;
  /** True when the call short-circuited on drafts an earlier run left behind. */
  alreadyDrafted: boolean;
  errors: string[];
}

/**
 * Turns a meeting into reviewable draft product features.
 *
 * The single service seam for ideation (PRD: "invocable without an agent") —
 * the tRPC procedures and, later, the mastra tool adapter both call this rather
 * than owning their own write path. Mirrors
 * `TranscriptionProcessingService.generateDraftActions` step for step: resolve
 * the session, check access, short-circuit if work already exists, run
 * deterministic extraction, write rows in a holding state, return a result
 * object (never throw for expected outcomes — the caller maps `success: false`
 * onto a TRPCError).
 *
 * Drafts land in `MeetingFeatureDraft`, NOT in `Feature`: nothing reaches the
 * feature registry until a human accepts.
 */
export class FeatureIdeationService {
  static async generateDraftFeatures(
    transcriptionId: string,
    userId: string,
    options: ExtractFeaturesOptions = {},
  ): Promise<DraftFeaturesResult> {
    const result: DraftFeaturesResult = {
      success: false,
      featuresCreated: 0,
      draftCount: 0,
      alreadyDrafted: false,
      errors: [],
    };

    try {
      const transcription = await db.transcriptionSession.findUnique({
        where: { id: transcriptionId },
        include: {
          project: { include: { team: true } },
          user: true,
        },
      });

      if (!transcription) {
        result.errors.push("Transcription not found");
        return result;
      }

      if (transcription.userId !== userId) {
        const hasAccess = await this.verifyUserAccess(
          userId,
          transcription.projectId,
        );
        if (!hasAccess) {
          result.errors.push("User does not have access to this transcription");
          return result;
        }
      }

      // Idempotence: a second click surfaces the drafts the first one produced
      // instead of paying for extraction again and doubling the review card.
      const existingDrafts = await db.meetingFeatureDraft.count({
        where: { transcriptionSessionId: transcriptionId },
      });

      if (existingDrafts > 0) {
        result.success = true;
        result.alreadyDrafted = true;
        result.draftCount = existingDrafts;
        return result;
      }

      const transcriptText = transcription.transcription?.trim() ?? "";
      if (transcriptText.length === 0) {
        result.errors.push(
          "This meeting has no transcript to ideate features from",
        );
        return result;
      }

      const drafts = await FeatureExtractionService.extractFromTranscript(
        transcriptText,
        options,
      );

      if (drafts.length === 0) {
        // No API key, or nothing feature-shaped was discussed. Both are
        // ordinary outcomes, not failures.
        result.success = true;
        return result;
      }

      await db.meetingFeatureDraft.createMany({
        data: drafts.map((draft) => ({
          transcriptionSessionId: transcriptionId,
          createdById: userId,
          name: draft.name,
          description: draft.description ?? null,
          vision: draft.vision ?? null,
          tickets: draft.tickets.map((ticket) => ({
            title: ticket.title,
            body: ticket.body ?? null,
            type: ticket.type,
          })),
        })),
      });

      result.success = true;
      result.featuresCreated = drafts.length;
      result.draftCount = drafts.length;
      return result;
    } catch (error) {
      console.error("[generateDraftFeatures] Failed:", error);
      result.errors.push(
        error instanceof Error ? error.message : "Failed to ideate features",
      );
      return result;
    }
  }

  /**
   * Same access shape as draft Actions: the meeting's owner always passes,
   * anyone else needs access to the project it is filed under.
   */
  private static async verifyUserAccess(
    userId: string,
    projectId: string | null,
  ): Promise<boolean> {
    if (!projectId) return true;
    const access = await getProjectAccess(db, userId, projectId);
    return userHasProjectAccess(access);
  }
}
