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

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { apiKeyMiddleware } from "~/server/api/middleware/apiKeyAuth";
import { DEFAULT_EXPIRY } from "~/server/utils/jwt";
import { mintVoiceSessionToken, verifyVoiceSessionToken } from "~/server/utils/voice-token";
import { createRealtimeSession } from "~/server/services/voice/openai-realtime";

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
    .mutation(({ input }): DispatchResult => {
      let userId: string;
      try {
        ({ userId } = verifyVoiceSessionToken(input.token));
      } catch {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid or missing voice-session token",
        });
      }

      // Ticket #1 skeleton: prove auth + dispatch end-to-end. Real coarse-tool
      // routing (to the zoe-backed brain modules) lands in tickets #2–#5.
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
    }),
});
