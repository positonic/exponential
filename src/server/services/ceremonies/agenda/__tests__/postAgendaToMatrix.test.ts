import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";

const listMatrixServers = vi.hoisted(() => vi.fn());
const getMatrixClientForServer = vi.hoisted(() => vi.fn());
const report = vi.hoisted(() => vi.fn());
vi.mock("~/server/services/matrix/matrixServer", () => ({ listMatrixServers, getMatrixClientForServer }));
vi.mock("~/server/utils/reportHandledErrorServer", () => ({ reportHandledErrorServer: report }));

import { buildAgendaTransactionId, postAgendaToMatrix, renderAgendaMarkdown } from "../postAgendaToMatrix";

const agenda = { version: 1, generatedAt: "x", narrative: "## Blockers\n- Fix login", sections: [{ key: "blk", type: "blockers", title: "Blockers", items: [{ id: "i", sectionKey: "blk", title: "Fix login", refType: "action", refId: "a", order: 0 }] }] };
const occurrence = {
  id: "occ-1",
  scheduledStart: new Date("2026-09-11T07:00:00Z"),
  agenda,
  ceremony: { id: "cer-1", name: "Daily Standup", timezone: "Europe/Berlin", matrixRoomId: "!room:syntro.fi", workspaceId: "ws-1", workspace: { slug: "ws" } },
};

describe("postAgendaToMatrix", () => {
  beforeEach(() => {
    listMatrixServers.mockReset();
    getMatrixClientForServer.mockReset();
    report.mockReset();
  });

  it("renders the narrative with a link, sends with an identity-derived txn id and stamps the post in the snapshot", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findUnique.mockResolvedValue(occurrence as never);
    db.ceremonyOccurrence.update.mockResolvedValue({} as never);
    listMatrixServers.mockResolvedValue([{ id: "srv-1" }]);
    const send = vi.fn(async () => ({ eventId: "$evt1" }));
    const client = { joinedRooms: async () => ["!room:syntro.fi"], send };

    const res = await postAgendaToMatrix(db, { occurrenceId: "occ-1", actorUserId: "u-1", client, appUrl: "https://app.test" });

    expect(res).toEqual({ kind: "posted", roomId: "!room:syntro.fi", eventId: "$evt1" });
    const [roomId, body] = send.mock.calls[0] as unknown as [string, { html: string; text: string; txnId: string }];
    expect(roomId).toBe("!room:syntro.fi");
    expect(body.txnId).toBe(buildAgendaTransactionId("occ-1", "!room:syntro.fi", 0));
    expect(body.text).toContain("Fix login");
    expect(body.text).toContain("https://app.test/w/ws/ceremonies/cer-1/occ-1");
    const data = db.ceremonyOccurrence.update.mock.calls[0]![0].data as { agenda: { matrixPosts: Array<{ roomId: string; serverId: string; eventId: string }> } };
    expect(data.agenda.matrixPosts).toEqual([expect.objectContaining({ roomId: "!room:syntro.fi", serverId: "srv-1", eventId: "$evt1" })]);
  });

  it("refuses a second copy unless confirmed, then uses the next attempt number", async () => {
    const db = mockDeep<PrismaClient>();
    const posted = { ...occurrence, agenda: { ...agenda, matrixPosts: [{ roomId: "!room:syntro.fi", serverId: "srv-1", eventId: "$e", postedAt: "2026-09-10T00:00:00Z", postedById: null }] } };
    db.ceremonyOccurrence.findUnique.mockResolvedValue(posted as never);
    db.ceremonyOccurrence.update.mockResolvedValue({} as never);
    listMatrixServers.mockResolvedValue([{ id: "srv-1" }]);
    const send = vi.fn(async () => ({ eventId: "$evt2" }));
    const client = { joinedRooms: async () => [], send };

    expect(await postAgendaToMatrix(db, { occurrenceId: "occ-1", actorUserId: null, client })).toEqual({ kind: "already-posted", roomId: "!room:syntro.fi", postedAt: "2026-09-10T00:00:00Z" });
    expect(send).not.toHaveBeenCalled();
    const again = await postAgendaToMatrix(db, { occurrenceId: "occ-1", actorUserId: null, client, confirmRepost: true });
    expect(again.kind).toBe("posted");
    expect((send.mock.calls[0] as unknown as [string, { txnId: string }])[1].txnId).toBe(buildAgendaTransactionId("occ-1", "!room:syntro.fi", 1));
  });

  it("reports outcomes it cannot act on: no room, no agenda, no server, a rejected send", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findUnique.mockResolvedValueOnce({ ...occurrence, ceremony: { ...occurrence.ceremony, matrixRoomId: null } } as never);
    expect(await postAgendaToMatrix(db, { occurrenceId: "occ-1", actorUserId: null })).toEqual({ kind: "no-room" });
    db.ceremonyOccurrence.findUnique.mockResolvedValueOnce({ ...occurrence, agenda: null } as never);
    expect(await postAgendaToMatrix(db, { occurrenceId: "occ-1", actorUserId: null })).toEqual({ kind: "no-agenda" });
    db.ceremonyOccurrence.findUnique.mockResolvedValue(occurrence as never);
    listMatrixServers.mockResolvedValue([]);
    expect((await postAgendaToMatrix(db, { occurrenceId: "occ-1", actorUserId: null })).kind).toBe("no-server");
    listMatrixServers.mockResolvedValue([{ id: "srv-1" }]);
    const client = { joinedRooms: async () => [], send: vi.fn(async () => { throw new Error("M_FORBIDDEN"); }) };
    const failed = await postAgendaToMatrix(db, { occurrenceId: "occ-1", actorUserId: null, client });
    expect(failed).toEqual({ kind: "failed", reason: "M_FORBIDDEN" });
    expect(report).toHaveBeenCalled();
    expect(db.ceremonyOccurrence.update).not.toHaveBeenCalled();
  });

  it("renders a structured listing when there is no narrative", () => {
    const md = renderAgendaMarkdown({ ceremonyName: "Retro", when: "Fri", agenda: { ...agenda, narrative: null }, url: "u" });
    expect(md).toContain("## Blockers");
    expect(md).toContain("- Fix login");
    expect(md).toContain("Open in Exponential: u");
  });
});
