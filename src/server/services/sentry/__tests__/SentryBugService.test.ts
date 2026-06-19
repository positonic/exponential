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

// Zulip notify is exercised in its own test; here we just assert it's invoked
// (or not) with the right deep link.
vi.mock("../sentryZulip", () => ({
  notifyZulipOfSentryBug: vi.fn(() => Promise.resolve()),
}));

import { createTicketWithNumber } from "~/plugins/product/server/services/createTicket";
import { notifyZulipOfSentryBug } from "../sentryZulip";
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
  delete process.env.NEXT_PUBLIC_APP_URL;
  dbMock.product.findUnique.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    {
      id: "prod-1",
      workspaceId: "ws-1",
      slug: "exponential",
      workspace: { slug: "syntrofi" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  );
  // No existing ticket by default — each test opts into a dedup hit.
  dbMock.ticket.findFirst.mockResolvedValue(null);
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

  it("notifies Zulip on creation with a deep link to the new ticket", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example";

    await ingestSentryBug(dbMock, bug);

    expect(notifyZulipOfSentryBug).toHaveBeenCalledTimes(1);
    expect(notifyZulipOfSentryBug).toHaveBeenCalledWith(
      dbMock,
      expect.objectContaining({
        workspaceId: "ws-1",
        authorId: "errol-id",
        title: "Boom",
        sentryUrl: "https://sentry.io/issues/42",
        ticketUrl:
          "https://app.example/w/syntrofi/products/exponential/tickets/ticket-1",
      }),
    );
  });

  it("throws when the configured product does not exist", async () => {
    dbMock.product.findUnique.mockResolvedValue(null);
    await expect(ingestSentryBug(dbMock, bug)).rejects.toThrow(
      /Sentry bug product not found/,
    );
    expect(createTicketWithNumber).not.toHaveBeenCalled();
  });

  describe("dedup", () => {
    it("creates no new ticket for an already-seen issue id and returns the existing one", async () => {
      dbMock.ticket.findFirst.mockResolvedValue(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: "existing-ticket" } as any,
      );

      const result = await ingestSentryBug(dbMock, bug);

      expect(createTicketWithNumber).not.toHaveBeenCalled();
      // Recurring errors that dedup onto an existing ticket do not re-notify.
      expect(notifyZulipOfSentryBug).not.toHaveBeenCalled();
      expect(result).toEqual({ created: false, ticketId: "existing-ticket" });
    });

    it("scopes the dedup lookup to the product and the Sentry issue id", async () => {
      await ingestSentryBug(dbMock, bug);

      expect(dbMock.ticket.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            productId: "prod-1",
            links: { path: ["sentryIssueId"], equals: "42" },
          },
        }),
      );
    });

    it("creates exactly one ticket for a previously-unseen issue id", async () => {
      dbMock.ticket.findFirst.mockResolvedValue(null);

      const result = await ingestSentryBug(dbMock, bug);

      expect(createTicketWithNumber).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ created: true, ticketId: "ticket-1" });
    });
  });
});
