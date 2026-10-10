/**
 * A Decision's label is `D-` + its workspace-sequence number, zero-padded to
 * four digits (`D-0042`). It is rendered, never stored (ADR-0060), so this
 * is the one place the format lives — server rows, the Decision Log, the
 * meeting page and Zoe all call it.
 */
export function formatDecisionLabel(number: number): string {
  return `D-${String(number).padStart(4, "0")}`;
}
