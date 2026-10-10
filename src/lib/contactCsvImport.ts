/**
 * Pure helpers for the CRM CSV contact import. Shared between the upload
 * dialog (client-side preview + column mapping) and the server-side import
 * service, so both sides parse and interpret the file identically.
 *
 * No server-only imports allowed here — this module runs in the browser.
 */

/** Where a CSV column's values land on the contact. */
export const CONTACT_CSV_TARGETS = [
  { value: "skip", label: "Don't import" },
  { value: "fullName", label: "Full name (split into first/last)" },
  { value: "firstName", label: "First name" },
  { value: "lastName", label: "Last name" },
  { value: "email", label: "Email (dedup key)" },
  { value: "phone", label: "Phone" },
  { value: "linkedIn", label: "LinkedIn" },
  { value: "twitter", label: "Twitter / X" },
  { value: "github", label: "GitHub" },
  { value: "telegram", label: "Telegram" },
  { value: "bluesky", label: "Bluesky" },
  { value: "about", label: "About / notes" },
  { value: "profileType", label: "Contact type" },
  { value: "tags", label: "Tags (comma-separated)" },
  { value: "firstSeenAt", label: "First seen (date)" },
  { value: "dealValue", label: "Revenue → create Deal" },
  { value: "metadata", label: "Keep as imported data" },
] as const;

export type CsvColumnTarget = (typeof CONTACT_CSV_TARGETS)[number]["value"];

export const CSV_TARGET_VALUES = CONTACT_CSV_TARGETS.map(
  (t) => t.value,
) as [CsvColumnTarget, ...CsvColumnTarget[]];

/** Column header (as it appears in the file) → destination field. */
export type CsvColumnMapping = Record<string, CsvColumnTarget>;

export interface ParsedCsv {
  headers: string[];
  /** Data rows, each padded/truncated to headers.length. */
  rows: string[][];
}

/**
 * Minimal RFC 4180 parser: quoted fields (with embedded commas, newlines and
 * `""` escapes), CRLF or LF line endings, and a UTF-8 BOM. Blank lines are
 * skipped. Ragged rows are normalized to the header width.
 */
export function parseCsv(text: string): ParsedCsv {
  const input = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAnything = false;

  const endField = () => {
    record.push(field);
    field = "";
  };
  const endRecord = () => {
    endField();
    // A record of one empty field is a blank line — drop it.
    if (record.length > 1 || (record[0] ?? "").trim() !== "") {
      records.push(record);
    }
    record = [];
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
      sawAnything = true;
    } else if (ch === ",") {
      endField();
    } else if (ch === "\n") {
      endRecord();
    } else if (ch === "\r") {
      if (input[i + 1] === "\n") i++;
      endRecord();
    } else {
      field += ch;
      sawAnything = true;
    }
  }
  if (field !== "" || record.length > 0) endRecord();

  if (!sawAnything || records.length === 0) {
    throw new Error("The file is empty");
  }
  if (inQuotes) {
    throw new Error("Malformed CSV: unterminated quoted field");
  }

  const headers = (records[0] ?? []).map((h) => h.trim());
  if (headers.every((h) => h === "")) {
    throw new Error("The file has no column headers");
  }
  const rows = records.slice(1).map((r) => {
    const row = r.slice(0, headers.length);
    while (row.length < headers.length) row.push("");
    return row;
  });
  return { headers, rows };
}

/** Loose email shape check — enough to reject obviously-not-an-email cells. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Best-guess destination for a column header ("first_name" → firstName …). */
export function suggestTarget(header: string): CsvColumnTarget {
  const key = header.toLowerCase().replace(/[^a-z0-9]/g, "");
  const exact: Record<string, CsvColumnTarget> = {
    name: "fullName",
    fullname: "fullName",
    firstname: "firstName",
    givenname: "firstName",
    lastname: "lastName",
    surname: "lastName",
    familyname: "lastName",
    email: "email",
    emailaddress: "email",
    phone: "phone",
    phonenumber: "phone",
    mobile: "phone",
    linkedin: "linkedIn",
    linkedinurl: "linkedIn",
    twitter: "twitter",
    x: "twitter",
    github: "github",
    telegram: "telegram",
    bluesky: "bluesky",
    tags: "tags",
    labels: "tags",
    about: "about",
    bio: "about",
    notes: "about",
    firstseen: "firstSeenAt",
    revenue: "dealValue",
  };
  // Unknown columns default to "metadata" rather than "skip": an import
  // exists to keep data, and the mapping step lets the user drop noise.
  return exact[key] ?? "metadata";
}

export interface ParsedMoney {
  value: number;
  /** ISO 4217 code, best-effort from the symbol/prefix; USD when ambiguous. */
  currency: string;
}

/** Parse "US$400.00", "$1,234.56", "€50", "GBP 120" … */
export function parseMoney(raw: string): ParsedMoney | null {
  const text = raw.trim();
  if (!text) return null;
  const numMatch = /-?\d[\d,]*(?:\.\d+)?/.exec(text);
  if (!numMatch) return null;
  const value = Number.parseFloat(numMatch[0].replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;

  let currency = "USD";
  const codeMatch = /^([A-Za-z]{3})[\s$]/.exec(text);
  if (text.includes("€")) currency = "EUR";
  else if (text.includes("£")) currency = "GBP";
  else if (codeMatch) currency = codeMatch[1]!.toUpperCase();
  return { value, currency };
}

/** Split a comma/semicolon-separated tag cell into trimmed unique tags. */
export function parseTags(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter((t) => t !== ""),
    ),
  ];
}

/** "Lynda Stuart" → { firstName: "Lynda", lastName: "Stuart" }. */
export function splitFullName(raw: string): {
  firstName: string | null;
  lastName: string | null;
} {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: null };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

export function parseDateCell(raw: string): Date | null {
  const text = raw.trim();
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? null : new Date(ms);
}

/** One CSV row interpreted through the column mapping. */
export interface ContactCsvRow {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  linkedIn: string | null;
  twitter: string | null;
  github: string | null;
  telegram: string | null;
  bluesky: string | null;
  about: string | null;
  profileType: string | null;
  tags: string[];
  firstSeenAt: Date | null;
  deal: ParsedMoney | null;
  /** Cells mapped to "metadata", keyed by the original column header. */
  metadata: Record<string, string>;
}

/**
 * Interpret one data row through the mapping. Explicit firstName/lastName
 * columns win over a split fullName column when both are mapped.
 */
export function buildContactRow(
  headers: string[],
  row: string[],
  mapping: CsvColumnMapping,
): ContactCsvRow {
  const result: ContactCsvRow = {
    email: null,
    firstName: null,
    lastName: null,
    phone: null,
    linkedIn: null,
    twitter: null,
    github: null,
    telegram: null,
    bluesky: null,
    about: null,
    profileType: null,
    tags: [],
    firstSeenAt: null,
    deal: null,
    metadata: {},
  };
  let splitName: { firstName: string | null; lastName: string | null } | null =
    null;

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i]!;
    const target = mapping[header] ?? "skip";
    const cell = (row[i] ?? "").trim();
    if (target === "skip" || cell === "") continue;
    switch (target) {
      case "fullName":
        splitName = splitFullName(cell);
        break;
      case "firstName":
      case "lastName":
      case "phone":
      case "linkedIn":
      case "twitter":
      case "github":
      case "telegram":
      case "bluesky":
      case "about":
      case "profileType":
        result[target] = cell;
        break;
      case "email":
        result.email = looksLikeEmail(cell) ? cell : null;
        break;
      case "tags":
        result.tags = [...new Set([...result.tags, ...parseTags(cell)])];
        break;
      case "firstSeenAt":
        result.firstSeenAt = parseDateCell(cell);
        break;
      case "dealValue":
        result.deal = parseMoney(cell);
        break;
      case "metadata":
        result.metadata[header] = cell;
        break;
    }
  }

  if (splitName) {
    result.firstName ??= splitName.firstName;
    result.lastName ??= splitName.lastName;
  }
  return result;
}
