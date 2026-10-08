/**
 * Overwrite mode ("Exponential is the source of truth") on the action push.
 *
 * It used to trash every page in the target database that wasn't linked to
 * one of the pushing user's actions, which includes every page anyone else
 * wrote there (ADR-0066). It now only overwrites pages it is linked to.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { SyncEngine } from "../SyncEngine";
import type { ExternalItem, IIntegrationService, PushConfig } from "../types";

const db = mockDeep<PrismaClient>() as DeepMockProxy<PrismaClient>;

const LINKED_PAGE = "linked-page";
const UNRELATED_PAGE = "someone-elses-page";

function externalItem(id: string): ExternalItem {
  return {
    id,
    title: id,
    lastEditedTime: new Date("2026-10-01T00:00:00Z"),
    createdTime: new Date("2026-10-01T00:00:00Z"),
  };
}

function fakeService() {
  return {
    testConnection: vi.fn(),
    getDatabases: vi.fn(),
    getDatabaseSchema: vi.fn(),
    // The database holds the linked page AND a page nobody here owns.
    getItems: vi.fn(() =>
      Promise.resolve([externalItem(LINKED_PAGE), externalItem(UNRELATED_PAGE)]),
    ),
    createItem: vi.fn(),
    updateItem: vi.fn((id: string) => Promise.resolve(externalItem(id))),
    parseToAction: vi.fn(),
    formatFromAction: vi.fn(() => ({ title: "Linked action" })),
  } satisfies IIntegrationService;
}

const CONFIG: PushConfig = {
  direction: "push",
  workflowId: "wf1",
  userId: "u1",
  databaseId: "db1",
  propertyMappings: {},
  conflictResolution: "local_wins",
  deletionBehavior: "archive",
  overwriteMode: true,
};

beforeEach(() => {
  mockReset(db);
  const sync = {
    id: "sync1",
    actionId: "a1",
    provider: "notion",
    externalId: LINKED_PAGE,
    status: "synced",
  };
  db.action.findMany.mockResolvedValue([
    { id: "a1", name: "Linked action", syncs: [sync], project: null },
  ] as never);
  db.actionSync.findFirst.mockResolvedValue(sync as never);
  db.actionSync.update.mockResolvedValue(sync as never);
});

describe("SyncEngine.push — overwrite mode", () => {
  it("overwrites the linked page and leaves every other page alone", async () => {
    const service = fakeService();
    const engine = new SyncEngine({ userId: "u1", db }, service, "notion");

    const result = await engine.push(CONFIG);

    expect(result.success).toBe(true);
    expect(service.updateItem).toHaveBeenCalledTimes(1);
    expect(service.updateItem).toHaveBeenCalledWith(LINKED_PAGE, expect.anything());
    expect(service.createItem).not.toHaveBeenCalled();
    expect(result.itemsUpdated).toBe(1);
    expect(result.itemsDeleted).toBe(0);
  });
});
