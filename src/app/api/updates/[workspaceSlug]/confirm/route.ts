import { type NextRequest, NextResponse } from "next/server";

import { db } from "~/server/db";
import { publicUpdatesPath } from "~/server/services/workspaceUpdates/public";
import { confirmSubscription } from "~/server/services/workspaceUpdates/subscribe";
import { checkRateLimit, clientIpFrom } from "~/server/utils/rateLimit";

/**
 * Confirms a newsletter signup: the Confirm button on
 * `/updates/[workspaceSlug]/confirm` posts the emailed token here. A POST, not
 * the emailed GET link itself, so mail scanners that prefetch links can't
 * subscribe anyone. Redirects back to the confirm page with the outcome.
 *
 * The workspace comes from the signed token; the slug in the path only picks
 * where to send the visitor back to.
 */
export const dynamic = "force-dynamic";

const IP_LIMIT = { limit: 20, windowSeconds: 10 * 60 };

function backTo(request: NextRequest, workspaceSlug: string, status: string): NextResponse {
  const url = new URL(`${publicUpdatesPath(workspaceSlug)}/confirm`, request.nextUrl.origin);
  url.searchParams.set("status", status);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;

  const ipCheck = await checkRateLimit({ name: "update-confirm-ip", key: clientIpFrom(request.headers), ...IP_LIMIT });
  if (!ipCheck.success) return backTo(request, workspaceSlug, "busy");

  let token: string | null = null;
  try {
    const value = (await request.formData()).get("token");
    token = typeof value === "string" ? value : null;
  } catch {
    token = null;
  }
  if (!token) return backTo(request, workspaceSlug, "invalid");

  const result = await confirmSubscription(db, token);
  if (result.kind === "invalid") return backTo(request, workspaceSlug, "invalid");
  if (result.kind === "closed") return backTo(request, result.workspaceSlug, "closed");
  return backTo(request, result.workspaceSlug, result.alreadySubscribed ? "already" : "subscribed");
}
