/**
 * Unit tests for `assertFeaturesLinkable` — the feature side of a
 * Meeting→Feature link. Mocked Prisma; the membership resolver is mocked so
 * each test controls access directly.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { assertFeaturesLinkable } from "../meetingFeatures";
import { getWorkspaceMembership } from "~/server/services/access";

vi.mock("~/server/services/access", () => ({
  getWorkspaceMembership: vi.fn(),
}));

const db = mockDeep<PrismaClient>();
const USER = "user-1";

beforeEach(() => {
  mockReset(db);
  vi.mocked(getWorkspaceMembership).mockReset();
});

describe("assertFeaturesLinkable", () => {
  it("is a no-op for an empty list, even without a workspace", async () => {
    await expect(
      assertFeaturesLinkable(db, USER, { workspaceId: null, featureIds: [] }),
    ).resolves.toBeUndefined();
    expect(getWorkspaceMembership).not.toHaveBeenCalled();
  });

  it("rejects linking features to a workspace-less meeting", async () => {
    await expect(
      assertFeaturesLinkable(db, USER, { workspaceId: null, featureIds: ["f1"] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a caller who isn't a member of the workspace", async () => {
    vi.mocked(getWorkspaceMembership).mockResolvedValue(null);
    await expect(
      assertFeaturesLinkable(db, USER, { workspaceId: "ws-A", featureIds: ["f1"] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a feature from another workspace", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getWorkspaceMembership).mockResolvedValue({ role: "member" } as any);
    db.feature.count.mockResolvedValue(1);
    await expect(
      assertFeaturesLinkable(db, USER, { workspaceId: "ws-A", featureIds: ["f1", "f2"] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.feature.count).toHaveBeenCalledWith({
      where: { id: { in: ["f1", "f2"] }, product: { workspaceId: "ws-A" } },
    });
  });

  it("accepts in-workspace features, counting duplicates once", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getWorkspaceMembership).mockResolvedValue({ role: "viewer" } as any);
    db.feature.count.mockResolvedValue(1);
    await expect(
      assertFeaturesLinkable(db, USER, { workspaceId: "ws-A", featureIds: ["f1", "f1"] }),
    ).resolves.toBeUndefined();
  });
});
