import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));

const { captureProcedureCall } = vi.hoisted(() => ({ captureProcedureCall: vi.fn() }));
vi.mock("~/server/analytics/posthog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/server/analytics/posthog")>();
  return { ...actual, captureProcedureCall };
});

import {
  createCallerFactory,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "../trpc";

const router = createTRPCRouter({
  thing: createTRPCRouter({
    list: protectedProcedure.query(() => ["a"]),
    create: protectedProcedure
      .input(z.object({ secret: z.string() }))
      .mutation(({ input }) => ({ id: input.secret.length })),
    explode: protectedProcedure.mutation(() => {
      throw new TRPCError({ code: "NOT_FOUND" });
    }),
    open: publicProcedure.mutation(() => "ok"),
  }),
});

const createCaller = createCallerFactory(router);

function callerFor(opts: { tokenType?: string; headers?: Record<string, string>; user?: boolean }) {
  return createCaller({
    db: {} as PrismaClient,
    session:
      opts.user === false
        ? null
        : {
            user: { id: "user_1", email: "u@test.com", name: "U", image: null, isAdmin: false },
            expires: new Date(Date.now() + 60_000).toISOString(),
          },
    tokenType: opts.tokenType,
    headers: new Headers(opts.headers ?? {}),
  });
}

describe("analytics middleware on protectedProcedure", () => {
  beforeEach(() => captureProcedureCall.mockClear());

  it("records a successful mutation with the procedure path, user and surface", async () => {
    await callerFor({}).thing.create({ secret: "hunter2" });
    expect(captureProcedureCall).toHaveBeenCalledTimes(1);
    const event = captureProcedureCall.mock.calls[0]![0] as Record<string, unknown>;
    expect(event).toMatchObject({
      userId: "user_1",
      path: "thing.create",
      type: "mutation",
      surface: "web",
      ok: true,
      errorCode: undefined,
    });
    expect(typeof event.durationMs).toBe("number");
    // The input never reaches analytics.
    expect(JSON.stringify(event)).not.toContain("hunter2");
  });

  it("records a failed call with its error code and still rethrows", async () => {
    await expect(callerFor({}).thing.explode()).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(captureProcedureCall).toHaveBeenCalledWith(
      expect.objectContaining({ path: "thing.explode", ok: false, errorCode: "NOT_FOUND" }),
    );
  });

  it("derives the surface from the token type", async () => {
    await callerFor({ tokenType: "api-token" }).thing.list();
    expect(captureProcedureCall).toHaveBeenCalledWith(
      expect.objectContaining({ path: "thing.list", type: "query", surface: "api" }),
    );
  });

  it("does not run for public procedures or unauthenticated calls", async () => {
    await callerFor({ user: false }).thing.open();
    await expect(callerFor({ user: false }).thing.create({ secret: "x" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(captureProcedureCall).not.toHaveBeenCalled();
  });
});
