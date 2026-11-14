/**
 * The server-side gate for AI entry points: tRPC procedures throw a typed
 * "not configured" error, crons and webhooks check and skip with one log line.
 *
 * Reads `process.env` on every call (no module-scope snapshot), so tests can
 * flip a key on and off, and a restart with a new key takes effect.
 */

import { TRPCError } from "@trpc/server";
import {
  aiNotConfiguredMessage,
  resolveAiCapabilities,
  resolveMastraUrl,
  type AiEnv,
  type AiRequirement,
} from "./capabilities";

export { aiNotConfiguredMessage, type AiRequirement };

/**
 * Thrown by an AI entry point when its provider isn't configured. A TRPCError
 * (PRECONDITION_FAILED), so a procedure surfaces it to the client as-is
 * instead of as a 500; outside tRPC it is an ordinary Error.
 */
export class AiNotConfiguredError extends TRPCError {
  readonly requirement: AiRequirement;

  constructor(requirement: AiRequirement, feature = "This feature") {
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

/**
 * The Assistant's (Mastra's) base URL, read per call; throws
 * `AiNotConfiguredError` when this install has no Assistant.
 */
export function requireMastraUrl(feature = "The Assistant", env: AiEnv = process.env): string {
  const url = resolveMastraUrl(env);
  if (!url) throw new AiNotConfiguredError("assistant", feature);
  return url;
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
  console.log(`[ai] ${aiNotConfiguredMessage(requirement, `${job} skipped`)}`);
  return false;
}
