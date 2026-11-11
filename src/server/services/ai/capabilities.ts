/**
 * Which AI this install has — the one answer every AI surface reads.
 *
 * A self-host install needs no LLM key: with none set the app is a plain
 * project and task tool, and each AI feature is hidden, explains how to turn
 * it on, or (crons, webhooks, indexing) logs one line and skips. Adding a key
 * and restarting turns the matching features on. exponential.im has every key
 * set, so everything resolves on there.
 *
 * Server code asks through `requireAi` / `isAiConfigured`
 * (`./requireAi.ts`); the UI reads the public `ai.getCapabilities` query; the
 * self-host preflight prints `aiCapabilityLines`. Same shape as
 * `src/server/auth/signInMethods.ts`.
 *
 * Pure, and imports nothing, so client components can import its types.
 */

export interface AiCapabilities {
  /** `OPENAI_API_KEY` is set: embeddings, extraction, digests, AI workflow steps, size suggestions. */
  openai: boolean;
  /** `ANTHROPIC_API_KEY` is set: Claude-written workspace updates and summaries, YouTube articles. */
  anthropic: boolean;
  /** Mastra is configured: the Assistant, chat, Agent runs, scheduling suggestions, CRM enrichment. */
  assistant: boolean;
  /** Meeting summaries: Claude when Anthropic is set, OpenAI otherwise. */
  summaries: boolean;
  /** Voice mode: OpenAI Realtime for the audio, the Assistant as its brain. */
  voice: boolean;
}

/** `process.env`, or any subset of it. */
export type AiEnv = Partial<Record<string, string | undefined>>;

/** The local Mastra dev server, used only outside production when MASTRA_API_URL is unset. */
export const DEV_MASTRA_URL = "http://localhost:4111";

/**
 * The variables that turn AI on, in the order the preflight and the README list
 * them, with what each one turns on. Names only — never values.
 */
export const AI_SETUP_OPTIONS: ReadonlyArray<{ variable: string; label: string; turnsOn: string }> = [
  {
    variable: "OPENAI_API_KEY",
    label: "OpenAI",
    turnsOn:
      "meeting summaries, action/decision/feature extraction, semantic search and knowledge indexing, digests and weekly narratives, AI workflow steps, ticket size suggestions",
  },
  {
    variable: "ANTHROPIC_API_KEY",
    label: "Anthropic",
    turnsOn: "meeting summaries (preferred over OpenAI), Claude-written workspace updates, YouTube articles",
  },
  {
    variable: "MASTRA_API_URL",
    label: "Assistant (Mastra)",
    turnsOn:
      "the Assistant: chat, Assign to Assistant, scheduling suggestions, CRM enrichment; with OPENAI_API_KEY, voice",
  },
];

/** Set means non-empty, matching t3-env's `emptyStringAsUndefined`. */
function isSet(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Where the Assistant lives, or null when there is none.
 *
 * In production an unset `MASTRA_API_URL` means no Assistant: a self-host
 * install without a Mastra service must switch the Assistant off rather than
 * call localhost and fail. Outside production it still falls back to the local
 * Mastra dev server, so a contributor's `npm run dev` behaves as before.
 */
export function resolveMastraUrl(env: AiEnv): string | null {
  if (isSet(env.MASTRA_API_URL)) return env.MASTRA_API_URL;
  return env.NODE_ENV === "production" ? null : DEV_MASTRA_URL;
}

export function resolveAiCapabilities(env: AiEnv): AiCapabilities {
  const openai = isSet(env.OPENAI_API_KEY);
  const anthropic = isSet(env.ANTHROPIC_API_KEY);
  const assistant = resolveMastraUrl(env) !== null;
  return {
    openai,
    anthropic,
    assistant,
    summaries: openai || anthropic,
    voice: openai && assistant,
  };
}

/**
 * Operator lines about AI configuration for the self-host preflight: what is
 * on, and — when something is off — each variable that would turn more on.
 * AI is optional, so these never stop startup.
 */
export function aiCapabilityLines(env: AiEnv): string[] {
  const capabilities = resolveAiCapabilities(env);
  const isOn: Record<string, boolean> = {
    OPENAI_API_KEY: capabilities.openai,
    ANTHROPIC_API_KEY: capabilities.anthropic,
    MASTRA_API_URL: capabilities.assistant,
  };
  const on = AI_SETUP_OPTIONS.filter((option) => isOn[option.variable]);
  const off = AI_SETUP_OPTIONS.filter((option) => !isOn[option.variable]);

  const head =
    on.length > 0
      ? `[selfhost] AI features: ${on.map((option) => option.label).join(", ")}`
      : "[selfhost] AI features: off (optional). The app works as a project and task tool without them.";
  if (off.length === 0) return [head];
  return [
    head,
    ...off.map((option) => `[selfhost]   To turn on ${option.turnsOn}: set ${option.variable} and restart.`),
  ];
}
