import { describe, expect, it } from "vitest";
import {
  DEFAULT_STATUS_MAP,
  mapPoints,
  mapPriority,
  mapStatus,
  mapStatusToNotion,
  mapType,
  normalizeName,
  readOptionNames,
} from "../mapping";

describe("mapStatus", () => {
  it("maps known names via the default map", () => {
    expect(mapStatus("In Progress").status).toBe("IN_PROGRESS");
    expect(mapStatus("Doing").status).toBe("IN_PROGRESS");
    expect(mapStatus("QA-ready").status).toBe("QA");
    expect(mapStatus("Shipped").status).toBe("DEPLOYED");
  });

  it("strips emoji and punctuation before matching", () => {
    expect(mapStatus("🚧 In Progress").status).toBe("IN_PROGRESS");
  });

  it("passes exact enum names through", () => {
    expect(mapStatus("READY_TO_PLAN").status).toBe("READY_TO_PLAN");
    expect(mapStatus("needs-refinement").status).toBe("NEEDS_REFINEMENT");
  });

  it("falls back to BACKLOG with a warning for unmapped names", () => {
    const result = mapStatus("Someday Maybe");
    expect(result.status).toBe("BACKLOG");
    expect(result.warning).toContain("Someday Maybe");
  });

  it("maps null to BACKLOG without a warning", () => {
    expect(mapStatus(null)).toEqual({ status: "BACKLOG" });
  });

  it("lets a per-sync map override and extend the defaults", () => {
    const custom = { "someday maybe": "ARCHIVED", "Done": "QA" } as const;
    expect(mapStatus("Someday Maybe", custom).status).toBe("ARCHIVED");
    // Override: "done" now means QA for this sync.
    expect(mapStatus("Done", custom).status).toBe("QA");
    // Defaults still apply for everything else.
    expect(mapStatus("Blocked", custom).status).toBe("BLOCKED");
  });

  it("normalizes custom map keys", () => {
    const custom = { "  Wont-Fix!! ": "ARCHIVED" } as const;
    expect(mapStatus("wont fix", custom).status).toBe("ARCHIVED");
  });
});

describe("mapStatusToNotion (sticky collapse)", () => {
  const options = ["Backlog", "In Progress", "Done"];

  it("returns null when the current Notion option already maps to the status", () => {
    // QA and DONE both collapse to Notion "Done" — moving QA→DONE must not
    // touch Notion when the page already shows an option meaning DONE... but
    // here "Done" maps to DONE, so writing DONE is a no-op:
    expect(
      mapStatusToNotion("DONE", {
        currentRemoteRaw: "Done",
        availableOptions: options,
      }),
    ).toBeNull();
  });

  it("returns null when several local statuses collapse onto the current option", () => {
    const map = { "done": "DONE" } as const;
    // Ticket moved QA → DEPLOYED; this DB has no option meaning DEPLOYED, so
    // there is nothing meaningful to write — skip rather than guess.
    expect(
      mapStatusToNotion("DEPLOYED", {
        statusMap: map,
        currentRemoteRaw: "Done",
        availableOptions: options,
      }),
    ).toBeNull();
  });

  it("picks the database's real option (exact casing) when a write is needed", () => {
    expect(
      mapStatusToNotion("IN_PROGRESS", {
        currentRemoteRaw: "Backlog",
        availableOptions: options,
      }),
    ).toBe("In Progress");
  });

  it("skips the write when no option in the database maps to the status", () => {
    expect(
      mapStatusToNotion("QA", {
        currentRemoteRaw: "Backlog",
        availableOptions: ["Backlog", "Doing"],
      }),
    ).toBeNull();
  });

  it("falls back to a map key when no option list is available", () => {
    expect(
      mapStatusToNotion("BLOCKED", { currentRemoteRaw: "Backlog" }),
    ).toBe("blocked");
  });

  it("writes when the current option maps to a different status", () => {
    expect(
      mapStatusToNotion("DONE", {
        currentRemoteRaw: "In Progress",
        availableOptions: options,
      }),
    ).toBe("Done");
  });
});

describe("mapPriority", () => {
  it.each([
    ["1 - High", 1],
    ["P2", 2],
    ["0 - Critical", 0],
    ["4", 4],
  ])("maps %s to %i", (raw, expected) => {
    expect(mapPriority(raw)).toBe(expected);
  });

  it("returns undefined for out-of-range or non-numeric values", () => {
    expect(mapPriority("9 - Whatever")).toBeUndefined();
    expect(mapPriority("High")).toBeUndefined();
    expect(mapPriority(null)).toBeUndefined();
    // Multi-digit tokens must read as the whole number, not the first digit.
    expect(mapPriority("P10")).toBeUndefined();
    expect(mapPriority("10 - Critical")).toBeUndefined();
  });
});

describe("mapPoints", () => {
  it.each([
    ["L (5pts)", 5],
    ["3 pts", 3],
    ["M (2.5pts)", 2.5],
  ])("maps %s to %d", (raw, expected) => {
    expect(mapPoints(raw)).toBe(expected);
  });

  it("returns undefined when no pts marker is present", () => {
    expect(mapPoints("Large")).toBeUndefined();
    expect(mapPoints(null)).toBeUndefined();
  });
});

describe("mapType", () => {
  it.each([
    ["🐞 Bug", "BUG"],
    ["Spike", "SPIKE"],
    ["research task", "RESEARCH"],
    ["Chore", "CHORE"],
    ["improvement", "IMPROVEMENT"],
    ["Ticket", "FEATURE"],
    ["Story", "FEATURE"],
    [null, "FEATURE"],
  ])("maps %s to %s", (raw, expected) => {
    expect(mapType(raw)).toBe(expected);
  });
});

describe("readOptionNames", () => {
  it("reads select, status, and multi_select properties", () => {
    expect(
      readOptionNames({ Status: { type: "status", status: { name: "Done" } } }, "Status"),
    ).toEqual(["Done"]);
    expect(
      readOptionNames({ Priority: { type: "select", select: { name: "1 - High" } } }, "Priority"),
    ).toEqual(["1 - High"]);
    expect(
      readOptionNames(
        { Label: { type: "multi_select", multi_select: [{ name: "a" }, { name: "b" }] } },
        "Label",
      ),
    ).toEqual(["a", "b"]);
  });

  it("returns empty for missing or empty properties", () => {
    expect(readOptionNames({}, "Status")).toEqual([]);
    expect(
      readOptionNames({ Status: { type: "status", status: null } }, "Status"),
    ).toEqual([]);
  });
});

describe("normalizeName / DEFAULT_STATUS_MAP invariants", () => {
  it("all default map keys are already normalized", () => {
    for (const key of Object.keys(DEFAULT_STATUS_MAP)) {
      expect(normalizeName(key)).toBe(key);
    }
  });
});
