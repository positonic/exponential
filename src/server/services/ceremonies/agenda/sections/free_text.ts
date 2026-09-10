/**
 * `free_text`: owner-written items from the template section's
 * `config.items` (an array of strings), as `text` items. Hand-added items on
 * the occurrence itself are kept by buildAgenda, not produced here.
 */
import type { AgendaItem, SectionModule } from "../types";

export const freeTextSection: SectionModule = {
  type: "free_text",
  run(_ctx, section) {
    const raw = section.config?.items;
    const lines = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
    return Promise.resolve(
      lines.map<AgendaItem>((text, index) => ({
        id: `${section.key}:text:${index}`,
        sectionKey: section.key,
        title: text.trim(),
        refType: "text",
        refId: `${section.key}:text:${index}`,
        order: index,
      })),
    );
  },
};
