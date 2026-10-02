import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep, mockReset } from "vitest-mock-extended";

const resolveMatrixDestination = vi.hoisted(() => vi.fn());
vi.mock("~/server/services/matrix/resolveMatrixDestination", () => ({ resolveMatrixDestination }));

import { createMatrixChannel, renderRoomMessage } from "../matrixChannel";
import type { ApprovedUpdate } from "../distribute";

const db = mockDeep<PrismaClient>();
const send = vi.fn();
const clientFor = vi.fn().mockResolvedValue({ send });
const update: ApprovedUpdate = {
  id: "upd-1",
  workspaceId: "ws-1",
  workspaceSlug: "acme",
  workspaceName: "Acme",
  title: "Bulk <edit> lands",
  body: "# Bulk edit lands\n\nEdit many tickets at once.",
  approvedById: "owner-1",
  config: { isPublic: true, newsletterCollectionId: null },
};
const renderHtml = (md: string) => `<p>${md}</p>`;
const channel = () => createMatrixChannel(db, { renderHtml, baseUrl: "https://app.test", clientFor });

beforeEach(() => {
  mockReset(db);
  send.mockReset().mockResolvedValue({ eventId: "$evt" });
  clientFor.mockClear();
  resolveMatrixDestination.mockReset();
});

describe("matrix channel", () => {
  it("posts the approved update to the workspace's team room with a stable transaction id", async () => {
    resolveMatrixDestination.mockResolvedValue({
      kind: "room",
      link: { externalId: "!team:matrix.org", serverIntegrationId: "srv-1" },
    });

    const result = await channel()(update);

    expect(result).toMatchObject({ status: "done", detail: "posted $evt" });
    expect(resolveMatrixDestination).toHaveBeenCalledWith(db, { projectId: null, workspaceId: "ws-1" });
    expect(clientFor).toHaveBeenCalledWith("srv-1", "ws-1");
    const [roomId, message] = send.mock.calls[0]!;
    expect(roomId).toBe("!team:matrix.org");
    expect(message.txnId).toBe("expo-update-upd-1-teammatrixorg-0");
    expect(message.html).toContain("<strong>Acme update: Bulk &lt;edit&gt; lands</strong>");
    expect(message.html).toContain("<p>Edit many tickets at once.</p>");
    expect(message.html).toContain('href="https://app.test/updates/acme/upd-1"');
  });

  it("is skipped when the workspace has no team room", async () => {
    resolveMatrixDestination.mockResolvedValue({ kind: "none" });
    expect((await channel()(update)).status).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
  });

  it("lets a send error propagate so the distributor records it as failed", async () => {
    resolveMatrixDestination.mockResolvedValue({ kind: "room", link: { externalId: "!r:x", serverIntegrationId: "srv-1" } });
    send.mockRejectedValue(new Error("room is encrypted"));
    await expect(channel()(update)).rejects.toThrow("room is encrypted");
  });

  it("leaves out the web link for a private workspace", () => {
    const msg = renderRoomMessage({ ...update, config: { isPublic: false, newsletterCollectionId: null } }, renderHtml, null);
    expect(msg.html).not.toContain("Read on the web");
    expect(msg.text).toBe("Acme update: Bulk <edit> lands\n\nEdit many tickets at once.");
  });
});
