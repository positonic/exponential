/**
 * The `setup` credentials provider behind `/setup`: a valid setup token signs
 * the claimant in as the new instance admin, with no email transport; anything
 * else signs nobody in.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const { onUserCreated } = vi.hoisted(() => ({ onUserCreated: vi.fn() }));

vi.mock("~/server/db", async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  return { db: mockDeep<PrismaClient>() };
});
vi.mock("~/server/auth/onUserCreated", () => ({ onUserCreated }));

import { db } from "~/server/db";
import { authorizeSetupClaim } from "../setupClaim";
import { hashSetupToken, normalizeSetupToken } from "~/server/services/instance/instanceSettings";

const mockDb = db as unknown as DeepMockProxy<PrismaClient>;
const TOKEN = "ABCDE-FGHJK-MNPQR-STVWX";

beforeEach(() => {
  mockReset(mockDb);
  onUserCreated.mockReset().mockResolvedValue(undefined);
  mockDb.$transaction.mockImplementation(((fn: (tx: PrismaClient) => unknown) => fn(mockDb)) as never);
});

describe("authorizeSetupClaim", () => {
  it("signs in nobody without both fields", async () => {
    expect(await authorizeSetupClaim({ email: "a@example.test" })).toBeNull();
    expect(await authorizeSetupClaim(undefined)).toBeNull();
  });

  it("signs in nobody with a wrong token", async () => {
    mockDb.user.count.mockResolvedValue(0);
    mockDb.instanceSettings.updateMany.mockResolvedValue({ count: 0 });

    expect(await authorizeSetupClaim({ email: "a@example.test", token: "WRONG" })).toBeNull();
    expect(onUserCreated).not.toHaveBeenCalled();
  });

  it("signs in nobody once the instance is claimed", async () => {
    mockDb.user.count.mockResolvedValue(1);
    expect(await authorizeSetupClaim({ email: "a@example.test", token: TOKEN })).toBeNull();
  });

  it("creates the admin, gives them a new user's start, and signs them in", async () => {
    mockDb.user.count.mockResolvedValue(0);
    mockDb.instanceSettings.updateMany.mockResolvedValue({ count: 1 });
    mockDb.user.findUnique
      .mockResolvedValueOnce(null) // no existing user with that email
      .mockResolvedValueOnce({ id: "u1", email: "owner@example.test", name: null, image: null } as never);
    mockDb.user.create.mockResolvedValue({ id: "u1" } as never);

    const user = await authorizeSetupClaim({ email: "owner@example.test", token: TOKEN });

    expect(user).toEqual({ id: "u1", email: "owner@example.test", name: null, image: null });
    expect(onUserCreated).toHaveBeenCalledWith({ id: "u1", email: "owner@example.test", name: null });
    expect(mockDb.instanceSettings.updateMany.mock.calls[0]![0].where).toMatchObject({
      setupTokenHash: await hashSetupToken(normalizeSetupToken(TOKEN)),
    });
  });

  it("promoting an existing user skips the new-user start", async () => {
    mockDb.user.count.mockResolvedValue(0);
    mockDb.instanceSettings.updateMany.mockResolvedValue({ count: 1 });
    mockDb.user.findUnique
      .mockResolvedValueOnce({ id: "u0" } as never)
      .mockResolvedValueOnce({ id: "u0", email: "old@example.test", name: "Old", image: null } as never);

    const user = await authorizeSetupClaim({ email: "old@example.test", token: TOKEN });

    expect(user?.id).toBe("u0");
    expect(onUserCreated).not.toHaveBeenCalled();
  });
});
