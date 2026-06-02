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
import { resolveVoiceCaller } from "~/server/api/middleware/resolveVoiceCaller";
import { DEFAULT_EXPIRY } from "~/server/utils/jwt";
import { mintVoiceSessionToken, verifyVoiceSessionToken } from "~/server/utils/voice-token";
import { createRealtimeSession } from "~/server/services/voice/openai-realtime";
import { captureAction } from "~/server/services/voice/capture";
import { getTodaysPlan } from "~/server/services/voice/dailyBrief";
import { runQuery } from "~/server/services/voice/query";
import { completeAction } from "~/server/services/voice/complete";
import { askExponential } from "~/server/services/voice/brainPassthrough";
import { speakableCaptureConfirmation } from "~/server/services/voice/speakable";
import {
  resolveWorkspaceId,
  WorkspaceAccessError,
} from "~/server/services/voice/workspaceResolver";
import {
  persistVoiceTurn,
  voiceThreadKey,
  EmptyVoiceTurnError,
} from "~/server/services/voice/voiceTranscriptBridge";

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
   * Mint a voice session. Authed by the any-of voice gate (resolveVoiceCaller):
   * a NextAuth session cookie (web), an x-api-key (legacy iOS), or — reserved,
   * inert today — a device token. Browser users never paste an API key.
   */
  createSession: publicProcedure
    .input(
      z
        .object({ mode: modeSchema, workspaceId: z.string().optional() })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      const { userId } = await resolveVoiceCaller(ctx);

      // Resolve (and validate) the session's workspace once, here — the result
      // is baked into the voice-session JWT as a verified claim so the device
      // cannot tamper with the workspace the brain operates in.
      let workspaceId: string | undefined;
      try {
        workspaceId = await resolveWorkspaceId(userId, db, input?.workspaceId);
      } catch (err) {
        if (err instanceof WorkspaceAccessError) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not a member of the requested workspace.",
          });
        }
        throw err;
      }

      const realtime = await createRealtimeSession();
      const voiceSessionToken = mintVoiceSessionToken({ id: userId }, workspaceId);

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
        /** Pins a confirm to the action the gate proposed (structured
         *  .pendingCompletion.id), so we complete that one rather than
         *  re-resolving the phrase on "yes". */
        pendingActionId: z.string().optional(),
      }),
    )
    .mutation(async ({ input }): Promise<DispatchResult> => {
      let userId: string;
      let workspaceId: string | undefined;
      try {
        ({ userId, workspaceId } = verifyVoiceSessionToken(input.token));
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
          const { action, inbox } = await captureAction(phrase, userId, db, workspaceId);
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

        case "get_todays_plan": {
          // Read-only briefing: never raises the confirmation gate. The verified
          // token claim is authoritative; args.workspaceId is honoured only as a
          // back-compat fallback for one release (see ticket #10 / PRD §33).
          const argWorkspaceId =
            typeof input.args?.workspaceId === "string"
              ? input.args.workspaceId
              : undefined;
          const { speakable, data } = await getTodaysPlan(userId, db, {
            workspaceId: workspaceId ?? argWorkspaceId,
          });
          return {
            speakable,
            structured: { briefing: data },
            needsConfirmation: false,
          };
        }

        case "query": {
          // Read-only, Action/Project-scoped. Declines out-of-scope topics
          // (goals/OKRs/blockers) inside runQuery rather than improvising.
          const phrase = extractPhrase(input.args);
          if (!phrase) {
            return {
              speakable: "What would you like to know about your actions or projects?",
              structured: { error: "missing_phrase" },
              needsConfirmation: false,
            };
          }
          // Token claim is authoritative; args.workspaceId is back-compat only.
          const argWorkspaceId =
            typeof input.args?.workspaceId === "string"
              ? input.args.workspaceId
              : undefined;
          const { speakable, structured } = await runQuery(
            phrase,
            userId,
            db,
            workspaceId ?? argWorkspaceId,
          );
          return { speakable, structured, needsConfirmation: false };
        }

        case "complete_action": {
          // Destructive: gated. completeAction resolves (never silently guesses),
          // returns needsConfirmation on first call, and only mutates on confirm.
          // The confirm flag is relayed by the transport on the user's single-word
          // "yes" (dispatch input carries `confirm`).
          const phrase = extractPhrase(input.args);
          if (!phrase) {
            return {
              speakable: "Which action should I mark as done?",
              structured: { error: "missing_phrase" },
              needsConfirmation: false,
            };
          }
          return completeAction(phrase, userId, db, {
            confirm: input.confirm,
            pendingId: input.pendingActionId,
            workspaceId,
          });
        }

        case "ask_exponential": {
          // Brain passthrough (ADR 0003): hand the whole turn to zoe's full agent
          // for everything the four coarse tools don't cover. zoe self-confirms
          // destructive actions; on failure we degrade gracefully so the voice
          // session never hangs.
          const phrase = extractPhrase(input.args);
          if (!phrase) {
            return {
              speakable: "What would you like me to help with?",
              structured: { error: "missing_phrase" },
              needsConfirmation: false,
            };
          }
          try {
            return await askExponential(phrase, userId, db, workspaceId);
          } catch (error) {
            console.error("[voice.dispatch] ask_exponential failed:", error);
            return {
              speakable: "I couldn't reach the assistant just now. Try again in a moment.",
              structured: { error: "brain_unavailable" },
              needsConfirmation: false,
            };
          }
        }

        default: {
          // Remaining coarse tools land in ticket #5. Until then, echo a
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

  /**
   * Persist one voice transcript turn into the voice-scoped memory thread, so a
   * voice session has continuity across turns. Authed by the voice-session JWT
   * (same as dispatch). Isolated from text-chat memory — see voiceTranscriptBridge.
   */
  persistTurn: publicProcedure
    .input(
      z.object({
        token: z.string().min(1, "voice-session token required"),
        role: z.enum(["user", "assistant"]),
        text: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      let userId: string;
      try {
        ({ userId } = verifyVoiceSessionToken(input.token));
      } catch {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid or missing voice-session token",
        });
      }

      try {
        const turn = await persistVoiceTurn({
          userId,
          role: input.role,
          text: input.text,
          threadKey: voiceThreadKey(userId),
        });
        return { id: turn.id, marker: turn.marker };
      } catch (err) {
        if (err instanceof EmptyVoiceTurnError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
        }
        throw err;
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
