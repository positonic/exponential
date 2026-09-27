/**
 * Smart-merge rules for CRM contacts.
 *
 * Pure functions shared by the `crmContact.merge` procedures and the merge
 * dialog, so the proposal the user reviews is exactly what the server applies.
 * The server passes decrypted candidates in; nothing here touches the DB.
 *
 * Rules (in order of precedence for a single-valued field):
 *   1. The user's explicit choice ("take this field from that contact").
 *   2. Otherwise the kept (primary) contact's own value, if it has one.
 *   3. Otherwise the most complete other contact's value — but a value a human
 *      typed beats one the enrichment agent filled in (ADR-0036), since the
 *      agent can confidently pick the wrong same-named person.
 * Multi-valued fields (skills, tags) are always the union.
 */

export const MERGE_FIELD_KEYS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "linkedIn",
  "telegram",
  "twitter",
  "github",
  "bluesky",
  "about",
  "profileType",
  "organizationId",
] as const;

export type MergeFieldKey = (typeof MERGE_FIELD_KEYS)[number];

export const MERGE_FIELDS: ReadonlyArray<{ key: MergeFieldKey; label: string }> = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "organizationId", label: "Organization" },
  { key: "profileType", label: "Profile type" },
  { key: "linkedIn", label: "LinkedIn" },
  { key: "twitter", label: "Twitter / X" },
  { key: "github", label: "GitHub" },
  { key: "telegram", label: "Telegram" },
  { key: "bluesky", label: "Bluesky" },
  { key: "about", label: "About" },
];

/** Most contacts a single merge may fold together — keeps the dialog legible. */
export const MERGE_MAX_CONTACTS = 10;

export interface MergeRelatedCounts {
  interactions: number;
  communications: number;
  deals: number;
  meetings: number;
  screenshots: number;
  enrichments: number;
  listMemberships: number;
}

/** A contact as the merge sees it: PII already decrypted, relations counted. */
export interface MergeCandidate {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  linkedIn: string | null;
  telegram: string | null;
  twitter: string | null;
  github: string | null;
  bluesky: string | null;
  about: string | null;
  profileType: string | null;
  organizationId: string | null;
  organizationName: string | null;
  skills: string[];
  tags: string[];
  aiSourcedFields: string[];
  imageUrl: string | null;
  createdAt: Date;
  lastInteractionAt: Date | null;
  connectionScore: number | null;
  counts: MergeRelatedCounts;
}

export interface MergeFieldOption {
  contactId: string;
  value: string;
  /** What to show the user — the organization's name rather than its id. */
  display: string;
  isAiSourced: boolean;
}

export type MergeFieldStatus = "empty" | "single" | "same" | "conflict";

export interface MergeFieldProposal {
  key: MergeFieldKey;
  label: string;
  /** Non-empty values only, in suggestion order (kept contact first). */
  options: MergeFieldOption[];
  suggestedContactId: string | null;
  status: MergeFieldStatus;
}

export interface MergeProposal {
  primaryId: string;
  fields: MergeFieldProposal[];
  skills: string[];
  tags: string[];
}

/** Per-field override: the contact to take the value from, or null to clear it. */
export type MergeChoices = Partial<Record<MergeFieldKey, string | null>>;

export function contactDisplayName(c: Pick<MergeCandidate, "firstName" | "lastName" | "email">): string {
  return (
    [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
    c.email ||
    "Unnamed contact"
  );
}

function trimmed(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export function fieldValue(c: MergeCandidate, key: MergeFieldKey): string | null {
  return trimmed(c[key]);
}

/** Equality used to decide whether two contacts "agree" on a field. */
function normalizeForCompare(key: MergeFieldKey, value: string): string {
  const v = value.trim();
  return key === "email" ? v.toLowerCase() : v;
}

export function totalRelated(counts: MergeRelatedCounts): number {
  return (
    counts.interactions +
    counts.communications +
    counts.deals +
    counts.meetings +
    counts.screenshots +
    counts.enrichments +
    counts.listMemberships
  );
}

/**
 * How much a contact "knows": filled fields plus attached records. Used to pick
 * the default kept contact and to order fallbacks for empty fields.
 */
export function scoreCandidate(c: MergeCandidate): number {
  let score = 0;
  for (const key of MERGE_FIELD_KEYS) {
    if (fieldValue(c, key)) score += 1;
  }
  if (c.skills.length > 0) score += 1;
  if (c.tags.length > 0) score += 1;
  return score + totalRelated(c.counts);
}

function toTime(d: Date | string | null | undefined): number {
  if (!d) return Number.NaN;
  return new Date(d).getTime();
}

/** Richest contact wins; ties go to the oldest record (its id is likely linked elsewhere). */
export function orderByRichness(candidates: MergeCandidate[]): MergeCandidate[] {
  return [...candidates].sort((a, b) => {
    const diff = scoreCandidate(b) - scoreCandidate(a);
    if (diff !== 0) return diff;
    const byAge = toTime(a.createdAt) - toTime(b.createdAt);
    if (!Number.isNaN(byAge) && byAge !== 0) return byAge;
    return a.id.localeCompare(b.id);
  });
}

export function suggestPrimary(candidates: MergeCandidate[]): string {
  const first = orderByRichness(candidates)[0];
  if (!first) throw new Error("suggestPrimary: no candidates");
  return first.id;
}

export function unionValues(lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list) {
      const v = raw.trim();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

function optionsFor(ordered: MergeCandidate[], key: MergeFieldKey): MergeFieldOption[] {
  const options: MergeFieldOption[] = [];
  for (const c of ordered) {
    const value = fieldValue(c, key);
    if (!value) continue;
    options.push({
      contactId: c.id,
      value,
      display: key === "organizationId" ? (c.organizationName ?? value) : value,
      isAiSourced: c.aiSourcedFields.includes(key),
    });
  }
  return options;
}

function statusFor(key: MergeFieldKey, options: MergeFieldOption[]): MergeFieldStatus {
  if (options.length === 0) return "empty";
  if (options.length === 1) return "single";
  const distinct = new Set(options.map((o) => normalizeForCompare(key, o.value)));
  return distinct.size === 1 ? "same" : "conflict";
}

/**
 * The smart proposal for merging `candidates` into `primaryId`. Deterministic:
 * the same candidates and primary always yield the same proposal.
 */
export function proposeMerge(candidates: MergeCandidate[], primaryId: string): MergeProposal {
  const primary = candidates.find((c) => c.id === primaryId);
  if (!primary) throw new Error("proposeMerge: primaryId is not among the candidates");

  const others = orderByRichness(candidates.filter((c) => c.id !== primaryId));
  const ordered = [primary, ...others];

  const fields = MERGE_FIELDS.map(({ key, label }): MergeFieldProposal => {
    const options = optionsFor(ordered, key);
    // Kept contact first, then richest others — but never prefer an AI guess
    // over something a human typed.
    const suggested = options.find((o) => !o.isAiSourced) ?? options[0] ?? null;
    return {
      key,
      label,
      options,
      suggestedContactId: suggested?.contactId ?? null,
      status: statusFor(key, options),
    };
  });

  return {
    primaryId,
    fields,
    skills: unionValues(ordered.map((c) => c.skills)),
    tags: unionValues(ordered.map((c) => c.tags)),
  };
}

export interface ResolvedMerge {
  values: Record<MergeFieldKey, string | null>;
  /** Which contact each kept value came from (null when cleared / all empty). */
  sourceByField: Record<MergeFieldKey, string | null>;
  /** Keys whose kept value was AI-sourced on the contact it came from. */
  aiSourcedFields: string[];
  skills: string[];
  tags: string[];
}

/**
 * Apply the user's choices on top of the proposal and produce the final field
 * values. Throws on a choice that names a contact outside the merge or one
 * that has no value for that field — the caller turns that into a 4xx.
 */
export function resolveMergeChoices(
  candidates: MergeCandidate[],
  primaryId: string,
  choices: MergeChoices = {},
): ResolvedMerge {
  const proposal = proposeMerge(candidates, primaryId);
  const byId = new Map(candidates.map((c) => [c.id, c]));

  const values = {} as Record<MergeFieldKey, string | null>;
  const sourceByField = {} as Record<MergeFieldKey, string | null>;
  const aiSourcedFields: string[] = [];

  for (const field of proposal.fields) {
    const choice = field.key in choices ? choices[field.key] : undefined;
    const sourceId = choice === undefined ? field.suggestedContactId : choice;

    if (sourceId === null) {
      values[field.key] = null;
      sourceByField[field.key] = null;
      continue;
    }

    const source = byId.get(sourceId);
    if (!source) {
      throw new Error(`Field "${field.key}" was chosen from a contact that is not part of this merge`);
    }
    const value = fieldValue(source, field.key);
    if (!value) {
      throw new Error(`Field "${field.key}" was chosen from a contact that has no value for it`);
    }
    values[field.key] = value;
    sourceByField[field.key] = source.id;
    if (source.aiSourcedFields.includes(field.key)) aiSourcedFields.push(field.key);
  }

  return { values, sourceByField, aiSourcedFields, skills: proposal.skills, tags: proposal.tags };
}

/** Sum of records on the contacts that will be folded into the kept one. */
export function countsToMove(candidates: MergeCandidate[], primaryId: string): MergeRelatedCounts {
  const total: MergeRelatedCounts = {
    interactions: 0,
    communications: 0,
    deals: 0,
    meetings: 0,
    screenshots: 0,
    enrichments: 0,
    listMemberships: 0,
  };
  for (const c of candidates) {
    if (c.id === primaryId) continue;
    for (const k of Object.keys(total) as (keyof MergeRelatedCounts)[]) {
      total[k] += c.counts[k];
    }
  }
  return total;
}
