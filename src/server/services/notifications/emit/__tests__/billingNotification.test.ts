/**
 * The billing notification category: when a workspace's own Anthropic key
 * stops working, the people who can replace it (its owners and admins) are
 * told which key, what it means for the Assistant, and where to fix it. The
 * notification names the key by its last four characters and nothing more.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { resolveRecipients } from "../recipients";
import { buildContent } from "../content";
import { NOTIFICATION_CATEGORIES, CATEGORY_LIST, DEFAULT_MATRIX } from "../constants";

const db = mockDeep<PrismaClient>();
const OCCURRED_AT = new Date("2026-11-15T10:00:00.000Z");

const input = {
  category: NOTIFICATION_CATEGORIES.BILLING,
  actorUserId: null,
  subject: {
    workspaceId: "ws-1",
    event: "model_key_failing" as const,
    keyLast4: "7Q4x",
    occurredAt: OCCURRED_AT,
  },
  db,
};

describe("billing notifications", () => {
  beforeEach(() => mockReset(db));

  it("is registered: in the category list with push and email on, opt-in channels off", () => {
    expect(CATEGORY_LIST).toContain("billing");
    expect(DEFAULT_MATRIX.billing).toEqual({
      push: true,
      email: true,
      matrix: false,
      whatsapp: false,
      zulip: false,
    });
  });

  it("recipients: the workspace's owners and admins who are people", async () => {
    db.workspaceUser.findMany.mockResolvedValue([{ userId: "owner-1" }, { userId: "admin-1" }] as never);

    expect(await resolveRecipients(input)).toEqual(["owner-1", "admin-1"]);
    expect(db.workspaceUser.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "ws-1",
        role: { in: ["owner", "admin"] },
        user: { isAgent: false },
      },
      select: { userId: true },
    });
  });

  it("content: names the workspace and the key's last four characters, and links to the Billing tab", async () => {
    db.workspace.findUnique.mockResolvedValue({ slug: "acme", name: "Acme" } as never);

    const content = await buildContent(input, "owner-1");

    expect(content).toMatchObject({
      category: "billing",
      title: "The Anthropic key for Acme stopped working",
      message: expect.stringContaining("the key ending in 7Q4x"),
      deeplink: "/w/acme/settings?section=billing",
      workspaceId: "ws-1",
      dedupeKey: "billing:model_key_failing:ws-1:2026-11-15T10:00:00.000Z:owner-1",
    });
    expect(content?.message).toContain("back on the monthly allowance");
  });

  it("content: one failure is one notification per person, and a later failure is a new one", async () => {
    db.workspace.findUnique.mockResolvedValue({ slug: "acme", name: "Acme" } as never);

    const first = await buildContent(input, "owner-1");
    const again = await buildContent(input, "owner-1");
    const later = await buildContent(
      { ...input, subject: { ...input.subject, occurredAt: new Date("2026-12-01T08:00:00.000Z") } },
      "owner-1",
    );

    expect(again?.dedupeKey).toBe(first?.dedupeKey);
    expect(later?.dedupeKey).not.toBe(first?.dedupeKey);
  });

  it("content: nothing for a workspace that no longer exists", async () => {
    db.workspace.findUnique.mockResolvedValue(null);

    expect(await buildContent(input, "owner-1")).toBeNull();
  });
});
