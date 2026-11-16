/**
 * `notifyTicketAssigned` decides whether a ticket write changed hands. Only a
 * write that sets a *new* assignee notifies; the emit pipeline (mocked here)
 * owns the rest, including skipping the actor.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.mock("~/server/services/notifications/emit/emitNotification", () => ({
  emitNotification: vi.fn(() => Promise.resolve([])),
}));

import { emitNotification } from "~/server/services/notifications/emit/emitNotification";
import { notifyTicketAssigned } from "../notifyTicketAssigned";

const db = mockDeep<PrismaClient>();

beforeEach(() => vi.clearAllMocks());

describe("notifyTicketAssigned", () => {
  it("emits an Assignment for the new assignee, attributed to the actor", async () => {
    await notifyTicketAssigned(db, {
      ticketId: "t1",
      assigneeId: "james",
      previousAssigneeId: "andi",
      actorUserId: "errol",
    });

    expect(emitNotification).toHaveBeenCalledTimes(1);
    expect(emitNotification).toHaveBeenCalledWith({
      db,
      category: "assignment",
      actorUserId: "errol",
      subject: { ticketId: "t1", assignedUserIds: ["james"] },
    });
  });

  it("emits for a ticket created with an assignee", async () => {
    await notifyTicketAssigned(db, {
      ticketId: "t1",
      assigneeId: "james",
      previousAssigneeId: null,
      actorUserId: "andi",
    });

    expect(emitNotification).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["the write did not touch the assignee", undefined, "andi"],
    ["the assignee was cleared", null, "andi"],
    ["the same person was re-sent", "james", "james"],
  ])("stays quiet when %s", async (_label, assigneeId, previousAssigneeId) => {
    await notifyTicketAssigned(db, {
      ticketId: "t1",
      assigneeId,
      previousAssigneeId,
      actorUserId: "andi",
    });

    expect(emitNotification).not.toHaveBeenCalled();
  });
});
