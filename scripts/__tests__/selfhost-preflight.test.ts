/**
 * The self-host preflight's decisions: whether this Postgres can hold the
 * schema (pgvector, 0.5.0+ for HNSW), how a failed extension migration is
 * explained, and which env combinations stop startup.
 */

import { describe, expect, it } from "vitest";
import {
  checkPgvector,
  explainMigrationFailure,
  formatSetupTokenBanner,
  preflightEnv,
  PGVECTOR_MISSING_MESSAGE,
} from "../selfhost/preflight";

describe("checkPgvector", () => {
  it("fails, naming pgvector, when the server does not ship the extension", () => {
    const result = checkPgvector(undefined);
    expect(result).toEqual({ ok: false, message: PGVECTOR_MISSING_MESSAGE });
    expect(PGVECTOR_MISSING_MESSAGE).toMatch(/pgvector/);
  });

  it("fails, naming pgvector, below 0.5.0 (no HNSW)", () => {
    const result = checkPgvector({ default_version: "0.4.4", installed_version: null });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/pgvector 0\.4\.4.*0\.5\.0/);
  });

  it("checks the installed version when there is one", () => {
    const result = checkPgvector({ default_version: "0.8.0", installed_version: "0.4.0" });
    expect(result.ok).toBe(false);
  });

  it("passes when available but not yet installed (the migration creates it)", () => {
    expect(checkPgvector({ default_version: "0.8.0", installed_version: null })).toEqual({
      ok: true,
      installed: false,
    });
  });

  it("passes when installed at 0.5.0 or newer", () => {
    expect(checkPgvector({ default_version: "0.5.0", installed_version: "0.5.0" })).toEqual({
      ok: true,
      installed: true,
    });
    expect(checkPgvector({ default_version: "0.10.1", installed_version: null }).ok).toBe(true);
  });
});

describe("explainMigrationFailure", () => {
  it("turns a privilege failure into a CREATE EXTENSION instruction", () => {
    const message = explainMigrationFailure(
      'Error: P3018\nDatabase error: ERROR: permission denied to create extension "vector"',
    );
    expect(message).toMatch(/CREATE EXTENSION vector as a superuser/);
  });

  it("names pgvector when the extension is unavailable", () => {
    expect(explainMigrationFailure('ERROR: extension "vector" is not available')).toBe(PGVECTOR_MISSING_MESSAGE);
  });

  it("leaves unrelated failures alone", () => {
    expect(explainMigrationFailure("P1001: Can't reach database server")).toBeNull();
  });
});

describe("preflightEnv", () => {
  it("stops on SMTP_HOST without a sender", () => {
    const result = preflightEnv({ SMTP_HOST: "smtp.example.test" });
    expect(result.error).toMatch(/EMAIL_FROM/);
  });

  it("prints the active sign-in methods", () => {
    const result = preflightEnv({ SMTP_HOST: "smtp.example.test", EMAIL_FROM: "a@example.test" });
    expect(result.error).toBeNull();
    expect(result.lines[0]).toBe("[selfhost] Sign-in methods: email codes (SMTP)");
  });

  it("with no LLM key, starts and lists AI as off with each variable that turns it on", () => {
    const result = preflightEnv({ NODE_ENV: "production", AUTH_LOG_SIGN_IN_CODES: "true" });
    expect(result.error).toBeNull();
    const text = result.lines.join("\n");
    expect(text).toMatch(/AI features: off \(optional\)/);
    expect(text).toMatch(/OPENAI_API_KEY/);
    expect(text).toMatch(/ANTHROPIC_API_KEY/);
    expect(text).toMatch(/MASTRA_API_URL/);
  });

  it("with every AI variable set, lists what is on and nothing to add", () => {
    const result = preflightEnv({
      NODE_ENV: "production",
      AUTH_LOG_SIGN_IN_CODES: "true",
      OPENAI_API_KEY: "sk-test",
      ANTHROPIC_API_KEY: "sk-ant-test",
      MASTRA_API_URL: "https://mastra.example.test",
    });
    const aiLines = result.lines.filter((line) => line.includes("AI features") || line.includes("To turn on"));
    expect(aiLines).toEqual(["[selfhost] AI features: OpenAI, Anthropic, Assistant (Mastra)"]);
  });

  it("warns, without stopping, when log delivery is on", () => {
    const result = preflightEnv({ AUTH_LOG_SIGN_IN_CODES: "true" });
    expect(result.error).toBeNull();
    expect(result.lines.join("\n")).toMatch(/anyone who can read this log/);
  });

  it("warns, without stopping, when there is no way in", () => {
    const result = preflightEnv({});
    expect(result.error).toBeNull();
    expect(result.lines.join("\n")).toMatch(/no sign-in method is configured.*AUTH_LOG_SIGN_IN_CODES/);
  });
});

describe("formatSetupTokenBanner", () => {
  const expiresAt = new Date("2026-11-13T10:00:00Z");

  it("prints the token, where to enter it and when it stops working", () => {
    const text = formatSetupTokenBanner({ token: "ABCDE-FGHJK-MNPQR-STVWX", expiresAt, baseUrl: "https://ops.example.test/" }).join("\n");
    expect(text).toContain("ABCDE-FGHJK-MNPQR-STVWX");
    expect(text).toContain("https://ops.example.test/setup");
    expect(text).toContain("2026-11-13T10:00:00.000Z");
    expect(text).toMatch(/once/);
  });

  it("falls back to the path when the public URL isn't known", () => {
    const text = formatSetupTokenBanner({ token: "T", expiresAt, baseUrl: undefined }).join("\n");
    expect(text).toContain("/setup on this install");
  });

  it("prefixes every line so it is easy to find in a platform log", () => {
    for (const line of formatSetupTokenBanner({ token: "T", expiresAt, baseUrl: undefined })) {
      expect(line.startsWith("[selfhost]")).toBe(true);
    }
  });
});
