import { describe, expect, it } from "vitest";
import {
  assignPullRequestsToCycles,
  buildCycleChangelog,
  isReleasePlumbing,
  parsePullRequestTitle,
  type ChangelogPullRequest,
  type ChangelogTicket,
} from "../cycleChangelog";

function ticket(overrides: Partial<ChangelogTicket>): ChangelogTicket {
  return {
    id: "t1",
    number: 1,
    shortId: null,
    title: "A ticket",
    type: "FEATURE",
    status: "DONE",
    points: 3,
    featureId: null,
    featureName: null,
    prUrl: null,
    branchName: null,
    ...overrides,
  };
}

function pr(overrides: Partial<ChangelogPullRequest>): ChangelogPullRequest {
  return {
    repoFullName: "org/api",
    prNumber: 1,
    title: "feat: something",
    url: "https://github.com/org/api/pull/1",
    branchName: null,
    author: null,
    mergedAt: new Date("2026-10-20T10:00:00Z"),
    ...overrides,
  };
}

function sectionTitles(changelog: ReturnType<typeof buildCycleChangelog>) {
  return Object.fromEntries(
    changelog.sections.map((s) => [s.key, s.entries.map((e) => e.title)]),
  );
}

describe("parsePullRequestTitle", () => {
  it("splits conventional prefix, scope and text", () => {
    expect(parsePullRequestTitle("fix(events): bound the query")).toEqual({
      section: "fixes",
      scope: "events",
      text: "Bound the query",
    });
  });

  it("routes plumbing prefixes under the hood", () => {
    expect(parsePullRequestTitle("ci: rename workflows").section).toBe(
      "underTheHood",
    );
    expect(parsePullRequestTitle("docs: rewrite README").section).toBe(
      "underTheHood",
    );
  });

  it("treats a plain-English title as a feature", () => {
    expect(
      parsePullRequestTitle("Redesign the Analysis page"),
    ).toEqual({
      section: "features",
      scope: null,
      text: "Redesign the Analysis page",
    });
  });
});

describe("isReleasePlumbing", () => {
  it("drops environment syncs and merge-ups", () => {
    expect(isReleasePlumbing("Sync prod with dev")).toBe(true);
    expect(isReleasePlumbing("Merge branch 'main' into dev")).toBe(true);
    expect(isReleasePlumbing("feat: sync contacts")).toBe(false);
  });
});

describe("buildCycleChangelog", () => {
  it("ignores tickets that have not shipped", () => {
    const changelog = buildCycleChangelog({
      tickets: [
        ticket({ id: "a", title: "Shipped", status: "DEPLOYED" }),
        ticket({ id: "b", title: "Still open", status: "IN_PROGRESS" }),
      ],
      pullRequests: [],
    });
    expect(sectionTitles(changelog)).toEqual({ features: ["Shipped"] });
    expect(changelog.totals.tickets).toBe(1);
  });

  it("attaches PRs to the ticket that names them or shares their branch", () => {
    const changelog = buildCycleChangelog({
      tickets: [
        ticket({
          id: "kb",
          title: "Knowledgebase uploads",
          points: 8,
          prUrl: "https://github.com/org/api/pull/7/",
        }),
        ticket({ id: "wh", title: "Alert webhooks", points: 5, branchName: "feat/webhooks" }),
      ],
      pullRequests: [
        pr({ prNumber: 7, url: "https://github.com/org/api/pull/7" }),
        pr({ prNumber: 8, url: "https://github.com/org/api/pull/8", branchName: "feat/webhooks" }),
      ],
    });
    const entries = changelog.sections[0]!.entries;
    expect(entries.map((e) => [e.title, e.points, e.pullRequestCount])).toEqual([
      ["Knowledgebase uploads", 8, 1],
      ["Alert webhooks", 5, 1],
    ]);
  });

  it("groups a feature's tickets into one entry", () => {
    const changelog = buildCycleChangelog({
      tickets: [
        ticket({ id: "a", title: "Answer from questions", points: 5, featureId: "f", featureName: "Situation analysis" }),
        ticket({ id: "b", title: "Humanitarian Access", points: 3, featureId: "f", featureName: "Situation analysis" }),
      ],
      pullRequests: [],
    });
    const [entry] = changelog.sections[0]!.entries;
    expect(entry!.title).toBe("Situation analysis");
    expect(entry!.points).toBe(8);
    expect(entry!.items.map((i) => i.title)).toEqual([
      "Answer from questions",
      "Humanitarian Access",
    ]);
  });

  it("groups unlinked PRs by section and scope, titling a lone PR by itself", () => {
    const changelog = buildCycleChangelog({
      tickets: [],
      pullRequests: [
        pr({ prNumber: 1, title: "feat(signals): unified extraction" }),
        pr({ prNumber: 2, title: "feat(signals): geolocate posts" }),
        pr({ prNumber: 3, title: "fix(signals): drain sensor" }),
        pr({ prNumber: 4, title: "feat(nav): country picker" }),
        pr({ prNumber: 5, title: "ci: rename workflows" }),
        pr({ prNumber: 6, title: "Sync prod with dev" }),
      ],
    });
    expect(sectionTitles(changelog)).toEqual({
      features: ["Signals", "Country picker"],
      fixes: ["Drain sensor"],
      underTheHood: ["Rename workflows"],
    });
    expect(changelog.totals.pullRequests).toBe(5);
  });

  it("orders entries by points plus PRs, largest first", () => {
    const changelog = buildCycleChangelog({
      tickets: [ticket({ id: "big", title: "Big ticket", points: 13 })],
      pullRequests: [
        pr({ prNumber: 1, title: "feat(analysis): a" }),
        pr({ prNumber: 2, title: "feat(analysis): b" }),
      ],
    });
    expect(changelog.sections[0]!.entries.map((e) => e.size)).toEqual([13, 2]);
  });

  it("files tickets by type when they have no PRs", () => {
    const changelog = buildCycleChangelog({
      tickets: [
        ticket({ id: "a", title: "Out of memory", type: "BUG" }),
        ticket({ id: "b", title: "Repo readiness", type: "CHORE" }),
        ticket({ id: "c", title: "Pick analytics tool", type: "RESEARCH" }),
      ],
      pullRequests: [],
    });
    expect(sectionTitles(changelog)).toEqual({
      fixes: ["Out of memory"],
      underTheHood: ["Repo readiness"],
      alsoThisCycle: ["Pick analytics tool"],
    });
  });

  it("folds lone PRs into one row when a section runs long", () => {
    const lone = Array.from({ length: 9 }, (_, i) =>
      pr({ prNumber: i + 1, title: `fix(scope${i}): change ${i}` }),
    );
    const changelog = buildCycleChangelog({
      tickets: [ticket({ id: "bug", title: "Out of memory", type: "BUG", points: 13 })],
      pullRequests: lone,
    });
    const fixes = changelog.sections.find((s) => s.key === "fixes")!;
    expect(fixes.entries.map((e) => e.title)).toEqual([
      "Out of memory",
      "9 smaller changes",
    ]);
    expect(fixes.entries[1]!.items).toHaveLength(9);
  });

  it("counts a PR stored twice only once", () => {
    const changelog = buildCycleChangelog({
      tickets: [],
      pullRequests: [pr({ prNumber: 9 }), pr({ prNumber: 9 })],
    });
    expect(changelog.totals.pullRequests).toBe(1);
  });
});

describe("assignPullRequestsToCycles", () => {
  const cycles = [
    { id: "c17", startDate: new Date("2026-10-01T00:00:00Z"), endDate: new Date("2026-10-15T00:00:00Z") },
    { id: "c18", startDate: new Date("2026-10-15T00:00:00Z"), endDate: new Date("2026-10-28T00:00:00Z") },
  ];

  it("gives a PR on a shared boundary day to the later cycle only", () => {
    const result = assignPullRequestsToCycles(cycles, [
      { mergedAt: new Date("2026-10-15T12:00:00Z") },
    ]);
    expect(result.get("c17")).toHaveLength(0);
    expect(result.get("c18")).toHaveLength(1);
  });

  it("includes the whole of the end date and drops PRs outside every cycle", () => {
    const result = assignPullRequestsToCycles(cycles, [
      { mergedAt: new Date("2026-10-28T23:00:00Z") },
      { mergedAt: new Date("2026-10-29T01:00:00Z") },
      { mergedAt: new Date("2026-09-30T23:00:00Z") },
    ]);
    expect(result.get("c18")).toHaveLength(1);
    expect(result.get("c17")).toHaveLength(0);
  });
});
