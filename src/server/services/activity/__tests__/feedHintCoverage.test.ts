/**
 * Guard: every kind of activity event the app records has a feed sentence.
 *
 * `resolveFeedHint` falls back to "{actor} touched {entityRef}" for a pair it
 * does not know, which is how a finished agent run used to read "Aria touched
 * a1b2c3d4". This test reads every `recordActivity(...)` call in `src/` and
 * fails when a recorded `(entityType, action)` pair has no hint, so a new
 * writer cannot ship without its sentence.
 *
 * It works on the source text, because the pairs are string literals at the
 * call sites. A call whose entity type or action is computed is listed in
 * `COMPUTED_SITES` with the pairs it can produce; a computed call that is not
 * listed fails the test until someone lists it.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FALLBACK_FEED_HINT, resolveFeedHint } from "../feedRenderHints";

const SRC_ROOT = path.resolve(__dirname, "../../../..");

/** Every value of `ActivityAction`. A literal that is not one of these is not an action. */
const ACTIONS = [
  "created",
  "failed",
  "updated",
  "status_changed",
  "completed",
  "commented",
  "summarized",
  "synced",
  "reverted",
  "checked_in",
  "deleted",
  "accepted",
  "superseded",
  "deprecated",
  "confirmed",
  "captured",
  "agenda_circulated",
] as const;

/**
 * Call sites whose pair is not written as literals, keyed by file (relative to
 * `src/`), with every pair that file's computed calls can record.
 */
const COMPUTED_SITES: Record<string, Array<[entityType: string, action: string]>> = {
  // `statusActivityAction(status)` maps a decision status to one of these.
  "server/services/decisions/decisionService.ts": [
    ["decision", "accepted"],
    ["decision", "superseded"],
    ["decision", "deprecated"],
    ["decision", "status_changed"],
  ],
  // `recordPageActivity` takes the action from its caller: a page was created
  // or edited.
  "server/services/pages/pageActivity.ts": [
    ["page", "created"],
    ["page", "updated"],
  ],
  // `recordEpicActivity` takes the action from the mutation that called it.
  "server/api/routers/epic.ts": [
    ["epic", "created"],
    ["epic", "updated"],
    ["epic", "deleted"],
  ],
  // Records whatever `toGitHubFeedEvent` built (githubFeedEvent.ts).
  "server/services/GitHubActivityService.ts": [
    ["github_pull_request", "created"],
    ["github_pull_request", "completed"],
    ["github_pull_request", "status_changed"],
    ["github_pull_request_review", "commented"],
    ["github_push", "created"],
  ],
};

interface RecordedPair {
  file: string;
  entityType: string;
  action: string;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** The text of each `recordActivity(...)` call in a file, parentheses balanced. */
function recordActivityCalls(source: string): string[] {
  const calls: string[] = [];
  const pattern = /\brecordActivity\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    let index = match.index + match[0].length;
    let depth = 1;
    while (index < source.length && depth > 0) {
      const char = source[index];
      if (char === "(") depth += 1;
      else if (char === ")") depth -= 1;
      index += 1;
    }
    calls.push(source.slice(match.index, index));
  }
  return calls;
}

function scan(): { pairs: RecordedPair[]; unlistedComputed: string[] } {
  const pairs: RecordedPair[] = [];
  const unlistedComputed: string[] = [];

  for (const full of sourceFiles(SRC_ROOT)) {
    const file = path.relative(SRC_ROOT, full).split(path.sep).join("/");
    // The definition itself, not a call site.
    if (file === "server/services/activity/recordActivity.ts") continue;

    for (const call of recordActivityCalls(fs.readFileSync(full, "utf8"))) {
      const entityTypeExpr = /\bentityType:\s*([^,\n]+)/.exec(call)?.[1]?.trim();
      const actionExpr = /\baction:\s*([\s\S]*?)(?:,\s*\n|\n\s*\})/.exec(call)?.[1]?.trim();
      if (!entityTypeExpr || !actionExpr) continue;

      const entityType = /^"([a-z_]+)"$/.exec(entityTypeExpr)?.[1];
      const literalActions = [...actionExpr.matchAll(/"([a-z_]+)"/g)]
        .map((m) => m[1]!)
        .filter((value) => (ACTIONS as readonly string[]).includes(value));
      // Fully literal: `"created"`, or a ternary whose branches are literals.
      const isLiteralAction =
        literalActions.length > 0 && !/[a-zA-Z_]\w*\(/.test(actionExpr);

      if (entityType && isLiteralAction) {
        for (const action of literalActions) pairs.push({ file, entityType, action });
        continue;
      }
      // Literal branches still count even when another branch is computed.
      if (entityType) {
        for (const action of literalActions) pairs.push({ file, entityType, action });
      }
      const listed = COMPUTED_SITES[file];
      if (!listed) {
        unlistedComputed.push(`${file}: ${entityTypeExpr} / ${actionExpr.replace(/\s+/g, " ")}`);
        continue;
      }
      for (const [type, action] of listed) pairs.push({ file, entityType: type, action });
    }
  }
  return { pairs, unlistedComputed };
}

describe("feed hint coverage", () => {
  const { pairs, unlistedComputed } = scan();

  it("finds the activity write sites", () => {
    // If the scan matches nothing the guard below would pass vacuously.
    expect(pairs.length).toBeGreaterThan(40);
    expect(pairs).toContainEqual(
      expect.objectContaining({ entityType: "agent_run", action: "completed" }),
    );
    expect(pairs).toContainEqual(
      expect.objectContaining({ entityType: "agent_run", action: "failed" }),
    );
  });

  it("lists every call whose entity type or action is computed", () => {
    expect(unlistedComputed).toEqual([]);
  });

  it("has a feed sentence for every recorded (entityType, action) pair", () => {
    const missing = [
      ...new Set(
        pairs
          .filter(
            ({ entityType, action }) =>
              resolveFeedHint(entityType, action) === FALLBACK_FEED_HINT,
          )
          .map(({ entityType, action, file }) => `${entityType}/${action} (${file})`),
      ),
    ];

    expect(missing).toEqual([]);
  });
});
