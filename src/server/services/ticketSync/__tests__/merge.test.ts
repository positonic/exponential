import { describe, expect, it } from "vitest";
import {
  mergeSyncedFields,
  type MergeInput,
  type SyncedFields,
} from "../merge";

const T0 = new Date("2026-07-01T10:00:00Z");
const T1 = new Date("2026-07-01T11:00:00Z");

function fields(overrides: Partial<SyncedFields> = {}): SyncedFields {
  return {
    title: "Wire the widget",
    status: "BACKLOG",
    priority: 2,
    type: "FEATURE",
    points: 3,
    labels: ["FROM-NOTION"],
    cycleName: "Cycle 11",
    assigneeEmail: "dev@example.com",
    ...overrides,
  };
}

function merge(input: Partial<MergeInput>): ReturnType<typeof mergeSyncedFields> {
  return mergeSyncedFields({
    base: fields(),
    local: fields(),
    remote: fields(),
    localEditedAt: T0,
    remoteEditedAt: T0,
    ...input,
  });
}

describe("mergeSyncedFields", () => {
  it("does nothing when nothing changed", () => {
    const result = merge({});
    expect(result.applyToLocal).toEqual({});
    expect(result.applyToRemote).toEqual({});
    expect(result.conflicts).toEqual([]);
    expect(result.snapshot).toEqual(fields());
  });

  it("propagates a remote-only change to local", () => {
    const result = merge({ remote: fields({ status: "IN_PROGRESS" }) });
    expect(result.applyToLocal).toEqual({ status: "IN_PROGRESS" });
    expect(result.applyToRemote).toEqual({});
    expect(result.conflicts).toEqual([]);
    expect(result.snapshot.status).toBe("IN_PROGRESS");
  });

  it("propagates a local-only change to remote", () => {
    const result = merge({ local: fields({ priority: 0 }) });
    expect(result.applyToRemote).toEqual({ priority: 0 });
    expect(result.applyToLocal).toEqual({});
    expect(result.conflicts).toEqual([]);
    expect(result.snapshot.priority).toBe(0);
  });

  it("keeps both sides when different fields changed on each side", () => {
    const result = merge({
      local: fields({ priority: 0 }),
      remote: fields({ status: "QA" }),
    });
    expect(result.applyToLocal).toEqual({ status: "QA" });
    expect(result.applyToRemote).toEqual({ priority: 0 });
    expect(result.conflicts).toEqual([]);
    expect(result.snapshot.status).toBe("QA");
    expect(result.snapshot.priority).toBe(0);
  });

  it("treats a two-sided change to the same value as converged", () => {
    const result = merge({
      local: fields({ status: "DONE" }),
      remote: fields({ status: "DONE" }),
    });
    expect(result.applyToLocal).toEqual({});
    expect(result.applyToRemote).toEqual({});
    expect(result.conflicts).toEqual([]);
    expect(result.snapshot.status).toBe("DONE");
  });

  it("resolves a same-field conflict last-write-wins (local newer)", () => {
    const result = merge({
      local: fields({ title: "Local title" }),
      remote: fields({ title: "Remote title" }),
      localEditedAt: T1,
      remoteEditedAt: T0,
    });
    expect(result.applyToRemote).toEqual({ title: "Local title" });
    expect(result.applyToLocal).toEqual({});
    expect(result.conflicts).toEqual([
      {
        field: "title",
        winner: "local",
        localValue: "Local title",
        remoteValue: "Remote title",
      },
    ]);
    expect(result.snapshot.title).toBe("Local title");
  });

  it("resolves a same-field conflict last-write-wins (remote newer)", () => {
    const result = merge({
      local: fields({ title: "Local title" }),
      remote: fields({ title: "Remote title" }),
      localEditedAt: T0,
      remoteEditedAt: T1,
    });
    expect(result.applyToLocal).toEqual({ title: "Remote title" });
    expect(result.applyToRemote).toEqual({});
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.winner).toBe("remote");
    expect(result.snapshot.title).toBe("Remote title");
  });

  it("with no snapshot, treats every difference as a conflict resolved by LWW", () => {
    const result = merge({
      base: null,
      local: fields({ status: "IN_PROGRESS", priority: 1 }),
      remote: fields({ status: "QA", priority: 1 }),
      localEditedAt: T0,
      remoteEditedAt: T1,
    });
    expect(result.conflicts).toEqual([
      {
        field: "status",
        winner: "remote",
        localValue: "IN_PROGRESS",
        remoteValue: "QA",
      },
    ]);
    expect(result.applyToLocal).toEqual({ status: "QA" });
    expect(result.applyToRemote).toEqual({});
    expect(result.snapshot.status).toBe("QA");
    expect(result.snapshot.priority).toBe(1);
  });

  it("compares labels order-insensitively (no-op echo)", () => {
    const result = merge({
      local: fields({ labels: ["b", "a"] }),
      remote: fields({ labels: ["a", "b"] }),
    });
    expect(result.applyToLocal).toEqual({});
    expect(result.applyToRemote).toEqual({});
    expect(result.conflicts).toEqual([]);
  });

  it("treats null and undefined base values as equal (no phantom writes)", () => {
    const base = fields({ cycleName: null, assigneeEmail: null });
    const result = merge({
      base: { ...base, cycleName: undefined },
      local: fields({ cycleName: null, assigneeEmail: null }),
      remote: fields({ cycleName: null, assigneeEmail: null }),
    });
    expect(result.applyToLocal).toEqual({});
    expect(result.applyToRemote).toEqual({});
  });

  it("syncs label changes like any other field", () => {
    const result = merge({
      remote: fields({ labels: ["FROM-NOTION", "urgent"] }),
    });
    expect(result.applyToLocal).toEqual({ labels: ["FROM-NOTION", "urgent"] });
    expect(result.snapshot.labels).toEqual(["FROM-NOTION", "urgent"]);
  });

  it("returns a snapshot equal to both sides after the writes are applied", () => {
    const local = fields({ priority: 0, title: "Local title" });
    const remote = fields({ status: "QA", title: "Remote title" });
    const result = merge({
      local,
      remote,
      localEditedAt: T1,
      remoteEditedAt: T0,
    });
    const localAfter = { ...local, ...result.applyToLocal };
    const remoteAfter = { ...remote, ...result.applyToRemote };
    expect(localAfter).toEqual(result.snapshot);
    expect(remoteAfter).toEqual(result.snapshot);
  });
});
