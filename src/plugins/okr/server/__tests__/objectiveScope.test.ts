import { describe, it, expect } from "vitest";
import { objectiveScopeWhere } from "../objectiveScope";

const USER = "user-1";

describe("objectiveScopeWhere", () => {
  it("All (period null) drops the period clause and only hides archived", () => {
    expect(objectiveScopeWhere({ period: null, onlyMine: false, userId: USER })).toEqual({
      status: { not: "archived" },
    });
  });

  it("a period admits an objective by its own period or by a key result in it", () => {
    expect(objectiveScopeWhere({ period: "Q4-2026", onlyMine: false, userId: USER })).toEqual({
      status: { not: "archived" },
      AND: [
        {
          OR: [
            { period: "Q4-2026" },
            { keyResults: { some: { period: "Q4-2026" } } },
          ],
        },
      ],
    });
  });

  it("a period list (paired quarter + year) matches any of them", () => {
    const where = objectiveScopeWhere({
      period: ["Q1-2026", "Annual-2026"],
      onlyMine: false,
      userId: USER,
    });
    expect(where.AND).toEqual([
      {
        OR: [
          { period: { in: ["Q1-2026", "Annual-2026"] } },
          { keyResults: { some: { period: { in: ["Q1-2026", "Annual-2026"] } } } },
        ],
      },
    ]);
  });

  it("Mine is a DRI rule (objective or any key result), never the creator", () => {
    const where = objectiveScopeWhere({ period: null, onlyMine: true, userId: USER });
    expect(where.AND).toEqual([
      {
        OR: [
          { driUserId: USER },
          { keyResults: { some: { driUserId: USER } } },
        ],
      },
    ]);
    expect(JSON.stringify(where)).not.toContain('"userId"');
  });

  it("period and Mine combine under AND so neither OR overwrites the other", () => {
    const where = objectiveScopeWhere({ period: "Q4-2026", onlyMine: true, userId: USER });
    expect(where.AND).toHaveLength(2);
    expect(where.status).toEqual({ not: "archived" });
  });
});
