/**
 * Mints a short-lived OpenAI Realtime ephemeral session key server-side from
 * the durable `OPENAI_API_KEY` (ADR 0002). The real key never reaches the
 * device — only the returned `client_secret` does, and it expires in ~1 min.
 *
 * Isolated in its own module so `voice.createSession` can be unit/integration
 * tested without hitting the OpenAI network (mock this module).
 */
// GA endpoint for minting ephemeral client secrets. The beta
// `/v1/realtime/sessions` was removed when the Realtime API went GA
// (deprecated 2026-05-12) — it now 404s with "Invalid URL".
const OPENAI_REALTIME_CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";

export interface RealtimeSession {
  /** The ephemeral client secret the device uses to open the Realtime session. */
  ephemeralKey: string;
  /** Unix seconds when the ephemeral key expires, if returned by OpenAI. */
  expiresAt?: number;
  model: string;
  voice: string;
}

/**
 * Create an OpenAI Realtime session and return its ephemeral client secret.
 * Throws if the server key is missing or OpenAI rejects the request.
 */
export async function createRealtimeSession(): Promise<RealtimeSession> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to mint a Realtime session");
  }

  const model = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime";
  // `marin` is a natural female GA voice (pairs well with the British-accent
  // persona for Zoe). Override per-deployment via OPENAI_REALTIME_VOICE
  // (other female options: coral, shimmer, sage; male: cedar, ash, echo).
  const voice = process.env.OPENAI_REALTIME_VOICE ?? "marin";

  // GA shape: model + voice are bound to the client secret via the `session`
  // config; the ephemeral key is returned at the top level as `value`.
  const res = await fetch(OPENAI_REALTIME_CLIENT_SECRETS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model,
        // Bind input transcription to the ephemeral key so the device receives
        // `…input_audio_transcription.completed` events for the user's speech
        // (mirrors the live `session.update` in useVoiceSession). Without it the
        // spoken user turn is never transcribed and never rendered.
        audio: {
          output: { voice },
          input: { transcription: { model: "whisper-1" } },
        },
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI Realtime session request failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as { value?: string; expires_at?: number };
  const ephemeralKey = data.value;
  if (!ephemeralKey) {
    throw new Error("OpenAI Realtime session response missing client secret value");
  }

  return {
    ephemeralKey,
    expiresAt: data.expires_at,
    model,
    voice,
  };
}
