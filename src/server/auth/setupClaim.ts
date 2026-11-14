import type { User } from "next-auth";
import { db } from "~/server/db";
import { onUserCreated } from "~/server/auth/onUserCreated";
import { claimInstance } from "~/server/services/instance/instanceSettings";

/**
 * `authorize` for the `setup` credentials provider — how `/setup` signs in the
 * person claiming a fresh self-host install ([ADR-0081](../../../docs/adr/0081-first-run-setup-token-and-sign-up-mode.md)).
 *
 * The proof is the one-time **Setup token** from the boot log, which only the
 * operator can read, so no email transport is needed. `claimInstance` refuses
 * once any instance admin exists, so on exponential.im (which has admins and
 * no token) this never signs anyone in.
 *
 * Returns null for every failure, so Auth.js answers with one generic
 * `CredentialsSignin` and a guesser learns nothing about why.
 */
export async function authorizeSetupClaim(
  credentials: Partial<Record<string, unknown>> | undefined,
): Promise<User | null> {
  const email = credentials?.email;
  const token = credentials?.token;
  if (typeof email !== "string" || typeof token !== "string" || !email || !token) return null;

  const result = await claimInstance(db, { email, token });
  if (!result.ok) return null;

  const user = await db.user.findUnique({
    where: { id: result.userId },
    select: { id: true, email: true, name: true, image: true },
  });
  if (!user) return null;

  if (result.created) {
    // The adapter didn't create this user, so `events.createUser` won't fire.
    // A failure here costs the admin their Personal workspace, not the claim.
    try {
      await onUserCreated({ id: user.id, email: user.email, name: user.name });
    } catch (error) {
      console.error("[setup] Claimed the instance but new-user setup failed:", error);
    }
  }

  return user;
}
