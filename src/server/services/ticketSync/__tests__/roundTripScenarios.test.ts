/**
 * Round-trip scenario tests: the hard orderings the canonical quiescence suite
 * (roundTrip.test.ts) deliberately leaves out. Same shared FakeNotion +
 * FakeSyncDb + TestClock world, but each test drives a specific race or edge
 * case — same-field conflicts resolved by last-write-wins, outbound creation
 * from a pending sentinel, sticky-status collapse, unresolvable relations,
 * failure injection, and adoption — and proves that after convergence the
 * system goes quiet: one more full pull+push cycle writes nothing on either
 * side.
 *
 * The engine imports `createTicketWithNumber`, the tag helpers, and
 * `recordActivity` directly (not injectable), so — like roundTrip.test.ts — we
 * vi.mock the same three modules. None of these scenarios legitimately creates a
 * ticket from Notion, so a call to `createTicketWithNumber` means the sync
 * invented a row and must fail loudly.
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

import { PENDING_EXTERNAL_PREFIX } from "../push";
import {
  DEFAULT_FAKE_SCHEMA,
  POINTS_TO_RAW,
  PRIORITY_TO_RAW,
  STATUS_TO_RAW,
  TYPE_TO_RAW,
} from "./harness/fakeNotion";
import { createRoundTripWorld } from "./harness/world";

recordActivityMock.mockResolvedValue(true);
createTicketMock.mockRejectedValue(
  new Error("unexpected ticket creation in a round-trip scenario test"),
);

/** Assert a full pull+push cycle writes nothing on either side. */
async function expectQuiescent(w: ReturnType<typeof createRoundTripWorld>) {
  w.clearWrites();
  const cycle = await w.cycle();
  expect(cycle.pull.updated).toBe(0);
  expect(cycle.pull.conflicts).toBe(0);
  expect(cycle.pushes.every((p) => p.action === "skipped")).toBe(true);
  expect(w.ticketWrites()).toHaveLength(0);
  expect(w.notionWrites()).toHaveLength(0);
}

describe("round-trip scenarios", () => {
  describe("concurrent same-field edits resolve by last-write-wins", () => {
    it("remote edited last: remote wins, applied on the pull, and the local edit does not resurrect", async () => {
      const w = createRoundTripWorld();
      const { ticket, page } = w.seedSyncedTicket({});

      // Both sides rename the SAME field between syncs; remote edits last.
      w.db.editTicketLocally(ticket.id, { title: "Local rename" });
      w.notion.editAsHuman(page.externalId, { title: "Remote rename" });

      const cycle1 = await w.cycle();

      // The conflict is recorded on the inbound run, remote wins by timestamp,
      // and the winning value is applied to the ticket in exactly one write.
      expect(cycle1.pull.conflicts).toBe(1);
      expect(cycle1.pull.updated).toBe(1);
      const conflictItem = cycle1.pull.items.find(
        (i) => i.externalId === page.externalId,
      );
      expect(conflictItem?.action).toBe("conflict");
      expect(conflictItem?.reason).toContain("conflict on title: remote wins");
      expect(w.ticketWrites()).toHaveLength(1);
      // Read-only against Notion on the inbound path.
      expect(w.notionWrites()).toHaveLength(0);

      // The push finds everything converged (remote already won) — no echo.
      expect(cycle1.pushes.map((p) => p.action)).toEqual(["skipped"]);

      expect(w.db.tickets.get(ticket.id)?.title).toBe("Remote rename");
      expect(page.title).toBe("Remote rename");

      // The losing local value must not come back on the next cycle.
      await expectQuiescent(w);
      expect(w.db.tickets.get(ticket.id)?.title).toBe("Remote rename");
      expect(page.title).toBe("Remote rename");
    });

    it("local edited last: local wins, shipped on the push, and the remote edit does not resurrect", async () => {
      const w = createRoundTripWorld();
      const { ticket, page } = w.seedSyncedTicket({});

      // Remote edits first, local edits last → local wins the tiebreak.
      w.notion.editAsHuman(page.externalId, { title: "Remote rename" });
      w.db.editTicketLocally(ticket.id, { title: "Local rename" });

      const cycle1 = await w.cycle();

      // The pull records the conflict (local wins) but writes nothing local —
      // the local value stays pending outbound. The push then ships it.
      expect(cycle1.pull.conflicts).toBe(1);
      const conflictItem = cycle1.pull.items.find(
        (i) => i.externalId === page.externalId,
      );
      expect(conflictItem?.action).toBe("conflict");
      expect(conflictItem?.reason).toContain("conflict on title: local wins");
      expect(w.ticketWrites()).toHaveLength(0);

      expect(cycle1.pushes.map((p) => p.action)).toEqual(["pushed"]);
      expect(cycle1.pushes[0]?.wrote).toEqual(["title"]);

      expect(w.db.tickets.get(ticket.id)?.title).toBe("Local rename");
      expect(page.title).toBe("Local rename");

      // The losing remote value must not come back on the next cycle.
      await expectQuiescent(w);
      expect(w.db.tickets.get(ticket.id)?.title).toBe("Local rename");
      expect(page.title).toBe("Local rename");
    });
  });

  it("backfill → edit → push: a pending sentinel creates ONE page, then converges without duplicating it", async () => {
    const w = createRoundTripWorld();

    // A ticket born in Exponential, queued for its first mirror: a sync record
    // whose externalId is the pending sentinel and whose snapshot is null.
    const ticket = w.db.seedTicket({ title: "Born local" });
    const sync = w.db.linkTicket(
      ticket.id,
      `${PENDING_EXTERNAL_PREFIX}${ticket.id}`,
      null,
    );

    // …edited before it ever reaches Notion.
    w.db.editTicketLocally(ticket.id, { title: "Born local, then edited" });

    const created = await w.pushAll();
    expect(created.map((p) => p.action)).toEqual(["created"]);
    expect(w.notion.pages.size).toBe(1);
    expect(w.notionWrites().map((wr) => wr.method)).toEqual(["createPage"]);
    // The sentinel became a real page id, and the created page carries the edit.
    const createdRecord = w.db.syncs.get(sync.id);
    expect(createdRecord?.externalId.startsWith(PENDING_EXTERNAL_PREFIX)).toBe(
      false,
    );
    const createdPage = w.notion.pages.get(createdRecord!.externalId);
    expect(createdPage?.title).toBe("Born local, then edited");
    // Never fabricated a ticket from the Notion side.
    expect(createTicketMock).not.toHaveBeenCalled();

    // A full cycle must not re-import the bot-created page nor create a second.
    w.clearWrites();
    const cycle = await w.cycle();
    expect(cycle.pull.created).toBe(0);
    expect(cycle.pushes.map((p) => p.action)).toEqual(["skipped"]);
    expect(w.notion.pages.size).toBe(1);

    await expectQuiescent(w);
    expect(w.notion.pages.size).toBe(1);
  });

  it("sticky status collapse: moving between two statuses the schema can't tell apart writes nothing to Notion", async () => {
    const w = createRoundTripWorld();
    const { ticket, page } = w.seedSyncedTicket({ status: "DONE" });

    // Narrow the Status property to a single option ("Done"): DONE maps onto it,
    // DEPLOYED has no representable option — so both terminal statuses collapse
    // to the one Notion value and moving between them must be a Notion no-op.
    w.notion.setSchema({
      ...DEFAULT_FAKE_SCHEMA,
      Status: { type: "status", options: ["Done"] },
    });

    // DONE → DEPLOYED: no option maps to DEPLOYED, so status is skipped, not
    // guessed — zero Notion writes.
    w.db.editTicketLocally(ticket.id, { status: "DEPLOYED" });
    const toDeployed = await w.pushAll();
    expect(toDeployed.map((p) => p.action)).toEqual(["skipped"]);
    expect(toDeployed[0]?.reason).toContain("DEPLOYED");
    expect(w.notionWrites()).toHaveLength(0);

    // DEPLOYED → DONE: the page's current option already means DONE (sticky
    // collapse) — again zero Notion writes.
    w.db.editTicketLocally(ticket.id, { status: "DONE" });
    const toDone = await w.pushAll();
    expect(toDone.map((p) => p.action)).toEqual(["skipped"]);
    expect(w.notionWrites()).toHaveLength(0);

    // And back again — still silent.
    w.db.editTicketLocally(ticket.id, { status: "DEPLOYED" });
    const toDeployedAgain = await w.pushAll();
    expect(toDeployedAgain.map((p) => p.action)).toEqual(["skipped"]);
    expect(w.notionWrites()).toHaveLength(0);

    // The Notion page's status was never touched throughout the collapse.
    expect(page.rawStatus).toBe("Done");

    await expectQuiescent(w);
    expect(page.rawStatus).toBe("Done");
  });

  it("unresolvable assignee: the field is skipped, the snapshot is pinned, and no phantom echo appears", async () => {
    const w = createRoundTripWorld();
    const { ticket, page, sync } = w.seedSyncedTicket({});
    // FakeNotion.peopleByEmail is empty — no email resolves to a person.

    w.db.editTicketLocally(ticket.id, { assigneeEmail: "ghost@example.com" });

    const pushes = await w.pushAll();
    expect(pushes.map((p) => p.action)).toEqual(["skipped"]);
    expect(pushes[0]?.reason).toContain("ghost@example.com");
    expect(w.notionWrites()).toHaveLength(0);

    // Snapshot pinned to the REMOTE value (null) so the unpushable local change
    // stays pending outbound — never reverted, never defaulted.
    expect(
      (w.db.syncs.get(sync.id)?.snapshot as { assigneeEmail?: unknown })
        ?.assigneeEmail ?? null,
    ).toBeNull();

    // The inbound poll must not read the pinned snapshot as a remote change and
    // echo it back onto the ticket: the local assignee survives, Notion stays
    // empty, and nothing is written on either side.
    w.clearWrites();
    const cycle = await w.cycle();
    expect(cycle.pull.updated).toBe(0);
    expect(w.ticketWrites()).toHaveLength(0);
    expect(w.notionWrites()).toHaveLength(0);
    expect(w.db.tickets.get(ticket.id)?.assigneeEmail).toBe("ghost@example.com");
    expect(page.assigneeEmail).toBeNull();

    await expectQuiescent(w);
    expect(w.db.tickets.get(ticket.id)?.assigneeEmail).toBe("ghost@example.com");
    expect(page.assigneeEmail).toBeNull();
  });

  it("failure injection: a rejected updatePage leaves the snapshot untouched; the retry converges with exactly one Notion write", async () => {
    const w = createRoundTripWorld();
    const { ticket, page, sync } = w.seedSyncedTicket({});
    const snapshotBefore = {
      ...(w.db.syncs.get(sync.id)?.snapshot as Record<string, unknown>),
    };

    w.db.editTicketLocally(ticket.id, { title: "Pushed after retry" });

    // First push: Notion rejects the write before anything is recorded.
    w.notion.updatePageError = new Error("Notion 502 — transient");
    await expect(w.pushAll()).rejects.toThrow("Notion 502");

    // The write threw before the snapshot advanced (no lost update) and Notion
    // recorded nothing.
    expect(w.db.syncs.get(sync.id)?.snapshot).toEqual(snapshotBefore);
    expect(page.title).toBe("Seeded row");
    expect(w.notionWrites()).toHaveLength(0);

    // Retry: the transient error is gone, and the same pending change ships —
    // exactly one successful Notion write in total.
    const retry = await w.pushAll();
    expect(retry.map((p) => p.action)).toEqual(["pushed"]);
    expect(retry[0]?.wrote).toEqual(["title"]);
    expect(w.notionWrites()).toHaveLength(1);
    expect(page.title).toBe("Pushed after retry");
    expect(
      (w.db.syncs.get(sync.id)?.snapshot as { title?: unknown })?.title,
    ).toBe("Pushed after retry");

    await expectQuiescent(w);
    expect(page.title).toBe("Pushed after retry");
  });

  it("adoption: a ticket carrying a notionPageId but no sync record is adopted and converged by LWW without inventing changes", async () => {
    const w = createRoundTripWorld();

    // A FROM-NOTION import: ticket + page hold identical field values, linked
    // only by the stored notionPageId, with NO sync record yet.
    const page = w.notion.seedPage({
      title: "Adopt me",
      rawStatus: STATUS_TO_RAW.IN_PROGRESS!,
      rawType: TYPE_TO_RAW.BUG!,
      rawPriority: PRIORITY_TO_RAW[1]!,
      rawEffort: POINTS_TO_RAW[5]!,
    });
    const ticket = w.db.seedTicket({
      title: "Adopt me",
      status: "IN_PROGRESS",
      type: "BUG",
      priority: 1,
      points: 5,
      links: { notionPageId: page.externalId },
    });

    // A single human edit on the remote after the ticket's last touch: the only
    // real divergence, which LWW must resolve in the remote's favor.
    w.notion.editAsHuman(page.externalId, { title: "Renamed in Notion" });

    const pull = await w.pull();

    // Adopted on this same run (a sync record is created), then the row merge
    // resolves the title by LWW (remote is newer) — and touches nothing else.
    const adopted = pull.items.find((i) => i.action === "adopted");
    expect(adopted?.ticketId).toBe(ticket.id);
    expect(pull.conflicts).toBe(1);
    expect(pull.updated).toBe(1);
    expect(createTicketMock).not.toHaveBeenCalled();

    // "Without inventing changes": exactly one field write, and only the title.
    expect(w.ticketWrites()).toHaveLength(1);
    expect(Object.keys(w.ticketWrites()[0]?.data as object)).toEqual(["title"]);
    expect(w.notionWrites()).toHaveLength(0);
    expect(w.db.tickets.get(ticket.id)?.title).toBe("Renamed in Notion");

    // The push sees a converged link and writes nothing back.
    w.clearWrites();
    const pushes = await w.pushAll();
    expect(pushes.map((p) => p.action)).toEqual(["skipped"]);
    expect(w.notionWrites()).toHaveLength(0);

    await expectQuiescent(w);
    // The pre-adoption local title does not resurrect.
    expect(w.db.tickets.get(ticket.id)?.title).toBe("Renamed in Notion");
    expect(page.title).toBe("Renamed in Notion");
  });
});
