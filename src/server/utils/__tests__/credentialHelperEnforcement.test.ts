/**
 * Enforcement test (2026-07-30 audit, V4): encryption is mandatory.
 * `encryptCredential` must THROW when DATABASE_ENCRYPTION_KEY is absent —
 * the old behavior silently degraded to `{ isEncrypted: false }`, so a
 * misconfigured deploy stored every secret in plaintext.
 *
 * Lives in its own file because encryption.ts captures the key at module
 * load: this file's env setup runs with the key deleted before import.
 */

import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  delete process.env.DATABASE_ENCRYPTION_KEY;
});

import { encryptCredential } from "~/server/utils/credentialHelper";

describe("encryptCredential without DATABASE_ENCRYPTION_KEY", () => {
  it("throws instead of returning plaintext", () => {
    expect(() => encryptCredential("super-secret")).toThrow(
      /DATABASE_ENCRYPTION_KEY is not set/,
    );
  });
});
