/**
 * `up_next`: each participant's `COMMITTED` tickets in the current cycle of
 * every product in the workspace where they hold tickets — the Daily
 * summary's Up next, from the same `loadCycleBlocks` — plus one line for
 * their still-unrefined cycle tickets. Ticket links are app-relative (the
 * digest's absolute base is left empty here).
 */
import { loadCycleBlocks } from "~/server/services/notifications/emit/dailySummary/loaders";
import type { AgendaItem, SectionModule } from "../types";
import { briefPeople, personPrefix } from "./dailyBrief";

export const upNextSection: SectionModule = {
  type: "up_next",
  async run(ctx, section) {
    const workspaceSlug = ctx.workspacePath.replace(/^\/w\//, "");
    const people = await briefPeople(ctx);
    const items: AgendaItem[] = [];

    for (const person of people) {
      const prefix = personPrefix(people, person);
      const blocks = await loadCycleBlocks(
        ctx.db,
        person.id,
        { workspaceId: ctx.workspaceId, workspaceSlug },
        ctx.occurrence.scheduledStart,
        ctx.ceremony.timezone,
        "",
      );
      for (const block of blocks) {
        for (const t of block.upNext) {
          const refId = t.url.slice(t.url.lastIndexOf("/") + 1);
          items.push({
            id: `${section.key}:ticket:${refId}`,
            sectionKey: section.key,
            title: `${prefix}${t.label}`,
            refType: "ticket",
            refId,
            order: items.length,
            detail: blocks.length > 1 ? `${block.productName} · ${block.name}` : block.name,
            href: t.url,
          });
        }
        if (block.unrefinedCount > 0) {
          const id = `${section.key}:text:${person.id}:${block.productName}:unrefined`;
          items.push({
            id,
            sectionKey: section.key,
            title: `${prefix}${block.unrefinedCount} of your ${block.productName} cycle tickets still need${block.unrefinedCount === 1 ? "s" : ""} refinement`,
            refType: "text",
            refId: id,
            order: items.length,
            href: block.cycleUrl,
          });
        }
      }
    }
    return items;
  },
};
