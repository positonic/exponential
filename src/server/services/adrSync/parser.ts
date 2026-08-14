import type { AdrStatus } from "@prisma/client";

/**
 * adrSync/parser — lenient, pure parsing of one ADR markdown file.
 *
 * ADRs in the wild come in (at least) four formats: YAML frontmatter with a
 * `status:` key, `# ADR 0001 — Title` headings with a bulleted `**Status**:`
 * line, a plain `Status: ...` line, and files with no status at all. The
 * parser never throws on content: anything unparseable degrades field by
 * field (status → UNKNOWN, title → filename slug) rather than failing the
 * file. Git stays the source of truth — this only projects.
 */

export interface ParsedAdr {
  /** First `#` heading with any `ADR-NNNN` prefix stripped; falls back to the filename slug. */
  title: string;
  /** Sequence number from the `NNNN-` filename prefix; null when absent. */
  number: number | null;
  /** Filename without the number prefix and `.md` suffix; null when empty. */
  slug: string | null;
  status: AdrStatus;
  /** Verbatim status string from the file (null when no status was found). */
  statusRaw: string | null;
  /** Date from frontmatter `date:` or a `Date:` line, when parseable. */
  decidedAt: Date | null;
  /**
   * True when the status is the template alternation ("Proposed | Accepted |
   * ...") — the file is an unfilled ADR template and should be skipped.
   */
  isTemplate: boolean;
}

/** How many body lines are scanned for a `Status:` / `Date:` line. */
const HEADER_SCAN_LINES = 15;

const STATUS_LINE_RE = /^[-*\s]*\**Status\**\s*:\s*(.+)$/i;
const DATE_LINE_RE = /^[-*\s]*\**Date\**\s*:\s*(.+)$/i;
/** `## Status` section heading — the status text is the next non-empty line. */
const STATUS_HEADING_RE = /^#{2,}\s*Status\s*$/i;

/**
 * The unfilled-template signature: a status offering the choices instead of
 * picking one, e.g. "Proposed | Accepted | Rejected | Deprecated | Superseded".
 */
const TEMPLATE_STATUS_RE = /proposed\s*\|\s*accepted/i;

function mapStatus(raw: string | null): AdrStatus {
  if (!raw) return "UNKNOWN";
  // Anchor at the start: the leading word is the primary state. A trailing
  // "…superseded by NNNN" is an edge (derived separately), not the state —
  // e.g. "Deferred — premise superseded by ADR-0020" must NOT map SUPERSEDED.
  const s = raw.trim().toLowerCase();
  if (s.startsWith("propos")) return "PROPOSED";
  if (s.startsWith("accept")) return "ACCEPTED";
  if (s.startsWith("supersed")) return "SUPERSEDED";
  if (s.startsWith("deprecat")) return "DEPRECATED";
  return "UNKNOWN";
}

/** Extract simple `key: value` pairs from a leading YAML frontmatter block. */
function parseFrontmatter(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!content.startsWith("---")) return out;
  const end = content.indexOf("\n---", 3);
  if (end === -1) return out;
  const block = content.slice(3, end);
  for (const line of block.split("\n")) {
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (m?.[1] && m[2] !== undefined) {
      out[m[1].toLowerCase()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return out;
}

function parseDate(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseAdr({
  path,
  content,
}: {
  path: string;
  content: string;
}): ParsedAdr {
  const filename = path.split("/").pop() ?? path;
  const base = filename.replace(/\.md$/i, "");
  const numberMatch = /^(\d{4})-?/.exec(base);
  const number = numberMatch?.[1] ? parseInt(numberMatch[1], 10) : null;
  const slugPart = numberMatch ? base.slice(numberMatch[0].length) : base;
  const slug = slugPart.length > 0 ? slugPart : null;

  const frontmatter = parseFrontmatter(content);
  const frontmatterEnd = content.startsWith("---")
    ? content.indexOf("\n---", 3)
    : -1;
  const afterFrontmatter =
    frontmatterEnd !== -1 ? content.slice(frontmatterEnd + 4) : content;
  const lines = afterFrontmatter.split("\n");

  // Title: first `#` heading, stripped of any ADR-number prefix.
  let title: string | null = null;
  for (const line of lines) {
    const m = /^#\s+(.+)$/.exec(line.trim());
    if (m?.[1]) {
      title = m[1].replace(/^ADR[- ]?\d+\s*[—:-]\s*/i, "").trim();
      break;
    }
  }
  if (!title || title.length === 0) {
    title = slug ? slug.replace(/-/g, " ") : base;
  }

  // Status, in order of precedence: frontmatter `status:`; a `Status: ...`
  // line; a `## Status` section heading whose next non-empty line is the
  // status text (the dominant format in this workspace's own repos). Scanning
  // is bounded to the first N body lines.
  let statusRaw: string | null = frontmatter.status ?? null;
  let dateRaw: string | null = frontmatter.date ?? null;
  const headLines = lines.slice(0, HEADER_SCAN_LINES);
  if (!statusRaw) {
    for (const line of headLines) {
      const m = STATUS_LINE_RE.exec(line);
      if (m?.[1]) {
        statusRaw = m[1].replace(/\**\s*$/, "").trim();
        break;
      }
    }
  }
  if (!statusRaw) {
    for (let i = 0; i < headLines.length; i++) {
      if (!STATUS_HEADING_RE.test(headLines[i]?.trim() ?? "")) continue;
      for (let j = i + 1; j < lines.length && j < i + 1 + HEADER_SCAN_LINES; j++) {
        const candidate = lines[j]?.trim() ?? "";
        if (candidate.length === 0) continue;
        if (candidate.startsWith("#")) break; // next section — no status text
        statusRaw = candidate.replace(/^\**|\**$/g, "").trim();
        break;
      }
      break;
    }
  }
  if (!dateRaw) {
    for (const line of headLines) {
      const m = DATE_LINE_RE.exec(line);
      if (m?.[1]) {
        dateRaw = m[1].replace(/\**\s*$/, "").trim();
        break;
      }
    }
  }
  // "Accepted — 2026-05-14." style: the date lives inside the status text.
  if (!dateRaw && statusRaw) {
    const m = /\b(\d{4}-\d{2}-\d{2})\b/.exec(statusRaw);
    if (m?.[1]) dateRaw = m[1];
  }

  const isTemplate = statusRaw !== null && TEMPLATE_STATUS_RE.test(statusRaw);

  return {
    title,
    number,
    slug,
    status: isTemplate ? "UNKNOWN" : mapStatus(statusRaw),
    statusRaw,
    decidedAt: parseDate(dateRaw),
    isTemplate,
  };
}
