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
 *   5. registers the 5 voiceToolCatalog tools + router persona via session.update;
 *   6. forwards model tool calls through brainDispatcher and voices the result.
 *
 * Server VAD (the Realtime default) drives turn-taking and barge-in. Per the
 * PRD this transport module is validated by dogfooding, not unit tests.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  dispatch as dispatchToBrain,
  type BrainDispatchInput,
} from "~/lib/voice/brainDispatcher";
import {
  VOICE_TOOL_CATALOG,
  VOICE_ROUTER_INSTRUCTIONS,
} from "~/lib/voice/voiceToolCatalog";

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
  /** A committed assistant spoken transcript (one per finished zoe turn). */
  onAssistantTranscript?: (text: string) => void;
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
}

const DEFAULT_END_ON_SILENCE_MS = 25_000;

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

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tokenRef = useRef<string | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the most recent complete_action gate so a confirm pins to that action.
  const pendingActionIdRef = useRef<string | undefined>(undefined);
  // Tool calls arrive on two events (function_call_arguments.done AND
  // output_item.done) for the same call_id — handle each call once.
  const handledCallIdsRef = useRef<Set<string>>(new Set());
  // Whether a model response is currently in flight. The Realtime API rejects a
  // response.create while one is active, so we gate/defer ours on this.
  const activeResponseRef = useRef(false);
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
    pendingActionIdRef.current = undefined;
    handledCallIdsRef.current.clear();
    activeResponseRef.current = false;
    pendingResponseCreateRef.current = false;
  }, []);

  const stop = useCallback(() => {
    if (pcRef.current || dcRef.current || micRef.current) {
      setState("ending");
      teardown();
    }
    setState("idle");
  }, [teardown]);

  // Always release the session if the component using the hook unmounts.
  useEffect(() => () => teardown(), [teardown]);

  /** (Re)start the end-on-silence countdown; any activity event resets it. */
  const armSilenceTimer = useCallback(() => {
    const ms = optionsRef.current.endOnSilenceMs ?? DEFAULT_END_ON_SILENCE_MS;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (ms <= 0) return;
    silenceTimerRef.current = setTimeout(() => {
      // Only running sessions hold a peer connection; bounds idle billing.
      if (pcRef.current) stop();
    }, ms);
  }, [stop]);

  /** Send a client event over the data channel (no-op if not open). */
  const send = useCallback((event: Record<string, unknown>) => {
    const dc = dcRef.current;
    if (dc && dc.readyState === "open") dc.send(JSON.stringify(event));
  }, []);

  /** Register the tool catalog + router persona on the live session. */
  const configureSession = useCallback(() => {
    send({
      type: "session.update",
      session: {
        type: "realtime",
        instructions: VOICE_ROUTER_INSTRUCTIONS,
        tools: VOICE_TOOL_CATALOG,
        tool_choice: "auto",
      },
    });
  }, [send]);

  /** Forward a model tool call to the brain and feed the result back. */
  const handleToolCall = useCallback(
    async (callId: string, name: string, rawArgs: string) => {
      const token = tokenRef.current;
      if (!token) return;
      // The same tool call surfaces on two events; only dispatch it once.
      if (handledCallIdsRef.current.has(callId)) return;
      handledCallIdsRef.current.add(callId);

      const parsed = parseToolArgs(rawArgs);
      const input: BrainDispatchInput = {
        toolName: name,
        voiceSessionToken: token,
        ...(parsed.phrase ? { args: { phrase: parsed.phrase } } : {}),
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
        // Remember a pending completion so the next confirm pins to it.
        pendingActionIdRef.current = result.needsConfirmation
          ? pendingActionIdOf(result.structured)
          : undefined;
      } catch (err) {
        output = {
          speakable:
            "Sorry, something went wrong reaching the assistant. Try again?",
          error: err instanceof Error ? err.message : "dispatch_failed",
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
      // Trigger the spoken reply — but never while a response is still active
      // (the API rejects that). Defer until the in-flight response completes.
      if (activeResponseRef.current) {
        pendingResponseCreateRef.current = true;
      } else {
        send({ type: "response.create" });
      }
    },
    [send],
  );

  /** Route a single Realtime server event: state transitions + tool calls. */
  const onServerEvent = useCallback(
    (event: RealtimeServerEvent) => {
      optionsRef.current.onServerEvent?.(event);
      // Any server event is activity — reset the end-on-silence countdown.
      armSilenceTimer();

      switch (event.type) {
        case "input_audio_buffer.speech_started":
          setState("listening");
          break;
        case "response.created":
          activeResponseRef.current = true;
          setState("speaking");
          break;
        case "response.output_audio.delta":
        case "output_audio_buffer.started":
          setState("speaking");
          break;
        case "response.done":
          activeResponseRef.current = false;
          // Flush a tool-result reply we deferred while this response ran.
          if (pendingResponseCreateRef.current) {
            pendingResponseCreateRef.current = false;
            send({ type: "response.create" });
          }
          setState("listening");
          break;
        case "output_audio_buffer.stopped":
          setState("listening");
          break;
        case "conversation.item.input_audio_transcription.completed": {
          const text = asString(event.transcript)?.trim();
          if (text) optionsRef.current.onUserTranscript?.(text);
          break;
        }
        case "response.output_audio_transcript.done":
        case "response.audio_transcript.done": {
          const text = asString(event.transcript)?.trim();
          if (text) optionsRef.current.onAssistantTranscript?.(text);
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
        case "error":
          setLastError(describeServerError(event));
          break;
        default:
          break;
      }
    },
    [handleToolCall, armSilenceTimer, send],
  );

  const start = useCallback(async () => {
    if (pcRef.current) return; // already running
    setLastError(null);
    setPermissionDenied(false);
    setState("connecting");

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
      micRef.current = mic;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

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
        setState("listening");
        armSilenceTimer();
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
  }, [configureSession, onServerEvent, teardown, armSilenceTimer]);

  return { state, start, stop, lastError, permissionDenied };
}

// ── pure helpers ─────────────────────────────────────────────────────

interface ParsedToolArgs {
  phrase: string;
  confirm: boolean;
}

/** Tolerant parse of the model's tool-call arguments JSON. */
export function parseToolArgs(json: string): ParsedToolArgs {
  try {
    const obj: unknown = JSON.parse(json);
    if (!isRecord(obj)) return { phrase: "", confirm: false };
    const phrase = typeof obj.phrase === "string" ? obj.phrase.trim() : "";
    const confirm = obj.confirm === true;
    return { phrase, confirm };
  } catch {
    return { phrase: "", confirm: false };
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
