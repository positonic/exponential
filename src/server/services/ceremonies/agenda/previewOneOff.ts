/**
 * Dry run of a one-off's agenda (ADR-0059 amendment, 2026-10-07): what each
 * ticked section would produce if the meeting were booked now, so the
 * schedule-meeting modal can show a count and a sample beside each checkbox.
 *
 * Runs the same registry modules through the same `withAutoProjectsSection`
 * path as `generateAgenda` (a no-op here: a one-off has `includeProjects`
 * off, so it carries only what was ticked), against an in-memory ceremony and occurrence that
 * are never persisted (placeholder ids). Nothing is written and no LLM is
 * called. Participants are the caller and the member attendees, as booking
 * makes them. For the six one-off section types the modules read only the
 * ceremony's product and timezone, the occurrence's start, the previous
 * occurrence (none) and the project ids, so the stand-ins are enough.
 */
import type { Ceremony, CeremonyOccurrence, PrismaClient } from "@prisma/client";
import { getSectionModule } from "./sections";
import { withAutoProjectsSection, AUTO_PROJECTS_KEY } from "./autoSections";
import type { SectionContext } from "./types";
import { buildOneOffAgendaTemplate, type OneOffSectionType } from "../oneOffPresets";

export interface OneOffPreviewRow {
  key: string;
  type: string;
  title: string;
  count: number;
  /** The first three item titles. */
  sample: string[];
}

const PREVIEW_ID = "preview";

export async function previewOneOffAgenda(
  db: PrismaClient,
  input: {
    workspaceId: string;
    workspaceSlug: string;
    projectId: string;
    callerUserId: string;
    /** Member attendees, already checked to be workspace members; the caller is always added. */
    attendeeUserIds?: string[];
    scheduledStart: Date;
    durationMinutes?: number;
    sectionTypes: OneOffSectionType[];
    presetKey?: string;
    purpose?: string;
    timezone?: string;
    now?: Date;
  },
): Promise<OneOffPreviewRow[]> {
  const now = input.now ?? new Date();
  const scheduledEnd = new Date(input.scheduledStart.getTime() + (input.durationMinutes ?? 30) * 60_000);
  const template = buildOneOffAgendaTemplate({
    purpose: input.purpose?.trim() ? input.purpose.trim() : "",
    sectionTypes: input.sectionTypes,
    presetKey: input.presetKey,
  }).map((section) =>
    // An empty purpose is not an item; the real booking defaults it to the title.
    section.type === "free_text" && !input.purpose?.trim() ? { ...section, config: { items: [] } } : section,
  );

  const ceremony: Ceremony = {
    id: PREVIEW_ID,
    workspaceId: input.workspaceId,
    productId: null,
    teamId: null,
    name: "Preview",
    slug: PREVIEW_ID,
    aliases: [],
    kind: "CUSTOM",
    icon: null,
    purpose: input.purpose ?? null,
    notFor: null,
    inputs: null,
    outputs: null,
    cadenceRule: null,
    timezone: input.timezone ?? "UTC",
    startsOn: input.scheduledStart,
    durationMinutes: input.durationMinutes ?? 30,
    leadTimeHours: 24,
    ownerId: input.callerUserId,
    agendaTemplate: [],
    // Matches the booking: a one-off carries only its ticked sections.
    includeProjects: false,
    autoExtractOutputs: false,
    matrixRoomId: null,
    isActive: true,
    isOneOff: true,
    createdById: input.callerUserId,
    createdAt: now,
    updatedAt: now,
  };
  const occurrence: CeremonyOccurrence = {
    id: PREVIEW_ID,
    ceremonyId: PREVIEW_ID,
    workspaceId: input.workspaceId,
    scheduledStart: input.scheduledStart,
    scheduledEnd,
    status: "PLANNED",
    skipReason: null,
    definitionSnapshot: {},
    agenda: null,
    agendaGeneratedAt: null,
    agendaCirculatedAt: null,
    scheduledMeetingId: null,
    previousOccurrenceId: null,
    notesPageId: null,
    createdAt: now,
    updatedAt: now,
  };
  const ctx: SectionContext = {
    db,
    workspaceId: input.workspaceId,
    ceremony,
    occurrence,
    previousOccurrence: null,
    // The booking's participants: the organizer plus every member attendee,
    // so a teammate's blockers show in the preview as they will on the day.
    participantUserIds: Array.from(new Set([input.callerUserId, ...(input.attendeeUserIds ?? [])])),
    projectIds: [input.projectId],
    now,
    workspacePath: `/w/${input.workspaceSlug}`,
  };

  const rows: OneOffPreviewRow[] = [];
  for (const section of withAutoProjectsSection(template, ceremony.includeProjects)) {
    const mod = getSectionModule(section.type);
    const items = mod ? await mod.run(ctx, section) : [];
    // Mirrors `dropEmptyAutoSections`: the appended projects box only shows when it has something.
    if (section.key === AUTO_PROJECTS_KEY && items.length === 0) continue;
    rows.push({
      key: section.key,
      type: section.type,
      title: section.title,
      count: items.length,
      sample: items.slice(0, 3).map((item) => item.title),
    });
  }
  return rows;
}
