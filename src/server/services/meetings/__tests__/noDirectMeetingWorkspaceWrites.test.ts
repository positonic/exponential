/**
 * Guard: a Meeting's `workspaceId` is written only through the placement
 * module (`resolveMeetingWorkspace` / `assignMeetingPlacement` /
 * `rehomeProjectMeetings`). A project-linked Meeting inherits its Project's
 * Workspace (CONTEXT.md → Meeting↔Workspace); the device recorder's create
 * path once stored the caller's value instead, which left meetings with a
 * project and no workspace — listed under the workspace, yet "workspace-less"
 * on their own page.
 *
 * Two checks: no file outside the allow-list writes `workspaceId` into a
 * TranscriptionSession row at all, and the router procedures that do write it
 * take the value from the resolver rather than from their input.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../../..");
const SERVER = join(ROOT, "src/server");

/**
 * Files allowed to put `workspaceId` in a TranscriptionSession write.
 * Add a file here only when its value comes from `resolveMeetingWorkspace`
 * (or it IS the placement module).
 */
const ALLOWED_WRITERS = new Set([
  // The placement module itself.
  "src/server/services/meetings/assignMeetingPlacement.ts",
  // Create / details procedures: each derives the value via the resolver,
  // which the second test below checks.
  "src/server/api/routers/transcription.ts",
  // Ceremony auto-attach places a workspace-less meeting into the
  // occurrence's workspace. It only fires when `workspaceId` is null, which
  // after this guard means a project-less meeting, so no project rule applies.
  "src/server/services/ceremonies/autoAttach.ts",
]);

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      yield* sourceFiles(full);
    } else if (/\.ts$/.test(entry) && !/\.test\.ts$/.test(entry)) {
      yield full;
    }
  }
}

function read(file: string): string {
  // mastra.ts carries a stray NUL byte; decode leniently so the whole file is searched.
  return readFileSync(file).toString("utf8");
}

/** The text between a `(`/`{` at `open` and its matching close. */
function balanced(source: string, open: number): string {
  const pairs: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
  const stack: string[] = [];
  for (let i = open; i < source.length; i++) {
    const ch = source[i]!;
    if (pairs[ch]) stack.push(pairs[ch]);
    else if (ch === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return source.slice(open, i + 1);
    }
  }
  return source.slice(open);
}

const SESSION_WRITE = /\.transcriptionSession\.(create|createMany|update|updateMany|upsert)\(/g;

/**
 * What every TranscriptionSession write in `source` puts in `data`: the
 * literal `data: {...}` block, or, for `data: someVariable`, the
 * `someVariable.workspaceId = <expr>` assignments feeding it (rendered as
 * `workspaceId: <expr>` so both shapes are checked the same way).
 */
function sessionWriteDataBlocks(source: string): string[] {
  const blocks: string[] = [];
  for (const match of source.matchAll(SESSION_WRITE)) {
    const call = balanced(source, match.index! + match[0].length - 1);
    for (const data of call.matchAll(/\bdata:\s*\{/g)) {
      blocks.push(balanced(call, data.index! + data[0].length - 1));
    }
    for (const data of call.matchAll(/\bdata:\s*([A-Za-z_]\w*)\b/g)) {
      // The expression up to its first call paren: `await resolveMeetingWorkspace`
      // rather than the resolver's own argument list, which names the input.
      const assignments = source.matchAll(new RegExp(`\\b${data[1]}\\.workspaceId\\s*=\\s*([^;(]*)`, "g"));
      for (const assignment of assignments) blocks.push(`workspaceId: ${assignment[1].trim()}`);
    }
  }
  return blocks;
}

const WRITES_WORKSPACE = /\bworkspaceId\b\s*[:,}]/;

describe("Meeting workspaceId is written only through the placement module", () => {
  it("no file outside the allow-list writes workspaceId into a TranscriptionSession row", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SERVER)) {
      const rel = relative(ROOT, file);
      if (ALLOWED_WRITERS.has(rel)) continue;
      if (sessionWriteDataBlocks(read(file)).some((block) => WRITES_WORKSPACE.test(block))) {
        offenders.push(rel);
      }
    }
    expect(
      offenders,
      "derive the value with resolveMeetingWorkspace (services/meetings/assignMeetingPlacement.ts) and, if the file truly needs to write it, add it to ALLOWED_WRITERS with the reason",
    ).toEqual([]);
  });

  it("the allow-list is current (every entry still writes the column)", () => {
    for (const rel of ALLOWED_WRITERS) {
      expect(
        sessionWriteDataBlocks(read(join(ROOT, rel))).some((block) => WRITES_WORKSPACE.test(block)),
        `${rel} no longer writes workspaceId — drop it from ALLOWED_WRITERS`,
      ).toBe(true);
    }
  });

  describe("transcription router procedures take the value from the resolver", () => {
    const source = read(join(ROOT, "src/server/api/routers/transcription.ts"));
    const PROCEDURE_START =
      /\n  ([a-zA-Z]+): (protectedProcedure|humanOnlyProcedure|publicProcedure|apiKeyMiddleware)/g;
    const starts = [...source.matchAll(PROCEDURE_START)];

    function procedureBody(name: string): string {
      const index = starts.findIndex((m) => m[1] === name);
      if (index === -1) throw new Error(`procedure ${name} not found`);
      const from = starts[index]!.index!;
      const to = starts[index + 1]?.index ?? source.length;
      return source.slice(from, to);
    }

    /** Procedures whose session writes carry a workspaceId. */
    const writers = starts
      .map((m) => m[1]!)
      .filter((name) => sessionWriteDataBlocks(procedureBody(name)).some((b) => WRITES_WORKSPACE.test(b)));

    it("only the known procedures write it", () => {
      expect(writers.sort()).toEqual(["createManualTranscription", "startSession", "updateDetails"]);
    });

    it.each(["startSession", "createManualTranscription", "updateDetails"])(
      "%s resolves the workspace rather than storing its input",
      (name) => {
        const body = procedureBody(name);
        expect(body).toMatch(/resolveMeetingWorkspace\(/);
        for (const block of sessionWriteDataBlocks(body)) {
          expect(block).not.toMatch(
            /^\s*workspaceId:\s*(input\.workspaceId|workspaceId\s*\?\?\s*null)\s*,?\s*$/m,
          );
        }
      },
    );
  });
});
