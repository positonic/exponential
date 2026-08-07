import { describe, expect, it } from "vitest";
import { toGitHubFeedEvent } from "../githubFeedEvent";
import { deriveActivitySource } from "../deriveActivitySource";

const repo = "positonic/exponential";

function prInput(overrides: Record<string, unknown> = {}) {
  return {
    eventType: "pull_request" as const,
    eventAction: "opened",
    repoFullName: repo,
    repoUrl: `https://github.com/${repo}`,
    branchName: "feat/thing",
    prNumber: 497,
    prTitle: "feat: grant agents access to multiple workspaces at once",
    prUrl: `https://github.com/${repo}/pull/497`,
    prAuthor: "positonic",
    prMerged: false,
    ...overrides,
  };
}

describe("toGitHubFeedEvent — pull requests", () => {
  it("maps an opened PR to a created event", () => {
    const event = toGitHubFeedEvent(prInput());
    expect(event).not.toBeNull();
    expect(event!.entityType).toBe("github_pull_request");
    expect(event!.action).toBe("created");
    expect(event!.authorLogin).toBe("positonic");
  });

  it("maps a merged PR to completed — the 'work shipped' signal", () => {
    const event = toGitHubFeedEvent(
      prInput({ eventAction: "closed", prMerged: true }),
    );
    expect(event!.action).toBe("completed");
    expect(event!.metadata).toMatchObject({ merged: true });
  });

  it("distinguishes an unmerged close from a merge", () => {
    const event = toGitHubFeedEvent(
      prInput({ eventAction: "closed", prMerged: false }),
    );
    expect(event!.action).toBe("status_changed");
    expect(event!.metadata).toMatchObject({ merged: false });
  });

  it.each(["synchronize", "edited", "labeled", "ready_for_review", "assigned"])(
    "suppresses the low-signal %s action",
    (eventAction) => {
      expect(toGitHubFeedEvent(prInput({ eventAction }))).toBeNull();
    },
  );

  it("carries the PR title as the feed's entity label", () => {
    const event = toGitHubFeedEvent(prInput());
    expect(event!.metadata).toMatchObject({
      title: "feat: grant agents access to multiple workspaces at once",
      prNumber: 497,
      prUrl: `https://github.com/${repo}/pull/497`,
    });
  });

  it("is keyed per repo+PR so two repos' #1 don't collide", () => {
    const a = toGitHubFeedEvent(prInput());
    const b = toGitHubFeedEvent(prInput({ repoFullName: "positonic/mastra" }));
    expect(a!.entityId).not.toBe(b!.entityId);
  });
});

describe("toGitHubFeedEvent — pushes", () => {
  const pushInput = (commitCount: number) => ({
    eventType: "push" as const,
    repoFullName: repo,
    branchName: "main",
    commitCount,
    headCommitSha: "b8b334e",
    headCommitMessage: "refactor: Keep untimed tasks off the agenda timeline",
    headCommitUrl: `https://github.com/${repo}/commit/b8b334e`,
    commitAuthor: "positonic",
  });

  it("emits one event for the whole push, carrying the commit count", () => {
    const event = toGitHubFeedEvent(pushInput(20));
    expect(event!.entityType).toBe("github_push");
    expect(event!.metadata).toMatchObject({ commitCount: 20 });
  });

  it("suppresses commit-less pushes (branch create/delete)", () => {
    expect(toGitHubFeedEvent(pushInput(0))).toBeNull();
  });

  it("labels the row with the head commit subject", () => {
    const event = toGitHubFeedEvent(pushInput(3));
    expect(event!.metadata).toMatchObject({
      title: "refactor: Keep untimed tasks off the agenda timeline",
    });
  });
});

describe("toGitHubFeedEvent — reviews", () => {
  const reviewInput = (eventAction: string) => ({
    eventType: "pull_request_review" as const,
    eventAction,
    repoFullName: repo,
    prNumber: 497,
    prTitle: "feat: grant agents access",
    prUrl: `https://github.com/${repo}/pull/497`,
    prReviewState: "approved",
    prReviewer: "andi",
  });

  it("maps a submitted review to a comment event, attributed to the reviewer", () => {
    const event = toGitHubFeedEvent(reviewInput("submitted"));
    expect(event!.action).toBe("commented");
    expect(event!.authorLogin).toBe("andi");
    expect(event!.metadata).toMatchObject({ reviewState: "approved" });
  });

  it("suppresses review edits and dismissals", () => {
    expect(toGitHubFeedEvent(reviewInput("edited"))).toBeNull();
    expect(toGitHubFeedEvent(reviewInput("dismissed"))).toBeNull();
  });
});

describe("every emitted entity type resolves to the github source", () => {
  it("keeps the write side and the source derivation in agreement", () => {
    const events = [
      toGitHubFeedEvent(prInput()),
      toGitHubFeedEvent(prInput({ eventAction: "closed", prMerged: true })),
      toGitHubFeedEvent({
        eventType: "push",
        repoFullName: repo,
        branchName: "main",
        commitCount: 1,
        headCommitSha: "abc1234",
      }),
      toGitHubFeedEvent({
        eventType: "pull_request_review",
        eventAction: "submitted",
        repoFullName: repo,
        prNumber: 1,
        prReviewer: "andi",
      }),
    ];

    for (const event of events) {
      expect(event).not.toBeNull();
      expect(deriveActivitySource({ entityType: event!.entityType })).toBe(
        "github",
      );
    }
  });
});
