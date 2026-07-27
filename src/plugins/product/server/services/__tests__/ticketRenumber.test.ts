/**
 * Unit tests for the pure {@link allocateTicketNumbers} renumber allocator
 * (ADR-0027). The contract is external behavior: assigned numbers/shortIds must
 * be unique and disjoint from the destination's used set, so no
 * `@@unique([productId, number])` / `([productId, shortId])` violation is
 * possible after a move.
 */

import { describe, it, expect } from "vitest";
import { allocateTicketNumbers } from "../ticketRenumber";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `t-${i}`);

describe("allocateTicketNumbers", () => {
  it("numbers start clean against an empty destination", () => {
    const { assignments, nextTicketCounter } = allocateTicketNumbers({
      ticketIds: ids(3),
      ticketCounter: 0,
      usedNumbers: [],
      funTicketIds: false,
      usedShortIds: [],
    });
    expect(assignments.map((a) => a.number)).toEqual([1, 2, 3]);
    expect(nextTicketCounter).toBe(3);
    expect(assignments.every((a) => a.shortId === null)).toBe(true);
  });

  it("allocates above a dense used-number set with no collisions", () => {
    const used = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const { assignments } = allocateTicketNumbers({
      ticketIds: ids(3),
      ticketCounter: 10,
      usedNumbers: used,
      funTicketIds: false,
      usedShortIds: [],
    });
    const assigned = assignments.map((a) => a.number);
    expect(assigned).toEqual([11, 12, 13]);
    expect(assigned.some((n) => used.includes(n))).toBe(false);
  });

  it("stays above the max even with interleaved gaps (does not backfill)", () => {
    const used = [1, 3, 5];
    const { assignments } = allocateTicketNumbers({
      ticketIds: ids(2),
      ticketCounter: 5,
      usedNumbers: used,
      funTicketIds: false,
      usedShortIds: [],
    });
    const assigned = assignments.map((a) => a.number);
    expect(assigned).toEqual([6, 7]);
    expect(new Set([...assigned, ...used]).size).toBe(assigned.length + used.length);
  });

  it("allocates N tickets larger than any gap, all unique and disjoint", () => {
    const used = [2, 4, 6];
    const { assignments, nextTicketCounter } = allocateTicketNumbers({
      ticketIds: ids(10),
      ticketCounter: 6,
      usedNumbers: used,
      funTicketIds: false,
      usedShortIds: [],
    });
    const assigned = assignments.map((a) => a.number);
    expect(assigned).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    expect(new Set(assigned).size).toBe(assigned.length); // unique
    expect(assigned.some((n) => used.includes(n))).toBe(false); // disjoint
    expect(nextTicketCounter).toBe(16);
  });

  it("guards against a counter that lags behind the real max number", () => {
    // Defensive: if ticketCounter is stale, allocation still clears used max.
    const { assignments } = allocateTicketNumbers({
      ticketIds: ids(1),
      ticketCounter: 2,
      usedNumbers: [99],
      funTicketIds: false,
      usedShortIds: [],
    });
    expect(assignments[0]!.number).toBe(100);
  });

  it("issues fun shortIds disjoint from used and from each other", () => {
    let seq = 0;
    const deterministic = (taken: Set<string>) => {
      let candidate = `gen-${seq++}`;
      while (taken.has(candidate)) candidate = `gen-${seq++}`;
      return candidate;
    };
    const { assignments } = allocateTicketNumbers({
      ticketIds: ids(4),
      ticketCounter: 0,
      usedNumbers: [],
      funTicketIds: true,
      usedShortIds: ["gen-0", "gen-1"], // force the generator past collisions
      generateShortId: deterministic,
    });
    const shortIds = assignments.map((a) => a.shortId);
    expect(shortIds.every((s) => s !== null)).toBe(true);
    expect(new Set(shortIds).size).toBe(shortIds.length); // unique among batch
    expect(shortIds).not.toContain("gen-0");
    expect(shortIds).not.toContain("gen-1");
  });
});
