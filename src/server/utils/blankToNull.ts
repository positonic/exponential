/**
 * Optional free text is "none", never an empty string: `""`, whitespace,
 * `null` and `undefined` all map to `null`; anything else is returned
 * trimmed. The one normalisation for descriptions and "not accountable for"
 * on the write side and for the roster's `agentDescription` on the read
 * side, so no two call sites disagree about blank input.
 */
export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length === 0 ? null : trimmed;
}
