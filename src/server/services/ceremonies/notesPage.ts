/**
 * The notes canvas of a ceremony occurrence (ADR-0059 + ADR-0033): one
 * Knowledge Page per occurrence, created lazily the first time its agenda is
 * generated and linked through `CeremonyOccurrence.notesPageId`. Reads and
 * writes of the page body go through the ordinary `page.*` procedures, so
 * the access rules in `src/server/services/access/` apply unchanged; this
 * module only owns creation and placement.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

export interface NotesPageOccurrence {
  id: string;
  workspaceId: string;
  scheduledStart: Date;
  notesPageId: string | null;
}

export interface NotesPageCeremony {
  name: string;
  timezone: string;
  /** The page is owned by the ceremony owner, whoever triggered generation. */
  ownerId: string;
  projects: { projectId: string }[];
}

export interface EnsureNotesPageOptions {
  /** Seed content for a page created by this call (ticket quiet.llama). */
  seed?: { bodyDoc: Prisma.InputJsonValue; body: string };
}

export interface EnsureNotesPageResult {
  pageId: string;
  created: boolean;
}

const titleDateFmt: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

/** `<ceremony name> — <date>` in the ceremony's zone: "Daily Standup — 8 Sept 2026". */
export function formatNotesPageTitle(ceremonyName: string, scheduledStart: Date, timezone?: string): string {
  let when: string;
  try {
    when = scheduledStart.toLocaleDateString("en-GB", { ...titleDateFmt, timeZone: timezone });
  } catch {
    when = scheduledStart.toISOString().slice(0, 10);
  }
  return `${ceremonyName} — ${when}`;
}

/**
 * Where the page lives. A ceremony scoped to exactly one project places its
 * notes in that project so the page inherits the project's visibility
 * (restricted allowlist included). A ceremony that walks several projects,
 * or none, keeps its notes workspace-visible: picking one of many projects
 * would hide the notes from the members of the others.
 */
export function resolveNotesPageProjectId(projects: { projectId: string }[]): string | null {
  return projects.length === 1 ? projects[0]!.projectId : null;
}

/**
 * Return the occurrence's notes page id, creating the page when there is
 * none. Idempotent: an occurrence that already has a page keeps it. The link
 * is claimed with a compare-and-set on `notesPageId IS NULL`, so two
 * concurrent generations (the hourly sweep and a person clicking
 * "Generate") end up sharing one page; the loser deletes its orphan and
 * re-reads the winner's id.
 */
export async function ensureOccurrenceNotesPage(
  db: PrismaClient,
  occurrence: NotesPageOccurrence,
  ceremony: NotesPageCeremony,
  opts: EnsureNotesPageOptions = {},
): Promise<EnsureNotesPageResult> {
  if (occurrence.notesPageId) return { pageId: occurrence.notesPageId, created: false };

  const page = await db.knowledgePage.create({
    data: {
      workspaceId: occurrence.workspaceId,
      projectId: resolveNotesPageProjectId(ceremony.projects),
      title: formatNotesPageTitle(ceremony.name, occurrence.scheduledStart, ceremony.timezone),
      createdById: ceremony.ownerId,
      includeInSearch: true,
      ...(opts.seed ? { bodyDoc: opts.seed.bodyDoc, body: opts.seed.body } : {}),
    },
    select: { id: true },
  });

  const { count } = await db.ceremonyOccurrence.updateMany({
    where: { id: occurrence.id, notesPageId: null },
    data: { notesPageId: page.id },
  });
  if (count === 1) return { pageId: page.id, created: true };

  // Lost the race: someone linked a page between our read and our write.
  await db.knowledgePage.delete({ where: { id: page.id } });
  const fresh = await db.ceremonyOccurrence.findUnique({
    where: { id: occurrence.id },
    select: { notesPageId: true },
  });
  if (!fresh?.notesPageId) {
    throw new Error(`Occurrence ${occurrence.id} lost its notes page link during creation`);
  }
  return { pageId: fresh.notesPageId, created: false };
}
