/**
 * Unit tests for the pure cycle-matching helper. `wouldCreateCycle` hits the
 * DB (covered by ticket integration tests); `matchCycle` is pure and gets the
 * bulk of the edge-case coverage here — it's what turns a human "cycle 10"
 * into a real cycle id for the agent read tools.
 */
import { describe, it, expect } from "vitest";
import { matchCycle, type MatchableCycle } from "../ticketDependencies";

const cycles: MatchableCycle[] = [
  { id: "c1", name: "Cycle 9", slug: "cycle-9" },
  { id: "c10", name: "Cycle 10", slug: "cycle-10" },
  { id: "cx", name: "Hardening Sprint", slug: "hardening-sprint" },
];

describe("matchCycle", () => {
  it("matches an exact cycle id", () => {
    expect(matchCycle(cycles, "c10")?.id).toBe("c10");
  });

  it("matches an exact slug case-insensitively", () => {
    expect(matchCycle(cycles, "Cycle-10")?.id).toBe("c10");
  });

  it("matches the full name case-insensitively", () => {
    expect(matchCycle(cycles, "cycle 10")?.id).toBe("c10");
  });

  it('matches a bare number ("10" → "Cycle 10")', () => {
    expect(matchCycle(cycles, "10")?.id).toBe("c10");
  });

  it('matches "cycle 10" against "Cycle 10" without exact-name reliance', () => {
    // Even if name formatting varied, the number path resolves it.
    expect(matchCycle([{ id: "z", name: "Cycle  10", slug: "s" }], "cycle 10")?.id).toBe("z");
  });

  it("does not confuse 9 and 10 (no substring bleed)", () => {
    expect(matchCycle(cycles, "9")?.id).toBe("c1");
    expect(matchCycle(cycles, "cycle 9")?.id).toBe("c1");
  });

  it("matches a non-numeric named cycle by name", () => {
    expect(matchCycle(cycles, "Hardening Sprint")?.id).toBe("cx");
  });

  it("returns undefined for an unknown reference", () => {
    expect(matchCycle(cycles, "Cycle 42")).toBeUndefined();
    expect(matchCycle(cycles, "42")).toBeUndefined();
    expect(matchCycle(cycles, "nonsense")).toBeUndefined();
  });

  it("returns undefined for an empty/whitespace query", () => {
    expect(matchCycle(cycles, "")).toBeUndefined();
    expect(matchCycle(cycles, "   ")).toBeUndefined();
  });

  it("prefers an id/slug match over the number heuristic", () => {
    // A cycle whose *name* number is 10 but whose slug someone queries directly.
    const list: MatchableCycle[] = [
      { id: "a", name: "Cycle 10", slug: "cycle-10" },
      { id: "b", name: "Cycle 3", slug: "10" }, // pathological slug
    ];
    // "10" is an exact slug of b → slug wins over the "Cycle 10" number match.
    expect(matchCycle(list, "10")?.id).toBe("b");
  });
});
