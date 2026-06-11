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
  resolveVoiceThreadKey,
  EmptyVoiceTurnError,
} from "~/server/services/voice/voiceTranscriptBridge";
import { getAiInteractionLogger } from "~/server/services/AiInteractionLogger";
import { PROMPT_VERSION } from "~/server/services/promptVersion";
import {
  VOICE_TOOL_CATALOG,
  VOICE_ROUTER_INSTRUCTIONS,
} from "~/lib/voice/voiceToolCatalog";

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
   * a NextAuth session cookie (web), an `Authorization: Bearer <device-token>`
   * (native app — verified + normalized into ctx.session by createTRPCContext,
   * so it resolves via the gate's session path), or an x-api-key (legacy iOS).
   * Browser users never paste an API key.
   */
  createSession: publicProcedure
    .input(
      z
        .object({
          mode: modeSchema,
          workspaceId: z.string().optional(),
          /**
           * The active text-chat conversation to bind this voice session to
           * (web only, ADR-0006). Baked into the token as an authoritative
           * claim so voice and text share one memory thread. iOS omits it and
           * stays user-scoped (`voice-${userId}`).
           */
          conversationId: z.string().optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      const { userId } = await resolveVoiceCaller(ctx);

      // Resolve (and validate) the session's workspace once, here — the result
      // is baked into the voice-session JWT as a verified claim so the device
      // cannot tamper with the workspace the brain operates in.
      let workspaceId: string | undefined;
      try {
        workspaceId = await resolveWorkspaceId(userId, ctx.db, input?.workspaceId);
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
      const voiceSessionToken = mintVoiceSessionToken(
        { id: userId },
        workspaceId,
        input?.conversationId,
      );

      return {
        openaiEphemeralKey: realtime.ephemeralKey,
        voiceSessionToken,
        expiresInSeconds: DEFAULT_EXPIRY["voice-session"] * 60,
        realtime: {
          model: realtime.model,
          voice: realtime.voice,
          expiresAt: realtime.expiresAt,
        },
        // The server is the single source of truth for the voice tool catalog and
        // router persona (ADR 0005). Clients register exactly what they receive
        // here — the iOS app holds no hardcoded copy and fails the session if these
        // are absent. The catalog is already in the OpenAI Realtime flat-function
        // shape, so clients pass it straight to `session.update`.
        toolCatalog: VOICE_TOOL_CATALOG,
        routerInstructions: VOICE_ROUTER_INSTRUCTIONS,
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
    .mutation(async ({ ctx, input }): Promise<DispatchResult> => {
      let userId: string;
      let workspaceId: string | undefined;
      let conversationId: string | undefined;
      try {
        ({ userId, workspaceId, conversationId } = verifyVoiceSessionToken(
          input.token,
        ));
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
          const { action, inbox } = await captureAction(phrase, userId, ctx.db, workspaceId);
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
          const { speakable, data } = await getTodaysPlan(userId, ctx.db, {
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
            ctx.db,
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
          return completeAction(phrase, userId, ctx.db, {
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
            return await askExponential(
              phrase,
              userId,
              ctx.db,
              workspaceId,
              conversationId,
            );
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
   * Persist one voice transcript turn into the session's memory thread, so a
   * voice session has continuity across turns. Authed by the voice-session JWT
   * (same as dispatch). On web the token carries a `conversationId`, so voice
   * turns land on the shared text-chat thread and are visible to the text agent
   * on the next typed turn; iOS / legacy tokens fall back to the user-scoped
   * `voice-${userId}` thread (ADR-0006).
   *
   * KNOWN, ACCEPTED FOR v1 — turns routed to `ask_exponential` are persisted
   * twice on the thread: once here (the spoken transcript) and once by the
   * brain's own `zoeAgent.generate({ memory })` (the phrase + reply). This was
   * harmless pre-ADR-0006 (isolated `voice-${userId}` thread) and is now a minor
   * recall-quality / token cost on the shared thread. We deliberately keep both
   * writers rather than the alternatives: Mastra's `generate` has no clean
   * read-without-persist toggle (disabling it would risk the brain's own
   * recall — the core of ADR-0006), and the only signal the client has to
   * suppress this writer (the dispatch tool name) can't be reliably correlated
   * to the decoupled Realtime transcript events. Coarse-tool turns run no agent,
   * so for them this is the SOLE writer and must stay. Revisit if recall
   * degrades. See ADR-0006 and brainPassthrough.askExponential.
   */
  persistTurn: publicProcedure
    .input(
      z.object({
        token: z.string().min(1, "voice-session token required"),
        role: z.enum(["user", "assistant"]),
        text: z.string(),
        // For assistant turns: the paired user utterance + the dictation→reply
        // latency, so the turn is also logged to AiInteractionHistory (the same
        // metrics/feedback table typed turns use). Without these we only write
        // to Mastra memory and the turn stays invisible to metrics + rating.
        userMessage: z.string().optional(),
        responseTime: z.number().int().nonnegative().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let userId: string;
      let workspaceId: string | undefined;
      let conversationId: string | undefined;
      try {
        ({ userId, workspaceId, conversationId } = verifyVoiceSessionToken(
          input.token,
        ));
      } catch {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid or missing voice-session token",
        });
      }

      let turnId: string;
      try {
        const turn = await persistVoiceTurn({
          userId,
          role: input.role,
          text: input.text,
          threadKey: resolveVoiceThreadKey(userId, conversationId),
        });
        turnId = turn.id;
      } catch (err) {
        if (err instanceof EmptyVoiceTurnError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
        }
        throw err;
      }

      // Log the completed exchange to AiInteractionHistory so voice turns appear
      // in metrics and can carry a rateable interactionId. Best-effort: a logging
      // failure must never break the live voice session, so we swallow errors.
      let interactionId: string | undefined;
      if (input.role === "assistant" && input.userMessage?.trim()) {
        try {
          interactionId = await getAiInteractionLogger(ctx.db).logInteraction({
            platform: "voice",
            systemUserId: userId,
            userMessage: input.userMessage,
            aiResponse: input.text,
            agentName: "Zoe",
            model: "openai-realtime",
            promptVersion: PROMPT_VERSION,
            ...(conversationId ? { conversationId } : {}),
            ...(workspaceId ? { workspaceId } : {}),
            ...(input.responseTime !== undefined
              ? { responseTime: input.responseTime }
              : {}),
            messageType: "voice",
          });
        } catch (err) {
          console.error("[voice.persistTurn] interaction logging failed:", err);
        }
      }

      return { id: turnId, marker: "voice" as const, interactionId };
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
