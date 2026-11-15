/**
 * A workspace's own Anthropic key: what a saver is told when the key is bad,
 * that a good key is stored encrypted and never handed back to the app, and
 * that the only reader gets it only while it works.
 *
 * The Anthropic call is injected, so nothing leaves the process; the cipher
 * is the real one, against the repo's test encryption key.
 */

import Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  // Test-only key (the one src/test/integration-setup.ts uses).
  process.env.DATABASE_ENCRYPTION_KEY = "MMeRcJFimqp98NsQ5i2cawtF4LbcftnfiCNJWLhO/YQ=";
});

import {
  getModelKeyStatus,
  getWorkingModelKey,
  markModelKeyFailing,
  removeModelKey,
  saveModelKey,
  validateAnthropicKey,
} from "../modelKey";

const WORKSPACE = "ws-1";
const API_KEY = "sk-ant-api03-test-key-not-real-7Q4x";
const NOW = new Date("2026-11-15T10:00:00.000Z");

const apiError = <T extends new (...args: never[]) => Error>(ErrorClass: T, status: number) =>
  new (ErrorClass as unknown as new (s: number, e: object, m: string, h: Headers) => Error)(
    status,
    { type: "error" },
    "provider said no",
    new Headers(),
  );

describe("validateAnthropicKey", () => {
  it("accepts a key Anthropic accepts, and passes it the key as given", async () => {
    const probe = vi.fn().mockResolvedValue(undefined);

    await expect(validateAnthropicKey(API_KEY, probe)).resolves.toEqual({ ok: true });
    expect(probe).toHaveBeenCalledWith(API_KEY);
  });

  it("says the key was rejected when Anthropic answers 401", async () => {
    const probe = vi.fn().mockRejectedValue(apiError(Anthropic.AuthenticationError, 401));

    await expect(validateAnthropicKey(API_KEY, probe)).resolves.toEqual({
      ok: false,
      reason: "rejected",
      message: "That key was rejected by Anthropic",
    });
  });

  it("says the key lacks permission when Anthropic answers 403", async () => {
    const probe = vi.fn().mockRejectedValue(apiError(Anthropic.PermissionDeniedError, 403));

    const result = await validateAnthropicKey(API_KEY, probe);

    expect(result).toMatchObject({ ok: false, reason: "rejected" });
    expect(result.ok === false && result.message).toContain("permissions");
  });

  it("does not call a key bad when Anthropic could not be asked", async () => {
    const rateLimited = await validateAnthropicKey(
      API_KEY,
      vi.fn().mockRejectedValue(apiError(Anthropic.RateLimitError, 429)),
    );
    const offline = await validateAnthropicKey(API_KEY, vi.fn().mockRejectedValue(new Error("ECONNRESET")));

    expect(rateLimited).toMatchObject({ ok: false, reason: "unreachable" });
    expect(offline).toMatchObject({ ok: false, reason: "unreachable" });
  });

  it("never puts the key in the message it returns", async () => {
    const probe = vi.fn().mockRejectedValue(new Error(`request with ${API_KEY} failed`));

    const result = await validateAnthropicKey(API_KEY, probe);

    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });
});

describe("a saved key", () => {
  const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

  /** What the last save wrote, as the row a later read finds. */
  function storedRow() {
    const data = db.integration.create.mock.calls.at(-1)?.[0].data as {
      providerConfig: unknown;
      credentials: { create: { key: string; keyType: string; isEncrypted: boolean } };
    };
    return { providerConfig: data.providerConfig, credentials: [data.credentials.create] };
  }

  beforeEach(() => {
    mockReset(db);
    db.$transaction.mockImplementation((async (run: (tx: PrismaClient) => unknown) => run(db)) as never);
  });

  it("is stored encrypted, as the workspace's only key, owned by nobody's account", async () => {
    const status = await saveModelKey(db, { workspaceId: WORKSPACE, apiKey: API_KEY, now: NOW });

    expect(status).toEqual({ last4: "7Q4x", status: "valid", checkedAt: NOW });
    // The previous key, if any, goes first.
    expect(db.integration.deleteMany).toHaveBeenCalledWith({
      where: { workspaceId: WORKSPACE, type: "model_key", provider: "anthropic" },
    });
    const data = db.integration.create.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({ workspaceId: WORKSPACE, type: "model_key", provider: "anthropic" });
    expect(data).not.toHaveProperty("userId");
    expect(data).not.toHaveProperty("teamId");

    const credential = storedRow().credentials[0]!;
    expect(credential.isEncrypted).toBe(true);
    expect(credential.key).not.toContain(API_KEY);
    expect(JSON.stringify(data?.providerConfig)).not.toContain(API_KEY);
  });

  it("reads back whole only through getWorkingModelKey", async () => {
    await saveModelKey(db, { workspaceId: WORKSPACE, apiKey: API_KEY, now: NOW });
    db.integration.findFirst.mockResolvedValue(storedRow() as never);

    await expect(getWorkingModelKey(db, WORKSPACE)).resolves.toBe(API_KEY);
    await expect(getModelKeyStatus(db, WORKSPACE)).resolves.toEqual({
      last4: "7Q4x",
      status: "valid",
      checkedAt: NOW,
    });
  });

  it("is not handed out once it has been marked as failing", async () => {
    await saveModelKey(db, { workspaceId: WORKSPACE, apiKey: API_KEY, now: NOW });
    const row = storedRow();
    db.integration.findFirst.mockResolvedValue({
      ...row,
      providerConfig: { ...(row.providerConfig as object), status: "failing" },
    } as never);

    await expect(getWorkingModelKey(db, WORKSPACE)).resolves.toBeNull();
    await expect(getModelKeyStatus(db, WORKSPACE)).resolves.toMatchObject({ last4: "7Q4x", status: "failing" });
  });

  it("is simply absent for a workspace that never saved one", async () => {
    db.integration.findFirst.mockResolvedValue(null);

    await expect(getWorkingModelKey(db, WORKSPACE)).resolves.toBeNull();
    await expect(getModelKeyStatus(db, WORKSPACE)).resolves.toBeNull();
  });

  it("is marked as failing once, however many turns report it", async () => {
    const valid = { last4: "7Q4x", status: "valid", checkedAt: NOW.toISOString() };
    const later = new Date("2026-11-20T08:00:00.000Z");
    db.integration.findFirst.mockResolvedValueOnce({ id: "int-1", providerConfig: valid } as never);

    await expect(markModelKeyFailing(db, WORKSPACE, later)).resolves.toEqual({
      last4: "7Q4x",
      status: "failing",
      checkedAt: later,
    });
    expect(db.integration.update).toHaveBeenCalledWith({
      where: { id: "int-1" },
      data: { providerConfig: { last4: "7Q4x", status: "failing", checkedAt: later.toISOString() } },
    });

    // A second report finds it already marked: nothing changes, nobody is told again.
    db.integration.findFirst.mockResolvedValueOnce({
      id: "int-1",
      providerConfig: { ...valid, status: "failing" },
    } as never);
    await expect(markModelKeyFailing(db, WORKSPACE, later)).resolves.toBeNull();
    expect(db.integration.update).toHaveBeenCalledTimes(1);
  });

  it("has nothing to mark when the workspace has no key", async () => {
    db.integration.findFirst.mockResolvedValue(null);

    await expect(markModelKeyFailing(db, WORKSPACE)).resolves.toBeNull();
    expect(db.integration.update).not.toHaveBeenCalled();
  });

  it("works again once a new key is saved over a failing one", async () => {
    await saveModelKey(db, { workspaceId: WORKSPACE, apiKey: API_KEY, now: NOW });
    db.integration.findFirst.mockResolvedValue(storedRow() as never);

    await expect(getModelKeyStatus(db, WORKSPACE)).resolves.toMatchObject({ status: "valid" });
    await expect(getWorkingModelKey(db, WORKSPACE)).resolves.toBe(API_KEY);
  });

  it("is deleted whole on removal, and removing nothing reports that", async () => {
    db.integration.deleteMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    await expect(removeModelKey(db, WORKSPACE)).resolves.toBe(true);
    await expect(removeModelKey(db, WORKSPACE)).resolves.toBe(false);
    // Scoped to this workspace's model key: no other integration can be caught by it.
    expect(db.integration.deleteMany).toHaveBeenCalledWith({
      where: { workspaceId: WORKSPACE, type: "model_key", provider: "anthropic" },
    });
  });

  it("cannot be read when the stored value does not decrypt", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.integration.findFirst.mockResolvedValue({
      providerConfig: { last4: "7Q4x", status: "valid", checkedAt: NOW.toISOString() },
      credentials: [{ key: "not-ciphertext", isEncrypted: true }],
    } as never);

    await expect(getWorkingModelKey(db, WORKSPACE)).resolves.toBeNull();
    consoleError.mockRestore();
  });
});
