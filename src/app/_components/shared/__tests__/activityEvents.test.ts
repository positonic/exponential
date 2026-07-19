import { describe, it, expect } from "vitest";
import {
  groupFieldUpdates,
  formatFieldList,
  type RawEntityEvent,
} from "../activityEvents";

const MINUTE = 60 * 1000;
const BASE = new Date("2026-07-16T10:00:00Z").getTime();

function event(partial: Partial<RawEntityEvent> & { id: string }): RawEntityEvent {
  return {
    action: "updated",
    createdAt: new Date(BASE),
    actorId: "user-1",
    actorName: "Andreas",
    metadata: {},
    ...partial,
  };
}

describe("groupFieldUpdates", () => {
  it("merges consecutive same-actor field updates within the window", () => {
    const result = groupFieldUpdates([
      event({ id: "a", metadata: { fieldsChanged: ["priority"] } }),
      event({
        id: "b",
        createdAt: new Date(BASE + 2 * MINUTE),
        metadata: { fieldsChanged: ["points"] },
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("b"); // keeps the session's last event
    expect(result[0]!.metadata.fieldsChanged).toEqual(["priority", "points"]);
  });

  it("dedupes repeated fields within a session", () => {
    const result = groupFieldUpdates([
      event({ id: "a", metadata: { fieldsChanged: ["priority"] } }),
      event({
        id: "b",
        createdAt: new Date(BASE + MINUTE),
        metadata: { fieldsChanged: ["priority", "assigneeId"] },
      }),
    ]);
    expect(result[0]!.metadata.fieldsChanged).toEqual(["priority", "assigneeId"]);
  });

  it("does not merge across the 5-minute window", () => {
    const result = groupFieldUpdates([
      event({ id: "a", metadata: { fieldsChanged: ["priority"] } }),
      event({
        id: "b",
        createdAt: new Date(BASE + 6 * MINUTE),
        metadata: { fieldsChanged: ["points"] },
      }),
    ]);
    expect(result).toHaveLength(2);
  });

  it("does not merge different actors", () => {
    const result = groupFieldUpdates([
      event({ id: "a", metadata: { fieldsChanged: ["priority"] } }),
      event({
        id: "b",
        actorId: "user-2",
        createdAt: new Date(BASE + MINUTE),
        metadata: { fieldsChanged: ["points"] },
      }),
    ]);
    expect(result).toHaveLength(2);
  });

  it("status changes break a group and are never merged", () => {
    const result = groupFieldUpdates([
      event({ id: "a", metadata: { fieldsChanged: ["priority"] } }),
      event({
        id: "s",
        action: "status_changed",
        createdAt: new Date(BASE + MINUTE),
        metadata: { from: "BACKLOG", to: "QA" },
      }),
      event({
        id: "b",
        createdAt: new Date(BASE + 2 * MINUTE),
        metadata: { fieldsChanged: ["points"] },
      }),
    ]);
    expect(result.map((e) => e.id)).toEqual(["a", "s", "b"]);
  });

  it("does not merge bulk edits with hand edits", () => {
    const result = groupFieldUpdates([
      event({ id: "a", metadata: { fieldsChanged: ["priority"] } }),
      event({
        id: "b",
        createdAt: new Date(BASE + MINUTE),
        metadata: { fieldsChanged: ["points"], bulk: true },
      }),
    ]);
    expect(result).toHaveLength(2);
  });
});

describe("formatFieldList", () => {
  it("formats zero, one, two, and many fields", () => {
    expect(formatFieldList([])).toBe("details");
    expect(formatFieldList(["priority"])).toBe("priority");
    expect(formatFieldList(["priority", "effort"])).toBe("priority and effort");
    expect(formatFieldList(["priority", "effort", "DRI"])).toBe(
      "priority, effort and DRI",
    );
  });
});
