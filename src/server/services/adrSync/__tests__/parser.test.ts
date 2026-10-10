/**
 * Parser tests fixtured from the real ADR formats found in the wild across
 * this workspace's repos (see the Decision Log PRD): YAML frontmatter,
 * `# ADR 0001 — Title` + bulleted Status, plain `Status:` line, and no
 * status at all — plus the unfilled template and duplicate-number pairs.
 */

import { describe, expect, it } from "vitest";
import { parseAdr } from "../parser";

const FRONTMATTER_ADR = `---
status: Accepted
date: 2026-01-15
---

# ADR-0017: Markdown as the canonical content format

## Context

Everything is markdown.
`;

const HEADING_BULLET_ADR = `# ADR 0001 — Activity feed storage

- **Status**: Accepted
- **Date**: 2025-11-02

## Context
`;

const PLAIN_STATUS_ADR = `# Use Celery for pipeline jobs

Status: Superseded by ADR-0002

## Context
`;

const NO_STATUS_ADR = `# Some early decision

## Context

We never wrote a status line.
`;

describe("parseAdr", () => {
  it("parses number and slug from the filename", () => {
    const parsed = parseAdr({
      path: "docs/adr/0017-markdown-canonical-content-format.md",
      content: FRONTMATTER_ADR,
    });
    expect(parsed.number).toBe(17);
    expect(parsed.slug).toBe("markdown-canonical-content-format");
  });

  it("reads status and date from YAML frontmatter", () => {
    const parsed = parseAdr({
      path: "docs/adr/0017-markdown.md",
      content: FRONTMATTER_ADR,
    });
    expect(parsed.status).toBe("ACCEPTED");
    expect(parsed.statusRaw).toBe("Accepted");
    expect(parsed.decidedAt?.getUTCFullYear()).toBe(2026);
  });

  it("strips the ADR-number prefix from the title", () => {
    const parsed = parseAdr({
      path: "docs/adr/0017-markdown.md",
      content: FRONTMATTER_ADR,
    });
    expect(parsed.title).toBe("Markdown as the canonical content format");
  });

  it("reads a bulleted bold Status line under an em-dash heading", () => {
    const parsed = parseAdr({
      path: "docs/adr/0001-activity-feed-storage.md",
      content: HEADING_BULLET_ADR,
    });
    expect(parsed.title).toBe("Activity feed storage");
    expect(parsed.number).toBe(1);
    expect(parsed.status).toBe("ACCEPTED");
    expect(parsed.decidedAt).not.toBeNull();
  });

  it("reads a plain Status: line and preserves the verbatim string", () => {
    const parsed = parseAdr({
      path: "docs/adr/0001-celery.md",
      content: PLAIN_STATUS_ADR,
    });
    expect(parsed.status).toBe("SUPERSEDED");
    expect(parsed.statusRaw).toBe("Superseded by ADR-0002");
  });

  it("maps a missing status to UNKNOWN instead of failing", () => {
    const parsed = parseAdr({
      path: "docs/adr/0002-early.md",
      content: NO_STATUS_ADR,
    });
    expect(parsed.status).toBe("UNKNOWN");
    expect(parsed.statusRaw).toBeNull();
    expect(parsed.isTemplate).toBe(false);
  });

  it("handles a file with no number prefix", () => {
    const parsed = parseAdr({
      path: "docs/adr/template.md",
      content: NO_STATUS_ADR,
    });
    expect(parsed.number).toBeNull();
    expect(parsed.slug).toBe("template");
  });

  it("detects the unfilled template alternation as a template", () => {
    const parsed = parseAdr({
      path: "docs/adr/template.md",
      content: `# Title\n\nStatus: Proposed | Accepted | Rejected | Deprecated | Superseded\n`,
    });
    expect(parsed.isTemplate).toBe(true);
    expect(parsed.status).toBe("UNKNOWN");
  });

  it("falls back to the filename slug when there is no heading", () => {
    const parsed = parseAdr({
      path: "docs/adr/0009-connected-accounts.md",
      content: "Just prose, no heading.\n",
    });
    expect(parsed.title).toBe("connected accounts");
  });

  // ── Fixtures verbatim from real ADRs in the wild ──────────────────────────

  it("reads the `## Status` section format (exponential's dominant format)", () => {
    // Verbatim head of exponential's docs/adr/0001-activity-feed-storage.md
    const parsed = parseAdr({
      path: "docs/adr/0001-activity-feed-storage.md",
      content: `# Activity feed: two storage paths, union at read

## Status

Accepted — 2026-05-14.

⚠️ **Accuracy caveat (2026-06-14):** the GitHub half of this ADR (decisions #3–#5
`,
    });
    expect(parsed.title).toBe("Activity feed: two storage paths, union at read");
    expect(parsed.status).toBe("ACCEPTED");
    expect(parsed.statusRaw).toBe("Accepted — 2026-05-14.");
    expect(parsed.decidedAt?.toISOString().slice(0, 10)).toBe("2026-05-14");
  });

  it("reads a bold Deferred-status under a `## Status` heading as UNKNOWN with verbatim raw", () => {
    // Verbatim from exponential's docs/adr/0019-persist-polled-commits.md
    const parsed = parseAdr({
      path: "docs/adr/0019-persist-polled-commits.md",
      content: `# Persist polled commits

## Status

**Deferred — 2026-06-14.** **Declaration premise superseded by
[ADR-0020](0020-github-repo-association-via-app-installation.md).**
`,
    });
    expect(parsed.status).toBe("UNKNOWN");
    expect(parsed.statusRaw).toContain("Deferred — 2026-06-14.");
  });

  it("reads the `# ADR-NNNN: Title` + plain Status line format", () => {
    // Verbatim head of exponential's docs/adr/0029-ai-bug-fixer-workflow.md
    const parsed = parseAdr({
      path: "docs/adr/0029-ai-bug-fixer-workflow.md",
      content: `# ADR-0029: Autonomous AI bug-fixer via GitHub Actions

Status: Accepted

## Context
`,
    });
    expect(parsed.title).toBe("Autonomous AI bug-fixer via GitHub Actions");
    expect(parsed.number).toBe(29);
    expect(parsed.status).toBe("ACCEPTED");
  });

  it("handles a no-status ADR that opens straight into Context (mastra's format)", () => {
    // Verbatim head of mastra's docs/adr/0001-robust-tool-inputs.md
    const parsed = parseAdr({
      path: "docs/adr/0001-robust-tool-inputs.md",
      content: `# Robust tool inputs: coerce to preserve intent, never invent it

## Context

Agent tools (called by Zoe et al. from the exponential chat surface) repeatedly
`,
    });
    expect(parsed.status).toBe("UNKNOWN");
    expect(parsed.statusRaw).toBeNull();
    expect(parsed.title).toBe(
      "Robust tool inputs: coerce to preserve intent, never invent it",
    );
  });

  it("parses a lowercase status and a parenthesised date", () => {
    const lower = parseAdr({
      path: "docs/adr/0056-x.md",
      content: `# X\n\nStatus: accepted\n`,
    });
    expect(lower.status).toBe("ACCEPTED");
    const dated = parseAdr({
      path: "docs/adr/0044-welcome-flow.md",
      content: `# Welcome flow\n\nStatus: Accepted (2026-07-17)\n`,
    });
    expect(dated.status).toBe("ACCEPTED");
    expect(dated.decidedAt?.toISOString().slice(0, 10)).toBe("2026-07-17");
  });

  it("tolerates a duplicate-number pair — both parse, identity is a label not a key", () => {
    // exponential itself has two 0055s.
    const a = parseAdr({
      path: "docs/adr/0055-outcomes-deprecated-and-removed-from-the-product.md",
      content: `# Outcomes deprecated\n\nStatus: Accepted\n`,
    });
    const b = parseAdr({
      path: "docs/adr/0055-password-credential-in-its-own-table.md",
      content: `# Password credential in its own table\n\nStatus: Accepted\n`,
    });
    expect(a.number).toBe(55);
    expect(b.number).toBe(55);
    expect(a.slug).not.toBe(b.slug);
  });
});
