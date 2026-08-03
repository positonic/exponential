/**
 * Property / model-based convergence test for the two-way Notion ticket sync.
 *
 * The hand-written scenarios in roundTrip.test.ts prove specific two-way
 * properties (quiescence, echo suppression, no ping-pong) on fixed sequences.
 * This test generalizes them: for each of many SEEDED runs it generates a
 * random sequence of ~20 operations drawn from
 *   { editTicketLocally, editAsHuman, pull, pushAll }
 * across 2-3 seeded synced tickets, then drives pull+push cycles until quiet
 * and asserts the emergent invariants:
 *
 *   1. Convergence  — ticket and page hold identical values for every synced
 *      scalar field (title/status/priority/type/points), the page's raw value
 *      mapped back through the harness raw-value tables.
 *   2. Termination  — the exchange goes quiet within a small bounded number of
 *      pull+push cycles (no ping-pong).
 *   3. No invented data — every final field value was either written by some
 *      operation in the log or is the seeded value; nothing is conjured.
 *   4. Ledger sanity — once quiet, a further cycle reports zero created/updated
 *      and performs zero writes on either side.
 *
 * Everything is driven by a seeded mulberry32 PRNG (no new dependency — fast-check
 * is not in package.json and none was added), so a failure is exactly
 * reproducible: the thrown error carries the seed AND the full operation
 * sequence, and the seed alone re-runs the identical scenario.
 *
 * ── A REAL CONVERGENCE DEFECT THIS TEST FOUND (fixed: smoky.wolf) ────────────
 * Originally ~18% of random sequences did NOT converge, all via one mechanism:
 * a human edit to field B of a Notion page that was still pending (unpulled)
 * when an outbound push wrote a DIFFERENT field A to that same page flipped the
 * whole page's "last edited by" to the integration bot; the old row-level echo
 * suppression (`if (row.lastEditedByBot) skip`) then skipped the page entirely
 * and the incremental `lastPulledAt` window advanced past the human's edit — a
 * lost remote update. The engine now applies echo suppression snapshot-aware
 * (a bot-edited row is only skipped while its remote fields match the last-
 * synced base), the once-failing seeds run in the normal invariant band, and a
 * named deterministic regression test at the bottom pins the minimal case.
 *
 * The engine imports createTicketWithNumber / the tag helpers / recordActivity
 * directly (not injectable), so — like engine.test.ts and roundTrip.test.ts —
 * this file must vi.mock those three modules. createTicketWithNumber is wired to
 * REJECT: these scenarios never legitimately create a ticket from Notion (every
 * page is pre-linked), so a call means the sync invented a row — fail loudly.
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

import type { TicketStatus, TicketType } from "@prisma/client";
import { createRoundTripWorld } from "./harness/world";
import {
  POINTS_TO_RAW,
  PRIORITY_TO_RAW,
  STATUS_TO_RAW,
  TYPE_TO_RAW,
  type FakePage,
} from "./harness/fakeNotion";

recordActivityMock.mockResolvedValue(true);
createTicketMock.mockRejectedValue(
  new Error("unexpected ticket creation in a convergence property test"),
);

// ── seeded PRNG (mulberry32) — deterministic and dependency-free ─────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── the synced scalar fields under test ──────────────────────────────────────
type ScalarField = "title" | "status" | "priority" | "type" | "points";
const FIELDS: ScalarField[] = ["title", "status", "priority", "type", "points"];

// A field value in the LOCAL (ticket) representation.
type FieldValue = string | number | null;

// Value pools — restricted to what the harness raw tables support.
// ARCHIVED is deliberately excluded: it triggers the archive/tombstone flow
// (page trashed, link tombstoned), a different regime from plain scalar
// convergence, and would break the "identical scalar values" invariant by
// design. All other statuses round-trip cleanly through STATUS_TO_RAW.
const STATUSES = (Object.keys(STATUS_TO_RAW) as TicketStatus[]).filter(
  (s) => s !== "ARCHIVED",
);
const TYPES = Object.keys(TYPE_TO_RAW) as TicketType[];
const PRIORITIES: (number | null)[] = [0, 1, 2, 3, 4, null];
const POINTS: (number | null)[] = [1, 3, 5, 8, null];
const TITLES = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf"];

// ── inverse of the harness raw tables: a page's raw value → local value ──────
const RAW_TO_STATUS: Record<string, TicketStatus> = {};
for (const [status, raw] of Object.entries(STATUS_TO_RAW)) {
  RAW_TO_STATUS[raw] = status as TicketStatus;
}
const RAW_TO_TYPE: Record<string, TicketType> = {};
for (const [type, raw] of Object.entries(TYPE_TO_RAW)) {
  RAW_TO_TYPE[raw] = type as TicketType;
}
const RAW_TO_PRIORITY: Record<string, number> = {};
for (const [priority, raw] of Object.entries(PRIORITY_TO_RAW)) {
  RAW_TO_PRIORITY[raw] = Number(priority);
}
const RAW_TO_POINTS: Record<string, number> = {};
for (const [points, raw] of Object.entries(POINTS_TO_RAW)) {
  RAW_TO_POINTS[raw] = Number(points);
}

/**
 * Map a page's raw property values back to the local representation via the
 * harness raw tables. A value of `undefined` marks a raw string that is NOT a
 * known table value — i.e. the sync wrote something invented — which the
 * convergence check reports explicitly.
 */
function pageToLocal(page: FakePage): Record<ScalarField, FieldValue | undefined> {
  return {
    title: page.title,
    status: page.rawStatus === null ? undefined : RAW_TO_STATUS[page.rawStatus],
    priority:
      page.rawPriority === null ? null : RAW_TO_PRIORITY[page.rawPriority],
    type: page.rawType === null ? undefined : RAW_TO_TYPE[page.rawType],
    points: page.rawEffort === null ? null : RAW_TO_POINTS[page.rawEffort],
  };
}

function rawOf(page: FakePage, field: ScalarField): string {
  switch (field) {
    case "title":
      return page.title;
    case "status":
      return String(page.rawStatus);
    case "priority":
      return String(page.rawPriority);
    case "type":
      return String(page.rawType);
    case "points":
      return String(page.rawEffort);
  }
}

function pick<T>(arr: T[], r: number): T {
  return arr[Math.floor(r * arr.length)]!;
}

function randomValueFor(field: ScalarField, r: number): FieldValue {
  switch (field) {
    case "title":
      return pick(TITLES, r);
    case "status":
      return pick(STATUSES, r);
    case "priority":
      return pick(PRIORITIES, r);
    case "type":
      return pick(TYPES, r);
    case "points":
      return pick(POINTS, r);
  }
}

type LocalPatch = Partial<{
  title: string;
  status: TicketStatus;
  type: TicketType;
  priority: number | null;
  points: number | null;
}>;

function localPatch(field: ScalarField, value: FieldValue): LocalPatch {
  switch (field) {
    case "title":
      return { title: value as string };
    case "status":
      return { status: value as TicketStatus };
    case "priority":
      return { priority: value as number | null };
    case "type":
      return { type: value as TicketType };
    case "points":
      return { points: value as number | null };
  }
}

type HumanPatch = Partial<{
  title: string;
  rawStatus: string | null;
  rawType: string | null;
  rawPriority: string | null;
  rawEffort: string | null;
}>;

function humanPatch(field: ScalarField, value: FieldValue): HumanPatch {
  switch (field) {
    case "title":
      return { title: value as string };
    case "status":
      return { rawStatus: STATUS_TO_RAW[value as string]! };
    case "priority":
      return {
        rawPriority: value === null ? null : PRIORITY_TO_RAW[value as number]!,
      };
    case "type":
      return { rawType: TYPE_TO_RAW[value as string]! };
    case "points":
      return {
        rawEffort: value === null ? null : POINTS_TO_RAW[value as number]!,
      };
  }
}

function fmt(value: FieldValue): string {
  return value === null ? "null" : String(value);
}

interface TrackedTicket {
  id: string;
  externalId: string;
  /** Every value each field has legitimately held: seed + every edit. */
  allowed: Record<ScalarField, Set<FieldValue>>;
}

const NUM_OPS = 20;
const MAX_SETTLE_CYCLES = 8; // generous; convergence is asserted to be <= 3
const QUIET_BOUND = 3;

/**
 * Run one seeded scenario. Throws on any invariant violation, with a message
 * carrying the seed and the full operation log so the failure replays exactly.
 */
async function runScenario(seed: number): Promise<void> {
  const rnd = mulberry32(seed);
  const w = createRoundTripWorld();
  const ops: string[] = [];

  const fail = (msg: string): never => {
    throw new Error(`${msg}\n  seed=${seed}\n  ops: ${ops.join(" | ")}`);
  };
  const check = (cond: boolean, msg: string): void => {
    if (!cond) fail(msg);
  };

  // ── seed 2-3 converged synced tickets with distinct starting values ────────
  const numTickets = 2 + Math.floor(rnd() * 2);
  const tickets: TrackedTicket[] = [];
  for (let i = 0; i < numTickets; i++) {
    const seedTitle = TITLES[i % TITLES.length]!;
    const seedStatus = STATUSES[i % STATUSES.length]!;
    const seedType = TYPES[i % TYPES.length]!;
    const seedPriority = PRIORITIES[i % PRIORITIES.length]!;
    const seedPoints = POINTS[i % POINTS.length]!;
    const { ticket, page } = w.seedSyncedTicket({
      title: seedTitle,
      status: seedStatus,
      type: seedType,
      priority: seedPriority,
      points: seedPoints,
    });
    tickets.push({
      id: ticket.id,
      externalId: page.externalId,
      allowed: {
        title: new Set<FieldValue>([seedTitle]),
        status: new Set<FieldValue>([seedStatus]),
        priority: new Set<FieldValue>([seedPriority]),
        type: new Set<FieldValue>([seedType]),
        points: new Set<FieldValue>([seedPoints]),
      },
    });
  }

  // ── the random operation sequence ──────────────────────────────────────────
  for (let i = 0; i < NUM_OPS; i++) {
    const roll = rnd();
    if (roll < 0.34) {
      const t = tickets[Math.floor(rnd() * tickets.length)]!;
      const field = pick(FIELDS, rnd());
      const value = randomValueFor(field, rnd());
      w.db.editTicketLocally(t.id, localPatch(field, value));
      t.allowed[field].add(value);
      ops.push(`editLocal(${t.id}, ${field}=${fmt(value)})`);
    } else if (roll < 0.62) {
      const t = tickets[Math.floor(rnd() * tickets.length)]!;
      const field = pick(FIELDS, rnd());
      const value = randomValueFor(field, rnd());
      w.notion.editAsHuman(t.externalId, humanPatch(field, value));
      t.allowed[field].add(value);
      ops.push(`editHuman(${t.id}, ${field}=${fmt(value)})`);
    } else if (roll < 0.81) {
      await w.pull();
      ops.push("pull");
    } else {
      await w.pushAll();
      ops.push("pushAll");
    }
  }

  // ── drive pull+push cycles until quiet (bounded) ───────────────────────────
  let quietAt = -1;
  for (let cycle = 1; cycle <= MAX_SETTLE_CYCLES; cycle++) {
    w.clearWrites();
    const { pull, pushes } = await w.cycle();
    check(
      pull.failed === 0,
      `pull reported ${pull.failed} failed row(s) during settle cycle ${cycle}`,
    );
    check(
      pull.created === 0,
      `pull created ${pull.created} ticket(s) during settle cycle ${cycle} — no page should be unlinked`,
    );
    check(
      !pushes.some((p) => p.action === "failed"),
      `a push failed during settle cycle ${cycle}`,
    );
    const writes = w.ticketWrites().length + w.notionWrites().length;
    const changed = writes > 0 || pull.updated > 0 || pull.created > 0;
    if (!changed) {
      quietAt = cycle;
      break;
    }
  }

  // 2. Termination.
  check(
    quietAt !== -1,
    `never quiesced within ${MAX_SETTLE_CYCLES} cycles — possible ping-pong`,
  );
  check(
    quietAt <= QUIET_BOUND,
    `took ${quietAt} cycle(s) to quiesce (expected <= ${QUIET_BOUND})`,
  );

  // 1 + 3. Convergence and no-invented-data, per ticket, per field.
  for (const t of tickets) {
    const ticket = w.db.tickets.get(t.id);
    const page = w.notion.pages.get(t.externalId);
    check(!!ticket && !!page, `ticket or page missing for ${t.id}`);
    if (!ticket || !page) return;
    check(!page.archived, `page ${t.externalId} was archived unexpectedly`);

    const local: Record<ScalarField, FieldValue> = {
      title: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      type: ticket.type,
      points: ticket.points,
    };
    const mapped = pageToLocal(page);

    for (const field of FIELDS) {
      check(
        mapped[field] !== undefined,
        `page ${t.externalId} ${field}="${rawOf(page, field)}" is not a harness table value (invented)`,
      );
      check(
        local[field] === mapped[field],
        `field ${field} did not converge for ${t.id}: ticket=${fmt(local[field])} page=${fmt(mapped[field]!)}`,
      );
      check(
        t.allowed[field].has(local[field]),
        `field ${field} final value ${fmt(local[field])} for ${t.id} was never written by any op or seed (invented)`,
      );
    }
  }

  // 4. Ledger sanity: a further cycle is a strict no-op on both sides.
  w.clearWrites();
  const extra = await w.cycle();
  check(
    extra.pull.created === 0 && extra.pull.updated === 0,
    `post-quiet cycle still reported created=${extra.pull.created} updated=${extra.pull.updated}`,
  );
  check(
    extra.pull.failed === 0,
    `post-quiet cycle reported ${extra.pull.failed} failed row(s)`,
  );
  check(
    w.ticketWrites().length === 0,
    `post-quiet cycle wrote ${w.ticketWrites().length} ticket update(s)`,
  );
  check(
    w.notionWrites().length === 0,
    `post-quiet cycle wrote ${w.notionWrites().length} Notion update(s)`,
  );
  check(
    extra.pushes.every((p) => p.action === "skipped"),
    `post-quiet push not skipped: ${extra.pushes.map((p) => p.action).join(", ")}`,
  );
}

/**
 * All 40 seeds run the full invariant suite. Seeds 3, 6, 13, 18, 30 and 37
 * originally exposed the echo-suppression lost-update defect (smoky.wolf) and
 * were pinned as known-failing until the engine gained snapshot-aware echo
 * suppression; they are deliberately kept in the band as regression sentinels.
 */
const ALL_SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

describe("round-trip convergence (property-based)", () => {
  it.each(ALL_SEEDS)(
    "seed %i converges, terminates, and invents nothing",
    async (seed) => {
      await runScenario(seed);
    },
  );

  /**
   * REGRESSION (smoky.wolf) — deterministic minimal case for the lost-update
   * defect this suite originally found.
   *
   * A human changes field B (status) on a page; before any inbound pull applies
   * it, a local change to field A (priority) makes the next outbound push write
   * to the same page, flipping its "last edited by" to the integration bot.
   * Row-level echo suppression used to skip the whole page on the next pull and
   * the `lastPulledAt` window advanced past the human's edit — stranding it
   * forever. With snapshot-aware echo suppression the pull must detect that the
   * remote row differs from the last-synced base, apply the pending status, and
   * then go quiet.
   */
  it("REGRESSION: a remote edit still pending at push time survives the push's bot flip", async () => {
    const w = createRoundTripWorld();
    const { ticket, page } = w.seedSyncedTicket({
      status: "IN_PROGRESS",
      priority: 1,
    });

    // Remote-only human edit to status — not yet pulled.
    w.notion.editAsHuman(page.externalId, { rawStatus: STATUS_TO_RAW.DONE! });
    // Local edit to a DIFFERENT field, so the very next push writes to the page.
    w.db.editTicketLocally(ticket.id, { priority: 3 });

    const pushes = await w.pushAll();
    expect(pushes.map((p) => p.action)).toEqual(["pushed"]);
    // Only priority is pushed; the status change is remote-ahead (push is
    // outbound-only), and the write marks the whole page a bot edit.
    expect(pushes[0]?.wrote).toEqual(["priority"]);
    expect(page.lastEditedBy).toBe("bot");

    // The next pull must NOT treat the bot-edited row as a pure echo: the
    // remote status differs from the snapshot, so the pending change applies.
    const pull = await w.pull();
    expect(pull.updated).toBe(1);
    expect(w.db.tickets.get(ticket.id)?.status).toBe("DONE");
    expect(w.db.tickets.get(ticket.id)?.priority).toBe(3);
    expect(page.rawStatus).toBe(STATUS_TO_RAW.DONE);
    expect(RAW_TO_STATUS[page.rawStatus!]).toBe(
      w.db.tickets.get(ticket.id)?.status,
    );

    // And the exchange terminates: one more full cycle is a strict no-op.
    w.clearWrites();
    const cycle = await w.cycle();
    expect(cycle.pull.updated).toBe(0);
    expect(cycle.pushes.every((p) => p.action === "skipped")).toBe(true);
    expect(w.ticketWrites()).toHaveLength(0);
    expect(w.notionWrites()).toHaveLength(0);
  });
});
