/**
 * Unit tests for the shared credential resolver (2026-07-30 audit, V3).
 *
 * `keyType` is a free string with mixed-case spellings in production
 * (`ACCESS_TOKEN` vs `access_token`), and rows may be stored encrypted or
 * plaintext — the `isEncrypted` flag decides, never the caller.
 */

import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  // Raw 32-byte key (encryption.ts accepts raw or base64-encoded 32 bytes).
  process.env.DATABASE_ENCRYPTION_KEY = "0".repeat(32);
});

const findManyMock = vi.hoisted(() => vi.fn());
vi.mock("~/server/db", () => ({
  db: { integrationCredential: { findMany: findManyMock } },
}));

import {
  findCredential,
  resolveCredential,
} from "~/server/utils/credentialHelper";
import { encryptToBase64 } from "~/server/utils/encryption";

describe("findCredential", () => {
  const rows = [
    { keyType: "notion_metadata", key: "{}", isEncrypted: false },
    { keyType: "access_token", key: "oauth-token", isEncrypted: false },
    { keyType: "API_KEY", key: "manual-key", isEncrypted: false },
  ];

  it("matches keyType case-insensitively", () => {
    expect(findCredential(rows, ["ACCESS_TOKEN"])?.key).toBe("oauth-token");
    expect(findCredential(rows, ["api_key"])?.key).toBe("manual-key");
  });

  it("respects alias priority order", () => {
    expect(findCredential(rows, ["ACCESS_TOKEN", "API_KEY"])?.key).toBe("oauth-token");
    expect(findCredential(rows, ["API_KEY", "ACCESS_TOKEN"])?.key).toBe("manual-key");
  });

  it("returns null when nothing matches", () => {
    expect(findCredential(rows, ["BOT_TOKEN"])).toBeNull();
  });
});

describe("resolveCredential", () => {
  it("decrypts an encrypted row", async () => {
    const rows = [
      { keyType: "ACCESS_TOKEN", key: encryptToBase64("secret-token"), isEncrypted: true },
    ];
    await expect(resolveCredential(rows, ["access_token"])).resolves.toBe("secret-token");
  });

  it("passes through a plaintext row", async () => {
    const rows = [{ keyType: "access_token", key: "plain-token", isEncrypted: false }];
    await expect(resolveCredential(rows, ["ACCESS_TOKEN"])).resolves.toBe("plain-token");
  });

  it("returns null for an undecryptable row instead of returning ciphertext", async () => {
    const rows = [
      {
        keyType: "ACCESS_TOKEN",
        key: Buffer.from("garbage-that-will-not-decrypt").toString("base64"),
        isEncrypted: true,
      },
    ];
    await expect(resolveCredential(rows, ["ACCESS_TOKEN"])).resolves.toBeNull();
  });

  it("returns null when no alias matches", async () => {
    const rows = [{ keyType: "EMAIL", key: "a@b.c", isEncrypted: false }];
    await expect(resolveCredential(rows, ["ACCESS_TOKEN"])).resolves.toBeNull();
  });

  it("fetches rows by integrationId with a scoped select", async () => {
    findManyMock.mockResolvedValueOnce([
      { keyType: "access_token", key: "from-db", isEncrypted: false },
    ]);
    await expect(resolveCredential("int-1", ["ACCESS_TOKEN"])).resolves.toBe("from-db");
    expect(findManyMock).toHaveBeenCalledWith({
      where: { integrationId: "int-1" },
      select: { key: true, keyType: true, isEncrypted: true },
    });
  });
});
