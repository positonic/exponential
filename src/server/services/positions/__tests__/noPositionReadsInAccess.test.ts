/**
 * Guard: access control is a function of Role alone (ADR-0068 §2).
 *
 * A Position never grants or restricts anything, so nothing under
 * `services/access/` may read `Position` / `PositionHolder` or call into the
 * positions module. `assignability.ts` is the one file allowed to *name* the
 * type — it defines the roster shape that carries Positions to the pickers —
 * and even it may only import the type, never a loader.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ACCESS_DIR = resolve(__dirname, "../../access");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === "__tests__") return [];
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return name.endsWith(".ts") ? [full] : [];
  });
}

/** Code only: a doc comment may explain the rule without tripping it. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const files = sourceFiles(ACCESS_DIR).map((full) => {
  const source = readFileSync(full, "utf8");
  return { file: relative(ACCESS_DIR, full), source, code: stripComments(source) };
});

/** The roster-shape file: may carry the type, nothing more. */
const ROSTER_SHAPE_FILE = "assignability.ts";

describe("services/access never reads a Position", () => {
  it("finds the access module", () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files.map((f) => f.file)).toContain(ROSTER_SHAPE_FILE);
  });

  it.each(files)("$file issues no Prisma query against Position or PositionHolder", ({ code: source }) => {
    expect(source).not.toMatch(/\.position(Holder)?\s*\.\s*(find|count|aggregate|groupBy|create|update|upsert|delete)/);
    // Relation reads inside another model's select/include count too.
    expect(source).not.toMatch(/\bpositionHolders?\s*:/);
    expect(source).not.toMatch(/\bholders\s*:/);
  });

  it.each(files)("$file never calls the positions module", ({ code: source }) => {
    expect(source).not.toMatch(/loadPositionsByUser|hasRemitGap/);
    // A value import would be a read path; only `import type` is allowed.
    const imports = source.match(/^import\s[^;]*positions["'];?$/gm) ?? [];
    for (const line of imports) expect(line).toMatch(/^import type /);
  });

  it.each(files.filter((f) => f.file !== ROSTER_SHAPE_FILE))(
    "$file does not mention Positions at all",
    ({ source }) => {
      expect(source).not.toMatch(/position/i);
    },
  );
});
