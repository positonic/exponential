import { describe, expect, it } from "vitest";
import { buildMorningNudge } from "~/server/services/morningNudge";

describe("buildMorningNudge", () => {
  it("greets by first name", () => {
    const { title } = buildMorningNudge({
      firstName: "James",
      todayCount: 3,
      overdueCount: 0,
      cohortCount: 0,
    });
    expect(title).toBe("Good morning, James!");
  });

  it("says so plainly when nothing is overdue", () => {
    const { body } = buildMorningNudge({
      firstName: "James",
      todayCount: 3,
      overdueCount: 0,
      cohortCount: 0,
    });
    expect(body).toBe("3 actions scheduled today. Nothing overdue — nice.");
  });

  it("handles a completely empty day without claiming nothing is planned", () => {
    const { body } = buildMorningNudge({
      firstName: "James",
      todayCount: 0,
      overdueCount: 0,
      cohortCount: 0,
    });
    expect(body).toBe("Nothing scheduled today, and nothing overdue.");
  });

  it("leads with the reframe when most of the overdue pile was bulk-created", () => {
    // The real case: 6 scheduled, 43 overdue, 21 of them from two bulk writes.
    const { body } = buildMorningNudge({
      firstName: "James",
      todayCount: 6,
      overdueCount: 43,
      cohortCount: 22,
    });
    expect(body).toContain("43 overdue");
    expect(body).toContain("22 of those were created in one batch");
  });

  it("does NOT soften the number when the overdue pile is mostly real debt", () => {
    const { body } = buildMorningNudge({
      firstName: "James",
      todayCount: 6,
      overdueCount: 43,
      cohortCount: 4,
    });
    expect(body).toBe("6 actions scheduled today, and 43 overdue.");
    expect(body).not.toContain("one batch");
  });

  it("treats an exact half as real debt — the reframe needs a majority", () => {
    const { body } = buildMorningNudge({
      firstName: "James",
      todayCount: 0,
      overdueCount: 10,
      cohortCount: 5,
    });
    expect(body).not.toContain("one batch");
  });

  it("singularises a single action", () => {
    const { body } = buildMorningNudge({
      firstName: "James",
      todayCount: 1,
      overdueCount: 0,
      cohortCount: 0,
    });
    expect(body).toContain("1 action scheduled today");
    expect(body).not.toContain("1 actions");
  });
});
