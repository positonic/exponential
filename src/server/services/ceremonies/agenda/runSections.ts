/**
 * Runs a template's sections through the registry. Sections that read their
 * siblings' output (`carried_over`) run after every other section, with the
 * records those produced in `producedRefIds`; results come back in template
 * order regardless.
 */
import type { SectionRunResult } from "./buildAgenda";
import { getSectionModule } from "./sections";
import { agendaRefKey, RUN_LAST_SECTION_TYPES, type AgendaTemplateSection, type SectionContext } from "./types";

export async function runAgendaSections(ctx: SectionContext, template: AgendaTemplateSection[]): Promise<SectionRunResult[]> {
  const byKey = new Map<string, SectionRunResult>();
  const produced = new Set<string>();

  const run = async (section: AgendaTemplateSection, sectionCtx: SectionContext) => {
    const mod = getSectionModule(section.type);
    if (!mod) {
      byKey.set(section.key, { section, items: [], emptyReason: `No query for "${section.type}" yet` });
      return;
    }
    const items = await mod.run(sectionCtx, section);
    byKey.set(section.key, { section, items, emptyReason: items.length === 0 ? "Nothing to raise" : null });
    if (!RUN_LAST_SECTION_TYPES.has(section.type)) for (const item of items) produced.add(agendaRefKey(item));
  };

  for (const section of template) if (!RUN_LAST_SECTION_TYPES.has(section.type)) await run(section, ctx);
  for (const section of template) if (RUN_LAST_SECTION_TYPES.has(section.type)) await run(section, { ...ctx, producedRefIds: produced });

  return template.map((section) => byKey.get(section.key)!);
}
