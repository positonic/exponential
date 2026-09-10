/**
 * Pure assembly of an agenda snapshot (ADR-0059): sections in template
 * order, query items as produced, hand-added items and per-item state
 * (resolved, reorder) carried over from the previous snapshot of the same
 * occurrence so regeneration never loses a person's edits.
 */
import type { AgendaItem, AgendaSection, AgendaSnapshot, AgendaTemplateSection } from "./types";

export interface SectionRunResult {
  section: AgendaTemplateSection;
  items: AgendaItem[];
  /** Set when no module exists for the type or the query found nothing. */
  emptyReason?: string | null;
}

export function buildAgenda(
  template: AgendaTemplateSection[],
  results: SectionRunResult[],
  previous: AgendaSnapshot | null,
  now: Date,
): AgendaSnapshot {
  const byKey = new Map(results.map((r) => [r.section.key, r]));
  const prevSections = new Map((previous?.sections ?? []).map((s) => [s.key, s]));

  const sections: AgendaSection[] = template.map((tpl) => {
    const run = byKey.get(tpl.key);
    const prev = prevSections.get(tpl.key);
    const prevById = new Map((prev?.items ?? []).map((i) => [i.id, i]));

    // Query items: fresh from the run, but keep a person's resolution and
    // any explicit order they gave the item last time.
    const fresh: AgendaItem[] = (run?.items ?? []).map((item) => {
      const old = prevById.get(item.id);
      return old
        ? { ...item, resolvedAt: old.resolvedAt ?? null, order: old.order }
        : item;
    });
    const freshIds = new Set(fresh.map((i) => i.id));

    // Hand-added and carried items are not re-derivable from a query, so they
    // ride along unchanged until someone resolves or removes them.
    const kept: AgendaItem[] = (prev?.items ?? []).filter(
      (i) => !freshIds.has(i.id) && (i.addedByUserId || i.carriedFromOccurrenceId),
    );

    const items = [...fresh, ...kept]
      .sort((a, b) => a.order - b.order)
      .map((item, index) => ({ ...item, order: index }));

    return {
      key: tpl.key,
      type: tpl.type,
      title: tpl.title,
      minutes: tpl.minutes ?? null,
      items,
      emptyReason: items.length === 0 ? run?.emptyReason ?? "Nothing to raise" : null,
    };
  });

  return {
    version: 1,
    generatedAt: now.toISOString(),
    sections,
    narrative: previous?.narrative ?? null,
    narratedAt: previous?.narratedAt ?? null,
  };
}
