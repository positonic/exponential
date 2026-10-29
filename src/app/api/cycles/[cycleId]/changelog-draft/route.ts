import { type NextRequest, NextResponse } from "next/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { assertWorkspaceAccess } from "~/plugins/product/server/routers/product";
import { draftCycleChangelog } from "~/plugins/product/server/cycleChangelogDraftRunner";
import { checkRateLimit } from "~/server/utils/rateLimit";

/**
 * "Draft with AI" on the change-log page: writes (or rewrites) one cycle's
 * change-log draft.
 *
 * A route rather than a tRPC mutation because the model call can take a
 * couple of minutes and the tRPC handler is capped at 60 seconds.
 */
export const maxDuration = 300;

/** Each draft is a paid model call. */
const MAX_DRAFTS_PER_WINDOW = 10;
const WINDOW_SECONDS = 60 * 60;

const BodySchema = z
  .object({ overwriteEdited: z.boolean().optional() })
  .optional();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ cycleId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { cycleId } = await params;

  const parsed = BodySchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const cycle = await db.list.findUnique({
    where: { id: cycleId },
    select: { workspaceId: true, listType: true },
  });
  if (cycle?.listType !== "SPRINT") {
    return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  }
  try {
    await assertWorkspaceAccess(db, userId, cycle.workspaceId, "edit");
  } catch (error) {
    if (error instanceof TRPCError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const rateCheck = await checkRateLimit({
    name: "cycle-changelog-draft",
    key: userId,
    limit: MAX_DRAFTS_PER_WINDOW,
    windowSeconds: WINDOW_SECONDS,
  });
  if (!rateCheck.success) {
    return NextResponse.json(
      { error: "Too many drafts this hour. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rateCheck.retryAfterSeconds) },
      },
    );
  }

  try {
    const result = await draftCycleChangelog(db, {
      cycleId,
      userId,
      overwriteEdited: parsed.data?.overwriteEdited,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[cycle-changelog-draft] draft failed", error);
    return NextResponse.json(
      { error: "The draft couldn't be written. Try again." },
      { status: 502 },
    );
  }
}
