import type { PrismaClient } from "@prisma/client";
import { listForEntity, setEntityTags } from "./TagAssignmentService";

/**
 * Label references for tickets written by agents (Mastra tools, cold.nebula).
 *
 * An agent knows a label by whatever it last saw: a tag id from `listLabels`,
 * its slug, or the display name the user typed ("AI buildable"). This module
 * resolves those references against the tags a ticket may carry (global tags
 * plus the ticket's workspace tags) and applies the result through
 * `setEntityTags`, so the access check and tag-scope check are the same ones
 * the label picker and the MCP `labels set_for_entity` path run.
 *
 * Unknown references are never created here: an agent guessing a label name
 * would otherwise mint a new tag on every typo. They come back as warnings so
 * the agent can say what it skipped. (Bulk import keeps its create-on-miss
 * behaviour for provenance tags such as FROM-NOTION.)
 */

export interface TicketLabel {
  id: string;
  name: string;
  slug: string;
}

export interface ResolvedLabelRefs {
  tags: TicketLabel[];
  /** References that matched no tag available in the workspace. */
  unresolved: string[];
}

/** Same slug rule as `tag.create`, so a display name finds its tag. */
export function slugifyLabelRef(ref: string): string {
  return ref
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function cleanRefs(refs: readonly string[]): string[] {
  return [...new Set(refs.map((r) => r.trim()).filter((r) => r.length > 0))];
}

/**
 * Resolve label references (ids, slugs or names) to tags available in
 * `workspaceId`. A workspace tag wins over a global tag with the same slug,
 * matching `resolveOrCreateWorkspaceTags`.
 */
export async function resolveLabelRefs(
  db: PrismaClient,
  workspaceId: string,
  refs: readonly string[],
): Promise<ResolvedLabelRefs> {
  const cleaned = cleanRefs(refs);
  if (cleaned.length === 0) return { tags: [], unresolved: [] };

  const slugs = [...new Set(cleaned.map(slugifyLabelRef).filter((s) => s.length > 0))];
  const candidates = await db.tag.findMany({
    where: {
      AND: [
        { OR: [{ workspaceId }, { workspaceId: null }] },
        { OR: [{ id: { in: cleaned } }, { slug: { in: slugs } }] },
      ],
    },
    select: { id: true, name: true, slug: true, workspaceId: true },
  });

  const byId = new Map(candidates.map((t) => [t.id, t]));
  const bySlug = new Map<string, (typeof candidates)[number]>();
  for (const tag of candidates) {
    const existing = bySlug.get(tag.slug);
    // Workspace tag shadows a global tag with the same slug.
    if (!existing || (existing.workspaceId === null && tag.workspaceId !== null)) {
      bySlug.set(tag.slug, tag);
    }
  }

  const tags: TicketLabel[] = [];
  const seen = new Set<string>();
  const unresolved: string[] = [];
  for (const ref of cleaned) {
    const hit = byId.get(ref) ?? bySlug.get(slugifyLabelRef(ref));
    if (!hit) {
      unresolved.push(ref);
      continue;
    }
    if (seen.has(hit.id)) continue;
    seen.add(hit.id);
    tags.push({ id: hit.id, name: hit.name, slug: hit.slug });
  }
  return { tags, unresolved };
}

export interface TicketLabelChange {
  /** Replace the ticket's whole label set. */
  set?: readonly string[];
  /** Add these labels, keeping the existing ones. */
  add?: readonly string[];
  /** Remove these labels. */
  remove?: readonly string[];
}

export interface TicketLabelResult {
  /** The ticket's labels after the change. */
  labels: TicketLabel[];
  warnings: string[];
}

function unresolvedWarning(refs: string[]): string {
  return `Label${refs.length === 1 ? "" : "s"} not found in this workspace: ${refs
    .map((r) => `"${r}"`)
    .join(", ")}. Call list-labels for the labels you can use.`;
}

/** True when the change asks for any label write at all. */
export function hasLabelChange(change: TicketLabelChange): boolean {
  return change.set !== undefined || change.add !== undefined || change.remove !== undefined;
}

/**
 * Apply a label change to a ticket. The caller must already have checked the
 * user's edit access to the ticket's product; `listForEntity` /
 * `setEntityTags` re-check workspace membership, and `resolveLabelRefs` only
 * ever returns global or workspace tags.
 *
 * `add` / `remove` are written incrementally (createMany skipDuplicates,
 * deleteMany scoped to the ticket), never as a full replacement built from a
 * snapshot: two agents editing labels at once must not undo each other, so an
 * add can never delete a label it did not read.
 *
 * `set` is an explicit full replacement through `setEntityTags`. A `set` with
 * any unresolved reference leaves the labels untouched: replacing with the
 * subset that did resolve would silently drop labels the agent meant to keep.
 * Unresolved `add`/`remove` references are skipped individually.
 */
export async function applyTicketLabels(
  db: PrismaClient,
  params: {
    userId: string;
    ticketId: string;
    workspaceId: string;
    change: TicketLabelChange;
  },
): Promise<TicketLabelResult> {
  const { userId, ticketId, workspaceId, change } = params;
  const warnings: string[] = [];

  // Membership check + the labels as they stand.
  const current = (
    await listForEntity({ db, userId, entityType: "ticket", entityId: ticketId })
  ).map(toLabel);

  if (!hasLabelChange(change)) return { labels: current, warnings };

  const [setRefs, addRefs, removeRefs] = await Promise.all([
    change.set ? resolveLabelRefs(db, workspaceId, change.set) : null,
    change.add ? resolveLabelRefs(db, workspaceId, change.add) : null,
    change.remove ? resolveLabelRefs(db, workspaceId, change.remove) : null,
  ]);

  if (setRefs && setRefs.unresolved.length > 0) {
    warnings.push(
      `${unresolvedWarning(setRefs.unresolved)} Labels were left unchanged.`,
    );
    return { labels: current, warnings };
  }
  for (const refs of [addRefs, removeRefs]) {
    if (refs && refs.unresolved.length > 0) warnings.push(unresolvedWarning(refs.unresolved));
  }

  const removeIds = new Set((removeRefs?.tags ?? []).map((t) => t.id));
  const addIds = (addRefs?.tags ?? []).map((t) => t.id).filter((id) => !removeIds.has(id));

  if (setRefs) {
    // Explicit replacement: the agent named the whole set.
    const finalIds = [...new Set([...setRefs.tags.map((t) => t.id), ...addIds])].filter(
      (id) => !removeIds.has(id),
    );
    const result = await setEntityTags({
      db,
      userId,
      entityType: "ticket",
      entityId: ticketId,
      tagIds: finalIds,
    });
    return { labels: result.tags.map(toLabel), warnings };
  }

  if (removeIds.size === 0 && addIds.length === 0) return { labels: current, warnings };

  await db.$transaction([
    ...(removeIds.size > 0
      ? [db.ticketTag.deleteMany({ where: { ticketId, tagId: { in: [...removeIds] } } })]
      : []),
    ...(addIds.length > 0
      ? [
          db.ticketTag.createMany({
            data: addIds.map((tagId) => ({ ticketId, tagId })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);

  const rows = await db.ticketTag.findMany({
    where: { ticketId },
    select: { tag: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });
  return { labels: rows.map((row) => toLabel(row.tag)), warnings };
}

function toLabel(tag: { id: string; name: string; slug: string }): TicketLabel {
  return { id: tag.id, name: tag.name, slug: tag.slug };
}
