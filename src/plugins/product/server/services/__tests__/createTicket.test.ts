/**
 * Unit tests for the shared `createTicketWithNumber` service.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` so the test runs in
 * milliseconds and CANNOT touch a real DB. `recordActivity` and `generateFunId`
 * are mocked so we can assert on their inputs deterministically. The service
 * itself does no access control — these tests cover the create-mechanics only.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

// Deterministic fun ID so we can assert when it's used.
vi.mock("~/lib/fun-ids", () => ({
  generateFunId: vi.fn(() => "fun.id"),
}));

// Spy on the activity write so we can assert its args without a real DB row.
vi.mock("~/server/services/activity/recordActivity", () => ({
  recordActivity: vi.fn(() => Promise.resolve()),
}));

import { generateFunId } from "~/lib/fun-ids";
import { recordActivity } from "~/server/services/activity/recordActivity";
import { createTicketWithNumber, type CreateTicketInput } from "../createTicket";

const dbMock: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

function baseInput(
  overrides: Partial<CreateTicketInput> = {},
): CreateTicketInput {
  return {
    productId: "prod-1",
    workspaceId: "ws-1",
    createdById: "user-1",
    title: "A ticket",
    ...overrides,
  };
}

/** Set up product.update + ticket.create + (optional) ticket.findMany mocks. */
function primeDb(opts: { ticketCounter: number; funTicketIds: boolean }) {
  dbMock.product.update.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { ticketCounter: opts.ticketCounter, funTicketIds: opts.funTicketIds } as any,
  );
  dbMock.ticket.findMany.mockResolvedValue([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { shortId: "existing.one" } as any,
  ]);
  dbMock.ticket.create.mockImplementation(
    // create echoes the data so we can assert on what was written.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((args: any) =>
      Promise.resolve({ id: "ticket-1", ...args.data })) as any,
  );
}

beforeEach(() => {
  mockReset(dbMock);
  vi.clearAllMocks();
});

describe("createTicketWithNumber", () => {
  it("increments the product counter and uses it as the ticket number", async () => {
    primeDb({ ticketCounter: 42, funTicketIds: false });

    const ticket = await createTicketWithNumber(dbMock, baseInput());

    expect(dbMock.product.update).toHaveBeenCalledWith({
      where: { id: "prod-1" },
      data: { ticketCounter: { increment: 1 } },
      select: { ticketCounter: true, funTicketIds: true },
    });
    expect(dbMock.ticket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ number: 42 }),
      }),
    );
    expect(ticket.number).toBe(42);
  });

  it("generates a shortId only when the product has fun IDs enabled", async () => {
    // Disabled → no shortId, generator never called.
    primeDb({ ticketCounter: 1, funTicketIds: false });
    await createTicketWithNumber(dbMock, baseInput());
    expect(generateFunId).not.toHaveBeenCalled();
    expect(dbMock.ticket.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ shortId: null }) }),
    );

    vi.clearAllMocks();
    mockReset(dbMock);

    // Enabled → shortId minted from the existing-id set.
    primeDb({ ticketCounter: 2, funTicketIds: true });
    await createTicketWithNumber(dbMock, baseInput());
    expect(generateFunId).toHaveBeenCalledTimes(1);
    expect(generateFunId).toHaveBeenCalledWith(new Set(["existing.one"]));
    expect(dbMock.ticket.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ shortId: "fun.id" }) }),
    );
  });

  it("passes links through to the created ticket", async () => {
    primeDb({ ticketCounter: 3, funTicketIds: false });
    const links = { sentryIssueId: "abc", sentryUrl: "https://sentry.example/abc" };

    await createTicketWithNumber(dbMock, baseInput({ links }));

    expect(dbMock.ticket.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ links }) }),
    );
  });

  it("records a 'created' activity event with the product's workspaceId", async () => {
    primeDb({ ticketCounter: 4, funTicketIds: false });

    const ticket = await createTicketWithNumber(
      dbMock,
      baseInput({ workspaceId: "ws-42", createdById: "user-7" }),
    );

    expect(recordActivity).toHaveBeenCalledWith(
      dbMock,
      expect.objectContaining({
        workspaceId: "ws-42",
        userId: "user-7",
        entityType: "ticket",
        entityId: ticket.id,
        action: "created",
      }),
    );
  });

  it("honors the supplied createdById, type, and status", async () => {
    primeDb({ ticketCounter: 5, funTicketIds: false });

    await createTicketWithNumber(
      dbMock,
      baseInput({ createdById: "errol-id", type: "BUG", status: "BACKLOG" }),
    );

    expect(dbMock.ticket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdById: "errol-id",
          type: "BUG",
          status: "BACKLOG",
        }),
      }),
    );
  });

  it("defaults type to FEATURE and status to BACKLOG when unset", async () => {
    primeDb({ ticketCounter: 6, funTicketIds: false });

    await createTicketWithNumber(dbMock, baseInput());

    expect(dbMock.ticket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "FEATURE", status: "BACKLOG" }),
      }),
    );
  });
});
