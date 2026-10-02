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
  db.crmCommunication.create.mockResolvedValue({} as never);
});

describe("email channel", () => {
  it("emails each List member the approved body once, logged against the update", async () => {
    db.crmCommunication.findMany.mockResolvedValue([{ contactId: "c2" }] as never);

    const result = await channel()(update);

    expect(result.status).toBe("done");
    // c2 already got this update, c3 has no address.
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
      expect.objectContaining({ where: expect.objectContaining({ sourceType: UPDATE_EMAIL_SOURCE, sourceId: "upd-1", status: "SENT" }) }),
    );
    expect(db.crmCommunication.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ contactId: "c1", status: "SENT", sourceType: UPDATE_EMAIL_SOURCE, sourceId: "upd-1" }),
    });
  });

  it("reports failed (for the retry sweep) when any recipient failed, logging the failure", async () => {
    send.mockRejectedValueOnce(new Error("mailbox full"));

    const result = await channel()(update);

    expect(result.status).toBe("failed");
    expect(result.detail).toContain("failed 1");
    expect(db.crmCommunication.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ contactId: "c1", status: "FAILED", errorMessage: "mailbox full" }),
    });
  });

  it("is skipped without a newsletter List, and links nowhere when the workspace is private", async () => {
    expect((await channel()({ ...update, config: { isPublic: false, newsletterCollectionId: null } })).status).toBe("skipped");

    await channel()({ ...update, config: { isPublic: false, newsletterCollectionId: "list-1" } });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ webUrl: null }));
  });
});
