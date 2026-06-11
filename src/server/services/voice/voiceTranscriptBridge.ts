/**
 * voiceTranscriptBridge (Voice — Web Client, ticket #14) — persists a voice turn
 * (the user's spoken utterance, or zoe's spoken reply) into a Mastra memory
 * thread so a voice session has conversational continuity across turns.
 *
 * MEMORY MODEL — ISOLATE (decided with the human owner; see the ticket comment):
 * the gating iOS audit response on memory alignment never arrived, the web chat
 * doesn't actually key memory per-(user × workspace) (it keys per-conversation),
 * and there is no app-side chat message table to add a `marker` column to. So
 * voice turns persist to a VOICE-SCOPED thread (the same `voice-${userId}` key
 * brainPassthrough already uses), kept isolated from the text-chat memory, and
 * the 🎙 `marker` is a UI/contract attribute (MastraMessageV1 has no metadata
 * slot for it). brainPassthrough's thread key is left untouched, so iOS runtime
 * behaviour is unchanged. Reversible to alignment once the audit lands.
 *
 * Idempotent: a turn's id is derived from (threadKey, role, text), so a retry of
 * the same turn upserts rather than duplicating.
 */
import crypto from "crypto";

import { MastraClient } from "@mastra/client-js";
import { generateAgentJWT } from "~/server/utils/jwt";

const MASTRA_API_URL = process.env.MASTRA_API_URL ?? "http://localhost:4111";
/** Same agent brainPassthrough drives, so the voice thread is one conversation. */
const VOICE_AGENT_ID = "zoeAgent";

export type VoiceTurnRole = "user" | "assistant";

export interface PersistVoiceTurnInput {
  userId: string;
  role: VoiceTurnRole;
  text: string;
  /** The voice-scoped Mastra thread key (e.g. `voice-${userId}`). */
  threadKey: string;
  /** Display marker; defaults to "voice" (drives the 🎙 chat icon). */
  marker?: "voice";
}

export interface PersistedVoiceTurn {
  id: string;
  role: VoiceTurnRole;
  threadKey: string;
  marker: "voice";
}

/** Thrown when asked to persist an empty/whitespace-only turn. */
export class EmptyVoiceTurnError extends Error {
  constructor() {
    super("Refusing to persist an empty voice turn");
    this.name = "EmptyVoiceTurnError";
  }
}

/** The slice of MastraClient the bridge needs (injectable for tests). */
export interface VoiceMemoryClient {
  saveMessageToMemory(params: {
    agentId: string;
    messages: Array<{
      id: string;
      role: VoiceTurnRole;
      content: string;
      createdAt: Date;
      threadId: string;
      resourceId: string;
      type: "text";
    }>;
  }): Promise<unknown>;
  createMemoryThread(params: {
    threadId: string;
    resourceId: string;
    agentId: string;
    title?: string;
  }): Promise<unknown>;
}

function defaultClient(userId: string): VoiceMemoryClient {
  const agentJWT = generateAgentJWT({ id: userId });
  return new MastraClient({
    baseUrl: MASTRA_API_URL,
    headers: { Authorization: `Bearer ${agentJWT}` },
  }) as unknown as VoiceMemoryClient;
}

/** Deterministic id so retrying the same turn upserts instead of duplicating. */
export function voiceTurnId(threadKey: string, role: VoiceTurnRole, text: string): string {
  const hash = crypto
    .createHash("sha256")
    .update(`${threadKey}:${role}:${text}`)
    .digest("hex")
    .slice(0, 32);
  return `voice-${hash}`;
}

/** Mastra's saveMessages rejects writes to a nonexistent thread with this. */
function isThreadNotFound(err: unknown): boolean {
  return err instanceof Error && /thread .* not found/i.test(err.message);
}

/**
 * Persist one voice turn into its voice-scoped memory thread. Rejects empty
 * turns; idempotent on retry (deterministic id). Returns the persisted record
 * (carrying the marker the chat UI renders as 🎙).
 *
 * A conversation can BEGIN with a voice turn (ADR-0006 binds web voice to the
 * text chat's conversationId, but the Mastra thread is only created when the
 * agent first runs against it — `saveMessages` does NOT auto-create). Observed
 * 2026-06-11: every turn of a voice-first session failed with "Thread conv_…
 * not found" and the client retried forever, losing the whole transcript. So
 * on that specific failure we create the thread and retry the save once. The
 * create is best-effort (a concurrent turn may have won the race); the retried
 * save is the call that decides success.
 */
export async function persistVoiceTurn(
  input: PersistVoiceTurnInput,
  deps: { client?: VoiceMemoryClient } = {},
): Promise<PersistedVoiceTurn> {
  const text = input.text.trim();
  if (!text) throw new EmptyVoiceTurnError();

  const id = voiceTurnId(input.threadKey, input.role, text);
  const client = deps.client ?? defaultClient(input.userId);

  const save = () =>
    client.saveMessageToMemory({
      agentId: VOICE_AGENT_ID,
      messages: [
        {
          id,
          role: input.role,
          content: text,
          createdAt: new Date(),
          threadId: input.threadKey,
          resourceId: input.userId,
          type: "text",
        },
      ],
    });

  try {
    await save();
  } catch (err) {
    if (!isThreadNotFound(err)) throw err;
    try {
      await client.createMemoryThread({
        threadId: input.threadKey,
        resourceId: input.userId,
        agentId: VOICE_AGENT_ID,
        title: "Voice conversation",
      });
    } catch (createErr) {
      console.warn(
        "[voiceTranscriptBridge] createMemoryThread failed (may have lost a benign race):",
        createErr,
      );
    }
    await save();
  }

  return { id, role: input.role, threadKey: input.threadKey, marker: input.marker ?? "voice" };
}

/** The voice-scoped memory thread key for a user (the iOS / no-conversation fallback). */
export function voiceThreadKey(userId: string): string {
  return `voice-${userId}`;
}

/**
 * Resolve the Mastra memory thread the brain reads/writes for a voice turn
 * (ADR-0006). On web the voice-session token carries the active text-chat
 * `conversationId`, so voice and text converge on ONE thread (the text chat
 * already keys memory on `thread.id = conversationId`, `resource = userId`).
 * With no conversationId (iOS / legacy tokens) it falls back to the
 * user-scoped `voice-${userId}` thread, preserving the prior behaviour.
 *
 * `resource` is `userId` on both sides regardless — only the thread key differs.
 */
export function resolveVoiceThreadKey(
  userId: string,
  conversationId?: string,
): string {
  return conversationId && conversationId.length > 0
    ? conversationId
    : voiceThreadKey(userId);
}
