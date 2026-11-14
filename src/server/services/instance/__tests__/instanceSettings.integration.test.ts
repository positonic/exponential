/**
 * Hosted safety against a real Postgres (ADR-0081). exponential.im never runs
 * `start:selfhost`, already has instance admins and has an empty
 * `InstanceSettings` table after the migration, so it must keep open sign-up
 * and never expose `/setup`. And a setup token is single-use even when two
 * claims race — that needs real row locking, which mocked Prisma can't show.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { getTestDb } from "~/test/test-db";
import { createUser } from "~/test/factories";
import { mayCreateAccount } from "~/server/auth/signUpPolicy";
import {
  claimInstance,
  getSignUpMode,
  isSetupOpen,
  issueSetupToken,
} from "../instanceSettings";

describe("instance settings on a real database", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  describe("exponential.im (admins, no settings row)", () => {
    it("reads open sign-up and lets a new address create an account", async () => {
      await createUser(db, { isAdmin: true });

      expect(await db.instanceSettings.count()).toBe(0);
      expect(await getSignUpMode(db)).toBe("open");
      expect(await mayCreateAccount(db, "stranger@example.test")).toBe(true);
    });

    it("never issues a setup token, so /setup stays closed", async () => {
      await createUser(db, { isAdmin: true });

      expect(await issueSetupToken(db)).toBeNull();
      expect(await isSetupOpen(db)).toBe(false);
      expect(await db.instanceSettings.count()).toBe(0);
    });

    it("a stray token row still can't open /setup or be claimed once an admin exists", async () => {
      const issued = await issueSetupToken(db);
      expect(issued).not.toBeNull();
      await createUser(db, { isAdmin: true });

      expect(await isSetupOpen(db)).toBe(false);
      expect(await claimInstance(db, { email: "late@example.test", token: issued!.token })).toEqual({
        ok: false,
        reason: "already-claimed",
      });
    });
  });

  describe("a fresh self-host install", () => {
    it("claims once, locks sign-up, and the token is spent", async () => {
      const issued = await issueSetupToken(db);
      expect(await isSetupOpen(db)).toBe(true);

      const claim = await claimInstance(db, { email: "owner@example.test", token: issued!.token });
      expect(claim).toMatchObject({ ok: true, created: true });

      const admin = await db.user.findUniqueOrThrow({ where: { email: "owner@example.test" } });
      expect(admin.isAdmin).toBe(true);
      expect(await getSignUpMode(db)).toBe("invite-only");
      expect(await isSetupOpen(db)).toBe(false);
      expect(await issueSetupToken(db)).toBeNull(); // the next boot prints nothing
      expect(await mayCreateAccount(db, "stranger@example.test")).toBe(false);
    });

    it("a restart retires the earlier token", async () => {
      const first = await issueSetupToken(db);
      await issueSetupToken(db);

      expect(await claimInstance(db, { email: "owner@example.test", token: first!.token })).toEqual({
        ok: false,
        reason: "invalid-token",
      });
    });

    it("an expired token is refused", async () => {
      const longAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const issued = await issueSetupToken(db, longAgo);

      expect(await isSetupOpen(db)).toBe(false);
      expect(await claimInstance(db, { email: "owner@example.test", token: issued!.token })).toEqual({
        ok: false,
        reason: "invalid-token",
      });
    });

    it("two racing claims with the same token make exactly one admin", async () => {
      const issued = await issueSetupToken(db);

      const results = await Promise.all([
        claimInstance(db, { email: "first@example.test", token: issued!.token }),
        claimInstance(db, { email: "second@example.test", token: issued!.token }),
      ]);

      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(await db.user.count({ where: { isAdmin: true } })).toBe(1);
    });

    it("invite-only still admits an address with a pending invitation", async () => {
      const issued = await issueSetupToken(db);
      const claim = await claimInstance(db, { email: "owner@example.test", token: issued!.token });
      if (!claim.ok) throw new Error("claim failed");
      const workspace = await db.workspace.create({
        data: { name: "Team", slug: "team-ws", type: "team", ownerId: claim.userId },
      });
      await db.workspaceInvitation.create({
        data: {
          workspaceId: workspace.id,
          email: "Invitee@Example.test",
          token: "invite-token-1",
          expiresAt: new Date(Date.now() + 86_400_000),
          createdById: claim.userId,
        },
      });

      expect(await mayCreateAccount(db, "invitee@example.test")).toBe(true);
    });
  });
});
