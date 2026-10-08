/**
 * One-off ceremonies (ADR-0059 amendment, 2026-10-07): an ad hoc meeting
 * scheduled from a project is a Ceremony with no cadence rule and exactly one
 * Occurrence, so it gets everything an occurrence already has — a generated
 * agenda, the notes page, hand-added items, the capture lifecycle and
 * auto-attach of the recording by iCal UID — without a second host for any of
 * them. It is never listed with the recurring ceremonies, and the word
 * "ceremony" is never shown for it.
 *
 * Its agenda is built only from the sections that make sense without a
 * previous occurrence, chosen through purpose presets (`oneOffPresets.ts`).
 */
import type { Ceremony, Prisma } from "@prisma/client";
import type { AgendaSectionTemplate } from "./templates";
import { snapshotCeremony } from "./occurrences";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";

export {
  ONE_OFF_SECTION_TYPES,
  ONE_OFF_PRESETS,
  DEFAULT_ONE_OFF_PRESET,
  buildOneOffAgendaTemplate,
  type OneOffSectionType,
  type OneOffPreset,
} from "./oneOffPresets";

/** Slug unique enough that a second "Stellar sync" never hits the per-workspace unique. */
export function oneOffSlug(title: string, suffix = Math.random().toString(36).slice(2, 8)): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return `${base.length > 0 ? base : "meeting"}-${suffix}`;
}

/**
 * The absolute occurrence link the invite carries. Same base as the
 * notification deep links — never `NEXT_PUBLIC_APP_URL` alone, which is unset
 * in every Vercel environment.
 */
export function buildOccurrenceUrl(workspaceSlug: string, ceremonyId: string, occurrenceId: string): string {
  const base = (process.env.NEXTAUTH_URL ?? getPublicBaseUrlFromEnv()).replace(/\/+$/, "");
  return `${base}/w/${workspaceSlug}/ceremonies/${ceremonyId}/${occurrenceId}`;
}

export interface CreateOneOffInput {
  workspaceId: string;
  projectId: string;
  organizerId: string;
  meetingId: string;
  title: string;
  purpose: string;
  agendaTemplate: AgendaSectionTemplate[];
  memberUserIds: string[];
  timezone: string;
  startsAt: Date;
  endsAt: Date;
}

/**
 * Inside the booking transaction: the one-off ceremony, its member
 * participants and project link, and its single occurrence pointing at the
 * already-created Scheduled meeting. External attendees live on the meeting
 * only.
 */
export async function createOneOffCeremony(
  tx: Prisma.TransactionClient,
  input: CreateOneOffInput,
): Promise<{ ceremony: Ceremony; occurrenceId: string }> {
  const ceremony = await tx.ceremony.create({
    data: {
      workspaceId: input.workspaceId,
      name: input.title,
      slug: oneOffSlug(input.title),
      aliases: [input.title],
      kind: "CUSTOM",
      purpose: input.purpose,
      cadenceRule: null,
      isOneOff: true,
      timezone: input.timezone,
      startsOn: input.startsAt,
      durationMinutes: Math.max(1, Math.round((input.endsAt.getTime() - input.startsAt.getTime()) / 60_000)),
      ownerId: input.organizerId,
      createdById: input.organizerId,
      agendaTemplate: input.agendaTemplate as unknown as Prisma.InputJsonValue,
      // Only the sections the organizer ticked: a linked-projects section is
      // one of the checkboxes, never appended behind their back.
      includeProjects: false,
      participants: { create: Array.from(new Set(input.memberUserIds)).map((userId) => ({ userId })) },
      projects: { create: [{ projectId: input.projectId }] },
    },
  });
  const occurrence = await tx.ceremonyOccurrence.create({
    data: {
      ceremonyId: ceremony.id,
      workspaceId: input.workspaceId,
      scheduledStart: input.startsAt,
      scheduledEnd: input.endsAt,
      definitionSnapshot: snapshotCeremony(ceremony),
      scheduledMeetingId: input.meetingId,
    },
    select: { id: true },
  });
  return { ceremony, occurrenceId: occurrence.id };
}
