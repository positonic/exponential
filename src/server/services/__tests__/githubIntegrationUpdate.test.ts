/**
 * Regression test: re-running the GitHub connect flow must not wipe the
 * stored access token (2026-07-30 integration-secrets audit, standalone bug).
 *
 * updateGithubIntegration used an UNSCOPED updateMany over every credential
 * row of the integration, rewriting access_token into github_metadata and
 * leaving N identical metadata rows. It must instead replace-in-place scoped
 * by keyType (same pattern as upsertWorkspaceInstallation), storing the fresh
 * token encrypted.
 *
 * Uses an in-memory credential store behind a mocked Prisma client — no real
 * DB, ever (see CLAUDE.md "Test database safety").
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  // Raw 32-byte key (encryption.ts accepts raw or base64-encoded 32 bytes).
  process.env.DATABASE_ENCRYPTION_KEY = "0".repeat(32);
});

interface Row {
  id: string;
  integrationId: string;
  key: string;
  keyType: string;
  isEncrypted: boolean;
}

const store = vi.hoisted(() => ({ rows: [] as Row[], nextId: 1 }));

vi.mock("~/server/db", () => ({
  db: {
    integration: {
      update: vi.fn().mockResolvedValue({}),
    },
    integrationCredential: {
      deleteMany: vi.fn(async ({ where }: { where: { integrationId: string; keyType?: { in: string[] } } }) => {
        const before = store.rows.length;
        store.rows = store.rows.filter(
          (r) =>
            r.integrationId !== where.integrationId ||
            (where.keyType ? !where.keyType.in.includes(r.keyType) : false),
        );
        return { count: before - store.rows.length };
      }),
      createMany: vi.fn(async ({ data }: { data: Omit<Row, "id">[] }) => {
        for (const d of data) {
          store.rows.push({ ...d, id: `cred-${store.nextId++}` });
        }
        return { count: data.length };
      }),
      create: vi.fn(async ({ data }: { data: Omit<Row, "id"> }) => {
        const row = { ...data, id: `cred-${store.nextId++}` };
        store.rows.push(row);
        return row;
      }),
      updateMany: vi.fn(async () => {
        throw new Error(
          "updateGithubIntegration must not use updateMany on credentials — an unscoped updateMany is exactly the bug this test guards against",
        );
      }),
    },
    workflow: { create: vi.fn().mockResolvedValue({}) },
  },
}));

import { githubIntegrationService } from "~/server/services/github-integration";
import { decryptCredential } from "~/server/utils/credentialHelper";

const OAUTH_DATA = {
  accessToken: "gho_fresh_token",
  scopes: ["repo"],
  githubUser: { id: 1, login: "octocat", avatar_url: "http://x" },
  selectedRepository: {
    id: 10,
    name: "repo",
    full_name: "octocat/repo",
    private: false,
    permissions: { push: true },
  },
  installationId: 42,
};

describe("updateGithubIntegration credential handling", () => {
  beforeEach(() => {
    store.rows = [
      {
        id: "cred-token",
        integrationId: "int-1",
        key: "gho_original_token",
        keyType: "access_token",
        isEncrypted: false,
      },
      {
        id: "cred-meta",
        integrationId: "int-1",
        key: "{}",
        keyType: "github_metadata",
        isEncrypted: false,
      },
      {
        id: "cred-other-int",
        integrationId: "int-2",
        key: "unrelated",
        keyType: "access_token",
        isEncrypted: false,
      },
    ];
  });

  it("preserves a usable access_token across repeated connects and does not accumulate metadata rows", async () => {
    await githubIntegrationService.updateGithubIntegration("user-1", "int-1", OAUTH_DATA);
    await githubIntegrationService.updateGithubIntegration("user-1", "int-1", OAUTH_DATA);

    const mine = store.rows.filter((r) => r.integrationId === "int-1");
    const tokens = mine.filter((r) => r.keyType === "access_token");
    const metas = mine.filter((r) => r.keyType === "github_metadata");

    expect(tokens).toHaveLength(1);
    expect(metas).toHaveLength(1);
    // The stored token is the fresh one, decryptable, and actually encrypted.
    expect(decryptCredential(tokens[0]!.key, tokens[0]!.isEncrypted)).toBe("gho_fresh_token");

    // Other integrations' credentials are untouched.
    expect(store.rows.find((r) => r.id === "cred-other-int")).toBeDefined();
  });
});
