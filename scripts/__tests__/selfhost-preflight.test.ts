/**
 * The self-host preflight's decisions: whether this Postgres can hold the
 * schema (pgvector, 0.5.0+ for HNSW), how a failed extension migration is
 * explained, and which env combinations stop startup.
 */

import { describe, expect, it } from "vitest";
import {
  checkPgvector,
  explainMigrationFailure,
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
    expect(result.lines).toEqual(["[selfhost] Sign-in methods: email codes (SMTP)"]);
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
