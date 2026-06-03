/**
 * Brain passthrough — the `ask_exponential` voice tool's server side.
 *
 * Unlike the four COARSE tools (capture/today/query/complete), which are thin,
 * intent-shaped RPCs into narrow modules, this hands the user's whole phrase to
 * zoe's FULL agent loop (all of zoe's tools: projects, goals/OKR, calendar, CRM,
 * email, Slack, meetings, web). It is the long-tail catch-all so the voice client
 * isn't limited to the four coarse intents (see ADR 0003).
 *
 * Auth (ADR 0002): the device only ever holds the short-lived voice-session
 * token. Here, server-side, we mint a full agent JWT from the verified userId and
 * pass it to zoe via the Mastra RequestContext so zoe's tools call the Exponential
 * backend as that user. The broad agent JWT never reaches the device.
 *
 * Mirrors the web chat path (src/app/api/chat/stream/route.ts) but NON-streaming:
 * a single awaited generate() returns the final text, which the Realtime model
 * voices. The spoken filler masks the round-trip.
 *
 * Confirmation: writes are allowed; zoe self-confirms destructive/irreversible
 * actions conversationally via the guard below (the structured confirmation gate
 * stays on the dedicated complete_action coarse tool).
 */
import type { PrismaClient } from "@prisma/client";

import { MastraClient } from "@mastra/client-js";
import type { MessageListInput } from "@mastra/core/agent/message-list";
import { RequestContext } from "@mastra/core/di";

import { generateAgentJWT } from "~/server/utils/jwt";
import { boundLength } from "~/server/services/voice/speakable";
import { resolveWorkspaceId } from "~/server/services/voice/workspaceResolver";
import { resolveVoiceThreadKey } from "~/server/services/voice/voiceTranscriptBridge";
import { withTimeout } from "~/server/utils/withTimeout";

const MASTRA_API_URL = process.env.MASTRA_API_URL ?? "http://localhost:4111";

/**
 * Bound zoe's full agent run. The tRPC route this sits under is a 60s Vercel
 * function (see `src/app/api/trpc/[trpc]/route.ts`); zoe's loop (model turns +
 * tool calls into Google/Slack/etc.) has no timeout of its own. Cap it below the
 * wall so a stalled tool rejects HERE — the caller (voice.dispatch) then speaks a
 * fallback instead of the function being killed mid-flight.
 */
const GENERATE_TIMEOUT_MS = 45_000;

/**
 * System guard. Two jobs: keep replies spoken-length, and stop zoe from making
 * UNREQUESTED writes over voice. zoe's persona is eager — without this it will
 * happily invent and create a goal when merely asked "what are my goals?". So we
 * pin it to read-by-default and require an explicit ask + spoken confirm to write.
 */
const VOICE_SELF_CONFIRM_GUARD = `You are answering over a VOICE call, speaking as Zoe.
- Keep replies short and natural for speech — a sentence or two, no markdown, no bullet lists, no raw IDs.
- Use your tools for any fact or action; never invent the user's data.
- DEFAULT TO READ-ONLY. Only create, update, delete, complete, or send something if the user EXPLICITLY asked for that action in this message. If they only asked a question (e.g. "what are my goals?"), just answer with the read tools — do NOT create or modify anything, and never invent an item to fill a gap or be "helpful".
- If a write IS explicitly requested, first say out loud what you're about to do and ask the user to confirm; only proceed after they clearly say yes.`;

export interface BrainPassthroughResult {
  speakable: string;
  structured: unknown;
  needsConfirmation: false;
}

/**
 * Run zoe's full agent for a voice turn and return a spoken answer. Throws are
 * caught by the caller (voice.dispatch) which renders a graceful fallback.
 *
 * `workspaceId` is the session's verified workspace (from the voice-session JWT
 * claim, threaded by voice.dispatch) so zoe's workspace-scoped tools (OKR/goals)
 * have a valid id. Legacy tokens minted before the claim existed pass it as
 * undefined; we then fall back to the shared `workspaceResolver` (the same
 * three-tier resolution used at session-mint time).
 *
 * `conversationId` is the session's verified text-chat thread (web only,
 * ADR-0006). When present, zoe reads/writes that same memory thread so the
 * brain recalls what was typed and voice turns appear in the text history;
 * absent (iOS / legacy), it falls back to the user-scoped `voice-${userId}`
 * thread. `resource` stays `userId` either way.
 */
export async function askExponential(
  phrase: string,
  userId: string,
  db: PrismaClient,
  workspaceId?: string,
  conversationId?: string,
): Promise<BrainPassthroughResult> {
  const agentJWT = generateAgentJWT({ id: userId });
  const effectiveWorkspaceId = workspaceId ?? (await resolveWorkspaceId(userId, db));

  const client = new MastraClient({
    baseUrl: MASTRA_API_URL,
    headers: { Authorization: `Bearer ${agentJWT}` },
  });

  // Mirror the web chat RequestContext so zoe's tools have what they need.
  const entries: [string, string][] = [
    ["authToken", agentJWT],
    ["userId", userId],
  ];
  if (effectiveWorkspaceId) entries.push(["workspaceId", effectiveWorkspaceId]);
  const requestContext = new RequestContext(entries);

  const messages: MessageListInput = [
    { role: "system", content: VOICE_SELF_CONFIRM_GUARD },
    { role: "user", content: phrase },
  ];

  const res = await withTimeout(
    client.getAgent("zoeAgent").generate(messages, {
      requestContext: requestContext as RequestContext<unknown>,
      memory: {
        resource: userId,
        thread: resolveVoiceThreadKey(userId, conversationId),
      },
    }),
    GENERATE_TIMEOUT_MS,
    "zoeAgent.generate",
  );

  const text = (res.text ?? "").trim();
  return {
    speakable: boundLength(text.length > 0 ? text : "I didn't get an answer for that."),
    structured: { via: "zoe", workspaceId: effectiveWorkspaceId ?? null },
    needsConfirmation: false,
  };
}
