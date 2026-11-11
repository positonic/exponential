/**
 * AI instructions are guidance, never authority (ADR-0071 "Authorized
 * agency"; Agent principles PRD requirement `cmv3rnvfc001ajp06kibdp8fm`).
 *
 * Workspace and project `aiInstructions` are text a workspace member writes
 * for agents. Nothing in them may widen what a principal can do, so the code
 * that decides access must never read them. This pins that by construction:
 * no file under `services/access/` (the resolvers, `resolvePrincipal`, the
 * middleware) and none of the gates outside it mentions `aiInstructions`.
 *
 * If this fails, the fix is to move the read out of access code, not to
 * relax the test: an access decision that depends on instruction text lets
 * the text grant authority.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../../..");
const ACCESS_DIR = resolve(__dirname, "..");

/** The access gates that live outside `services/access/`. */
const GATES_OUTSIDE = [
  "src/server/api/trpc.ts", // protectedProcedure, humanOnlyProcedure, agent-key auth
  "src/server/services/externalAgentAccess.ts", // the delegation invariant (ADR-0049)
  "src/server/services/actions/workspaceGate.ts", // assertCanWriteToWorkspace
];

const READS_AI_INSTRUCTIONS = /aiInstructions/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === "__tests__" ? [] : sourceFiles(path);
    }
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("access code never reads AI instructions", () => {
  const accessFiles = sourceFiles(ACCESS_DIR);

  it("scans the resolvers and the principal resolver", () => {
    const names = accessFiles.map((f) => relative(ACCESS_DIR, f));
    expect(names).toEqual(
      expect.arrayContaining(["principal.ts", "AccessControlService.ts", "resolvers/projectResolver.ts"]),
    );
  });

  it("the matcher catches a read (so a pass is not vacuous)", () => {
    expect(READS_AI_INSTRUCTIONS.test("select: { aiInstructions: true }")).toBe(true);
  });

  it.each(accessFiles.map((f) => [relative(ROOT, f), f]))("%s does not read aiInstructions", (_name, file) => {
    expect(readFileSync(file, "utf8")).not.toMatch(READS_AI_INSTRUCTIONS);
  });

  it.each(GATES_OUTSIDE)("%s does not read aiInstructions", (file) => {
    expect(readFileSync(resolve(ROOT, file), "utf8")).not.toMatch(READS_AI_INSTRUCTIONS);
  });
});
