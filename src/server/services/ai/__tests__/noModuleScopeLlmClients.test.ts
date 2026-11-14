// @vitest-environment node
/**
 * Guard: nothing under src/ builds an LLM client at module scope.
 *
 * The `openai` SDK throws in its constructor without a key, so one module-scope
 * `new OpenAI()` turns a keyless self-host install into a 500 on every route
 * that imports the file (and a `next build` that needs a dummy key). Build
 * clients lazily instead: `getOpenAIClient()` in `../clients.ts`, or a
 * `??=` getter inside a function.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../../../..");

const LLM_CONSTRUCTORS = [
  "OpenAI",
  "AzureOpenAI",
  "Anthropic",
  "ChatOpenAI",
  "ChatAnthropic",
  "OpenAIEmbeddings",
];

/**
 * A line that starts at column 0 (a top-level statement, not a function body)
 * and constructs an LLM client: `const openai = new OpenAI({...})`,
 * `export const model = new ChatOpenAI(...)`, `createOpenAI({...})`.
 */
const MODULE_SCOPE_CLIENT = new RegExp(
  String.raw`^(?!\s)(?!//|\*|/\*).*(\bnew\s+(${LLM_CONSTRUCTORS.join("|")})\s*\(|\bcreate(OpenAI|Anthropic)\s*\()`,
);

export function findModuleScopeClients(source: string): number[] {
  return source
    .split("\n")
    .flatMap((line, index) => (MODULE_SCOPE_CLIENT.test(line) ? [index + 1] : []));
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === "__tests__" || name === "node_modules" ? [] : sourceFiles(full);
    }
    return /\.(ts|tsx|js|mjs)$/.test(name) && !/\.test\.|\.spec\./.test(name) ? [full] : [];
  });
}

describe("module-scope LLM clients", () => {
  it("the matcher flags a module-scope client and ignores a lazy one", () => {
    expect(findModuleScopeClients(`import OpenAI from "openai";\nconst openai = new OpenAI({ apiKey });\n`)).toEqual([2]);
    expect(findModuleScopeClients(`export const model = new ChatOpenAI({ modelName });`)).toEqual([1]);
    expect(findModuleScopeClients(`const anthropic = createAnthropic({});`)).toEqual([1]);
    expect(
      findModuleScopeClients(
        `function getClient() {\n  return (cached ??= new OpenAI({ apiKey }));\n}\n// const old = new OpenAI();\n`,
      ),
    ).toEqual([]);
  });

  it("no file under src/ constructs one at module scope", () => {
    const offenders = sourceFiles(SRC).flatMap((file) =>
      findModuleScopeClients(readFileSync(file, "utf8")).map(
        (line) => `${path.relative(SRC, file)}:${line}`,
      ),
    );

    expect(offenders, "Build LLM clients lazily (see src/server/services/ai/clients.ts)").toEqual([]);
  });
});
