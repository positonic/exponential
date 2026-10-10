"use client";

/**
 * useVoiceSession — the browser Realtime audio layer (Voice — Web Client,
 * ticket #13). Hides the OpenAI Realtime WebRTC lifecycle behind a small
 * `{ state, start, stop, lastError }` interface so the chat-panel UI (next
 * ticket) never has to learn WebRTC.
 *
 * Transport: native browser WebRTC (no SDK dependency) — the standard OpenAI
 * Realtime browser flow. `start()`:
 *   1. mints a voice session (caller-supplied, cookie-authed createSession);
 *   2. captures the mic via getUserMedia;
 *   3. opens an RTCPeerConnection + an "oai-events" data channel;
 *   4. exchanges SDP with OpenAI using the ephemeral client_secret as Bearer
 *      (the durable OPENAI_API_KEY never reaches the browser — only the
 *      short-lived ephemeral key does);
 *   5. registers the 5 voice tools + router persona via session.update (using
 *      what the mint issued, per ADR-0005);
 *   6. seeds the on-screen chat thread as one demoted context item, so the
 *      router can resolve what the user is referring to;
 *   7. forwards model tool calls through brainDispatcher and voices the result.
 *
 * Turn-taking: server VAD detects speech and barge-in, but it does NOT create
 * responses (`create_response: false`). The client owns `response.create`, and
 * sends one on `input_audio_buffer.committed` UNLESS a tool call is still
 * waiting on the brain — in which case the committed turn waits for the tool
 * output's own response.create and gets answered with real data. Without this
 * gate the model answered a mid-wait "okay" from nothing, then contradicted
 * itself when the result landed (ticket humble.basin).
 *
 * Every Realtime event of note is pushed to a `voiceEventLog`; the slice since
 * the previous assistant turn is handed to `onAssistantTranscript` so the caller
 * can persist it with the turn (AiInteractionHistory.actionsTaken). Per the PRD
 * this transport module is validated by dogfooding, not unit tests.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  dispatch as dispatchToBrain,
  type BrainDispatchInput,
} from "~/lib/voice/brainDispatcher";
import {
  VOICE_TOOL_CATALOG,
  VOICE_ROUTER_INSTRUCTIONS,
  type RealtimeToolDescriptor,
} from "~/lib/voice/voiceToolCatalog";
import {
  createVoiceEventLog,
  excerpt,
  type VoiceEvent,
  type VoiceEventLog,
  type VoiceEventType,
} from "~/lib/voice/voiceEventLog";

/** OpenAI Realtime WebRTC SDP-exchange endpoint (GA). */
const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

export type VoiceSessionState =
  | "idle"
  | "connecting"
  | "listening"
  | "speaking"
  | "ending";

/** What the caller's createSession must return (subset of voice.createSession). */
export interface VoiceSessionMint {
  openaiEphemeralKey: string;
  voiceSessionToken: string;
  realtime: { model: string };
  /**
   * Server-issued persona + catalog (ADR-0005: the server is the single source
   * of truth for both). Optional here only so an older/partial mint still
   * starts — we fall back to the bundled constants, which is the same module
   * the server serves from. iOS, by contrast, fails the session outright.
   */
  toolCatalog?: RealtimeToolDescriptor[];
  routerInstructions?: string;
}

/** Forensic context handed along with a committed assistant transcript. */
export interface VoiceTurnMeta {
  /** Realtime events since the previous assistant transcript (tool calls, timings, response ids). */
  events: VoiceEvent[];
}

export interface UseVoiceSessionOptions {
  /** Mint a voice session (cookie-authed). Usually `api.voice.createSession.mutateAsync`. */
  createSession: () => Promise<VoiceSessionMint>;
  /** Base URL for brainDispatcher; defaults to same-origin. */
  baseUrl?: string;
  /** Optional tap on raw Realtime server events. */
  onServerEvent?: (event: RealtimeServerEvent) => void;
  /** A committed user utterance transcript (one per finished user turn). */
  onUserTranscript?: (text: string) => void;
  /**
   * A committed assistant spoken transcript (one per finished zoe turn), with
   * the Realtime events that led to it so the caller can persist the audit trail.
   */
  onAssistantTranscript?: (text: string, meta: VoiceTurnMeta) => void;
  /**
   * Snapshot of the on-screen chat thread, seeded into the Realtime session as
   * one demoted context item the moment the data channel opens (see
   * `buildVoiceSeedContext`). Read once per `start()`, so it must be a getter
   * rather than a value — the caller's messages change on every turn and the
   * hook must not re-render for it.
   *
   * This matters most on resume: a session that ends on the silence timer takes
   * the router's entire conversation with it, and without a reseed the user
   * picks up mid-thought talking to a stranger.
   */
  seedContext?: () => string | null | undefined;
  /**
   * Auto-close the session after this many ms of total silence (no speech, no
   * response activity), to bound Realtime per-minute billing. Default ~25s.
   * Set to 0 to disable.
   */
  endOnSilenceMs?: number;
}

export interface UseVoiceSession {
  state: VoiceSessionState;
  start: () => Promise<void>;
  stop: () => void;
  lastError: string | null;
  /** True when start() failed because mic permission was denied/blocked. */
  permissionDenied: boolean;
  /**
   * True when a session ended for a reason OTHER than a deliberate user stop —
   * the end-on-silence timer, a network drop, or a page refresh mid-session.
   * The UI surfaces a "tap to resume" affordance instead of silently dying;
   * calling `start()` mints a fresh session on the same conversationId
   * (ADR-0006). False after a deliberate `stop()` or once resumed.
   */
  needsResume: boolean;
}

const DEFAULT_END_ON_SILENCE_MS = 25_000;

/**
 * Grace period for a "disconnected" ICE state before treating it as a real
 * drop. Per the WebRTC spec `disconnected` is transient and routinely recovers
 * to `connected` (wifi handoff, a momentary mobile blip), so we wait this long
 * for it to heal rather than tearing the call down on every hiccup. `failed`
 * is terminal and ends immediately.
 */
const DISCONNECT_GRACE_MS = 5_000;

/**
 * A tool call still "pending" after this long is treated as lost for turn-gating
 * purposes, so a hung dispatch can't leave the user talking to silence. Sits
 * above the brain's own 45s generate cap (brainPassthrough.GENERATE_TIMEOUT_MS)
 * plus transport slack; the dispatch normally rejects well before this.
 */
const STALE_TOOL_CALL_MS = 60_000;

/**
 * sessionStorage marker: "a voice session was live and was NOT deliberately
 * stopped." Survives a page refresh (the one teardown path that can't run
 * `stop()`), so on remount we can offer to resume rather than show silence.
 * Per-tab, like the conversation/messages keys in AgentModalProvider.
 */
const VOICE_RESUMABLE_KEY = "exp:voice-resumable";

function readResumableMarker(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      window.sessionStorage.getItem(VOICE_RESUMABLE_KEY) === "1"
    );
  } catch {
    return false;
  }
}

function writeResumableMarker(on: boolean): void {
  try {
    if (typeof window === "undefined") return;
    if (on) window.sessionStorage.setItem(VOICE_RESUMABLE_KEY, "1");
    else window.sessionStorage.removeItem(VOICE_RESUMABLE_KEY);
  } catch {
    // sessionStorage unavailable (private mode / SSR) — resume just won't persist.
  }
}

/** A Realtime server event — a tagged JSON object over the data channel. */
export interface RealtimeServerEvent {
  type: string;
  [key: string]: unknown;
}

export function useVoiceSession(
  options: UseVoiceSessionOptions,
): UseVoiceSession {
  const [state, setState] = useState<VoiceSessionState>("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [needsResume, setNeedsResume] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tokenRef = useRef<string | null>(null);
  // Persona + catalog for the CURRENT session, taken from the mint (ADR-0005).
  const sessionConfigRef = useRef<{
    instructions: string;
    tools: RealtimeToolDescriptor[];
  } | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pending grace timer for a transient "disconnected" transport (see below).
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the most recent complete_action gate so a confirm pins to that action.
  const pendingActionIdRef = useRef<string | undefined>(undefined);
  // Tool calls arrive on two events (function_call_arguments.done AND
  // output_item.done) for the same call_id — handle each call once.
  const handledCallIdsRef = useRef<Set<string>>(new Set());
  // Whether a model response is currently in flight. The Realtime API rejects a
  // response.create while one is active, so we gate/defer ours on this.
  const activeResponseRef = useRef(false);
  // Tool calls dispatched to the brain whose output is not yet on the
  // conversation (call_id → started-at ms). While non-empty, a committed user
  // turn does NOT get its own response.create — see the committed case.
  const pendingToolCallsRef = useRef<Map<string, number>>(new Map());
  // Per-session forensic event log; created in start(), dropped in teardown().
  const eventLogRef = useRef<VoiceEventLog | null>(null);
  // A response.create we wanted to send while a response was active; fired when
  // the active response completes.
  const pendingResponseCreateRef = useRef(false);
  // Latest options without forcing start/stop identities to change.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const teardown = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }
    dcRef.current?.close();
    dcRef.current = null;
    pcRef.current?.getSenders().forEach((s) => s.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
    micRef.current?.getTracks().forEach((t) => t.stop());
    micRef.current = null;
    if (audioRef.current) {
      audioRef.current.srcObject = null;
      audioRef.current = null;
    }
    tokenRef.current = null;
    sessionConfigRef.current = null;
    pendingActionIdRef.current = undefined;
    handledCallIdsRef.current.clear();
    pendingToolCallsRef.current.clear();
    activeResponseRef.current = false;
    pendingResponseCreateRef.current = false;
    eventLogRef.current?.push("session.ended");
    eventLogRef.current = null;
  }, []);

  /**
   * Tear down the live session. `resumable` distinguishes an INVOLUNTARY end
   * (silence timer, network drop) — which leaves the resume affordance up — from
   * a DELIBERATE end (user tapped stop / closed the drawer), which clears it.
   */
  const endSession = useCallback(
    (resumable: boolean) => {
      if (pcRef.current || dcRef.current || micRef.current) {
        setState("ending");
        teardown();
      }
      setState("idle");
      setNeedsResume(resumable);
      // Keep the refresh-survival marker only while a resume is on offer.
      writeResumableMarker(resumable);
    },
    [teardown],
  );

  // Public stop is always a deliberate end — no resume prompt.
  const stop = useCallback(() => endSession(false), [endSession]);

  // Always release the session if the component using the hook unmounts.
  useEffect(() => () => teardown(), [teardown]);

  // On mount, if a prior session was interrupted (marker survived a refresh),
  // offer to resume — but NEVER auto-open the mic (no surprise hot mic).
  useEffect(() => {
    if (readResumableMarker()) setNeedsResume(true);
  }, []);

  /** (Re)start the end-on-silence countdown; any activity event resets it. */
  const armSilenceTimer = useCallback(() => {
    const ms = optionsRef.current.endOnSilenceMs ?? DEFAULT_END_ON_SILENCE_MS;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (ms <= 0) return;
    silenceTimerRef.current = setTimeout(() => {
      // Only running sessions hold a peer connection; bounds idle billing.
      // An idle-timeout end is involuntary — offer to resume (ADR-0006).
      if (pcRef.current) endSession(true);
    }, ms);
  }, [endSession]);

  /** Send a client event over the data channel (no-op if not open). */
  const send = useCallback((event: Record<string, unknown>) => {
    const dc = dcRef.current;
    if (dc && dc.readyState === "open") dc.send(JSON.stringify(event));
  }, []);

  /** Record a forensic event on the current session's log (no-op when idle). */
  const log = useCallback(
    (type: VoiceEventType, detail?: VoiceEvent["detail"]) => {
      eventLogRef.current?.push(type, detail);
    },
    [],
  );

  /**
   * Is a tool call still waiting on the brain? Prunes entries older than
   * STALE_TOOL_CALL_MS so a dispatch that never settles can't gate turns forever.
   */
  const hasPendingToolCall = useCallback((): boolean => {
    const pending = pendingToolCallsRef.current;
    const now = Date.now();
    for (const [callId, startedAt] of pending) {
      if (now - startedAt > STALE_TOOL_CALL_MS) {
        pending.delete(callId);
        log("tool.error", { callId, error: "stale_pending_pruned", durationMs: now - startedAt });
      }
    }
    return pending.size > 0;
  }, [log]);

  /**
   * The ONLY place a response.create is sent. The API rejects a response.create
   * while one is active, so if a response is in flight we defer and flush on its
   * response.done. The slot is reserved locally BEFORE sending so a second
   * request landing before the server's response.created ACK defers instead of
   * racing.
   */
  const requestResponse = useCallback(
    (reason: string) => {
      if (activeResponseRef.current) {
        pendingResponseCreateRef.current = true;
        log("response.deferred", { reason, why: "response_active" });
        return;
      }
      activeResponseRef.current = true;
      log("response.requested", { reason });
      send({ type: "response.create" });
    },
    [send, log],
  );

  /** Register the tool catalog + router persona on the live session. */
  const configureSession = useCallback(() => {
    // Prefer what the server issued for THIS session (ADR-0005) so the persona
    // can be tuned server-side without shipping a new web bundle; the bundled
    // constants are the fallback, and are the same module the server serves.
    const config = sessionConfigRef.current;
    send({
      type: "session.update",
      session: {
        type: "realtime",
        instructions: config?.instructions ?? VOICE_ROUTER_INSTRUCTIONS,
        tools: config?.tools ?? VOICE_TOOL_CATALOG,
        tool_choice: "auto",
        // Enable transcription of the USER's speech. Without this, OpenAI never
        // emits `conversation.item.input_audio_transcription.completed`, so
        // `onUserTranscript` never fires and the spoken user turn never renders
        // (the assistant reply is transcribed by default, which is why only its
        // side showed up). The capability is also bound at mint time server-side.
        audio: {
          input: {
            transcription: { model: "whisper-1" },
            // Server VAD still detects speech and interrupts zoe on barge-in, but
            // the CLIENT decides when a response starts (see the
            // input_audio_buffer.committed case). With the default
            // create_response:true the server started a response on every
            // committed utterance, including an "okay" said while a tool call
            // was still waiting on the brain — and the model answered from
            // nothing (ticket humble.basin).
            turn_detection: {
              type: "server_vad",
              create_response: false,
              interrupt_response: true,
            },
          },
        },
      },
    });
    log("session.configured", {
      source: config ? "mint" : "bundled",
      tools: (config?.tools ?? VOICE_TOOL_CATALOG).length,
    });
  }, [send, log]);

  /**
   * Seed the fresh session with the on-screen thread, as ONE demoted context
   * item. Deliberately does NOT follow with `response.create`: the user tapped
   * the mic to talk, not to be greeted, and server VAD will open the first turn
   * when they actually speak.
   */
  const seedConversation = useCallback(() => {
    const text = optionsRef.current.seedContext?.();
    if (!text) return;
    log("session.seeded", { chars: text.length });
    send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    });
  }, [send, log]);

  /** Forward a model tool call to the brain and feed the result back. */
  const handleToolCall = useCallback(
    async (callId: string, name: string, rawArgs: string) => {
      const token = tokenRef.current;
      if (!token) return;
      // The same tool call surfaces on two events; only dispatch it once.
      if (handledCallIdsRef.current.has(callId)) return;
      handledCallIdsRef.current.add(callId);
      // While this call has no output on the conversation, a committed user
      // turn must NOT start a response — the model would answer from nothing.
      // Cleared below once the function_call_output has been sent.
      const startedAt = Date.now();
      pendingToolCallsRef.current.set(callId, startedAt);

      const parsed = parseToolArgs(rawArgs);
      const args = toolArgsFor(name, parsed);
      log("tool.called", {
        name,
        callId,
        phrase: excerpt(parsed.phrase),
        ...(parsed.focus ? { focus: parsed.focus } : {}),
        ...(parsed.confirm ? { confirm: true } : {}),
      });
      const input: BrainDispatchInput = {
        toolName: name,
        voiceSessionToken: token,
        ...(args ? { args } : {}),
        ...(parsed.confirm ? { confirm: true } : {}),
        ...(parsed.confirm && pendingActionIdRef.current
          ? { pendingActionId: pendingActionIdRef.current }
          : {}),
      };

      let output: unknown;
      try {
        const result = await dispatchToBrain(input, {
          baseUrl: optionsRef.current.baseUrl,
        });
        output = result;
        log("tool.result", {
          name,
          callId,
          durationMs: Date.now() - startedAt,
          needsConfirmation: result.needsConfirmation === true,
          speakable: excerpt(result.speakable),
        });
        // Remember a pending completion so the next confirm pins to it.
        pendingActionIdRef.current = result.needsConfirmation
          ? pendingActionIdOf(result.structured)
          : undefined;
      } catch (err) {
        const message = err instanceof Error ? err.message : "dispatch_failed";
        log("tool.error", {
          name,
          callId,
          durationMs: Date.now() - startedAt,
          error: excerpt(message),
        });
        output = {
          speakable:
            "Sorry, something went wrong reaching the assistant. Try again?",
          error: message,
        };
      }

      // Hand the result back to the model and let it voice the reply.
      send({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(output),
        },
      });
      // The output is on the conversation: user turns may start responses again.
      pendingToolCallsRef.current.delete(callId);
      // Trigger the spoken reply. Any user turn committed while we waited is
      // already in the conversation, so this one response answers it too — with
      // the real result in hand.
      requestResponse("tool_output");
    },
    [send, log, requestResponse],
  );

  /** Route a single Realtime server event: state transitions + tool calls. */
  const onServerEvent = useCallback(
    (event: RealtimeServerEvent) => {
      optionsRef.current.onServerEvent?.(event);
      // Any server event is activity — reset the end-on-silence countdown.
      armSilenceTimer();

      switch (event.type) {
        case "input_audio_buffer.speech_started":
          log("speech.started");
          setState("listening");
          break;
        case "input_audio_buffer.committed": {
          // Server VAD closed a user turn. Because the session runs with
          // create_response:false, nothing happens unless WE ask — and we don't
          // while a tool call is still waiting on the brain: the model has no
          // result to speak yet, and the tool output's own response.create will
          // answer this turn with real data when it lands.
          const itemId = asString(event.item_id) ?? null;
          const toolPending = hasPendingToolCall();
          log("speech.committed", {
            itemId,
            pendingTools: pendingToolCallsRef.current.size,
          });
          if (toolPending) {
            log("response.deferred", { reason: "user_turn", why: "tool_pending" });
            break;
          }
          requestResponse("user_turn");
          break;
        }
        case "response.created": {
          const resp = isRecord(event.response) ? event.response : undefined;
          log("response.created", { responseId: asString(resp?.id) ?? null });
          activeResponseRef.current = true;
          setState("speaking");
          break;
        }
        case "response.output_audio.delta":
        case "output_audio_buffer.started":
          setState("speaking");
          break;
        case "response.done": {
          const resp = isRecord(event.response) ? event.response : undefined;
          log("response.done", {
            responseId: asString(resp?.id) ?? null,
            status: asString(resp?.status) ?? null,
          });
          activeResponseRef.current = false;
          // Flush a response.create we deferred while this response ran (a tool
          // result or a user turn that landed mid-response).
          if (pendingResponseCreateRef.current) {
            pendingResponseCreateRef.current = false;
            requestResponse("flush_deferred");
          }
          setState("listening");
          break;
        }
        case "output_audio_buffer.stopped":
          setState("listening");
          break;
        case "conversation.item.input_audio_transcription.completed": {
          const text = asString(event.transcript)?.trim();
          log("transcript.user", {
            itemId: asString(event.item_id) ?? null,
            text: excerpt(text),
          });
          if (text) optionsRef.current.onUserTranscript?.(text);
          break;
        }
        case "response.output_audio_transcript.done":
        case "response.audio_transcript.done": {
          const text = asString(event.transcript)?.trim();
          log("transcript.assistant", {
            responseId: asString(event.response_id) ?? null,
            text: excerpt(text),
          });
          if (text) {
            // Hand over everything since the previous assistant turn — the tool
            // round-trip, the deferrals, the response ids — so the caller can
            // persist how this reply came to be said.
            const events = eventLogRef.current?.drain() ?? [];
            optionsRef.current.onAssistantTranscript?.(text, { events });
          }
          break;
        }
        case "response.function_call_arguments.done": {
          // GA carries name + call_id + arguments on this event.
          const callId = asString(event.call_id);
          const name = asString(event.name);
          const args = asString(event.arguments) ?? "{}";
          if (callId && name) void handleToolCall(callId, name, args);
          break;
        }
        case "response.output_item.done": {
          // Fallback path: a completed function_call output item.
          const item = event.item;
          if (isRecord(item) && item.type === "function_call") {
            const callId = asString(item.call_id);
            const name = asString(item.name);
            const args = asString(item.arguments) ?? "{}";
            if (callId && name) void handleToolCall(callId, name, args);
          }
          break;
        }
        case "error": {
          const message = describeServerError(event);
          const code = isRecord(event.error) ? asString(event.error.code) : undefined;
          log("server.error", { code: code ?? null, message: excerpt(message) });
          if (code === "conversation_already_has_active_response") {
            // Our response.create raced a response the server already had in
            // flight. Keep the slot marked busy and re-queue, so the turn that
            // asked for it is answered on that response's response.done rather
            // than lost. Not surfaced as a session error: nothing is broken.
            activeResponseRef.current = true;
            pendingResponseCreateRef.current = true;
            break;
          }
          // Release the (possibly optimistically reserved) response slot so a
          // failed response.create can't wedge the gate shut for the session.
          activeResponseRef.current = false;
          setLastError(message);
          break;
        }
        default:
          break;
      }
    },
    [handleToolCall, armSilenceTimer, log, hasPendingToolCall, requestResponse],
  );

  const start = useCallback(async () => {
    if (pcRef.current) return; // already running
    setLastError(null);
    setPermissionDenied(false);
    // Starting (or resuming) clears the resume affordance — we're acting on it.
    setNeedsResume(false);
    setState("connecting");
    // Fresh forensic log per session. Mirrored to the console outside
    // production so a dogfooding session can be read live in devtools.
    eventLogRef.current = createVoiceEventLog({
      echo:
        process.env.NODE_ENV !== "production"
          ? (e) => console.debug("[voice]", e.t, e.type, e.detail ?? "")
          : undefined,
    });

    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      // Distinguish a blocked-permission denial so the UI can explain how to fix it.
      const denied =
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "SecurityError");
      setPermissionDenied(denied);
      setLastError(
        denied
          ? "Microphone access is blocked. Allow microphone permission in your browser settings, then try again."
          : err instanceof Error
            ? err.message
            : "Couldn't access the microphone.",
      );
      setState("idle");
      return;
    }

    try {
      const mint = await optionsRef.current.createSession();
      tokenRef.current = mint.voiceSessionToken;
      // Captured before the data channel exists, so configureSession() (which
      // runs on dc.onopen) always sees this session's own persona/catalog.
      // Both or neither: a server persona paired with a bundled catalog (or the
      // reverse) is a worse failure than falling back cleanly to both bundled.
      if (mint.routerInstructions && mint.toolCatalog) {
        sessionConfigRef.current = {
          instructions: mint.routerInstructions,
          tools: mint.toolCatalog,
        };
      } else {
        // Say so. Silent fallback means a server-side persona change appears to
        // ship and simply doesn't take effect — with nothing anywhere to explain
        // why the model is still following last release's instructions.
        console.warn(
          "[useVoiceSession] mint omitted routerInstructions/toolCatalog — using the bundled persona and catalog; server-side persona changes will NOT apply",
          {
            hasRouterInstructions: !!mint.routerInstructions,
            hasToolCatalog: !!mint.toolCatalog,
          },
        );
        sessionConfigRef.current = null;
      }
      micRef.current = mic;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // A dropped/failed transport is an involuntary end — offer to resume.
      // Guard on identity so our own teardown (which fires "closed") and any
      // stale handler from a prior pc never trigger a spurious resume.
      // `failed` is terminal → end now. `disconnected` is transient and often
      // self-heals, so give it a grace window before giving up; cancel the
      // pending end if it recovers.
      pc.onconnectionstatechange = () => {
        if (pcRef.current !== pc) return;
        const cs = pc.connectionState;
        if (cs === "failed") {
          if (disconnectTimerRef.current) {
            clearTimeout(disconnectTimerRef.current);
            disconnectTimerRef.current = null;
          }
          endSession(true);
        } else if (cs === "disconnected") {
          if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
          disconnectTimerRef.current = setTimeout(() => {
            disconnectTimerRef.current = null;
            if (pcRef.current === pc && pc.connectionState === "disconnected") {
              endSession(true);
            }
          }, DISCONNECT_GRACE_MS);
        } else if (cs === "connected") {
          // Recovered before the grace window elapsed — cancel the pending end.
          if (disconnectTimerRef.current) {
            clearTimeout(disconnectTimerRef.current);
            disconnectTimerRef.current = null;
          }
        }
      };

      // Play zoe's audio: route the remote track to a hidden <audio> element.
      const audioEl = new Audio();
      audioEl.autoplay = true;
      audioRef.current = audioEl;
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0] ?? null;
      };

      mic.getTracks().forEach((track) => pc.addTrack(track, mic));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onopen = () => {
        configureSession();
        seedConversation();
        setState("listening");
        armSilenceTimer();
        // Session is live — mark it so a refresh mid-session can offer resume.
        writeResumableMarker(true);
      };
      dc.onmessage = (e) => {
        const parsed = safeParse(e.data);
        if (parsed) onServerEvent(parsed);
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch(
        `${REALTIME_CALLS_URL}?model=${encodeURIComponent(mint.realtime.model)}`,
        {
          method: "POST",
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${mint.openaiEphemeralKey}`,
            "Content-Type": "application/sdp",
          },
        },
      );
      if (!sdpRes.ok) {
        throw new Error(`Realtime SDP exchange failed (${sdpRes.status})`);
      }
      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Failed to start voice session");
      teardown();
      setState("idle");
    }
  }, [
    configureSession,
    seedConversation,
    onServerEvent,
    teardown,
    armSilenceTimer,
    endSession,
  ]);

  return { state, start, stop, lastError, permissionDenied, needsResume };
}

// ── pure helpers ─────────────────────────────────────────────────────

interface ParsedToolArgs {
  phrase: string;
  confirm: boolean;
  /** get_todays_plan only: which section to read in full. */
  focus: string;
}

const EMPTY_ARGS: ParsedToolArgs = { phrase: "", confirm: false, focus: "" };

/** Tolerant parse of the model's tool-call arguments JSON. */
export function parseToolArgs(json: string): ParsedToolArgs {
  try {
    const obj: unknown = JSON.parse(json);
    if (!isRecord(obj)) return EMPTY_ARGS;
    const phrase = typeof obj.phrase === "string" ? obj.phrase.trim() : "";
    const confirm = obj.confirm === true;
    const focus = typeof obj.focus === "string" ? obj.focus.trim() : "";
    return { phrase, confirm, focus };
  } catch {
    return EMPTY_ARGS;
  }
}

/**
 * The `args` the brain receives for a tool call. `get_todays_plan` carries the
 * optional `focus` plus the browser's IANA timezone (so "today" is the user's
 * day). `ask_exponential` carries the verbatim `phrase` plus the timezone (so
 * zoe's "yesterday" is the user's day); every other tool carries only the
 * `phrase`.
 */
export function toolArgsFor(
  toolName: string,
  parsed: ParsedToolArgs,
): Record<string, unknown> | undefined {
  if (toolName === "get_todays_plan") {
    const timezone = browserTimezone();
    return {
      ...(parsed.focus ? { focus: parsed.focus } : {}),
      ...(timezone ? { timezone } : {}),
    };
  }
  if (!parsed.phrase) return undefined;
  if (toolName === "ask_exponential") {
    const timezone = browserTimezone();
    return { phrase: parsed.phrase, ...(timezone ? { timezone } : {}) };
  }
  return { phrase: parsed.phrase };
}

function browserTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

function pendingActionIdOf(structured: unknown): string | undefined {
  if (!isRecord(structured)) return undefined;
  const pending = structured.pendingCompletion;
  if (!isRecord(pending)) return undefined;
  return typeof pending.id === "string" ? pending.id : undefined;
}

function safeParse(data: unknown): RealtimeServerEvent | null {
  if (typeof data !== "string") return null;
  try {
    const obj: unknown = JSON.parse(data);
    if (isRecord(obj) && typeof obj.type === "string") {
      return obj as RealtimeServerEvent;
    }
  } catch {
    // ignore malformed frames
  }
  return null;
}

function describeServerError(event: RealtimeServerEvent): string {
  const err = event.error;
  if (isRecord(err) && typeof err.message === "string") return err.message;
  return "Realtime session error";
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
