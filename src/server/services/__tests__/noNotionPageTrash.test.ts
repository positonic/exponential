/**
 * Guard for ADR-0066: nothing Exponential does trashes a Notion page.
 *
 * Two code paths trashed pages before (the ticket push's archive mirror and
 * the action sync's overwrite mode, in both SyncEngine and the workflow
 * router). Behavioural tests cover the paths that exist today; this scan
 * catches a new one, wherever it is written.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "..", "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === "__tests__" || name === "node_modules" ? [] : sourceFiles(path);
    }
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

// The argument object of a Notion `pages.update({ ... })` call.
const PAGES_UPDATE = /\.pages\.update\(\s*\{[\s\S]*?\}\s*\)/g;
const TRASH_FLAG = /\b(archived|in_trash)\s*:\s*true\b/;

describe("Notion page trashing (ADR-0066)", () => {
  const files = sourceFiles(SRC);
  const calls = files.flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(PAGES_UPDATE)].map((m) => ({
      file: relative(SRC, file),
      call: m[0],
    })),
  );

  it("finds the Notion page-update calls it is guarding", () => {
    expect(calls.length).toBeGreaterThan(0);
  });

  it("never sets archived or in_trash on a Notion page", () => {
    const trashing = calls.filter((c) => TRASH_FLAG.test(c.call)).map((c) => c.file);
    expect(trashing).toEqual([]);
  });
});
