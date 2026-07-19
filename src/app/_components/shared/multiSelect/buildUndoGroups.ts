/**
 * Group the items affected by a bulk update by their PREVIOUS values of the
 * patched fields, so "Undo" can restore them with one bulk call per distinct
 * prior state (usually 1-3 calls) instead of one call per item.
 */
export function buildUndoGroups<T extends { id: string }>(
  items: T[],
  prevOf: (item: T) => Record<string, unknown>,
): Array<{ ids: string[]; patch: Record<string, unknown> }> {
  const groups = new Map<
    string,
    { ids: string[]; patch: Record<string, unknown> }
  >();
  for (const item of items) {
    const patch = prevOf(item);
    const key = JSON.stringify(
      Object.keys(patch)
        .sort()
        .map((k) => [k, patch[k]]),
    );
    const group = groups.get(key);
    if (group) group.ids.push(item.id);
    else groups.set(key, { ids: [item.id], patch });
  }
  return Array.from(groups.values());
}
