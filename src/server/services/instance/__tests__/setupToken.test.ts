/**
 * The self-host **Setup token**: `start:selfhost` issues one while the install
 * has no **Instance admin**, and `/setup` redeems it exactly once to create (or
 * promote) that admin. A hosted install with admins never gets one.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import {
  claimInstance,
  hashSetupToken,
  isSetupOpen,
  issueSetupToken,
  normalizeSetupToken,
  SETUP_TOKEN_TTL_MS,
} from "../instanceSettings";

const db = mockDeep<PrismaClient>();
const NOW = new Date("2026-11-12T10:00:00Z");

beforeEach(() => {
  mockReset(db);
  // Interactive transactions run against the same mock.
  db.$transaction.mockImplementation(((fn: (tx: PrismaClient) => unknown) => fn(db)) as never);
});

describe("issueSetupToken", () => {
  it("issues nothing once any instance admin exists", async () => {
    db.user.count.mockResolvedValue(1);

    expect(await issueSetupToken(db, NOW)).toBeNull();
    expect(db.instanceSettings.upsert).not.toHaveBeenCalled();
  });

  it("with no admin, stores only the hash of a fresh token with an expiry", async () => {
    db.user.count.mockResolvedValue(0);

    const issued = await issueSetupToken(db, NOW);

    expect(issued).not.toBeNull();
    expect(issued!.token).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/);
    expect(issued!.expiresAt).toEqual(new Date(NOW.getTime() + SETUP_TOKEN_TTL_MS));

    const stored = db.instanceSettings.upsert.mock.calls[0]![0];
    const hash = await hashSetupToken(normalizeSetupToken(issued!.token));
    expect(stored.create).toMatchObject({ setupTokenHash: hash, setupTokenExpiresAt: issued!.expiresAt });
    expect(stored.update).toMatchObject({ setupTokenHash: hash, setupTokenExpiresAt: issued!.expiresAt });
    expect(JSON.stringify(stored)).not.toContain(issued!.token);
  });

  it("a second boot replaces the first token", async () => {
    db.user.count.mockResolvedValue(0);
    const first = await issueSetupToken(db, NOW);
    const second = await issueSetupToken(db, NOW);
    expect(second!.token).not.toEqual(first!.token);
  });
});

describe("isSetupOpen", () => {
  it("is closed with no settings row (exponential.im never ran start:selfhost)", async () => {
    db.user.count.mockResolvedValue(0);
    db.instanceSettings.findUnique.mockResolvedValue(null);
    expect(await isSetupOpen(db, NOW)).toBe(false);
  });

  it("is closed once an admin exists, even with a live token", async () => {
    db.user.count.mockResolvedValue(1);
    db.instanceSettings.findUnique.mockResolvedValue({
      id: "instance",
      signUpMode: null,
      setupTokenHash: "h",
      setupTokenExpiresAt: new Date(NOW.getTime() + 1000),
      updatedAt: NOW,
    });
    expect(await isSetupOpen(db, NOW)).toBe(false);
  });

  it("is closed when the token has expired", async () => {
    db.user.count.mockResolvedValue(0);
    db.instanceSettings.findUnique.mockResolvedValue({
      id: "instance",
      signUpMode: null,
      setupTokenHash: "h",
      setupTokenExpiresAt: new Date(NOW.getTime() - 1),
      updatedAt: NOW,
    });
    expect(await isSetupOpen(db, NOW)).toBe(false);
  });

  it("is open with no admin and a live token", async () => {
    db.user.count.mockResolvedValue(0);
    db.instanceSettings.findUnique.mockResolvedValue({
      id: "instance",
      signUpMode: null,
      setupTokenHash: "h",
      setupTokenExpiresAt: new Date(NOW.getTime() + 1000),
      updatedAt: NOW,
    });
    expect(await isSetupOpen(db, NOW)).toBe(true);
  });
});

describe("claimInstance", () => {
  const TOKEN = "ABCDE-FGHJK-MNPQR-STVWX";

  it("refuses when an admin already exists, without touching the token", async () => {
    db.user.count.mockResolvedValue(1);

    const result = await claimInstance(db, { email: "a@example.test", token: TOKEN, now: NOW });

    expect(result).toEqual({ ok: false, reason: "already-claimed" });
    expect(db.instanceSettings.updateMany).not.toHaveBeenCalled();
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("refuses a wrong, expired or spent token (the conditional consume matches no row)", async () => {
    db.user.count.mockResolvedValue(0);
    db.instanceSettings.updateMany.mockResolvedValue({ count: 0 });

    const result = await claimInstance(db, { email: "a@example.test", token: TOKEN, now: NOW });

    expect(result).toEqual({ ok: false, reason: "invalid-token" });
    expect(db.user.create).not.toHaveBeenCalled();
    const where = db.instanceSettings.updateMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({
      setupTokenHash: await hashSetupToken(normalizeSetupToken(TOKEN)),
      setupTokenExpiresAt: { gt: NOW },
    });
  });

  it("consumes the token, locks sign-up and creates the admin", async () => {
    db.user.count.mockResolvedValue(0);
    db.instanceSettings.updateMany.mockResolvedValue({ count: 1 });
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({ id: "u1" } as never);

    // Case and hyphens don't matter, as with a Sign-in code.
    const result = await claimInstance(db, {
      email: "  Owner@Example.TEST ",
      token: TOKEN.toLowerCase().replace(/-/g, ""),
      now: NOW,
    });

    expect(result).toEqual({ ok: true, userId: "u1", created: true });
    expect(db.instanceSettings.updateMany.mock.calls[0]![0].data).toEqual({
      setupTokenHash: null,
      setupTokenExpiresAt: null,
      signUpMode: "invite-only",
    });
    expect(db.user.create.mock.calls[0]![0].data).toMatchObject({
      email: "owner@example.test",
      isAdmin: true,
    });
  });

  it("promotes an existing user with that email instead of creating one", async () => {
    db.user.count.mockResolvedValue(0);
    db.instanceSettings.updateMany.mockResolvedValue({ count: 1 });
    db.user.findUnique.mockResolvedValue({ id: "u-existing" } as never);

    const result = await claimInstance(db, { email: "old@example.test", token: TOKEN, now: NOW });

    expect(result).toEqual({ ok: true, userId: "u-existing", created: false });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u-existing" }, data: { isAdmin: true } });
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("refuses something that isn't an email address", async () => {
    const result = await claimInstance(db, { email: "not-an-email", token: TOKEN, now: NOW });
    expect(result).toEqual({ ok: false, reason: "invalid-email" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
