import { beforeEach, describe, expect, it } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { settleDraftReviewNotification } from "../settleDraftReviewNotification";

describe("settleDraftReviewNotification", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
  });

  it("leaves the notification alone while the meeting still has drafts", async () => {
    db.decision.count.mockResolvedValue(2);

    await settleDraftReviewNotification(db, "m1");

    expect(db.decision.count).toHaveBeenCalledWith({
      where: { transcriptionSessionId: "m1", reviewState: "DRAFT" },
    });
    expect(db.notification.updateMany).not.toHaveBeenCalled();
  });

  it("marks that meeting's unread draft-review notification read once none are left", async () => {
    db.decision.count.mockResolvedValue(0);

    await settleDraftReviewNotification(db, "m1");

    expect(db.notification.updateMany).toHaveBeenCalledWith({
      where: {
        category: "meeting_ready",
        // The draft variant's key — never the plain "notes ready" one.
        dedupeKey: { startsWith: "meeting_ready:decisions:m1:" },
        readAt: null,
      },
      data: { readAt: expect.any(Date) },
    });
  });
});
