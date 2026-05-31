/**
 * Voice router — the architectural spine for the voice-first iOS client.
 *
 * - `createSession`  : durable-API-key-authed session minter (ADR 0002). Returns
 *                      a short-lived OpenAI Realtime ephemeral key + a scoped
 *                      `voice-session` JWT. The real OPENAI_API_KEY and the
 *                      durable Exponential key never reach the device.
 * - `dispatch`       : the voice brain endpoint / coarse-tool dispatcher
 *                      (ADR 0001). Authenticated by the `voice-session` JWT.
 *                      In this skeleton it echoes a stub; tickets #2–#5 wire the
 *                      coarse tools (capture_action, complete_action,
 *                      get_todays_plan, query) to the zoe-backed server modules.
 *
 * Separate from the existing one2b Vapi phone path in ../mastra, which is
 * untouched.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { db } from "~/server/db";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { apiKeyMiddleware } from "~/server/api/middleware/apiKeyAuth";
import { DEFAULT_EXPIRY } from "~/server/utils/jwt";
import { mintVoiceSessionToken, verifyVoiceSessionToken } from "~/server/utils/voice-token";
import { createRealtimeSession } from "~/server/services/voice/openai-realtime";
import { captureAction } from "~/server/services/voice/capture";
import { speakableCaptureConfirmation } from "~/server/services/voice/speakable";

/** The four coarse tools configured on the Realtime session (v1). */
export const COARSE_TOOLS = [
  "capture_action",
  "complete_action",
  "get_todays_plan",
  "query",
] as const;

/** The session entry-intent (ADR 0001 "mode"). */
const modeSchema = z.enum(["capture", "daily-brief"]).optional();

/** Uniform brain-endpoint result shape (in: intent/phrase, mode, userId → out). */
export interface DispatchResult {
  speakable: string;
  structured: unknown;
  needsConfirmation?: boolean;
}

export const voiceRouter = createTRPCRouter({
  /**
   * Mint a voice session. Authed by the durable Exponential API key via the
   * x-api-key middleware (ctx.userId is guaranteed non-null here).
   */
  createSession: apiKeyMiddleware
    .input(z.object({ mode: modeSchema }).optional())
    .mutation(async ({ ctx }) => {
      const realtime = await createRealtimeSession();
      const voiceSessionToken = mintVoiceSessionToken({ id: ctx.userId });

      return {
        openaiEphemeralKey: realtime.ephemeralKey,
        voiceSessionToken,
        expiresInSeconds: DEFAULT_EXPIRY["voice-session"] * 60,
        realtime: {
          model: realtime.model,
          voice: realtime.voice,
          expiresAt: realtime.expiresAt,
        },
      };
    }),

  /**
   * Voice brain endpoint. Every call must carry a valid `voice-session` JWT;
   * calls without one are rejected. Skeleton: echoes a stub result.
   */
  dispatch: publicProcedure
    .input(
      z.object({
        token: z.string().min(1, "voice-session token required"),
        toolName: z.string().min(1),
        args: z.record(z.unknown()).optional(),
        mode: modeSchema,
        confirm: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }): Promise<DispatchResult> => {
      let userId: string;
      try {
        ({ userId } = verifyVoiceSessionToken(input.token));
      } catch {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid or missing voice-session token",
        });
      }

      switch (input.toolName) {
        case "capture_action": {
          // Non-destructive: capture never raises the confirmation gate.
          const phrase = extractPhrase(input.args);
          if (!phrase) {
            return {
              speakable: "I didn't catch what to capture. Try again?",
              structured: { error: "missing_phrase" },
              needsConfirmation: false,
            };
          }
          const { action, inbox } = await captureAction(phrase, userId, db);
          return {
            speakable: speakableCaptureConfirmation({
              name: action.name,
              dueDate: action.dueDate,
              projectName: action.project?.name ?? null,
            }),
            structured: { action, inbox },
            needsConfirmation: false,
          };
        }

        default: {
          // Remaining coarse tools land in tickets #3–#5. Until then, echo a
          // stub so the dispatch + auth contract stays exercisable.
          return {
            speakable: `Voice brain ready. Received '${input.toolName}'.`,
            structured: {
              stub: true,
              toolName: input.toolName,
              args: input.args ?? {},
              mode: input.mode ?? null,
              userId,
            },
            needsConfirmation: false,
          };
        }
      }
    }),
});

/** Pull the raw user phrase out of a coarse tool's args (the Realtime model
 *  passes the phrase under `phrase`, tolerating `text`/`query` aliases). */
function extractPhrase(args: Record<string, unknown> | undefined): string | null {
  if (!args) return null;
  for (const key of ["phrase", "text", "query"]) {
    const v = args[key];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}
