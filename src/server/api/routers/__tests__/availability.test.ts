/**
 * Unit tests for the availability router — a member's own Availability
 * blocks. Mocked Prisma. What this router owns: every read and write is
 * scoped to the caller, edits are planned against the stored rows inside one
 * transaction, and the painter's grid leaves marked blocks to the client.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "sk-test-dummy";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.GOOGLE_CLIENT_ID ??= "test";
  process.env.GOOGLE_CLIENT_SECRET ??= "test";
  process.env.MASTRA_API_URL ??= "http://localhost:4111";
  process.env.AUTH_DISCORD_ID ??= "test";
  process.env.AUTH_DISCORD_SECRET ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.DATABASE_ENCRYPTION_KEY ??= "MMeRcJFimqp98NsQ5i2cawtF4LbcftnfiCNJWLhO/YQ=";
});

vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(_opts?: unknown) {
      // intentionally empty
    }
  },
}));

vi.mock("next-auth", () => ({
  default: () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("next-auth/providers/discord", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/notion", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/postmark", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/microsoft-entra-id", () => ({ default: vi.fn() }));

vi.mock("~/server/auth", () => ({
  auth: () => null,
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = { current: null };
function getDbMock(): DeepMockProxy<PrismaClient> {
  if (!dbHolder.current) dbHolder.current = mockDeep<PrismaClient>();
  return dbHolder.current;
}
vi.mock("~/server/db", () => {
  const proxy = new Proxy(
    {},
    {
      get(_t, prop) {
        const m = getDbMock() as unknown as Record<string | symbol, unknown>;
        return m[prop as string];
      },
    },
  );
  return { db: proxy };
});

import { createMockCaller } from "~/test/trpc-helpers";

const USER_ID = "user-me";
const at = (hhmm: string) => new Date(`2026-11-03T${hhmm}:00Z`);

describe("availability router (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    dbMock.$transaction.mockImplementation(((fn: (tx: unknown) => unknown) => fn(dbMock)) as never);
    dbMock.availabilityBlock.deleteMany.mockResolvedValue({ count: 1 } as never);
    dbMock.availabilityBlock.createMany.mockResolvedValue({ count: 1 } as never);
  });

  const caller = () => createMockCaller({ userId: USER_ID, db: dbMock });

  describe("mark", () => {
    it("merges a painted range with the caller's touching plain block", async () => {
      dbMock.availabilityBlock.findMany.mockResolvedValue([
        { id: "a", startsAt: at("09:00"), endsAt: at("10:00"), isAllDay: false, note: null },
      ] as never);

      await caller().availability.mark({
        ranges: [{ startsAt: at("10:00"), endsAt: at("11:00") }],
      });

      const read = dbMock.availabilityBlock.findMany.mock.calls[0]![0] as {
        where: Record<string, unknown>;
      };
      expect(read.where).toMatchObject({ userId: USER_ID });
      expect(dbMock.availabilityBlock.deleteMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, id: { in: ["a"] } },
      });
      expect(dbMock.availabilityBlock.createMany).toHaveBeenCalledWith({
        data: [
          { startsAt: at("09:00"), endsAt: at("11:00"), isAllDay: false, note: null, userId: USER_ID },
        ],
      });
    });

    it("writes nothing when the range is already marked", async () => {
      dbMock.availabilityBlock.findMany.mockResolvedValue([
        { id: "a", startsAt: at("09:00"), endsAt: at("12:00"), isAllDay: false, note: null },
      ] as never);

      const result = await caller().availability.mark({
        ranges: [{ startsAt: at("10:00"), endsAt: at("11:00") }],
      });

      expect(result).toEqual({ deleted: 0, created: 0 });
      expect(dbMock.availabilityBlock.deleteMany).not.toHaveBeenCalled();
      expect(dbMock.availabilityBlock.createMany).not.toHaveBeenCalled();
    });

    it("refuses an empty or inverted range", async () => {
      await expect(
        caller().availability.mark({ ranges: [{ startsAt: at("10:00"), endsAt: at("10:00") }] }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  describe("clear", () => {
    it("splits a block around the cleared range and keeps its note", async () => {
      dbMock.availabilityBlock.findMany.mockResolvedValue([
        { id: "a", startsAt: at("09:00"), endsAt: at("17:00"), isAllDay: false, note: "Offsite" },
      ] as never);

      await caller().availability.clear({
        ranges: [{ startsAt: at("12:00"), endsAt: at("13:00") }],
      });

      expect(dbMock.availabilityBlock.createMany).toHaveBeenCalledWith({
        data: [
          { startsAt: at("09:00"), endsAt: at("12:00"), isAllDay: false, note: "Offsite", userId: USER_ID },
          { startsAt: at("13:00"), endsAt: at("17:00"), isAllDay: false, note: "Offsite", userId: USER_ID },
        ],
      });
    });
  });

  describe("remove", () => {
    it("deletes only the caller's own block", async () => {
      await caller().availability.remove({ id: "block-1" });
      expect(dbMock.availabilityBlock.deleteMany).toHaveBeenCalledWith({
        where: { id: "block-1", userId: USER_ID },
      });
    });

    it("is NOT_FOUND for someone else's block", async () => {
      dbMock.availabilityBlock.deleteMany.mockResolvedValue({ count: 0 } as never);
      await expect(caller().availability.remove({ id: "theirs" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("add", () => {
    it("stores a labelled block for the caller without merging", async () => {
      dbMock.availabilityBlock.create.mockResolvedValue({} as never);
      await caller().availability.add({
        range: { startsAt: at("00:00"), endsAt: new Date("2026-11-05T00:00:00Z") },
        isAllDay: true,
        note: "  Leave  ",
      });
      expect(dbMock.availabilityBlock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            userId: USER_ID,
            startsAt: at("00:00"),
            endsAt: new Date("2026-11-05T00:00:00Z"),
            isAllDay: true,
            note: "Leave",
          },
        }),
      );
      expect(dbMock.availabilityBlock.findMany).not.toHaveBeenCalled();
    });
  });

  describe("myGrid", () => {
    it("reports calendar busy time per cell and returns marked blocks separately", async () => {
      dbMock.calendarEvent.findMany.mockResolvedValue([
        { userId: USER_ID, startsAt: at("09:00"), endsAt: at("10:00"), isAllDay: false, sourceType: "google" },
      ] as never);
      const marked = { id: "m", startsAt: at("11:00"), endsAt: at("12:00"), isAllDay: false, note: "Dentist" };
      // First call: the free/busy read (times only); second: the caller's own rows.
      dbMock.availabilityBlock.findMany
        .mockResolvedValueOnce([
          { userId: USER_ID, startsAt: at("11:00"), endsAt: at("12:00"), isAllDay: false },
        ] as never)
        .mockResolvedValueOnce([marked] as never);
      dbMock.user.findMany.mockResolvedValue([
        {
          id: USER_ID,
          workHoursEnabled: false,
          workDaysJson: null,
          workHoursStart: null,
          workHoursEnd: null,
          timezone: "UTC",
        },
      ] as never);
      dbMock.user.findUnique.mockResolvedValue({ timezone: "UTC" } as never);

      const result = await caller().availability.myGrid({
        rangeStart: at("08:00"),
        rangeEnd: at("13:00"),
      });

      const statusAt = (hhmm: string) =>
        result.statuses[result.cellStartsAt.findIndex((d) => d.getTime() === at(hhmm).getTime())];
      expect(statusAt("09:00")).toBe("busy");
      // Marked time is not folded into the statuses — the client overlays it.
      expect(statusAt("11:00")).toBe("free");
      expect(result.blocks).toEqual([marked]);
    });

    it("refuses a range longer than ten days", async () => {
      await expect(
        caller().availability.myGrid({
          rangeStart: at("00:00"),
          rangeEnd: new Date(at("00:00").getTime() + 11 * 24 * 60 * 60 * 1000),
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });
});
