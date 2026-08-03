/**
 * Mint a NextAuth session cookie for an EXISTING user - no OAuth round-trip.
 *
 * The app uses `session: { strategy: "jwt" }` (src/server/auth/config.ts), so a
 * session is a self-contained JWE encrypted with a key derived from
 * AUTH_SECRET + the cookie name as salt. `encode()` from next-auth/jwt is the
 * exact function the framework itself uses; we only supply the payload the
 * app's `jwt` callback would have produced after a real sign-in (sub, email,
 * isAdmin).
 *
 * Deliberately refuses to create users: minting is for pointing a browser at
 * data that already exists, and the seed script owns fixture creation.
 */
import type { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";

/**
 * Cookie name on plain-http localhost. NextAuth prefixes `__Secure-` when
 * serving over https - if you run `next dev --experimental-https`, this (and
 * the salt, which must equal the cookie name) both change.
 */
export const SESSION_COOKIE_NAME = "authjs.session-token";

const DEFAULT_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export interface MintedSession {
  cookieName: string;
  cookieValue: string;
  userId: string;
  email: string;
  expiresAt: Date;
}

export async function mintSessionCookie(
  db: PrismaClient,
  opts: { email: string; maxAgeSeconds?: number },
): Promise<MintedSession> {
  const user = await db.user.findUnique({
    where: { email: opts.email },
    select: { id: true, email: true, name: true, image: true, isAdmin: true },
  });
  if (!user?.email) {
    throw new Error(
      `[dev-session] No user with email "${opts.email}". ` +
        "This script never creates users - run scripts/seed-dev-fixture.ts first, " +
        "or pass the email of a user that already exists locally.",
    );
  }

  const maxAge = opts.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  const cookieValue = await encode({
    token: {
      sub: user.id,
      email: user.email,
      name: user.name,
      picture: user.image,
      isAdmin: user.isAdmin,
    },
    secret: process.env.AUTH_SECRET!,
    salt: SESSION_COOKIE_NAME,
    maxAge,
  });

  return {
    cookieName: SESSION_COOKIE_NAME,
    cookieValue,
    userId: user.id,
    email: user.email,
    expiresAt: new Date(Date.now() + maxAge * 1000),
  };
}
