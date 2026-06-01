import { describe, it, expect } from "vitest";
import { mergeObjectiveActivity } from "../../objectiveActivity";

const author = { id: "u1", name: "Ada", image: null };
const other = { id: "u2", name: "Grace", image: null };

const at = (iso: string) => new Date(iso);

describe("mergeObjectiveActivity", () => {
  it("returns an empty array when there is no activity", () => {
    expect(
      mergeObjectiveActivity({
        goalComments: [],
        goalUpdates: [],
        keyResults: [],
      }),
    ).toEqual([]);
  });

  it("merges all four kinds into one newest-first feed", () => {
    const items = mergeObjectiveActivity({
      goalComments: [
        { id: "gc1", createdAt: at("2026-01-01"), content: "objective note", author },
      ],
      goalUpdates: [
        {
          id: "gu1",
          createdAt: at("2026-01-05"),
          content: "status update",
          health: "at-risk",
          author,
        },
      ],
      keyResults: [
        {
          id: "kr-a",
          title: "Ship v1",
          comments: [
            { id: "kc1", createdAt: at("2026-01-03"), content: "kr note", author: other },
          ],
          checkIns: [
            {
              id: "ci1",
              createdAt: at("2026-01-04"),
              previousValue: 10,
              newValue: 20,
              notes: "progress",
              createdBy: other,
            },
          ],
        },
      ],
    });

    expect(items.map((i) => i.id)).toEqual(["gu1", "ci1", "kc1", "gc1"]);
    expect(items.map((i) => i.kind)).toEqual([
      "goalUpdate",
      "krCheckIn",
      "krComment",
      "goalComment",
    ]);
  });

  it("numbers KR codes per-objective in input order", () => {
    const items = mergeObjectiveActivity({
      goalComments: [],
      goalUpdates: [],
      keyResults: [
        {
          id: "kr-a",
          title: "First KR",
          comments: [
            { id: "kc-a", createdAt: at("2026-01-01"), content: "a", author },
          ],
          checkIns: [],
        },
        {
          id: "kr-b",
          title: "Second KR",
          comments: [],
          checkIns: [
            {
              id: "ci-b",
              createdAt: at("2026-01-02"),
              previousValue: 0,
              newValue: 5,
              notes: null,
              createdBy: null,
            },
          ],
        },
      ],
    });

    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(byId["kc-a"]).toMatchObject({
      kind: "krComment",
      keyResultId: "kr-a",
      keyResultCode: "KR1",
      keyResultTitle: "First KR",
    });
    expect(byId["ci-b"]).toMatchObject({
      kind: "krCheckIn",
      keyResultId: "kr-b",
      keyResultCode: "KR2",
      author: null,
    });
  });

  it("does not attach a KR chip to objective-native items", () => {
    const items = mergeObjectiveActivity({
      goalComments: [
        { id: "gc1", createdAt: at("2026-01-01"), content: "note", author },
      ],
      goalUpdates: [],
      keyResults: [],
    });
    expect(items[0]).not.toHaveProperty("keyResultId");
    expect(items[0]).not.toHaveProperty("keyResultCode");
  });
});
