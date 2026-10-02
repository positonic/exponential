import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep, mockReset } from "vitest-mock-extended";

const { createContact, addMembers, dispatch } = vi.hoisted(() => ({
  createContact: vi.fn(),
  addMembers: vi.fn(),
  dispatch: vi.fn(),
}));
vi.mock("~/server/services/crm/createCrmContact", () => ({ createCrmContact: createContact }));
vi.mock("~/server/services/collections/CollectionService", () => ({
  CollectionService: class {
    addMembers = addMembers;
  },
}));
vi.mock("~/server/services/collections/createMemberTypeRegistry", () => ({ createMemberTypeRegistry: vi.fn() }));
vi.mock("~/server/services/crm/automation/dispatchListMemberAddedAutomations", () => ({
  dispatchListMemberAddedAutomations: dispatch,
}));

import {
  confirmSubscription,
  previewSubscription,
  requestSubscription,
  UPDATE_SIGNUP_SOURCE,
} from "../subscribe";
import { signSubscribeToken, verifySubscribeToken } from "../subscribeToken";

const db = mockDeep<PrismaClient>();
const originalSecret = process.env.AUTH_SECRET;
beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret";
});
afterAll(() => {
  process.env.AUTH_SECRET = originalSecret;
});

function workspace(config: { isPublic: boolean; newsletterCollectionId: string | null } | null) {
  return { id: "ws-1", name: "Acme", slug: "acme", updateConfig: config };
}

beforeEach(() => {
  mockReset(db);
  createContact.mockReset().mockResolvedValue({ contactId: "c1", created: true, fired: false });
  addMembers.mockReset().mockResolvedValue({ count: 1, addedMemberIds: ["c1"] });
  dispatch.mockReset().mockResolvedValue({ firedDefinitionIds: [] });
  db.collection.findFirst.mockResolvedValue({ id: "list-1" } as never);
  db.crmContact.updateMany.mockResolvedValue({ count: 0 });
  db.crmContact.findUnique.mockResolvedValue({ emailOptedOutAt: null } as never);
});

describe("requestSubscription", () => {
  it("emails a signed confirmation link and stores nothing", async () => {
    db.workspace.findUnique.mockResolvedValue(workspace({ isPublic: true, newsletterCollectionId: "list-1" }) as never);
    const sendConfirmation = vi.fn().mockResolvedValue(undefined);

    const result = await requestSubscription(
      db,
      { workspaceSlug: "acme", email: "ada@example.com" },
      { sendConfirmation, baseUrl: "https://app.test" },
    );

    expect(result).toEqual({ kind: "sent" });
    const sent = sendConfirmation.mock.calls[0]![0] as { to: string; confirmUrl: string; workspaceName: string };
    expect(sent).toMatchObject({ to: "ada@example.com", workspaceName: "Acme", workspaceId: "ws-1" });
    const url = new URL(sent.confirmUrl);
    expect(url.origin + url.pathname).toBe("https://app.test/updates/acme/confirm");
    expect(verifySubscribeToken(url.searchParams.get("token")!)).toMatchObject({
      workspaceId: "ws-1",
      email: "ada@example.com",
    });
    expect(createContact).not.toHaveBeenCalled();
    expect(addMembers).not.toHaveBeenCalled();
  });

  it("is unavailable when the configured List was deleted", async () => {
    db.workspace.findUnique.mockResolvedValue(workspace({ isPublic: true, newsletterCollectionId: "gone" }) as never);
    db.collection.findFirst.mockResolvedValue(null);
    const sendConfirmation = vi.fn();

    const result = await requestSubscription(
      db,
      { workspaceSlug: "acme", email: "ada@example.com" },
      { sendConfirmation, baseUrl: "https://app.test" },
    );

    expect(result).toEqual({ kind: "unavailable" });
    expect(sendConfirmation).not.toHaveBeenCalled();
  });

  it.each([
    ["is not public", { isPublic: false, newsletterCollectionId: "list-1" }],
    ["has no newsletter List", { isPublic: true, newsletterCollectionId: null }],
    ["has no updates config", null],
  ])("is unavailable when the workspace %s", async (_label, config) => {
    db.workspace.findUnique.mockResolvedValue(workspace(config) as never);
    const sendConfirmation = vi.fn();

    const result = await requestSubscription(
      db,
      { workspaceSlug: "acme", email: "ada@example.com" },
      { sendConfirmation, baseUrl: "https://app.test" },
    );

    expect(result).toEqual({ kind: "unavailable" });
    expect(sendConfirmation).not.toHaveBeenCalled();
  });
});

describe("confirmSubscription", () => {
  it("adds the contact to the newsletter List and fires List automations", async () => {
    db.workspace.findUnique.mockResolvedValue(workspace({ isPublic: true, newsletterCollectionId: "list-1" }) as never);

    const result = await confirmSubscription(db, signSubscribeToken("ws-1", "ada@example.com"));

    expect(result).toEqual({ kind: "subscribed", workspaceSlug: "acme", workspaceName: "Acme", alreadySubscribed: false });
    expect(db.collection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "list-1", workspaceId: "ws-1", memberType: "crm_contact" } }),
    );
    expect(createContact).toHaveBeenCalledWith(db, {
      workspaceId: "ws-1",
      email: "ada@example.com",
      importSource: UPDATE_SIGNUP_SOURCE,
    });
    // Confirming re-consents: only an unsubscribe from before the request is lifted.
    expect(db.crmContact.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", emailOptedOutAt: { lt: expect.any(Date) } },
      data: { emailOptedOutAt: null },
    });
    expect(addMembers).toHaveBeenCalledWith("list-1", ["c1"]);
    expect(dispatch).toHaveBeenCalledWith(db, { collectionId: "list-1", workspaceId: "ws-1", addedMemberIds: ["c1"] });
  });

  it("is idempotent: confirming twice neither re-adds nor re-fires", async () => {
    db.workspace.findUnique.mockResolvedValue(workspace({ isPublic: true, newsletterCollectionId: "list-1" }) as never);
    addMembers.mockResolvedValue({ count: 0, addedMemberIds: [] });

    const result = await confirmSubscription(db, signSubscribeToken("ws-1", "ada@example.com"));

    expect(result).toMatchObject({ kind: "subscribed", alreadySubscribed: true });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("still subscribes when a List automation fails", async () => {
    db.workspace.findUnique.mockResolvedValue(workspace({ isPublic: true, newsletterCollectionId: "list-1" }) as never);
    dispatch.mockRejectedValue(new Error("engine down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await confirmSubscription(db, signSubscribeToken("ws-1", "ada@example.com"))).toMatchObject({
      kind: "subscribed",
    });
    spy.mockRestore();
  });

  it("never re-subscribes someone who unsubscribed after the link was sent", async () => {
    db.workspace.findUnique.mockResolvedValue(workspace({ isPublic: true, newsletterCollectionId: "list-1" }) as never);
    // The earlier-opt-out clear matches nothing; the later opt-out stays.
    db.crmContact.findUnique.mockResolvedValue({ emailOptedOutAt: new Date() } as never);

    const result = await confirmSubscription(db, signSubscribeToken("ws-1", "ada@example.com"));

    expect(result).toEqual({ kind: "invalid" });
    expect(addMembers).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("is closed once the public page is turned off", async () => {
    db.workspace.findUnique.mockResolvedValue(workspace({ isPublic: false, newsletterCollectionId: "list-1" }) as never);

    expect(await confirmSubscription(db, signSubscribeToken("ws-1", "ada@example.com"))).toMatchObject({
      kind: "closed",
    });
    expect(createContact).not.toHaveBeenCalled();
  });

  it("rejects an invalid token without touching contacts", async () => {
    expect(await confirmSubscription(db, "not-a-token")).toEqual({ kind: "invalid" });
    expect(createContact).not.toHaveBeenCalled();
  });

  it("is closed when the workspace no longer has a contact List", async () => {
    db.workspace.findUnique.mockResolvedValue(workspace({ isPublic: true, newsletterCollectionId: "list-1" }) as never);
    db.collection.findFirst.mockResolvedValue(null);

    expect(await confirmSubscription(db, signSubscribeToken("ws-1", "ada@example.com"))).toEqual({
      kind: "closed",
      workspaceSlug: "acme",
      workspaceName: "Acme",
    });
    expect(createContact).not.toHaveBeenCalled();
  });
});

describe("previewSubscription", () => {
  it("names the workspace and email a valid token is for", async () => {
    db.workspace.findUnique.mockResolvedValue(workspace({ isPublic: true, newsletterCollectionId: "list-1" }) as never);

    expect(await previewSubscription(db, signSubscribeToken("ws-1", "ada@example.com"))).toEqual({
      workspaceName: "Acme",
      workspaceSlug: "acme",
      email: "ada@example.com",
    });
    expect(await previewSubscription(db, "nope")).toBeNull();
  });
});
