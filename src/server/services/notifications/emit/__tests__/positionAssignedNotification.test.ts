/**
 * The position_assigned notification category (ADR-0068, Agent PRD D9): the
 * person behind each agent just made a Position holder hears about it — they
 * are accountable for what it does there — naming the Position, workspace and
 * who appointed it. Human holders are not notified by this category, and a
 * holder withdrawn before delivery notifies no one.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { resolveRecipients } from "../recipients";
import { buildContent } from "../content";
import { NOTIFICATION_CATEGORIES, CATEGORY_LIST, DEFAULT_MATRIX } from "../constants";

const db = mockDeep<PrismaClient>();

const input = {
  category: NOTIFICATION_CATEGORIES.POSITION_ASSIGNED,
  actorUserId: "admin-1",
  subject: { positionId: "pos-1", addedHolderUserIds: ["shadow-aria", "human-andi"] },
  db,
};

describe("position_assigned notifications", () => {
  beforeEach(() => mockReset(db));

  it("is registered: in the category list with push and email on, opt-in channels off", () => {
    expect(CATEGORY_LIST).toContain("position_assigned");
    expect(DEFAULT_MATRIX.position_assigned).toEqual({
      push: true,
      email: true,
      matrix: false,
      whatsapp: false,
      zulip: false,
    });
  });

  it("recipients: the owner of each newly added agent holder, once — never a human holder", async () => {
    db.externalAgent.findMany.mockResolvedValue([{ ownerId: "james" }, { ownerId: "james" }] as never);

    expect(await resolveRecipients(input)).toEqual(["james"]);
    expect(db.externalAgent.findMany).toHaveBeenCalledWith({
      where: { shadowUserId: { in: ["shadow-aria", "human-andi"] } },
      select: { ownerId: true },
    });
  });

  it("recipients: nobody when nothing was added", async () => {
    expect(
      await resolveRecipients({ ...input, subject: { positionId: "pos-1", addedHolderUserIds: [] } }),
    ).toEqual([]);
    expect(db.externalAgent.findMany).not.toHaveBeenCalled();
  });

  it("content: names the Position, workspace and appointer, links to Members, keyed by the appointment", async () => {
    db.position.findUnique.mockResolvedValue({
      title: "Chief of Staff",
      workspace: { id: "ws-1", slug: "acme", name: "Acme" },
    } as never);
    db.externalAgent.findMany.mockResolvedValue([{ name: "Aria", shadowUserId: "shadow-aria" }] as never);
    db.user.findUnique.mockResolvedValue({ name: "Andi", email: "andi@example.com" } as never);
    db.positionHolder.findMany.mockResolvedValue([{ createdAt: new Date(1_700_000_000_000) }] as never);

    const content = await buildContent(input, "james");

    expect(content).toMatchObject({
      category: "position_assigned",
      title: "Andi made Aria Chief of Staff",
      message: expect.stringContaining("In Acme."),
      deeplink: "/w/acme/settings?section=members",
      workspaceId: "ws-1",
      dedupeKey: "position_assigned:pos-1:james:1700000000000",
      metadata: { positionTitle: "Chief of Staff", appointerName: "Andi", workspaceName: "Acme" },
    });
    // Only this recipient's own agents are named.
    expect(db.externalAgent.findMany.mock.calls[0]?.[0]?.where).toEqual({
      ownerId: "james",
      shadowUserId: { in: ["shadow-aria", "human-andi"] },
    });
  });

  it("content: null when the agent was withdrawn before delivery", async () => {
    db.position.findUnique.mockResolvedValue({
      title: "Chief of Staff",
      workspace: { id: "ws-1", slug: "acme", name: "Acme" },
    } as never);
    db.externalAgent.findMany.mockResolvedValue([{ name: "Aria", shadowUserId: "shadow-aria" }] as never);
    db.user.findUnique.mockResolvedValue({ name: "Andi", email: null } as never);
    db.positionHolder.findMany.mockResolvedValue([] as never);

    expect(await buildContent(input, "james")).toBeNull();
  });
});
