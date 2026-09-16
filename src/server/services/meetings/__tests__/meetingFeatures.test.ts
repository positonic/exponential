/**
 * Unit tests for `assertFeaturesLinkable` — the feature side of a
 * Meeting→Feature link. Mocked Prisma; the membership resolver is mocked so
 * each test controls access directly.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import {
  assertFeaturesLinkable,
  dropStrandedFeatureMeetingLinks,
  dropStrandedMeetingFeatureLinks,
} from "../meetingFeatures";
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

describe("dropStrandedMeetingFeatureLinks", () => {
  it("drops links to features outside the meeting's new workspace", async () => {
    await dropStrandedMeetingFeatureLinks(db, { meetingIds: ["m1"], workspaceId: "ws-B" });
    expect(db.meetingFeature.deleteMany).toHaveBeenCalledWith({
      where: {
        transcriptionSessionId: { in: ["m1"] },
        feature: { product: { workspaceId: { not: "ws-B" } } },
      },
    });
  });

  it("drops every link when the meeting loses its workspace", async () => {
    await dropStrandedMeetingFeatureLinks(db, { meetingIds: ["m1"], workspaceId: null });
    expect(db.meetingFeature.deleteMany).toHaveBeenCalledWith({
      where: { transcriptionSessionId: { in: ["m1"] } },
    });
  });
});

describe("dropStrandedFeatureMeetingLinks", () => {
  it("drops a moved feature's links to meetings left in another workspace", async () => {
    await dropStrandedFeatureMeetingLinks(db, { featureIds: ["f1"], workspaceId: "ws-B" });
    expect(db.meetingFeature.deleteMany).toHaveBeenCalledWith({
      where: {
        feature: { id: { in: ["f1"] } },
        transcriptionSession: {
          OR: [{ workspaceId: null }, { workspaceId: { not: "ws-B" } }],
        },
      },
    });
  });

  it("scopes a product move to that product's features", async () => {
    await dropStrandedFeatureMeetingLinks(db, { productId: "p1", workspaceId: "ws-B" });
    expect(db.meetingFeature.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ feature: { productId: "p1" } }),
      }),
    );
  });
});
