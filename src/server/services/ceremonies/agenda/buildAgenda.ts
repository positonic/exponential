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
      // A person's manual tick survives regeneration, but a section that
      // derives `resolvedAt` from a query fact (retro_actions reads the
      // Action's `completedAt`) must win — otherwise an action completed
      // between two generations comes back as still outstanding.
      return old
        ? { ...item, resolvedAt: item.resolvedAt ?? old.resolvedAt ?? null, order: old.order ?? item.order }
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

  // The narrative belongs to one generation: it is written fresh (or left
  // empty) by the caller, never carried from a previous snapshot whose
  // items may no longer match.
  //
  // `matrixPosts` is the opposite case — an append-only delivery ledger that
  // is not derived from any query, so it must survive the rebuild. Dropping
  // it would reset both the repost guard and the transaction-id attempt
  // counter, and the homeserver would silently swallow the repost.
  return {
    version: 1,
    generatedAt: now.toISOString(),
    sections,
    narrative: null,
    narratedAt: null,
    ...(previous?.matrixPosts?.length ? { matrixPosts: previous.matrixPosts } : {}),
  };
}
