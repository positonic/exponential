/**
 * The server-side gate for AI entry points: tRPC procedures throw a typed
 * "not configured" error, crons and webhooks check and skip with one log line.
 *
 * Reads `process.env` on every call (no module-scope snapshot), so tests can
 * flip a key on and off, and a restart with a new key takes effect.
 */

import { TRPCError } from "@trpc/server";
import { resolveAiCapabilities, type AiCapabilities, type AiEnv } from "./capabilities";

export type AiRequirement = keyof AiCapabilities;

const HOW_TO_TURN_ON: Record<AiRequirement, string> = {
  openai: "Add OPENAI_API_KEY and restart to turn it on.",
  anthropic: "Add ANTHROPIC_API_KEY and restart to turn it on.",
  assistant: "Set MASTRA_API_URL to your Mastra service and restart to turn it on.",
  summaries: "Add OPENAI_API_KEY or ANTHROPIC_API_KEY and restart to turn it on.",
  voice: "Add OPENAI_API_KEY and set MASTRA_API_URL, then restart to turn it on.",
};

const WHAT_IS_MISSING: Record<AiRequirement, string> = {
  openai: "an OpenAI key",
  anthropic: "an Anthropic key",
  assistant: "the Assistant (Mastra)",
  summaries: "an OpenAI or Anthropic key",
  voice: "an OpenAI key and the Assistant (Mastra)",
};

/** "<Feature> needs an OpenAI key, which this install doesn't have. Add OPENAI_API_KEY and restart to turn it on." */
export function aiNotConfiguredMessage(requirement: AiRequirement, feature = "This feature"): string {
  return `${feature} needs ${WHAT_IS_MISSING[requirement]}, which this install doesn't have. ${HOW_TO_TURN_ON[requirement]}`;
}

/**
 * Thrown by an AI entry point when its provider isn't configured. A TRPCError
 * (PRECONDITION_FAILED), so a procedure surfaces it to the client as-is
 * instead of as a 500; outside tRPC it is an ordinary Error.
 */
export class AiNotConfiguredError extends TRPCError {
  readonly requirement: AiRequirement;

  constructor(requirement: AiRequirement, feature?: string) {
    super({ code: "PRECONDITION_FAILED", message: aiNotConfiguredMessage(requirement, feature) });
    this.name = "AiNotConfiguredError";
    this.requirement = requirement;
  }
}

export function isAiNotConfiguredError(error: unknown): error is AiNotConfiguredError {
  return error instanceof AiNotConfiguredError;
}

export function isAiConfigured(requirement: AiRequirement, env: AiEnv = process.env): boolean {
  return resolveAiCapabilities(env)[requirement];
}

/** Throw `AiNotConfiguredError` unless `requirement` is configured. */
export function requireAi(requirement: AiRequirement, feature?: string, env: AiEnv = process.env): void {
  if (!isAiConfigured(requirement, env)) throw new AiNotConfiguredError(requirement, feature);
}

/**
 * For crons, webhooks and background sweeps: true when configured; otherwise
 * logs one line naming the job and what is missing, and returns false so the
 * caller skips.
 */
export function aiConfiguredOrSkip(requirement: AiRequirement, job: string, env: AiEnv = process.env): boolean {
  if (isAiConfigured(requirement, env)) return true;
  console.log(`[ai] ${job} skipped: ${aiNotConfiguredMessage(requirement, "It")}`);
  return false;
}
