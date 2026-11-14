import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import {
  endOfISOWeek,
  getISOWeek,
  getISOWeekYear,
  startOfISOWeek,
} from "date-fns";
import { personNotFound, resolvePersonScope } from "../personPage";
import { gatherVisibleWeek } from "./gather";
import { synthesizeSummary, type SummaryOpenAIClient } from "./synthesize";

/**
 * Person week summary: an AI-written summary of one week of someone else's
 * work, shown on their Person page above the feed.
 *
 * It is written only from the events the viewer can see on that page (see
 * `gatherVisibleWeek`): no meetings, no assigned items, nothing from a
 * workspace the viewer is not in. That is what separates it from the Weekly
 * work digest, which draws on all of a person's own data and stays private to
 * them (ADR-0018). The two never share data or a cache.
 */
export interface PersonWeekSummary {
  isoYear: number;
  isoWeek: number;
  narrative: string;
  highlights: string[];
  /** How many visible events it was written from. */
  eventCount: number;
  /** True when the week held more visible events than one summary reads. */
  truncated: boolean;
  generatedAt: Date;
}

export async function getPersonWeekSummary(
  db: PrismaClient,
  args: {
    viewerId: string;
    subjectId: string;
    now?: Date;
    openai?: SummaryOpenAIClient;
  },
): Promise<PersonWeekSummary> {
  // The same guard as the page and its feed: a subject the viewer cannot see
  // is NOT_FOUND here too, so the summary cannot be used to probe.
  const scope = await resolvePersonScope(db, args.viewerId, args.subjectId);
  if (scope.isSelf) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Your own page shows your Weekly work digest; there is no summary of yourself.",
    });
  }

  const subject = await db.user.findUnique({
    where: { id: args.subjectId },
    select: { name: true, isAgent: true },
  });
  if (!subject) throw personNotFound();

  const now = args.now ?? new Date();
  const isoYear = getISOWeekYear(now);
  const isoWeek = getISOWeek(now);
  const name = subject.name ?? "This person";

  const week = await gatherVisibleWeek(db, {
    viewerId: args.viewerId,
    subjectId: args.subjectId,
    subjectName: name,
    workspaceIds: scope.visibleWorkspaces.map((workspace) => workspace.id),
    weekStart: startOfISOWeek(now),
    weekEnd: endOfISOWeek(now),
  });

  // Nothing visible: say so without a model call.
  if (week.events.length === 0) {
    return {
      isoYear,
      isoWeek,
      narrative: `Nothing from ${name} this week in the workspaces you share.`,
      highlights: [],
      eventCount: 0,
      truncated: false,
      generatedAt: now,
    };
  }

  const result = await synthesizeSummary(
    { name, isAgent: subject.isAgent },
    week.events,
    {
      nonce: randomBytes(8).toString("hex"),
      truncated: week.truncated,
      openai: args.openai,
    },
  );

  return {
    isoYear,
    isoWeek,
    narrative: result.narrative,
    highlights: result.highlights,
    eventCount: week.events.length,
    truncated: week.truncated,
    generatedAt: now,
  };
}
