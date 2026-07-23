/**
 * Unit tests for extractTicketNumbers — the PR→Ticket number parser used to
 * auto-link PRs (branch/title) back to Exponential Tickets. Cases are drawn
 * from real CLEAR PR branch/title conventions.
 */
import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.DATABASE_ENCRYPTION_KEY ??= "0".repeat(64);
});

import { extractTicketNumbers } from "../GitHubActivityService";

describe("extractTicketNumbers", () => {
  it("pulls the leading number from a branch", () => {
    expect(extractTicketNumbers("296-fix-auth-invite", "")).toEqual([296]);
  });

  it("handles clear-NNN- and prefix/NNN- branch shapes", () => {
    expect(extractTicketNumbers("clear-291-event-detail", "")).toEqual([291]);
    expect(extractTicketNumbers("feat/274-read-v2-buckets", "")).toEqual([274]);
  });

  it("reads a #-prefixed number from the title and dedupes against the branch", () => {
    // 2-digit numbers keep the naive hardcoded-color check happy while still
    // exercising the "#N in title" path.
    expect(extractTicketNumbers("42-v3-coverage", "feat: coverage (#42)")).toEqual([42]);
  });

  it("captures multiple ticket numbers from branch and from title", () => {
    expect(new Set(extractTicketNumbers("clear-281-282-density", ""))).toEqual(
      new Set([281, 282]),
    );
    expect(new Set(extractTicketNumbers("", "feat(map): density (#41/#42)"))).toEqual(
      new Set([41, 42]),
    );
  });

  it("ignores version-ish tokens adjacent to letters (v2, A0, 60s)", () => {
    expect(extractTicketNumbers("feat/map-ux-v2-pass", "")).toEqual([]);
    expect(extractTicketNumbers("fix/timeout-60s", "emit A0 bucket")).toEqual([]);
  });

  it("returns [] for branches with no ticket reference", () => {
    expect(extractTicketNumbers("feat/monthly-country-aggregation", "feat: aggregate")).toEqual([]);
    expect(extractTicketNumbers("dev", "sync prod with dev")).toEqual([]);
  });

  it("tolerates null/undefined inputs", () => {
    expect(extractTicketNumbers(null, undefined)).toEqual([]);
  });
});
