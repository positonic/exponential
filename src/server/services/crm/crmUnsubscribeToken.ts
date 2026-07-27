import jwt from "jsonwebtoken";

/**
 * Signed, contact-scoped unsubscribe tokens for Broadcast emails
 * ([ADR-0030](../../../../docs/adr/0030-generic-collection-list-primitive.md)).
 *
 * The token carries only `{ contactId, purpose }` and is signed with
 * `AUTH_SECRET`, so a recipient can only unsubscribe themselves — a tampered or
 * foreign token fails signature/purpose verification. No expiry: unsubscribe
 * links must keep working indefinitely.
 */
const PURPOSE = "crm-unsubscribe";

interface UnsubscribePayload {
  contactId: string;
  purpose: typeof PURPOSE;
}

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required to sign unsubscribe tokens");
  }
  return secret;
}

export function signUnsubscribeToken(contactId: string): string {
  return jwt.sign({ contactId, purpose: PURPOSE }, authSecret());
}

/** Returns the contactId for a valid token, or null for tampered/foreign/invalid. */
export function verifyUnsubscribeToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, authSecret()) as Partial<UnsubscribePayload>;
    if (decoded.purpose !== PURPOSE || typeof decoded.contactId !== "string") {
      return null;
    }
    return decoded.contactId;
  } catch {
    return null;
  }
}

/** Absolute unsubscribe URL for embedding in a Broadcast email. */
export function buildUnsubscribeUrl(contactId: string): string {
  const base =
    process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const token = signUnsubscribeToken(contactId);
  return `${base}/api/crm/unsubscribe?token=${encodeURIComponent(token)}`;
}
