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
const PROCEDURE_START = /\n  ([a-zA-Z]+): (protectedProcedure|humanOnlyProcedure|publicProcedure|apiKeyMiddleware)/g;

function procedureBody(source: string, name: string): string {
  const starts = [...source.matchAll(PROCEDURE_START)];
  const index = starts.findIndex((m) => m[1] === name);
  if (index === -1) throw new Error(`procedure ${name} not found`);
  const from = starts[index]!.index!;
  const to = starts[index + 1]?.index ?? source.length;
  return source.slice(from, to);
}

const DIRECT_WRITE =
  /\.action\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/;

describe("no direct Action writes outside the module", () => {
  const mastra = read("src/server/api/routers/mastra.ts");

  it.each(["createAction", "quickCreateAction", "updateAction"])(
    "mastra.%s writes only through the module",
    (name) => {
      expect(procedureBody(mastra, name)).not.toMatch(DIRECT_WRITE);
    },
  );

  const action = read("src/server/api/routers/action.ts");

  // The V1/V2 procedures that were switched over. Not listed: the with-order
  // and reorder procedures, whose sibling kanbanOrder-only updates of the
  // displaced cards are theirs by design; bulkReschedule / bulkDefer, which
  // are date-only set writes outside the seam; upsertBySource, which is
  // outside the PRD's inventory.
  it.each([
    "create",
    "update",
    "quickCreate",
    "updateKanbanStatus",
    "bulkAssignProject",
    "updateActionsProject",
    "bulkCreateFromTranscript",
    "ensureDailyPlanPromptAction",
  ])("action.%s writes only through the module", (name) => {
    expect(procedureBody(action, name)).not.toMatch(DIRECT_WRITE);
  });

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
