/**
 * Key-rotation test (2026-07-30 audit, V5): a credential written under the
 * OLD key must still decrypt after rotation, given
 * DATABASE_ENCRYPTION_KEY_PREVIOUS. Lives in its own file because
 * encryption.ts captures both keys at module load.
 */

import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";

const OLD_KEY = "1".repeat(32);
const NEW_KEY = "2".repeat(32);

vi.hoisted(() => {
  process.env.DATABASE_ENCRYPTION_KEY = "2".repeat(32);
  process.env.DATABASE_ENCRYPTION_KEY_PREVIOUS = "1".repeat(32);
});

import {
  encryptToBase64,
  decryptFromBase64,
  decryptFromBase64WithKeyInfo,
  decryptBufferWithKeyInfo,
  decryptBufferSafe,
} from "~/server/utils/encryption";

/** Produce iv12+tag16+ct ciphertext under an arbitrary raw 32-byte key. */
function encryptUnder(key: string, plaintext: string): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(key), iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

describe("key rotation with DATABASE_ENCRYPTION_KEY_PREVIOUS", () => {
  it("decrypts old-key ciphertext via the previous-key fallback and reports it", () => {
    const legacyCiphertext = encryptUnder(OLD_KEY, "written-before-rotation").toString("base64");

    expect(decryptFromBase64(legacyCiphertext)).toBe("written-before-rotation");

    const info = decryptFromBase64WithKeyInfo(`v1:${legacyCiphertext}`);
    expect(info).toMatchObject({ ok: true, value: "written-before-rotation", usedPreviousKey: true });
  });

  it("decrypts current-key ciphertext without the fallback", () => {
    const info = decryptFromBase64WithKeyInfo(encryptToBase64("written-after-rotation"));
    expect(info).toMatchObject({ ok: true, value: "written-after-rotation", usedPreviousKey: false });
  });

  it("applies the fallback to binary (CRM Bytes) ciphertext too", () => {
    const oldBinary = encryptUnder(OLD_KEY, "pii-under-old-key");
    expect(decryptBufferWithKeyInfo(oldBinary)).toEqual({
      value: "pii-under-old-key",
      usedPreviousKey: true,
    });
  });

  it("still fails (auth_failed) when neither key matches", () => {
    const foreign = encryptUnder("3".repeat(32), "unreachable").toString("base64");
    expect(decryptFromBase64WithKeyInfo(foreign)).toEqual({ ok: false, reason: "auth_failed" });
  });

  it("decryptBufferSafe degrades to null on a wrong key instead of throwing (CRM PII paths)", () => {
    const foreign = encryptUnder("3".repeat(32), "pii-under-unknown-key");
    expect(() => decryptBufferSafe(foreign)).not.toThrow();
    expect(decryptBufferSafe(foreign)).toBeNull();
  });

  it("round-trips new writes under the new key", () => {
    expect(decryptFromBase64(encryptToBase64(NEW_KEY + "-payload"))).toBe(NEW_KEY + "-payload");
  });
});
