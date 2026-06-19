/**
 * Unit tests for the Sentry ingest service. Mocks `createTicketWithNumber` (the
 * shared create path) and uses `mockDeep<PrismaClient>()` so no real DB is
 * touched. Slice 2 has no dedup yet — every ingest creates exactly one ticket.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

vi.mock("~/plugins/product/server/services/createTicket", () => ({
  createTicketWithNumber: vi.fn(() => Promise.resolve({ id: "ticket-1" })),
}));

import { createTicketWithNumber } from "~/plugins/product/server/services/createTicket";
import { ingestSentryBug } from "../SentryBugService";
import { type SentryBug } from "../sentryPayload";

const dbMock: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

const bug: SentryBug = {
  issueId: "42",
  title: "Boom",
  level: "error",
  culprit: "app/page.tsx",
  url: "https://sentry.io/issues/42",
  shortId: "EXPONENTIAL-1AB",
};

beforeEach(() => {
  mockReset(dbMock);
  vi.clearAllMocks();
  delete process.env.SENTRY_BUG_PRODUCT_ID;
  delete process.env.SENTRY_BOT_EMAIL;
  delete process.env.SENTRY_BOT_NAME;
  dbMock.product.findUnique.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { id: "prod-1", workspaceId: "ws-1" } as any,
  );
  dbMock.user.upsert.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { id: "errol-id" } as any,
  );
});

describe("ingestSentryBug", () => {
  it("creates exactly one BUG/BACKLOG ticket via the shared service, authored by Errol", async () => {
    const result = await ingestSentryBug(dbMock, bug);

    expect(createTicketWithNumber).toHaveBeenCalledTimes(1);
    expect(createTicketWithNumber).toHaveBeenCalledWith(
      dbMock,
      expect.objectContaining({
        productId: "prod-1",
        workspaceId: "ws-1",
        createdById: "errol-id",
        title: "Boom",
        type: "BUG",
        status: "BACKLOG",
        links: { sentryIssueId: "42", sentryUrl: "https://sentry.io/issues/42" },
      }),
    );
    expect(result).toEqual({ created: true, ticketId: "ticket-1" });
  });

  it("find-or-creates Errol via upsert keyed on the bot email (no duplicate users)", async () => {
    process.env.SENTRY_BOT_EMAIL = "errol@bots.exponential.im";
    process.env.SENTRY_BOT_NAME = "Errol";

    await ingestSentryBug(dbMock, bug);

    expect(dbMock.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "errol@bots.exponential.im" },
        create: { email: "errol@bots.exponential.im", name: "Errol" },
        update: {},
        select: { id: true },
      }),
    );
  });

  it("does not set a priority — left for human triage", async () => {
    await ingestSentryBug(dbMock, bug);
    const arg = vi.mocked(createTicketWithNumber).mock.calls[0]![1];
    expect(arg.priority).toBeUndefined();
  });

  it("throws when the configured product does not exist", async () => {
    dbMock.product.findUnique.mockResolvedValue(null);
    await expect(ingestSentryBug(dbMock, bug)).rejects.toThrow(
      /Sentry bug product not found/,
    );
    expect(createTicketWithNumber).not.toHaveBeenCalled();
  });
});
