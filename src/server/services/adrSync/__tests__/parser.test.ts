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
});
