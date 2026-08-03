/**
 * Round-trip coverage for the RELATIONAL sync paths (cycle, assignee) — the
 * coverage hole that let the live cycle-sync gap (frosty.flame) go unnoticed:
 * the harness previously rejected relational writes by design, so no test ever
 * drove a cycle through pull or push.
 *
 * Same shared FakeNotion + FakeSyncDb world as roundTrip.test.ts /
 * roundTripScenarios.test.ts; every scenario ends with the standard
 * zero-write quiescence check. The final block proves the frosty.flame
 * self-heal end-to-end: an unreadable cycle warns and holds the window, then
 * applies WITHOUT a re-edit once access is restored.
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

import { createRoundTripWorld, type RoundTripWorld } from "./harness/world";

recordActivityMock.mockResolvedValue(true);
createTicketMock.mockRejectedValue(
  new Error("unexpected ticket creation in a relation round-trip test"),
);

/** Assert a full pull+push cycle writes nothing on either side. */
async function expectQuiescence(w: RoundTripWorld): Promise<void> {
  w.clearWrites();
  const cycle = await w.cycle();
  expect(cycle.pull.updated).toBe(0);
  expect(cycle.pull.conflicts).toBe(0);
  expect(cycle.pushes.every((p) => p.action === "skipped")).toBe(true);
  expect(w.ticketWrites()).toHaveLength(0);
  expect(w.notionWrites()).toHaveLength(0);
}

describe("round-trip cycle relation", () => {
  it("inbound: a cycle set in Notion auto-creates the local cycle and applies", async () => {
    const w = createRoundTripWorld();
    const { ticket, page } = w.seedSyncedTicket({});

    w.notion.editAsHuman(page.externalId, { cycleName: "Cycle 3" });

    const pull = await w.pull();
    expect(pull.updated).toBe(1);
    expect(w.db.tickets.get(ticket.id)?.cycleName).toBe("Cycle 3");
    // The resolver auto-created the workspace cycle (SPRINT list).
    expect(
      [...w.db.cyclesById.values()].some((c) => c.name === "Cycle 3"),
    ).toBe(true);

    await expectQuiescence(w);
  });

  it("inbound: matches an existing local cycle case-insensitively, no duplicate", async () => {
    const w = createRoundTripWorld();
    const { ticket, page } = w.seedSyncedTicket({});
    w.db.seedCycle("cycle three");

    w.notion.editAsHuman(page.externalId, { cycleName: "Cycle Three" });

    const pull = await w.pull();
    expect(pull.updated).toBe(1);
    expect(w.db.tickets.get(ticket.id)?.cycleName).toBe("cycle three");
    expect(w.db.cyclesById.size).toBe(1);
    expect(
      w.db.writeLog.filter((e) => e.model === "list" && e.op === "create"),
    ).toHaveLength(0);

    await expectQuiescence(w);
  });

  it("outbound: a locally-assigned cycle pushes when a matching Notion page exists", async () => {
    const w = createRoundTripWorld();
    const { ticket, page } = w.seedSyncedTicket({});
    w.notion.cyclePagesById.set("cycle-page-1", "Cycle 3");

    w.db.editTicketLocally(ticket.id, { cycleName: "Cycle 3" });

    const pushes = await w.pushAll();
    expect(pushes.map((p) => p.action)).toEqual(["pushed"]);
    expect(pushes[0]?.wrote).toContain("cycleName");
    expect(page.cycleName).toBe("Cycle 3");

    await expectQuiescence(w);
  });

  it("outbound: no matching Notion cycle page warns, skips, and stays pending", async () => {
    const w = createRoundTripWorld();
    const { ticket, page } = w.seedSyncedTicket({});

    w.db.editTicketLocally(ticket.id, { cycleName: "Cycle 9" });

    const pushes = await w.pushAll();
    expect(pushes.map((p) => p.action)).toEqual(["skipped"]);
    expect(pushes[0]?.reason).toContain('no Notion cycle page named "Cycle 9"');
    expect(page.cycleName).toBeNull();
    // Pending outbound, never reverted: the local value survives quiet cycles.
    await expectQuiescence(w);
    expect(w.db.tickets.get(ticket.id)?.cycleName).toBe("Cycle 9");

    // Once the cycle page appears in Notion, the next push ships it.
    w.notion.cyclePagesById.set("cycle-page-9", "Cycle 9");
    const retry = await w.pushAll();
    expect(retry.map((p) => p.action)).toEqual(["pushed"]);
    expect(page.cycleName).toBe("Cycle 9");
    await expectQuiescence(w);
  });
});

describe("round-trip assignee relation", () => {
  it("inbound: an assignee set in Notion applies when the email matches a member", async () => {
    const w = createRoundTripWorld();
    const { ticket, page } = w.seedSyncedTicket({});
    w.db.seedMember("dev@example.com");

    w.notion.editAsHuman(page.externalId, { assigneeEmail: "dev@example.com" });

    const pull = await w.pull();
    expect(pull.updated).toBe(1);
    expect(w.db.tickets.get(ticket.id)?.assigneeEmail).toBe("dev@example.com");

    await expectQuiescence(w);
  });

  it("outbound: a local assignee pushes when the email matches a Notion person", async () => {
    const w = createRoundTripWorld();
    const { ticket, page } = w.seedSyncedTicket({});
    w.notion.peopleByEmail.set("dev@example.com", "person-1");

    w.db.editTicketLocally(ticket.id, { assigneeEmail: "dev@example.com" });

    const pushes = await w.pushAll();
    expect(pushes.map((p) => p.action)).toEqual(["pushed"]);
    expect(pushes[0]?.wrote).toContain("assigneeEmail");
    expect(page.assigneeEmail).toBe("dev@example.com");

    await expectQuiescence(w);
  });
});

describe("round-trip unreadable cycle relation (frosty.flame self-heal)", () => {
  it("warns, holds the window, never clears — then applies once access is restored, without a re-edit", async () => {
    const w = createRoundTripWorld();
    const { ticket, page } = w.seedSyncedTicket({});

    // A human sets a cycle the connection cannot read.
    w.notion.editAsHuman(page.externalId, {
      cycleName: "Cycle 3",
      cycleUnreadable: true,
    });

    const pull = await w.pull();
    expect(pull.updated).toBe(0);
    const item = pull.items.find((i) => i.externalId === page.externalId);
    expect(item?.reason).toContain("cycle page unreadable");
    expect(w.db.tickets.get(ticket.id)?.cycleName).toBeNull();
    // Window held: lastPulledAt must NOT advance while relations are unreadable.
    expect(w.db.config.lastPulledAt).toBeNull();

    // The push direction must not clear the (unknown) remote cycle either.
    const pushes = await w.pushAll();
    expect(pushes.every((p) => p.action === "skipped")).toBe(true);
    expect(w.notionWrites()).toHaveLength(0);

    // Access is granted — NO page edit, no timestamp bump. Because the window
    // was held, the very next pull re-scans the row and applies the cycle.
    page.cycleUnreadable = false;
    const healed = await w.pull();
    expect(healed.updated).toBe(1);
    expect(w.db.tickets.get(ticket.id)?.cycleName).toBe("Cycle 3");
    // Healthy again: the window advances normally from here.
    expect(w.db.config.lastPulledAt).not.toBeNull();

    await expectQuiescence(w);
  });
});
