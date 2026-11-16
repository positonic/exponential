/**
 * A ticket assignment rides the Assignment category (one preference row with
 * action assignments): the new assignee is told which ticket, by whom, with a
 * link into its product. Only someone who can read the ticket (a member of
 * its product's workspace) is ever sent its title.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { resolveRecipients } from "../recipients";
import { buildContent } from "../content";
import { filterRecipientsByAccess } from "../access";
import { NOTIFICATION_CATEGORIES } from "../constants";

const db = mockDeep<PrismaClient>();

const input = {
  category: NOTIFICATION_CATEGORIES.ASSIGNMENT,
  actorUserId: "errol",
  subject: { ticketId: "t1", assignedUserIds: ["james"] },
  db,
};

const TICKET = {
  id: "t1",
  number: 42,
  title: "invalid x-api-key",
  product: {
    slug: "exponential",
    workspace: { id: "ws1", slug: "acme", name: "Acme" },
  },
};

describe("ticket assignment notifications", () => {
  beforeEach(() => mockReset(db));

  it("recipients: the users just assigned, once each", async () => {
    expect(
      await resolveRecipients({
        ...input,
        subject: { ticketId: "t1", assignedUserIds: ["james", "james"] },
      }),
    ).toEqual(["james"]);
  });

  it("content: names the assigner and the ticket, links into the product, keyed per ticket and recipient", async () => {
    db.ticket.findUnique.mockResolvedValue(TICKET as never);
    db.user.findUnique.mockResolvedValue({ name: "Errol", email: "errol@bots.test" } as never);

    expect(await buildContent(input, "james")).toEqual({
      category: "assignment",
      title: "Errol assigned you a ticket",
      message: "#42 invalid x-api-key",
      deeplink: "/w/acme/products/exponential/tickets/42",
      metadata: {
        ticketId: "t1",
        workspaceId: "ws1",
        workspaceSlug: "acme",
        workspaceName: "Acme",
        assignerName: "Errol",
      },
      workspaceId: "ws1",
      dedupeKey: "assignment:ticket:t1:james",
    });
    // The action lookup is not consulted for a ticket.
    expect(db.action.findUnique).not.toHaveBeenCalled();
  });

  it("content: nothing when the ticket is gone", async () => {
    db.ticket.findUnique.mockResolvedValue(null as never);
    db.user.findUnique.mockResolvedValue(null as never);

    expect(await buildContent(input, "james")).toBeNull();
  });

  it("access: keeps only members of the ticket's workspace, directly or through a team", async () => {
    db.ticket.findUnique.mockResolvedValue({ product: { workspaceId: "ws1" } } as never);
    db.workspaceUser.findMany.mockResolvedValue([{ userId: "james" }] as never);
    db.teamUser.findMany.mockResolvedValue([{ userId: "andi" }] as never);

    expect(
      await filterRecipientsByAccess(input, ["james", "outsider", "andi"]),
    ).toEqual(["james", "andi"]);
    expect(db.workspaceUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "ws1", userId: { in: ["james", "outsider", "andi"] } },
      }),
    );
  });

  it("access: nobody when the ticket is gone", async () => {
    db.ticket.findUnique.mockResolvedValue(null as never);

    expect(await filterRecipientsByAccess(input, ["james"])).toEqual([]);
  });
});
