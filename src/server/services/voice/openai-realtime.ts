/**
 * Mints a short-lived OpenAI Realtime ephemeral session key server-side from
 * the durable `OPENAI_API_KEY` (ADR 0002). The real key never reaches the
 * device — only the returned `client_secret` does, and it expires in ~1 min.
 *
 * Isolated in its own module so `voice.createSession` can be unit/integration
 * tested without hitting the OpenAI network (mock this module).
 */
const OPENAI_REALTIME_SESSIONS_URL = "https://api.openai.com/v1/realtime/sessions";

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

  const model = process.env.OPENAI_REALTIME_MODEL ?? "gpt-4o-realtime-preview";
  const voice = process.env.OPENAI_REALTIME_VOICE ?? "alloy";

  const res = await fetch(OPENAI_REALTIME_SESSIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, voice }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI Realtime session request failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    client_secret?: { value?: string; expires_at?: number };
  };
  const ephemeralKey = data.client_secret?.value;
  if (!ephemeralKey) {
    throw new Error("OpenAI Realtime session response missing client_secret.value");
  }

  return {
    ephemeralKey,
    expiresAt: data.client_secret?.expires_at,
    model,
    voice,
  };
}
