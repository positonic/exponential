import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time equality for webhook signature strings.
 *
 * `crypto.timingSafeEqual` throws when the buffers differ in length, so a
 * truncated or malformed signature header would turn into a 500 instead of a
 * 401. Compare lengths first — a length mismatch is simply "no match". The
 * length check leaks only the expected signature's length, which is public
 * anyway (a hex HMAC digest of known algorithm).
 */
export function safeSignatureEquals(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}
