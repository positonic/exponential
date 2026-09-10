/**
 * Agenda shapes (ADR-0059, V2). An agenda is a snapshot stored on the
 * occurrence: the ceremony's typed sections in template order, each holding
 * items that came from a deterministic query over workspace data (or a
 * person's hand). The LLM only narrates; it never produces an item.
 */
import type { Ceremony, CeremonyOccurrence, Prisma, PrismaClient } from "@prisma/client";

export type AgendaRefType =
  | "action"
  | "decision"
  | "key_result"
  | "goal"
  | "ticket"
  | "cycle"
  | "meeting"
  | "text";

export interface AgendaItem {
  /** Stable per occurrence: `<sectionKey>:<refType>:<refId>` for query items, a cuid-ish for hand-added ones. */
  id: string;
  sectionKey: string;
  title: string;
  refType: AgendaRefType;
  /** The underlying record's id; for `text` items, the item id itself. */
  refId: string;
  /** Objective / key result the item rolls up to, when known (goal chips). */
  goalId?: number | null;
  keyResultId?: string | null;
  goalTitle?: string | null;
  keyResultTitle?: string | null;
  /** Set when the item was copied from a previous occurrence's unresolved list. */
  carriedFromOccurrenceId?: string | null;
  /** Set when a person added the item by hand; hand items survive regeneration. */
  addedByUserId?: string | null;
  resolvedAt?: string | null;
  order: number;
  /** One line of supporting detail ("no check-in for 9 days", "due 2 Sep"). */
  detail?: string | null;
  /** App-relative link to the record, when it has a page. */
  href?: string | null;
}

export interface AgendaSection {
  key: string;
  type: string;
  title: string;
  minutes?: number | null;
  items: AgendaItem[];
  /** Why the section is empty, when the query ran and found nothing. */
  emptyReason?: string | null;
}

export interface AgendaSnapshot {
  version: 1;
  generatedAt: string;
  sections: AgendaSection[];
  /** Markdown narrative rendered from the sections (V2 action 5); never parsed back. */
  narrative?: string | null;
  narratedAt?: string | null;
}

/** One section of the ceremony's template, as stored in `Ceremony.agendaTemplate`. */
export interface AgendaTemplateSection {
  key: string;
  type: string;
  title: string;
  minutes?: number;
  config?: Record<string, unknown>;
}

export interface SectionContext {
  db: PrismaClient;
  workspaceId: string;
  ceremony: Ceremony;
  occurrence: CeremonyOccurrence;
  previousOccurrence: CeremonyOccurrence | null;
  participantUserIds: string[];
  now: Date;
  /** Base path for links, `/w/<slug>`. */
  workspacePath: string;
}

export interface SectionModule {
  type: string;
  run(ctx: SectionContext, section: AgendaTemplateSection): Promise<AgendaItem[]>;
}

export function readAgendaTemplate(value: Prisma.JsonValue | null | undefined): AgendaTemplateSection[] {
  if (!Array.isArray(value)) return [];
  const out: AgendaTemplateSection[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const o = raw as Record<string, unknown>;
    if (typeof o.key !== "string" || typeof o.type !== "string" || typeof o.title !== "string") continue;
    out.push({
      key: o.key,
      type: o.type,
      title: o.title,
      minutes: typeof o.minutes === "number" ? o.minutes : undefined,
      config: o.config && typeof o.config === "object" && !Array.isArray(o.config) ? (o.config as Record<string, unknown>) : undefined,
    });
  }
  return out;
}

export function readAgendaSnapshot(value: Prisma.JsonValue | null | undefined): AgendaSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (!Array.isArray(o.sections)) return null;
  return o as unknown as AgendaSnapshot;
}
