import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

/**
 * The meeting page's "Extract outputs" button. It runs
 * `transcription.extractOutputs` — same procedure, same session, same access
 * checks — but from a route of its own, because the shared tRPC route stops
 * at 60 seconds and one reading of a long recording takes longer than that:
 * every section of the transcript goes to the model, plus the notes passes.
 * The caller waits for the result, so the work stays inside the request.
 */
export const maxDuration = 300;

const bodySchema = z.object({ transcriptionId: z.string().min(1), replaceDrafts: z.boolean().optional() });

export async function POST(request: NextRequest) {
  // A JSON body cannot be sent cross-site without a preflight, which is the
  // same protection the tRPC route's mutations rely on.
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Expected application/json" }, { status: 415 });
  }
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "transcriptionId is required" }, { status: 400 });
  }

  try {
    const caller = createCaller(await createTRPCContext({ headers: request.headers }));
    const result = await caller.transcription.extractOutputs(body.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TRPCError) {
      return NextResponse.json({ error: error.message }, { status: getHTTPStatusCodeFromError(error) });
    }
    console.error("[extract-outputs] failed:", error);
    return NextResponse.json({ error: "Failed to extract meeting outputs" }, { status: 500 });
  }
}
