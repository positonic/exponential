/**
 * The person-resolution rules shared by recorded-Meeting Participants and
 * Scheduled-meeting Attendees, one test per branch (moved out of the
 * transcription router, so these pin that the extraction preserved them).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.mock("~/server/utils/encryption", () => ({
  encryptString: (value: string) => Buffer.from(`enc:${value}`),
  decryptBufferSafe: (value: Buffer | null) => (value ? value.toString().replace(/^enc:/, "") : null),
}));

import { resolvePerson } from "../resolvePerson";

const WORKSPACE_ID = "ws-1";
const ACTOR_ID = "user-actor";

describe("resolvePerson", () => {
  const tx: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

  beforeEach(() => {
    mockReset(tx);
  });

  const resolve = (person: Parameters<typeof resolvePerson>[1]["person"], memberIds?: Set<string>) =>
    resolvePerson(tx, { workspaceId: WORKSPACE_ID, actorId: ACTOR_ID, person, memberIds });

  it("member: verifies membership and returns the user's email and name", async () => {
    tx.workspaceUser.findFirst.mockResolvedValue({ id: "wu-1" } as never);
    tx.user.findUnique.mockResolvedValue({ id: "user-a", name: "Andi", email: "andi@example.com" } as never);

    await expect(resolve({ userId: "user-a" })).resolves.toEqual({
      userId: "user-a",
      contactId: null,
      email: "andi@example.com",
      name: "Andi",
    });
    expect(tx.workspaceUser.findFirst).toHaveBeenCalledWith({ where: { userId: "user-a", workspaceId: WORKSPACE_ID } });
  });

  it("member: refuses a non-member, by WorkspaceUser row or by the roster passed in", async () => {
    tx.workspaceUser.findFirst.mockResolvedValue(null as never);
    await expect(resolve({ userId: "user-x" })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(resolve({ userId: "user-x" }, new Set(["user-a"]))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(tx.user.findUnique).not.toHaveBeenCalled();
  });

  it("member: a roster member through a team needs no WorkspaceUser row", async () => {
    tx.user.findUnique.mockResolvedValue({ id: "user-t", name: "Tee", email: "tee@example.com" } as never);
    await expect(resolve({ userId: "user-t" }, new Set(["user-t"]))).resolves.toMatchObject({ userId: "user-t" });
    expect(tx.workspaceUser.findFirst).not.toHaveBeenCalled();
  });

  it("contact with an email: links it and uses the email on file", async () => {
    tx.crmContact.findUnique.mockResolvedValue({
      id: "contact-1",
      workspaceId: WORKSPACE_ID,
      firstName: "Zineb",
      lastName: "K",
      email: Buffer.from("enc:zineb@example.com"),
    } as never);

    await expect(resolve({ contactId: "contact-1", email: "other@example.com" })).resolves.toEqual({
      userId: null,
      contactId: "contact-1",
      email: "zineb@example.com",
      name: "Zineb K",
    });
    expect(tx.crmContact.update).not.toHaveBeenCalled();
  });

  it("contact in another workspace is refused", async () => {
    tx.crmContact.findUnique.mockResolvedValue({ id: "contact-1", workspaceId: "ws-other" } as never);
    await expect(resolve({ contactId: "contact-1" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("contact without an email: captures the supplied one and writes it back", async () => {
    tx.crmContact.findUnique
      .mockResolvedValueOnce({ id: "contact-1", workspaceId: WORKSPACE_ID, firstName: "Sam", lastName: null, email: null } as never)
      .mockResolvedValueOnce(null as never);

    await expect(resolve({ contactId: "contact-1", email: "sam@example.com" })).resolves.toEqual({
      userId: null,
      contactId: "contact-1",
      email: "sam@example.com",
      name: "Sam",
    });
    expect(tx.crmContact.update).toHaveBeenCalledWith({
      where: { id: "contact-1" },
      data: { email: Buffer.from("enc:sam@example.com"), emailHash: expect.any(String) as unknown },
    });
  });

  it("contact without an email: refuses an email another contact owns", async () => {
    tx.crmContact.findUnique
      .mockResolvedValueOnce({ id: "contact-1", workspaceId: WORKSPACE_ID, firstName: "Sam", lastName: null, email: null } as never)
      .mockResolvedValueOnce({ id: "contact-2" } as never);

    await expect(resolve({ contactId: "contact-1", email: "taken@example.com" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "That email already belongs to another contact",
    });
    expect(tx.crmContact.update).not.toHaveBeenCalled();
  });

  it("free text with an email: creates a MANUAL contact when none has that email", async () => {
    tx.crmContact.findUnique.mockResolvedValue(null as never);
    tx.crmContact.create.mockResolvedValue({ id: "contact-new", firstName: "Ada", lastName: "Lovelace" } as never);

    await expect(resolve({ name: "Ada Lovelace", email: "ada@example.com" })).resolves.toEqual({
      userId: null,
      contactId: "contact-new",
      email: "ada@example.com",
      name: "Ada Lovelace",
    });
    expect(tx.crmContact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          createdById: ACTOR_ID,
          firstName: "Ada",
          lastName: "Lovelace",
          importSource: "MANUAL",
        }) as unknown,
      }),
    );
  });

  it("free text with a known email: links the existing contact and takes its name", async () => {
    tx.crmContact.findUnique.mockResolvedValue({ id: "contact-1", firstName: "Grace", lastName: "Hopper" } as never);

    await expect(resolve({ email: "grace@example.com" })).resolves.toEqual({
      userId: null,
      contactId: "contact-1",
      email: "grace@example.com",
      name: "Grace Hopper",
    });
    expect(tx.crmContact.create).not.toHaveBeenCalled();
  });

  it("free text, name only: resolves to no email and writes nothing", async () => {
    await expect(resolve({ name: "Someone" })).resolves.toEqual({
      userId: null,
      contactId: null,
      email: null,
      name: "Someone",
    });
    expect(tx.crmContact.findUnique).not.toHaveBeenCalled();
  });
});
