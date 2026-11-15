// @vitest-environment node
/**
 * Guard: a workspace's own Anthropic key has exactly one way out of the app.
 *
 * `getWorkingModelKey` is the only function that decrypts it, and the only
 * caller is `mastra.getModelKey`, which answers the Mastra server alone. Any
 * other caller is a new path a key could leak through: into a RequestContext
 * (unsigned, and printed by the chat route's debug log), a browser response
 * or a log line. If this fails, the new caller needs the same scrutiny that
 * callback got, and then a place on the list below.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../../../..");

const ALLOWED_READERS = [
  // Defines it.
  "server/services/billing/modelKey.ts",
  // `mastra.getModelKey`: Mastra server key + a member's agent token.
  "server/api/routers/mastra.ts",
];

/** The paths that build what the app sends to Mastra for a turn. */
const TURN_BUILDERS = [
  "app/api/chat/stream/route.ts",
  "server/services/agentRuns/dispatch.ts",
  "server/services/voice/brainPassthrough.ts",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === "__tests__" || name === "node_modules" ? [] : sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(name) && !/\.test\.|\.spec\./.test(name) ? [full] : [];
  });
}

const relative = (file: string) => path.relative(SRC, file).split(path.sep).join("/");

describe("the workspace's own model key", () => {
  it("is decrypted by one function with one caller", () => {
    const readers = sourceFiles(SRC)
      .filter((file) => readFileSync(file, "utf8").includes("getWorkingModelKey"))
      .map(relative)
      .sort();

    expect(readers).toEqual([...ALLOWED_READERS].sort());
  });

  it("is never read by the code that builds a turn's RequestContext", () => {
    for (const file of TURN_BUILDERS) {
      const source = readFileSync(path.join(SRC, file), "utf8");
      expect(source, file).not.toMatch(/services\/billing\/modelKey/);
    }
  });
});
