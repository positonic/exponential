/**
 * Guard for ADR-0066: nothing Exponential does trashes a Notion page.
 *
 * Two code paths trashed pages before (the ticket push's archive mirror and
 * the action sync's overwrite mode, in both SyncEngine and the workflow
 * router). Behavioural tests cover the paths that exist today; this scan
 * catches a new one, wherever it is written.
 *
 * It is deliberately strict rather than clever: every Notion `pages.update`
 * call must pass an inline object literal whose top-level keys are on an
 * allow-list. A payload built elsewhere (`pages.update(payload)`) or spread in
 * (`{ ...payload }`) can't be checked, so it fails too — write the call inline.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "..", "..");

/** Keys a page update may set. `archived` and `in_trash` trash the page. */
const ALLOWED_KEYS = new Set(["page_id", "properties", "icon", "cover"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === "__tests__" || name === "node_modules" ? [] : sourceFiles(path);
    }
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Top-level keys of the object literal whose `{` is at `open`, or a problem. */
function topLevelKeys(source: string, open: number): string[] | { problem: string } {
  let depth = 0;
  let segment = "";
  const segments: string[] = [];
  for (let i = open; i < source.length; i++) {
    const ch = source[i]!;
    if ("{[(".includes(ch)) depth++;
    if ("}])".includes(ch)) depth--;
    if (depth === 0) {
      segments.push(segment);
      return segments
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .flatMap((s) => {
          if (s.startsWith("...")) return ["..."];
          return [s.split(":")[0]!.trim().replace(/^["']|["']$/g, "")];
        });
    }
    if (depth === 1 && ch === ",") {
      segments.push(segment);
      segment = "";
    } else if (!(depth === 1 && ch === "{" && i === open)) {
      segment += ch;
    }
  }
  return { problem: "unterminated object literal" };
}

/** Every reason a source text's `pages.update` calls could trash a page. */
function findPageTrashRisks(source: string): string[] {
  const risks: string[] = [];
  for (const match of source.matchAll(/\.pages\s*\.update\s*\(\s*/g)) {
    const argStart = match.index + match[0].length;
    if (source[argStart] !== "{") {
      risks.push("argument is not an inline object literal");
      continue;
    }
    const keys = topLevelKeys(source, argStart);
    if (!Array.isArray(keys)) {
      risks.push(keys.problem);
      continue;
    }
    for (const key of keys) {
      if (key === "...") risks.push("spread argument can't be checked");
      else if (!ALLOWED_KEYS.has(key)) risks.push(`sets "${key}"`);
    }
  }
  return risks;
}

describe("findPageTrashRisks (the scanner itself)", () => {
  it("passes a plain property update", () => {
    expect(
      findPageTrashRisks(
        "await client.pages.update({ page_id: id, properties: { Status: { status: { name: 'Done' } } } });",
      ),
    ).toEqual([]);
  });

  it.each([
    ["literal archived", "client.pages.update({ page_id: id, archived: true })", 'sets "archived"'],
    ["literal in_trash", "client.pages.update({ page_id: id, in_trash: true })", 'sets "in_trash"'],
    ["computed flag", "client.pages.update({ page_id: id, archived: shouldTrash })", 'sets "archived"'],
    ["quoted key", "client.pages.update({ page_id: id, 'in_trash': true })", 'sets "in_trash"'],
    ["payload variable", "client.pages.update(payload)", "argument is not an inline object literal"],
    ["spread payload", "client.pages.update({ page_id: id, ...rest })", "spread argument can't be checked"],
    ["multi-line chain", "client.pages\n  .update({\n    page_id: id,\n    archived: true,\n  })", 'sets "archived"'],
  ])("flags %s", (_label, source, risk) => {
    expect(findPageTrashRisks(source)).toContain(risk);
  });
});

describe("Notion page trashing (ADR-0066)", () => {
  const files = sourceFiles(SRC).map((file) => ({
    file: relative(SRC, file),
    source: readFileSync(file, "utf8"),
  }));

  it("finds the Notion page-update calls it is guarding", () => {
    expect(files.some((f) => /\.pages\s*\.update\s*\(/.test(f.source))).toBe(true);
  });

  it("no Notion page update can trash a page", () => {
    const risky = files.flatMap((f) =>
      findPageTrashRisks(f.source).map((risk) => `${f.file}: ${risk}`),
    );
    expect(risky).toEqual([]);
  });
});
