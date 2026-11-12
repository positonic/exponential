/**
 * Which Auth.js providers an install registers. An OAuth provider exists only
 * when its id and secret are both set; the email provider (`postmark`) and the
 * desktop bridge are always there. Registered is what `/signin` offers, since
 * both read `resolveSignInMethods`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/services/EmailService", () => ({
  sendFirstLoginWelcomeEmail: vi.fn(),
  sendSignInCodeEmail: vi.fn(),
  sendWelcomeWithSignInCodeEmail: vi.fn(),
}));

const PROVIDER_VARS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "AUTH_DISCORD_ID",
  "AUTH_DISCORD_SECRET",
  "NOTION_CLIENT_ID",
  "NOTION_CLIENT_SECRET",
  "MICROSOFT_ENTRA_ID_CLIENT_ID",
  "MICROSOFT_ENTRA_ID_CLIENT_SECRET",
];

async function providerIds(vars: Record<string, string>): Promise<string[]> {
  for (const name of PROVIDER_VARS) vi.stubEnv(name, "");
  for (const [name, value] of Object.entries(vars)) vi.stubEnv(name, value);
  vi.resetModules();
  const { authConfig } = await import("../config");
  return authConfig.providers.map((provider) => {
    const resolved = typeof provider === "function" ? provider() : provider;
    // Auth.js applies user options (e.g. Credentials' `id: "desktop"`) over
    // the factory defaults when it parses providers; do the same here.
    const options = (resolved as { options?: { id?: string } }).options;
    return options?.id ?? resolved.id;
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("authConfig.providers", () => {
  it("with no OAuth keys, registers only the email provider, the desktop bridge and first-run setup", async () => {
    expect((await providerIds({})).sort()).toEqual(["desktop", "postmark", "setup"]);
  });

  it("a Google id and secret add Google", async () => {
    const ids = await providerIds({ GOOGLE_CLIENT_ID: "g-id", GOOGLE_CLIENT_SECRET: "g-secret" });
    expect(ids).toContain("google");
  });

  it("a Discord id alone does not add Discord", async () => {
    expect(await providerIds({ AUTH_DISCORD_ID: "d-id" })).not.toContain("discord");
  });

  it("a Discord id and secret add Discord, and Notion needs its own pair", async () => {
    const ids = await providerIds({
      AUTH_DISCORD_ID: "d-id",
      AUTH_DISCORD_SECRET: "d-secret",
      NOTION_CLIENT_ID: "n-id",
    });
    expect(ids).toContain("discord");
    expect(ids).not.toContain("notion");
  });

  it("Microsoft stays absent while MICROSOFT_LOGIN_ENABLED is false", async () => {
    const ids = await providerIds({
      MICROSOFT_ENTRA_ID_CLIENT_ID: "m-id",
      MICROSOFT_ENTRA_ID_CLIENT_SECRET: "m-secret",
    });
    expect(ids).not.toContain("microsoft-entra-id");
  });
});
