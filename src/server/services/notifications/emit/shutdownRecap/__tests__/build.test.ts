import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import type { AgendaItem, SectionContext } from "~/server/services/ceremonies/agenda/types";

const sectionItems: Record<string, AgendaItem[]> = {};
const seenContexts: SectionContext[] = [];

// The server error reporter pulls in the Prisma singleton at module load.
vi.mock("~/server/utils/reportHandledErrorServer", () => ({ reportHandledErrorServer: vi.fn() }));

// The section modules are the ceremony's own queries, tested where they live.
// Here they return canned items so the recap's shaping is what is under test.
vi.mock("~/server/services/ceremonies/agenda/sections", () => ({
  getSectionModule: (type: string) => ({
    type,
    run: async (ctx: SectionContext) => {
      seenContexts.push(ctx);
      return sectionItems[type] ?? [];
    },
  }),
}));

import { buildShutdownRecap } from "../build";

const db = mockDeep<PrismaClient>();

function action(sectionKey: string, id: string, title: string, detail: string | null = null): AgendaItem {
  return { id: `${sectionKey}:action:${id}`, sectionKey, title, refType: "action", refId: id, order: 0, detail, href: `/w/me/actions/${id}` };
}

function text(sectionKey: string, id: string, title: string, detail: string | null = null): AgendaItem {
  return { id, sectionKey, title, refType: "text", refId: id, order: 0, detail };
}

const NOW = new Date("2026-10-08T16:00:00.000Z"); // Thursday, 18:00 in Berlin

beforeEach(() => {
  mockReset(db);
  for (const key of Object.keys(sectionItems)) delete sectionItems[key];
  seenContexts.length = 0;
  process.env.NEXTAUTH_URL = "https://app.test";
  db.user.findUnique.mockResolvedValue({ name: "James Farrell", defaultWorkspaceId: null } as never);
  db.workspace.findFirst.mockResolvedValue({ id: "ws-personal", slug: "me" } as never);
  db.action.findMany.mockResolvedValue([] as never);
});

describe("buildShutdownRecap", () => {
  it("runs the sections as the person's own shutdown routine in their personal workspace", async () => {
    await buildShutdownRecap(db, "u1", NOW, "Europe/Berlin");

    expect(seenContexts.length).toBe(5);
    const ctx = seenContexts[0]!;
    expect(ctx.workspaceId).toBe("ws-personal");
    expect(ctx.participantUserIds).toEqual(["u1"]);
    expect(ctx.ceremony.timezone).toBe("Europe/Berlin");
    expect(ctx.ceremony.ownerId).toBe("u1");
    expect(ctx.occurrence.scheduledStart).toEqual(NOW);
  });

  it("returns null when the user is gone", async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect(await buildShutdownRecap(db, "u1", NOW, "UTC")).toBeNull();
  });

  it("numbers left-undone then tomorrow in one sequence, five overdue at most, and folds the rest into a count", async () => {
    sectionItems.todays_actions = [
      action("left_undone", "a1", "Write the brief"),
      ...["o1", "o2", "o3", "o4", "o5", "o6", "o7"].map((id) => action("left_undone", id, `Overdue ${id}`, "overdue · due 2 Oct")),
      text("left_undone", "left_undone:text:u1:more-overdue", "4 more overdue"),
    ];
    sectionItems.tomorrow = [
      text("tomorrow", "tomorrow:text:u1:event:0", "09:30 Standup", "meeting"),
      action("tomorrow", "t1", "Ship the recap", "scheduled"),
      // Already numbered above; must not get a second number.
      action("tomorrow", "a1", "Write the brief", "due"),
    ];

    const recap = await buildShutdownRecap(db, "u1", NOW, "Europe/Berlin");

    expect(recap!.leftUndone.map((a) => [a.n, a.actionId])).toEqual([
      [1, "a1"],
      [2, "o1"],
      [3, "o2"],
      [4, "o3"],
      [5, "o4"],
      [6, "o5"],
    ]);
    expect(recap!.moreOverdue).toBe(2 + 4);
    expect(recap!.tomorrowActions.map((a) => [a.n, a.actionId])).toEqual([[7, "t1"]]);
    expect(recap!.tomorrowMeetings).toEqual(["09:30 Standup"]);
    expect(recap!.leftUndone[0]!.url).toBe("https://app.test/w/me/actions/a1");
  });

  it("names what each finished action rolls up to", async () => {
    sectionItems.completed_today = [action("completed_today", "d1", "Ship V4a", "done 15:20")];
    db.action.findMany.mockResolvedValue([
      {
        id: "d1",
        project: { name: "Ceremonies", goals: [{ title: "Run the company on rituals" }], keyResults: [{ keyResult: { title: "5 ceremonies live" } }] },
      },
    ] as never);

    const recap = await buildShutdownRecap(db, "u1", NOW, "Europe/Berlin");

    expect(recap!.done).toEqual([
      {
        actionId: "d1",
        title: "Ship V4a",
        url: "https://app.test/w/me/actions/d1",
        projectName: "Ceremonies",
        goalTitle: "Run the company on rituals",
        keyResultTitle: "5 ceremonies live",
      },
    ]);
    expect(recap!.firstName).toBe("James");
    expect(recap!.dayLabel).toBe("Thursday 8 October");
    expect(recap!.dayKey).toBe("2026-10-08");
  });
});
