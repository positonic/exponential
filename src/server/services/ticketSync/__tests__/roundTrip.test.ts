/**
 * Round-trip quiescence tests: pull and push driven against ONE shared
 * FakeNotion + FakeSyncDb, proving the system converges and then goes quiet.
 *
 * The per-direction suites (engine.test.ts, push.test.ts) prove each runner's
 * behavior in isolation; these tests prove the emergent two-way properties —
 * no ping-pong, no phantom writes, echo suppression end-to-end — that only
 * show up when both directions share state.
 */

import { describe, expect, it, vi } from "vitest";

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

import { createRoundTripWorld } from "./harness/world";

recordActivityMock.mockResolvedValue(true);
// The quiescence scenarios never create tickets from Notion; a call here means
// the sync invented a row out of nothing — fail loudly.
createTicketMock.mockRejectedValue(
  new Error("unexpected ticket creation in a round-trip quiescence test"),
);

describe("round-trip quiescence", () => {
  it("steady state: a full pull+push cycle performs zero writes on either side", async () => {
    const w = createRoundTripWorld();
    w.seedSyncedTicket({});

    const pull = await w.pull();
    expect(pull.created).toBe(0);
    expect(pull.updated).toBe(0);
    expect(pull.failed).toBe(0);
    expect(w.ticketWrites()).toHaveLength(0);
    expect(w.notionWrites()).toHaveLength(0);

    const pushes = await w.pushAll();
    expect(pushes.map((p) => p.action)).toEqual(["skipped"]);
    expect(pushes[0]?.reason).toContain("in sync");
    expect(w.notionWrites()).toHaveLength(0);
  });

  it("local edit: exactly one Notion write, then the system goes quiet", async () => {
    const w = createRoundTripWorld();
    const { ticket, page } = w.seedSyncedTicket({});

    w.db.editTicketLocally(ticket.id, { title: "Renamed locally" });

    const pushes = await w.pushAll();
    expect(pushes.map((p) => p.action)).toEqual(["pushed"]);
    expect(pushes[0]?.wrote).toEqual(["title"]);
    expect(w.notionWrites()).toHaveLength(1);
    expect(page.title).toBe("Renamed locally");

    // Cycle 2: the pull sees only our own write (echo) and applies nothing;
    // the push finds everything converged and writes nothing.
    w.clearWrites();
    const cycle2 = await w.cycle();
    expect(cycle2.pull.updated).toBe(0);
    expect(
      cycle2.pull.items.every(
        (i) => i.action === "skipped" || i.action === "adopted",
      ),
    ).toBe(true);
    expect(cycle2.pushes.map((p) => p.action)).toEqual(["skipped"]);
    expect(w.ticketWrites()).toHaveLength(0);
    expect(w.notionWrites()).toHaveLength(0);

    // Cycle 3: still quiet.
    const cycle3 = await w.cycle();
    expect(cycle3.pull.updated).toBe(0);
    expect(cycle3.pushes.map((p) => p.action)).toEqual(["skipped"]);
    expect(w.ticketWrites()).toHaveLength(0);
    expect(w.notionWrites()).toHaveLength(0);

    // The local edit survived the whole exchange.
    expect(w.db.tickets.get(ticket.id)?.title).toBe("Renamed locally");
    expect(page.title).toBe("Renamed locally");
  });

  it("remote human edit: applied locally exactly once, then the system goes quiet", async () => {
    const w = createRoundTripWorld();
    const { ticket, page } = w.seedSyncedTicket({});

    w.notion.editAsHuman(page.externalId, {
      rawStatus: "Done",
    });

    const pull = await w.pull();
    expect(pull.updated).toBe(1);
    expect(pull.conflicts).toBe(0);
    expect(w.db.tickets.get(ticket.id)?.status).toBe("DONE");
    expect(w.ticketWrites()).toHaveLength(1);
    // Strictly read-only against Notion on the inbound path.
    expect(w.notionWrites()).toHaveLength(0);

    // The applied inbound change must NOT be echoed back to Notion.
    w.clearWrites();
    const pushes = await w.pushAll();
    expect(pushes.map((p) => p.action)).toEqual(["skipped"]);
    expect(w.notionWrites()).toHaveLength(0);

    const cycle2 = await w.cycle();
    expect(cycle2.pull.updated).toBe(0);
    expect(cycle2.pushes.map((p) => p.action)).toEqual(["skipped"]);
    expect(w.ticketWrites()).toHaveLength(0);
    expect(w.notionWrites()).toHaveLength(0);
  });

  it("echo suppression keys on the editor: bot rows are skipped, human rows apply", async () => {
    const w = createRoundTripWorld();
    const { ticket, page } = w.seedSyncedTicket({});

    // Our own push makes the page's last edit a bot edit …
    w.db.editTicketLocally(ticket.id, { title: "Renamed locally" });
    await w.pushAll();

    const echoPull = await w.pull();
    const echoItem = echoPull.items.find(
      (i) => i.externalId === page.externalId,
    );
    expect(echoItem?.action).toBe("skipped");
    expect(echoItem?.reason).toContain("echo suppression");

    // … but a subsequent HUMAN edit is no longer suppressed and applies,
    // without reverting the pushed title.
    w.notion.editAsHuman(page.externalId, { rawStatus: "Blocked" });
    w.clearWrites();
    const humanPull = await w.pull();
    expect(humanPull.updated).toBe(1);
    expect(w.db.tickets.get(ticket.id)?.status).toBe("BLOCKED");
    expect(w.db.tickets.get(ticket.id)?.title).toBe("Renamed locally");
    expect(page.title).toBe("Renamed locally");

    // And the exchange still terminates.
    w.clearWrites();
    const cycle = await w.cycle();
    expect(cycle.pull.updated).toBe(0);
    expect(cycle.pushes.map((p) => p.action)).toEqual(["skipped"]);
    expect(w.ticketWrites()).toHaveLength(0);
    expect(w.notionWrites()).toHaveLength(0);
  });

  it("a pushed field later edited by a human applies cleanly — no spurious conflict", async () => {
    // This is the observable value of snapshot advancement after a push: with
    // a stale snapshot the remote edit would read as a two-sided change and
    // surface as a conflict; with the advanced snapshot it is a clean
    // remote-only change. (Deliberately mutation-sensitive: disabling the
    // ticketSync.update after updatePage in push.ts makes this fail.)
    const w = createRoundTripWorld();
    const { ticket, page } = w.seedSyncedTicket({});

    w.db.editTicketLocally(ticket.id, { title: "Renamed locally" });
    await w.pushAll();

    w.notion.editAsHuman(page.externalId, { title: "Renamed in Notion" });

    const pull = await w.pull();
    expect(pull.conflicts).toBe(0);
    expect(pull.updated).toBe(1);
    expect(w.db.tickets.get(ticket.id)?.title).toBe("Renamed in Notion");

    w.clearWrites();
    const cycle = await w.cycle();
    expect(cycle.pull.updated).toBe(0);
    expect(cycle.pushes.map((p) => p.action)).toEqual(["skipped"]);
    expect(w.ticketWrites()).toHaveLength(0);
    expect(w.notionWrites()).toHaveLength(0);
  });

  it("edits on both sides of different fields converge within one cycle, then quiesce", async () => {
    const w = createRoundTripWorld();
    const { ticket, page } = w.seedSyncedTicket({});

    w.db.editTicketLocally(ticket.id, { priority: 2 });
    w.notion.editAsHuman(page.externalId, { rawStatus: "Done" });

    const cycle1 = await w.cycle();
    // Pull applies the remote status; push ships the local priority.
    expect(cycle1.pull.updated).toBe(1);
    expect(cycle1.pull.conflicts).toBe(0);
    expect(cycle1.pushes.map((p) => p.action)).toEqual(["pushed"]);
    expect(cycle1.pushes[0]?.wrote).toEqual(["priority"]);

    expect(w.db.tickets.get(ticket.id)?.status).toBe("DONE");
    expect(w.db.tickets.get(ticket.id)?.priority).toBe(2);
    expect(page.rawStatus).toBe("Done");
    expect(page.rawPriority).toBe("2 - Medium");

    w.clearWrites();
    const cycle2 = await w.cycle();
    expect(cycle2.pull.updated).toBe(0);
    expect(cycle2.pushes.map((p) => p.action)).toEqual(["skipped"]);
    expect(w.ticketWrites()).toHaveLength(0);
    expect(w.notionWrites()).toHaveLength(0);
  });
});
