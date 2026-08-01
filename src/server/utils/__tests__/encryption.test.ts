/**
 * Unit tests for string-form ciphertext versioning (2026-07-30 audit, V5).
 *
 * New writes are `v1:<base64(iv12+tag16+ct)>`; legacy unprefixed base64 must
 * keep decrypting as v1 so rotation lands without a big-bang rewrite.
 */

import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  // Raw 32-byte key (encryption.ts accepts raw or base64-encoded 32 bytes).
  process.env.DATABASE_ENCRYPTION_KEY = "0".repeat(32);
});

import {
  encryptString,
  encryptToBase64,
  decryptFromBase64,
} from "~/server/utils/encryption";

describe("versioned string ciphertext", () => {
  it("writes a v1: prefix and round-trips", () => {
    const ct = encryptToBase64("hello-secret");
    expect(ct.startsWith("v1:")).toBe(true);
    expect(decryptFromBase64(ct)).toBe("hello-secret");
  });

  it("still decrypts legacy unprefixed ciphertext as v1", () => {
    const legacy = Buffer.from(encryptString("legacy-secret")).toString("base64");
    expect(legacy.startsWith("v1:")).toBe(false);
    expect(decryptFromBase64(legacy)).toBe("legacy-secret");
  });

  it("returns null for garbage input", () => {
    expect(decryptFromBase64("not-ciphertext-at-all")).toBeNull();
    expect(decryptFromBase64("v1:AAAA")).toBeNull();
    expect(decryptFromBase64(null)).toBeNull();
  });
});
