/**
 * The committed agent procedure contract matches the router.
 *
 * `contracts/agent-procedures.json` holds the input of every procedure an
 * agent tool calls. The Mastra repo checks each tool's request against its
 * copy of that file. This test fails when the file is stale, so a change to
 * one of those inputs shows up in the pull request as a contract change.
 *
 * To update the file: `npm run contracts:generate`.
 *
 * No database: the router is only read for its input schemas.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "sk-test-dummy";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.GOOGLE_CLIENT_ID ??= "test";
  process.env.GOOGLE_CLIENT_SECRET ??= "test";
  process.env.MASTRA_API_URL ??= "http://localhost:4111";
  process.env.AUTH_DISCORD_ID ??= "test";
  process.env.AUTH_DISCORD_SECRET ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.DATABASE_ENCRYPTION_KEY ??= "0".repeat(64);
});

vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(_opts?: unknown) {
      // intentionally empty
    }
  },
}));

vi.mock("next-auth", () => ({
  default: () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("next-auth/providers/discord", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/notion", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/postmark", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/microsoft-entra-id", () => ({ default: vi.fn() }));

vi.mock("~/server/auth", () => ({
  auth: () => null,
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("~/server/db", () => ({ db: {} }));

import { appRouter } from "~/server/api/root";
import { AGENT_PROCEDURES, AGENT_ROUTERS } from "../agentProcedures";
import {
  buildAgentProcedureContract,
  serializeContract,
  type ProcedureLike,
} from "../buildAgentProcedureContract";

const CONTRACT_FILE = path.resolve(process.cwd(), "contracts/agent-procedures.json");
const shouldWrite = process.env.UPDATE_AGENT_CONTRACT === "1";

function currentContract(): string {
  const procedures = (appRouter as unknown as { _def: { procedures: Record<string, ProcedureLike> } })
    ._def.procedures;
  return serializeContract(
    buildAgentProcedureContract(procedures, { routers: AGENT_ROUTERS, procedures: AGENT_PROCEDURES }),
  );
}

function proceduresOf(text: string): Record<string, unknown> {
  try {
    return (JSON.parse(text) as { procedures?: Record<string, unknown> }).procedures ?? {};
  } catch {
    return {};
  }
}

/** The procedures that differ between the committed file and the router. */
function changedProcedures(committedText: string, currentText: string): string[] {
  const committed = proceduresOf(committedText);
  const current = proceduresOf(currentText);
  const lines: string[] = [];
  for (const name of Object.keys(current)) {
    if (!(name in committed)) lines.push(`  added    ${name}`);
    else if (JSON.stringify(committed[name]) !== JSON.stringify(current[name])) lines.push(`  changed  ${name}`);
  }
  for (const name of Object.keys(committed)) {
    if (!(name in current)) lines.push(`  removed  ${name}`);
  }
  return lines.length > 0 ? lines : ["  (formatting only)"];
}

describe("agent procedure contract", () => {
  it("contracts/agent-procedures.json matches the router's inputs", () => {
    const current = currentContract();

    if (shouldWrite) {
      writeFileSync(CONTRACT_FILE, current);
      return;
    }

    let committed = "";
    try {
      committed = readFileSync(CONTRACT_FILE, "utf8");
    } catch {
      // A missing file reads as empty, so the message below still applies.
    }

    expect(
      committed === current,
      "contracts/agent-procedures.json is stale. These procedures an agent tool calls have a changed input:\n" +
        changedProcedures(committed, current).join("\n") +
        "\n\nRun `npm run contracts:generate` and commit the file. " +
        "Then check that the Mastra tool that calls each procedure still sends a valid request " +
        "(in the Mastra repo: `npm run contracts:sync`, then `npm test`).",
    ).toBe(true);
  });
});
