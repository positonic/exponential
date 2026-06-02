/**
 * resolveVoiceCaller — the single auth-resolution point for the voice surface
 * (Voice — Web Client, ticket #11; PRD §25).
 *
 * Collapses three credential sources into one `(ctx) → { userId }` helper, tried
 * in priority order:
 *   1. NextAuth session cookie (web client). `createTRPCContext` also normalizes
 *      a valid `Authorization: Bearer <app-JWT>` into `ctx.session`, so legacy
 *      Bearer callers resolve here too.
 *   2. `x-api-key` header (legacy iOS; kept indefinitely as a dev fallback).
 *   3. `Authorization: Bearer <device-token>` — RESERVED for the upcoming native
 *      OAuth effort and intentionally INERT today (no exchanger exists yet).
 *      Wired into the chain so that work slots in without re-touching this gate.
 *
 * Rejects with `UNAUTHORIZED` when no source resolves a caller.
 */
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import type { PrismaClient } from "@prisma/client";

export interface VoiceCaller {
  userId: string;
}

/** The minimal slice of the tRPC context this resolver reads. */
export interface VoiceCallerContext {
  session: { user?: { id?: string | null } | null } | null;
  headers: Headers;
  db: PrismaClient;
}

export async function resolveVoiceCaller(
  ctx: VoiceCallerContext,
): Promise<VoiceCaller> {
  // 1. Signed-in session (NextAuth cookie, or a Bearer app-JWT normalized upstream).
  if (ctx.session?.user?.id) {
    return { userId: ctx.session.user.id };
  }

  // 2. x-api-key header (legacy iOS).
  const apiKey = ctx.headers.get("x-api-key");
  if (apiKey) {
    const userId = await resolveApiKeyUserId(apiKey, ctx.db);
    if (userId) return { userId };
  }

  // 3. Device-token slot — reserved, inert today.
  const deviceCaller = await resolveDeviceToken(ctx);
  if (deviceCaller) return deviceCaller;

  throw new TRPCError({
    code: "UNAUTHORIZED",
    message:
      "Voice session requires authentication: a signed-in session or an x-api-key.",
  });
}

/**
 * Resolve an `x-api-key` to its owner. Tries the hashed lookup first (current
 * keys are stored as sha256 hashes), then a plaintext fallback for legacy keys —
 * mirroring `apiKeyMiddleware`. Returns null when no valid, unexpired key matches.
 */
async function resolveApiKeyUserId(
  apiKey: string,
  db: PrismaClient,
): Promise<string | null> {
  const hashedKey = `sha256:${crypto.createHash("sha256").update(apiKey).digest("hex")}`;
  let verificationToken = await db.verificationToken.findFirst({
    where: { token: hashedKey, expires: { gt: new Date() } },
  });
  if (!verificationToken) {
    verificationToken = await db.verificationToken.findFirst({
      where: { token: apiKey, expires: { gt: new Date() } },
    });
  }
  return verificationToken?.userId ?? null;
}

/**
 * Reserved slot for native-OAuth device tokens
 * (`Authorization: Bearer <device-token>`). INERT until the native OAuth feature
 * lands — always returns null today. The future ticket implements the exchanger
 * here without re-touching `resolveVoiceCaller` or `voice.createSession`.
 */
function resolveDeviceToken(
  _ctx: VoiceCallerContext,
): Promise<VoiceCaller | null> {
  return Promise.resolve(null);
}
