/**
 * The Matrix poster: wraps the registered-server client, forwards the deterministic
 * transaction id and the mentions, and refuses a binding without a server.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { createMatrixRoomPoster } from "~/server/services/outboundPosts/posters/matrix";

const LINK = {
  id: "link-1",
  provider: "matrix",
  externalId: "!leadership:example.org",
  displayName: null,
  workspaceId: "ws-1",
  projectId: null,
  isActive: true,
  direction: "outbound",
  kind: "decision",
  serverIntegrationId: "int-1",
  createdById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MESSAGE = { html: "<b>x</b>", text: "x", markdown: "**x**", mentions: ["@james:example.org"] };

let db: DeepMockProxy<PrismaClient>;
let send: ReturnType<typeof vi.fn>;
let clientFor: ReturnType<typeof vi.fn>;

beforeEach(() => {
  db = mockDeep<PrismaClient>();
  mockReset(db);
  send = vi.fn().mockResolvedValue({ eventId: "$evt" });
  clientFor = vi.fn().mockResolvedValue({ send });
});

describe("MatrixRoomPoster", () => {
  it("builds the client for the binding's server and sends with txnId and mentions", async () => {
    const poster = createMatrixRoomPoster(db, { clientFor });

    await expect(
      poster.send({ link: LINK, workspaceId: "ws-1" }, MESSAGE, { txnId: "expo-post-p1-0" }),
    ).resolves.toEqual({ eventId: "$evt" });

    expect(clientFor).toHaveBeenCalledWith("int-1", "ws-1");
    expect(send).toHaveBeenCalledWith("!leadership:example.org", {
      html: "<b>x</b>",
      text: "x",
      txnId: "expo-post-p1-0",
      mentions: ["@james:example.org"],
    });
  });

  it("refuses a binding with no server rather than guessing one", async () => {
    const poster = createMatrixRoomPoster(db, { clientFor });

    await expect(
      poster.send({ link: { ...LINK, serverIntegrationId: null }, workspaceId: "ws-1" }, MESSAGE, { txnId: "t" }),
    ).rejects.toThrow(/no Matrix server/);
    expect(clientFor).not.toHaveBeenCalled();
  });

  it("resolves mentions through the gateway pairing mappings", async () => {
    db.integration.findFirst.mockResolvedValue({ id: "gw" } as never);
    db.integrationUserMapping.findMany.mockResolvedValue([
      { userId: "user-1", externalUserId: "@james:example.org" },
    ] as never);
    const poster = createMatrixRoomPoster(db, { clientFor });

    const map = await poster.lookupMentions!(db, ["user-1", "user-2"]);

    expect(map.get("user-1")).toBe("@james:example.org");
    expect(map.has("user-2")).toBe(false);
    expect(db.integrationUserMapping.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { integrationId: "gw", userId: { in: ["user-1", "user-2"] } } }),
    );
  });

  it("returns no mentions when the gateway integration is absent", async () => {
    db.integration.findFirst.mockResolvedValue(null as never);
    const poster = createMatrixRoomPoster(db, { clientFor });

    await expect(poster.lookupMentions!(db, ["user-1"])).resolves.toEqual(new Map());
    expect(db.integrationUserMapping.findMany).not.toHaveBeenCalled();
  });
});
