/**
 * Inbound adoption of hand-written pages (EXPONENTIAL-671).
 *
 * The incident: a page written by hand in Notion for CLEAR-612 was imported as
 * a second ticket, CLEAR-616; archiving that duplicate later trashed the page
 * (fixed separately, ADR-0066). A page that LINKS to an existing ticket's
 * Exponential URL now belongs to that ticket. A ticket number mentioned in
 * text never counts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { createTicketMock, resolveTagsMock, attachTagsMock, recordActivityMock } =
  vi.hoisted(() => ({
    createTicketMock: vi.fn(),
    resolveTagsMock: vi.fn(),
    attachTagsMock: vi.fn(),
    recordActivityMock: vi.fn(),
  }));

vi.mock("~/plugins/product/server/services/createTicket", () => ({
  createTicketWithNumber: createTicketMock,
}));

vi.mock("../../notionTicketImport", () => ({
  resolveOrCreateWorkspaceTags: resolveTagsMock,
  attachTicketTags: attachTagsMock,
}));

vi.mock("~/server/services/activity/recordActivity", () => ({
  recordActivity: recordActivityMock,
}));

import { STATUS_TO_RAW } from "./harness/fakeNotion";
import { createRoundTripWorld } from "./harness/world";

recordActivityMock.mockResolvedValue(true);

/** The world's product is `prod` in workspace `ws`. */
function ticketUrl(number: number): string {
  return `https://www.exponential.im/w/ws/products/prod/tickets/${number}`;
}

beforeEach(() => {
  createTicketMock.mockReset();
  createTicketMock.mockRejectedValue(
    new Error("unexpected ticket creation in an adoption test"),
  );
});

describe("inbound: a hand-written page that links to an existing ticket", () => {
  it("is adopted by that ticket instead of imported as a duplicate", async () => {
    const w = createRoundTripWorld();
    const ticket = w.db.seedTicket({ title: "Website: visual design" });
    w.clock.advance(); // the page is written after the ticket exists
    // The incident page: a parent and a dependency named in plain text, the
    // owning ticket as an "Open in Exponential" link, plus an unrelated link.
    const page = w.notion.seedPage({
      title: "Website: visual design",
      rawStatus: STATUS_TO_RAW.READY_TO_PLAN!,
      links: [ticketUrl(ticket.number), "https://example.com/brief"],
    });

    const pull = await w.pull();

    expect(createTicketMock).not.toHaveBeenCalled();
    expect(pull.created).toBe(0);
    expect(pull.items).toContainEqual(
      expect.objectContaining({
        externalId: page.externalId,
        ticketId: ticket.id,
        action: "adopted",
      }),
    );
    const links = [...w.db.syncs.values()].filter(
      (s) => s.externalId === page.externalId,
    );
    expect(links.map((s) => s.ticketId)).toEqual([ticket.id]);
    // Merged in the same run: the page is newer, so its status wins.
    expect(ticket.status).toBe("READY_TO_PLAN");
  });

  it("archiving the adopted ticket keeps the page (the full incident loop)", async () => {
    const w = createRoundTripWorld();
    const ticket = w.db.seedTicket({});
    const page = w.notion.seedPage({ links: [ticketUrl(ticket.number)] });
    await w.pull();

    w.db.editTicketLocally(ticket.id, { status: "ARCHIVED" });
    await w.pushAll();

    expect(page.archived).toBe(false);
    expect(page.rawStatus).toBe(STATUS_TO_RAW.ARCHIVED);
  });

  it("dry run reports the adoption without linking", async () => {
    const w = createRoundTripWorld();
    const ticket = w.db.seedTicket({});
    const page = w.notion.seedPage({ links: [ticketUrl(ticket.number)] });

    const pull = await w.pull({ dryRun: true });

    expect(pull.items).toContainEqual(
      expect.objectContaining({
        externalId: page.externalId,
        action: "adopted",
        reason: expect.stringContaining("would link") as unknown,
      }),
    );
    expect(w.db.syncs.size).toBe(0);
  });

  it("skips a page linking to several tickets rather than guessing", async () => {
    const w = createRoundTripWorld();
    const a = w.db.seedTicket({});
    const b = w.db.seedTicket({});
    const page = w.notion.seedPage({
      links: [ticketUrl(a.number), ticketUrl(b.number)],
    });

    const pull = await w.pull();

    expect(createTicketMock).not.toHaveBeenCalled();
    expect(pull.items).toContainEqual(
      expect.objectContaining({
        externalId: page.externalId,
        action: "skipped",
        reason: expect.stringContaining("several tickets") as unknown,
      }),
    );
    expect(w.db.syncs.size).toBe(0);
  });

  it("skips a page linking to a ticket already synced to another page", async () => {
    const w = createRoundTripWorld();
    const { ticket } = w.seedSyncedTicket({});
    const stray = w.notion.seedPage({ links: [ticketUrl(ticket.number)] });

    const pull = await w.pull();

    expect(createTicketMock).not.toHaveBeenCalled();
    expect(pull.items).toContainEqual(
      expect.objectContaining({
        externalId: stray.externalId,
        action: "skipped",
        reason: expect.stringContaining("already synced") as unknown,
      }),
    );
    expect([...w.db.syncs.values()].map((s) => s.externalId)).not.toContain(
      stray.externalId,
    );
  });

  it("still imports a page whose only link is to a ticket that doesn't exist", async () => {
    const w = createRoundTripWorld();
    createTicketMock.mockResolvedValue({ id: "t-new", number: 99 });
    const page = w.notion.seedPage({ links: [ticketUrl(404)] });

    const pull = await w.pull();

    expect(createTicketMock).toHaveBeenCalledTimes(1);
    expect(pull.items).toContainEqual(
      expect.objectContaining({ externalId: page.externalId, action: "created" }),
    );
  });

  it("still imports a page that only mentions a ticket number in text", async () => {
    const w = createRoundTripWorld();
    w.db.seedTicket({});
    createTicketMock.mockResolvedValue({ id: "t-new", number: 99 });
    const page = w.notion.seedPage({
      title: "Website: visual design (Exponential prod-1)",
    });

    const pull = await w.pull();

    expect(createTicketMock).toHaveBeenCalledTimes(1);
    expect(pull.items).toContainEqual(
      expect.objectContaining({ externalId: page.externalId, action: "created" }),
    );
  });
});
