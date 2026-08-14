/**
 * Webhook-trigger tests: only default-branch pushes touching enrolled
 * adrPaths enqueue a run; everything else is a no-op. Mocked Prisma +
 * injected fake runner — no network, no DB.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import {
  pushTouchesAdrPaths,
  triggerAdrSyncFromPush,
  type PushEventLike,
} from "../webhookTrigger";

const db = mockDeep<PrismaClient>() as DeepMockProxy<PrismaClient>;

function push(overrides?: Partial<PushEventLike>): PushEventLike {
  return {
    ref: "refs/heads/main",
    repository: { full_name: "acme/api", default_branch: "main" },
    commits: [{ added: ["docs/adr/0009-new-decision.md"], modified: [], removed: [] }],
    ...overrides,
  };
}

describe("pushTouchesAdrPaths", () => {
  it("matches a default-branch push adding a file under an enrolled dir", () => {
    expect(pushTouchesAdrPaths(push(), ["docs/adr"])).toBe(true);
  });

  it("matches modified and removed files too", () => {
    expect(
      pushTouchesAdrPaths(
        push({ commits: [{ modified: ["docs/adr/0001-x.md"] }] }),
        ["docs/adr"],
      ),
    ).toBe(true);
    expect(
      pushTouchesAdrPaths(
        push({ commits: [{ removed: ["docs/adr/0001-x.md"] }] }),
        ["docs/adr"],
      ),
    ).toBe(true);
  });

  it("ignores pushes to non-default branches", () => {
    expect(
      pushTouchesAdrPaths(push({ ref: "refs/heads/feature-x" }), ["docs/adr"]),
    ).toBe(false);
  });

  it("ignores tag pushes and unknown default branches", () => {
    expect(pushTouchesAdrPaths(push({ ref: "refs/tags/v1" }), ["docs/adr"])).toBe(
      false,
    );
    expect(
      pushTouchesAdrPaths(
        push({ repository: { full_name: "acme/api" } }),
        ["docs/adr"],
      ),
    ).toBe(false);
  });

  it("treats a possibly-truncated payload (>=20 commits) as matching — err on the cheap side", () => {
    const commits = Array.from({ length: 20 }, () => ({
      modified: ["src/unrelated.ts"],
    }));
    expect(pushTouchesAdrPaths(push({ commits }), ["docs/adr"])).toBe(true);
  });

  it("a root enrolment matches every file, mirroring the engine's root sync", () => {
    expect(
      pushTouchesAdrPaths(push({ commits: [{ added: ["0001-x.md"] }] }), ["/"]),
    ).toBe(true);
  });

  it("ignores pushes touching only files outside enrolled dirs", () => {
    expect(
      pushTouchesAdrPaths(
        push({ commits: [{ modified: ["src/index.ts", "docs/README.md"] }] }),
        ["docs/adr"],
      ),
    ).toBe(false);
    // Prefix must be a DIRECTORY prefix — "docs/adr-notes.md" is not under docs/adr.
    expect(
      pushTouchesAdrPaths(push({ commits: [{ added: ["docs/adr-notes.md"] }] }), [
        "docs/adr",
      ]),
    ).toBe(false);
  });
});

describe("triggerAdrSyncFromPush", () => {
  beforeEach(() => {
    mockReset(db);
  });

  it("runs a sync for each matching enrolment of the pushed repo", async () => {
    db.adrSyncConfig.findMany.mockResolvedValue([
      { id: "cfg1", adrPaths: ["docs/adr"] },
      { id: "cfg2", adrPaths: ["decisions"] }, // other workspace, other dir
    ] as never);
    const runSync = vi.fn().mockResolvedValue({ status: "success" });

    const result = await triggerAdrSyncFromPush(db, push(), { runSync });

    expect(runSync).toHaveBeenCalledTimes(1);
    expect(runSync).toHaveBeenCalledWith(db, "cfg1", "webhook", expect.anything());
    expect(result.triggered).toEqual([{ configId: "cfg1", status: "success" }]);
    // Disconnected configs are never triggered.
    expect(db.adrSyncConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          enabled: true,
          integrationId: { not: null },
          repository: { fullName: "acme/api" },
        }),
      }),
    );
  });

  it("does nothing for a push that touches no enrolled dir", async () => {
    db.adrSyncConfig.findMany.mockResolvedValue([
      { id: "cfg1", adrPaths: ["docs/adr"] },
    ] as never);
    const runSync = vi.fn();

    const result = await triggerAdrSyncFromPush(
      db,
      push({ commits: [{ modified: ["src/app.ts"] }] }),
      { runSync },
    );

    expect(runSync).not.toHaveBeenCalled();
    expect(result.triggered).toEqual([]);
  });

  it("skips a config whose run is already in flight (two pushes seconds apart)", async () => {
    db.adrSyncConfig.findMany.mockResolvedValue([
      { id: "cfg1", adrPaths: ["docs/adr"] },
    ] as never);
    db.adrSyncRun.findFirst.mockResolvedValue({ id: "run-live" } as never);
    const runSync = vi.fn();

    const result = await triggerAdrSyncFromPush(db, push(), { runSync });

    expect(runSync).not.toHaveBeenCalled();
    expect(result.triggered).toEqual([
      { configId: "cfg1", status: "skipped-running" },
    ]);
  });

  it("one enrolment's failure doesn't block another workspace's", async () => {
    db.adrSyncConfig.findMany.mockResolvedValue([
      { id: "cfg-bad", adrPaths: ["docs/adr"] },
      { id: "cfg-good", adrPaths: ["docs/adr"] },
    ] as never);
    const runSync = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ status: "success" });

    const result = await triggerAdrSyncFromPush(db, push(), { runSync });

    expect(result.triggered).toEqual([
      { configId: "cfg-bad", status: "error" },
      { configId: "cfg-good", status: "success" },
    ]);
  });
});
