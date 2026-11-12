/**
 * Instance-wide settings: who claimed this install, and who may sign up
 * ([ADR-0081](../../../../docs/adr/0081-first-run-setup-token-and-sign-up-mode.md)).
 *
 * One `InstanceSettings` row (id `"instance"`). An absent row is every default:
 * open sign-up and no setup token — exactly how exponential.im runs, since it
 * never runs `start:selfhost`.
 *
 * - **Setup token**: while no **Instance admin** (`User.isAdmin`) exists,
 *   `start:selfhost` calls `issueSetupToken` on every boot and prints the token.
 *   Only its SHA-256 is stored. `/setup` redeems it once via `claimInstance`.
 * - **Sign-up mode**: `open` or `invite-only`. Claiming sets `invite-only`.
 *
 * Imports no `~/` alias and no Node built-in: `scripts/selfhost/start.ts` runs
 * it under tsx, and `src/server/auth/config.ts` (pulled into the Edge
 * middleware bundle) reads it too. Hashing uses Web Crypto for the same reason.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { normalizeSignInEmail, SIGN_IN_CODE_ALPHABET } from "../../../lib/signInCode";

/** The id of the one settings row. */
export const INSTANCE_SETTINGS_ID = "instance";

export const SIGN_UP_MODES = ["open", "invite-only"] as const;
export type SignUpMode = (typeof SIGN_UP_MODES)[number];

/**
 * How long a printed setup token stays valid. Long enough to deploy now and
 * set up after lunch; a restart prints a fresh one regardless.
 */
export const SETUP_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** 20 Crockford base32 characters = 100 bits, printed as four groups of five. */
const SETUP_TOKEN_LENGTH = 20;

type Db = PrismaClient | Prisma.TransactionClient;

/** Uppercase, drop separators, fold the Crockford look-alikes (I/L → 1, O → 0). */
export function normalizeSetupToken(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
}

/** Hex SHA-256. The token carries 100 bits, so no salt or secret is needed. */
export async function hashSetupToken(normalized: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function generateSetupToken(): string {
  const bytes = new Uint8Array(SETUP_TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  // 32 divides 256 exactly, so the modulo is uniform (see generateSignInCode).
  const chars = Array.from(bytes, (byte) => SIGN_IN_CODE_ALPHABET[byte % SIGN_IN_CODE_ALPHABET.length]);
  return [0, 5, 10, 15].map((start) => chars.slice(start, start + 5).join("")).join("-");
}

/** True once any user holds `isAdmin` — the install has been claimed. */
export async function hasInstanceAdmin(db: Db): Promise<boolean> {
  return (await db.user.count({ where: { isAdmin: true } })) > 0;
}

/**
 * Called by `start:selfhost` on every boot. With no instance admin, store the
 * hash of a fresh token (replacing any earlier one) and return the token to
 * print; otherwise return null and print nothing.
 */
export async function issueSetupToken(
  db: PrismaClient,
  now: Date = new Date(),
): Promise<{ token: string; expiresAt: Date } | null> {
  if (await hasInstanceAdmin(db)) return null;

  const token = generateSetupToken();
  const expiresAt = new Date(now.getTime() + SETUP_TOKEN_TTL_MS);
  const fields = { setupTokenHash: await hashSetupToken(normalizeSetupToken(token)), setupTokenExpiresAt: expiresAt };
  await db.instanceSettings.upsert({
    where: { id: INSTANCE_SETTINGS_ID },
    create: { id: INSTANCE_SETTINGS_ID, ...fields },
    update: fields,
  });
  return { token, expiresAt };
}

/**
 * Whether `/setup` exists right now: no instance admin and an unexpired token.
 * Both conditions matter for hosted safety — exponential.im has admins and no
 * row, and a dev database with no admins still has no token.
 */
export async function isSetupOpen(db: Db, now: Date = new Date()): Promise<boolean> {
  // The primary-key read first: on exponential.im there is no row, so /signin
  // pays one indexed lookup and never counts admins.
  const settings = await db.instanceSettings.findUnique({ where: { id: INSTANCE_SETTINGS_ID } });
  const hasLiveToken = Boolean(
    settings?.setupTokenHash && settings.setupTokenExpiresAt && settings.setupTokenExpiresAt > now,
  );
  return hasLiveToken && !(await hasInstanceAdmin(db));
}

export type ClaimResult =
  | { ok: true; userId: string; created: boolean }
  | { ok: false; reason: "invalid-email" | "invalid-token" | "already-claimed" };

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Redeem the setup token: in one transaction, refuse if an admin already
 * exists, consume the token with a conditional update (hash matches and not
 * expired — so a second, concurrent claim matches no row), set sign-up to
 * `invite-only`, and create the admin or promote an existing user with that
 * email. The caller signs the user in.
 */
export async function claimInstance(
  db: PrismaClient,
  input: { email: string; token: string; now?: Date },
): Promise<ClaimResult> {
  const email = normalizeSignInEmail(input.email);
  if (!EMAIL_SHAPE.test(email)) return { ok: false, reason: "invalid-email" };
  const now = input.now ?? new Date();
  const hash = await hashSetupToken(normalizeSetupToken(input.token));

  return db.$transaction(async (tx): Promise<ClaimResult> => {
    if (await hasInstanceAdmin(tx)) return { ok: false, reason: "already-claimed" };

    const consumed = await tx.instanceSettings.updateMany({
      where: { id: INSTANCE_SETTINGS_ID, setupTokenHash: hash, setupTokenExpiresAt: { gt: now } },
      data: { setupTokenHash: null, setupTokenExpiresAt: null, signUpMode: "invite-only" },
    });
    if (consumed.count !== 1) return { ok: false, reason: "invalid-token" };

    const existing = await tx.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      await tx.user.update({ where: { id: existing.id }, data: { isAdmin: true } });
      return { ok: true, userId: existing.id, created: false };
    }

    // The address is proven by holding the token (only the operator can read
    // the boot log), the same trust a redeemed Sign-in code gives.
    const user = await tx.user.create({
      data: { email, isAdmin: true, emailVerified: now },
      select: { id: true },
    });
    return { ok: true, userId: user.id, created: true };
  });
}
