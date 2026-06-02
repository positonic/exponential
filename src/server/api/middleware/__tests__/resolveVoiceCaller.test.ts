import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

import {
  resolveVoiceCaller,
  type VoiceCallerContext,
} from "~/server/api/middleware/resolveVoiceCaller";

const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

function ctx(overrides: Partial<VoiceCallerContext>): VoiceCallerContext {
  return {
    session: null,
    headers: new Headers(),
    db,
    ...overrides,
  };
}

describe("resolveVoiceCaller — any-of voice auth gate", () => {
  beforeEach(() => mockReset(db));

  it("resolves a NextAuth session cookie to the session user id", async () => {
    const result = await resolveVoiceCaller(
      ctx({ session: { user: { id: "user-session" } } }),
    );
    expect(result).toEqual({ userId: "user-session" });
    // Session short-circuits — no API-key DB lookup.
    expect(db.verificationToken.findFirst).not.toHaveBeenCalled();
  });

  it("cookie WINS over x-api-key when both are present (priority order)", async () => {
    const headers = new Headers({ "x-api-key": "key-abc" });
    const result = await resolveVoiceCaller(
      ctx({ session: { user: { id: "user-session" } }, headers }),
    );
    expect(result).toEqual({ userId: "user-session" });
    expect(db.verificationToken.findFirst).not.toHaveBeenCalled();
  });

  it("resolves an x-api-key header to the owning user id (no session)", async () => {
    db.verificationToken.findFirst.mockResolvedValueOnce({
      userId: "user-key",
    } as never);

    const headers = new Headers({ "x-api-key": "key-abc" });
    const result = await resolveVoiceCaller(ctx({ headers }));

    expect(result).toEqual({ userId: "user-key" });
  });

  it("rejects with UNAUTHORIZED when no credential source matches", async () => {
    await expect(resolveVoiceCaller(ctx({}))).rejects.toBeInstanceOf(TRPCError);
    await expect(resolveVoiceCaller(ctx({}))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects an x-api-key that matches no valid token", async () => {
    db.verificationToken.findFirst.mockResolvedValue(null);
    const headers = new Headers({ "x-api-key": "bogus" });
    await expect(resolveVoiceCaller(ctx({ headers }))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("device-token slot is inert: a Bearer device token alone does not resolve", async () => {
    // The Authorization Bearer slot is reserved for native OAuth and returns
    // "not resolved" today, so a request carrying only it is rejected.
    const headers = new Headers({ authorization: "Bearer device-token-xyz" });
    await expect(resolveVoiceCaller(ctx({ headers }))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
