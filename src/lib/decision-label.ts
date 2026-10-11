/**
 * A Decision's label is `D-` + its workspace-sequence number, zero-padded to
 * four digits (`D-0042`). It is rendered, never stored (ADR-0060), so this
 * is the one place the format lives — server rows, the Decision Log, the
 * meeting page and Zoe all call it.
 */
export function formatDecisionLabel(number: number): string {
  return `D-${String(number).padStart(4, "0")}`;
}

/** Postgres `Int` ceiling — a larger number cannot be a decision's. */
const MAX_DECISION_NUMBER = 2_147_483_647;

/**
 * The workspace-sequence number in a `D-0042` label (case-insensitive, any
 * zero padding), or null when the string is not a label — callers then treat
 * it as a row id. CUIDs never match: they carry no hyphen.
 */
export function parseDecisionLabel(value: string): number | null {
  const match = /^D-(\d+)$/i.exec(value.trim());
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isSafeInteger(number) || number < 1 || number > MAX_DECISION_NUMBER) return null;
  return number;
}
