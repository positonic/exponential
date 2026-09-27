/**
 * Content of a ceremony occurrence's notes page (ADR-0059 + ADR-0033):
 * seeded from the agenda when the page is created, and extended with the
 * recording's summary when the occurrence is captured.
 *
 * Both writers assemble a ProseMirror document with the shared codec and
 * derive the Markdown projection from that document, so `bodyDoc` and
 * `body` can never disagree (ADR-0024). Nothing here ever overwrites text
 * a person has typed: the seed only lands on an empty page, and the append
 * is a compare-and-set on `docVersion` that retries once against a fresh
 * read and then gives up.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { JSONContent } from "@tiptap/core";
import { z } from "zod";
import { docToMarkdownServer, markdownToDocServer } from "~/server/services/prd/markdown-doc";
import { getEmbeddingTriggerService } from "~/server/services/embedding/EmbeddingTriggerService";
import type { AgendaSnapshot } from "./agenda/types";
import { ensureOccurrenceNotesPage, type NotesPageCeremony, type NotesPageOccurrence } from "./notesPage";

export const DRAFT_AGENDA_HEADING = "Draft agenda";
export const MEETING_SUMMARY_HEADING = "Meeting summary";

export interface NotesSeed {
  bodyDoc: JSONContent;
  body: string;
}

/** Push every Markdown heading one level down so the narrative nests under its own heading. */
export function demoteHeadings(markdown: string): string {
  return markdown.replace(/^(#{1,5})(?=\s)/gm, "#$1");
}

/**
 * The seed as Markdown: one `##` heading per agenda section, in order, then
 * the AI pre-read under "Draft agenda" when there is one. Headings only —
 * the sections' items live in the structured agenda above the page and are
 * not copied, so a regenerated agenda and the notes cannot drift apart.
 */
export function buildNotesSeedMarkdown(agenda: AgendaSnapshot): string {
  const parts = agenda.sections.map((section) => `## ${section.title.trim() || section.key}`);
  const narrative = agenda.narrative?.trim();
  if (narrative) {
    parts.push(`## ${DRAFT_AGENDA_HEADING}`, demoteHeadings(narrative));
  }
  return parts.join("\n\n");
}

/** The seed as the editor stores it: canonical doc plus its Markdown projection. */
export function buildNotesSeed(agenda: AgendaSnapshot): NotesSeed {
  const bodyDoc = markdownToDocServer(buildNotesSeedMarkdown(agenda));
  return { bodyDoc, body: docToMarkdownServer(bodyDoc) };
}

/** True when the doc carries no text at all (an empty paragraph counts as empty). */
function isDocBlank(doc: JSONContent | null | undefined): boolean {
  if (!doc) return true;
  return docToMarkdownServer(doc).trim() === "";
}

/**
 * Seed a page that exists but has never been written to — the case for
 * pages created before seeding shipped, or created without a seed. A page
 * anyone has saved (`docVersion > 0`) or that carries any text is left
 * alone; the write is guarded on `docVersion = 0` so an editor save that
 * lands in between wins.
 */
export async function seedNotesPageIfUntouched(db: PrismaClient, pageId: string, seed: NotesSeed): Promise<boolean> {
  const page = await db.knowledgePage.findUnique({
    where: { id: pageId },
    select: { docVersion: true, body: true, bodyDoc: true },
  });
  if (!page || page.docVersion > 0) return false;
  if (page.body?.trim()) return false;
  if (!isDocBlank(page.bodyDoc as JSONContent | null)) return false;
  const { count } = await db.knowledgePage.updateMany({
    where: { id: pageId, docVersion: 0 },
    data: { bodyDoc: seed.bodyDoc as Prisma.InputJsonValue, body: seed.body, docVersion: { increment: 1 } },
  });
  if (count === 0) return false;
  getEmbeddingTriggerService(db).triggerPageEmbedding(pageId);
  return true;
}

/**
 * Make sure the occurrence has a notes page and that a page nobody has
 * touched carries the agenda seed. Called once the agenda (and its
 * narrative, when narration ran) is durable.
 */
export async function ensureSeededOccurrenceNotesPage(
  db: PrismaClient,
  occurrence: NotesPageOccurrence,
  ceremony: NotesPageCeremony,
  agenda: AgendaSnapshot,
): Promise<{ pageId: string; created: boolean; seeded: boolean }> {
  const seed = buildNotesSeed(agenda);
  const { pageId, created } = await ensureOccurrenceNotesPage(db, occurrence, ceremony, {
    seed: { bodyDoc: seed.bodyDoc as Prisma.InputJsonValue, body: seed.body },
  });
  if (created) {
    if (seed.body.trim()) getEmbeddingTriggerService(db).triggerPageEmbedding(pageId);
    return { pageId, created, seeded: true };
  }
  const seeded = await seedNotesPageIfUntouched(db, pageId, seed);
  return { pageId, created, seeded };
}

const firefliesSummary = z.object({
  overview: z.string().optional(),
  detailed_breakdown: z.string().optional(),
  shorthand_bullet: z.array(z.string()).optional(),
});

/**
 * A recording's persisted summary (`TranscriptionSession.summary`, the
 * Fireflies-shaped JSON `ensureMeetingSummary` writes) as Markdown: the
 * overview, then the themed breakdown, falling back to the flat bullets for
 * summaries generated before the breakdown existed. Anything that is not
 * that JSON is treated as prose and used as-is.
 */
export function summaryToMarkdown(summary: string | null | undefined): string {
  const raw = summary?.trim() ?? "";
  if (!raw) return "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  const res = firefliesSummary.safeParse(parsed);
  if (!res.success) return raw;
  const parts: string[] = [];
  if (res.data.overview?.trim()) parts.push(res.data.overview.trim());
  if (res.data.detailed_breakdown?.trim()) parts.push(demoteHeadings(res.data.detailed_breakdown.trim()));
  else if (res.data.shorthand_bullet?.length) parts.push(res.data.shorthand_bullet.map((b) => `- ${b}`).join("\n"));
  return parts.join("\n\n");
}

function hasHeading(doc: JSONContent, text: string): boolean {
  return (doc.content ?? []).some(
    (node) =>
      node.type === "heading" &&
      (node.content ?? []).map((c) => c.text ?? "").join("").trim().toLowerCase() === text.toLowerCase(),
  );
}

export type AppendSummaryResult =
  | { appended: true; pageId: string; docVersion: number }
  | { appended: false; reason: "no-page" | "empty-summary" | "already-appended" | "conflict" };

/**
 * Append a "Meeting summary" section with the recording's summary to the
 * occurrence's notes page. Read → assemble → compare-and-set on the
 * `docVersion` read; a lost race (someone saved in between) re-reads once
 * and tries again, then reports a conflict rather than clobbering. A page
 * that already has the section (a second capture) is left alone.
 */
export async function appendMeetingSummaryToNotes(
  db: PrismaClient,
  occurrenceId: string,
  summaryMarkdown: string,
): Promise<AppendSummaryResult> {
  const summary = summaryMarkdown.trim();
  if (!summary) return { appended: false, reason: "empty-summary" };
  const occurrence = await db.ceremonyOccurrence.findUnique({
    where: { id: occurrenceId },
    select: { notesPageId: true },
  });
  const pageId = occurrence?.notesPageId;
  if (!pageId) return { appended: false, reason: "no-page" };

  const fragment = markdownToDocServer(`## ${MEETING_SUMMARY_HEADING}\n\n${summary}`).content ?? [];

  for (let attempt = 0; attempt < 2; attempt++) {
    const page = await db.knowledgePage.findUnique({
      where: { id: pageId },
      select: { bodyDoc: true, body: true, docVersion: true },
    });
    if (!page) return { appended: false, reason: "no-page" };
    // A page the editor has not opened yet has no doc; derive it from the
    // Markdown the same way the editor's lazy migration would.
    const baseDoc = (page.bodyDoc as JSONContent | null) ?? markdownToDocServer(page.body);
    if (hasHeading(baseDoc, MEETING_SUMMARY_HEADING)) return { appended: false, reason: "already-appended" };
    const baseContent = (baseDoc.content ?? []).filter(
      // Drop the single empty paragraph of a blank page so the summary is not preceded by a gap.
      (node, _i, all) => !(all.length === 1 && node.type === "paragraph" && !(node.content?.length)),
    );
    const nextDoc: JSONContent = { ...baseDoc, type: "doc", content: [...baseContent, ...fragment] };
    const nextBody = docToMarkdownServer(nextDoc);
    const { count } = await db.knowledgePage.updateMany({
      where: { id: pageId, docVersion: page.docVersion },
      data: { bodyDoc: nextDoc as Prisma.InputJsonValue, body: nextBody, docVersion: { increment: 1 } },
    });
    if (count === 1) {
      getEmbeddingTriggerService(db).triggerPageEmbedding(pageId);
      return { appended: true, pageId, docVersion: page.docVersion + 1 };
    }
  }
  return { appended: false, reason: "conflict" };
}
