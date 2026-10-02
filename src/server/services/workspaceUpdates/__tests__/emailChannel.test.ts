import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep, mockReset } from "vitest-mock-extended";

const resolveMembers = vi.hoisted(() => vi.fn());
vi.mock("~/server/services/collections/CollectionService", () => ({
  CollectionService: class {
    resolveMembers = resolveMembers;
  },
}));
vi.mock("~/server/services/collections/createMemberTypeRegistry", () => ({ createMemberTypeRegistry: vi.fn() }));
vi.mock("~/server/services/crm/crmUnsubscribeToken", () => ({
  buildUnsubscribeUrl: (id: string) => `https://app.test/unsub/${id}`,
}));
vi.mock("~/server/utils/encryption", () => ({ encryptString: (s: string) => Buffer.from(s) }));
vi.mock("~/server/services/EmailService", () => ({ EmailService: {} }));

import { createEmailChannel, UPDATE_EMAIL_SOURCE } from "../emailChannel";
import type { ApprovedUpdate } from "../distribute";

const db = mockDeep<PrismaClient>();
const send = vi.fn();
const update: ApprovedUpdate = {
  id: "upd-1",
  workspaceId: "ws-1",
  workspaceSlug: "acme",
  workspaceName: "Acme",
  title: "Bulk edit lands",
  body: "# Bulk edit lands\n\nEdit many tickets at once.",
  approvedById: "owner-1",
  config: { isPublic: true, newsletterCollectionId: "list-1" },
};
const channel = () =>
  createEmailChannel(db, { send, renderHtml: (md) => `<p>${md}</p>`, baseUrl: "https://app.test" });

beforeEach(() => {
  mockReset(db);
  send.mockReset().mockImplementation((p: { subject: string }) =>
    Promise.resolve({ subject: p.subject, htmlBody: "<html/>", textBody: "text" }),
  );
  resolveMembers.mockReset().mockResolvedValue([
    { memberId: "c1", email: "ada@example.com", mergeVars: { firstName: "Ada" } },
    { memberId: "c2", email: "bo@example.com", mergeVars: {} },
    { memberId: "c3", email: null, mergeVars: {} },
  ]);
  db.crmCommunication.findMany.mockResolvedValue([]);
  db.crmCommunication.create.mockResolvedValue({ id: "comm-1" } as never);
  db.crmCommunication.update.mockResolvedValue({} as never);
});

describe("email channel", () => {
  it("emails each List member the approved body once, logged against the update", async () => {
    db.crmCommunication.findMany.mockResolvedValue([{ contactId: "c2" }] as never);

    const result = await channel()(update);

    expect(result.status).toBe("done");
    // c2 already got (or may have got) this update, c3 has no address.
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ada@example.com",
        subject: "Bulk edit lands",
        bodyHtml: "<p>Edit many tickets at once.</p>",
        bodyText: "Edit many tickets at once.",
        greetingName: "Ada",
        unsubscribeUrl: "https://app.test/unsub/c1",
        webUrl: "https://app.test/updates/acme/upd-1",
      }),
    );
    expect(db.crmCommunication.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ sourceType: UPDATE_EMAIL_SOURCE, sourceId: "upd-1", status: { in: ["SENT", "QUEUED"] } }) }),
    );
    // Recorded as QUEUED before the send, then SENT after it.
    expect(db.crmCommunication.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ contactId: "c1", status: "QUEUED", sourceType: UPDATE_EMAIL_SOURCE, sourceId: "upd-1" }),
      select: { id: true },
    });
    expect(db.crmCommunication.create.mock.invocationCallOrder[0]!).toBeLessThan(send.mock.invocationCallOrder[0]!);
    expect(db.crmCommunication.update).toHaveBeenCalledWith({
      where: { id: "comm-1" },
      data: expect.objectContaining({ status: "SENT", sentAt: expect.any(Date), htmlContent: "<html/>" }),
    });
  });

  it("counts a send whose SENT record failed as sent, leaving it QUEUED so it is never resent", async () => {
    resolveMembers.mockResolvedValue([{ memberId: "c1", email: "ada@example.com", mergeVars: {} }]);
    db.crmCommunication.update.mockRejectedValueOnce(new Error("db blip"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await channel()(update);

    expect(result.status).toBe("done");
    expect(send).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("does not send when the QUEUED record cannot be written", async () => {
    resolveMembers.mockResolvedValue([{ memberId: "c1", email: "ada@example.com", mergeVars: {} }]);
    db.crmCommunication.create.mockRejectedValueOnce(new Error("db down"));

    const result = await channel()(update);

    expect(result.status).toBe("failed");
    expect(send).not.toHaveBeenCalled();
  });

  it("reports failed (for the retry sweep) when any recipient failed, logging the failure", async () => {
    send.mockRejectedValueOnce(new Error("mailbox full"));

    const result = await channel()(update);

    expect(result.status).toBe("failed");
    expect(result.detail).toContain("failed 1");
    expect(db.crmCommunication.update).toHaveBeenCalledWith({
      where: { id: "comm-1" },
      data: { status: "FAILED", errorMessage: "mailbox full" },
    });
  });

  it("is skipped without a newsletter List, and links nowhere when the workspace is private", async () => {
    expect((await channel()({ ...update, config: { isPublic: false, newsletterCollectionId: null } })).status).toBe("skipped");

    await channel()({ ...update, config: { isPublic: false, newsletterCollectionId: "list-1" } });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ webUrl: null }));
  });
});
