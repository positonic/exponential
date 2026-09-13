/**
 * Guard: the agent and voice call sites write Actions only through the
 * module. A direct Prisma Action write reappearing in any of them is the
 * "one more copy" this feature exists to prevent (V3 requirement row).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../../..");

function read(relative: string): string {
  // mastra.ts carries a stray NUL byte; decode leniently so the whole file is searched.
  return readFileSync(resolve(ROOT, relative)).toString("utf8");
}

/** The body of one tRPC procedure in a router file, up to the next procedure. */
function procedureBody(source: string, name: string): string {
  const start = source.indexOf(`  ${name}: protectedProcedure`);
  if (start === -1) throw new Error(`procedure ${name} not found`);
  const rest = source.slice(start + name.length + 4);
  const next = rest.search(/\n  [a-zA-Z]+: (protectedProcedure|humanOnlyProcedure|publicProcedure)/);
  return next === -1 ? rest : rest.slice(0, next);
}

const DIRECT_WRITE = /\.action\.(create|update|updateMany|upsert)\(/;

describe("no direct Action writes outside the module", () => {
  const mastra = read("src/server/api/routers/mastra.ts");

  it.each(["createAction", "quickCreateAction", "updateAction"])(
    "mastra.%s writes only through the module",
    (name) => {
      expect(procedureBody(mastra, name)).not.toMatch(DIRECT_WRITE);
    },
  );

  it.each(["src/server/services/voice/capture.ts", "src/server/services/voice/complete.ts"])(
    "%s writes only through the module",
    (file) => {
      expect(read(file)).not.toMatch(DIRECT_WRITE);
    },
  );

  it("the module is the only place under services/actions that writes an Action row", () => {
    for (const file of ["createAction.ts", "applyActionUpdate.ts"]) {
      expect(read(`src/server/services/actions/${file}`)).toMatch(DIRECT_WRITE);
    }
  });
});
