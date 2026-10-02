import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "~/server/db";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";
import { sendUpdateSubscribeConfirmEmail } from "~/server/services/EmailService";
import { isTooFastSubmission } from "~/server/services/forms/timeTrap";
import { requestSubscription } from "~/server/services/workspaceUpdates/subscribe";
import { checkRateLimit, clientIpFrom, tooManyRequestsInit } from "~/server/utils/rateLimit";

/**
 * Public signup for a workspace's update newsletter: POST
 * /api/updates/[workspaceSlug]/subscribe with `{ email, honeypot, elapsedMs }`.
 * Emails a confirmation link; the address joins the List only once that link
 * is followed (double opt-in).
 *
 * Unauthenticated, so it carries the Forms intake defences (ADR-0029/0036):
 * per-IP and per-email rate limits shared across instances, a hidden honeypot
 * and a time trap. Bot hits get a fake success so they learn nothing, and the
 * per-email limit stops the form being used to flood someone's inbox.
 */
export const dynamic = "force-dynamic";

const IP_LIMIT = { limit: 5, windowSeconds: 10 * 60 };
const EMAIL_LIMIT = { limit: 3, windowSeconds: 60 * 60 };
/** One field, often autofilled: a lower bar than the full Forms time trap. */
const MIN_SIGNUP_FILL_MS = 1500;

const emailSchema = z.string().trim().min(3).max(254).email();

export async function POST(request: NextRequest, { params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;

  const ipCheck = await checkRateLimit({ name: "update-signup-ip", key: clientIpFrom(request.headers), ...IP_LIMIT });
  if (!ipCheck.success) {
    return NextResponse.json(
      { ok: false, error: "Too many signups from here. Please try again later." },
      tooManyRequestsInit(ipCheck),
    );
  }

  let body: { email?: unknown; honeypot?: unknown; elapsedMs?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  // Honeypot and time trap: pretend it worked.
  const honeypotTripped = typeof body.honeypot === "string" && body.honeypot.trim().length > 0;
  if (honeypotTripped || isTooFastSubmission(body.elapsedMs, MIN_SIGNUP_FILL_MS)) {
    return NextResponse.json({ ok: true });
  }

  const parsed = emailSchema.safeParse(body.email);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 422 });
  }
  const email = parsed.data;

  const emailCheck = await checkRateLimit({ name: "update-signup-email", key: email.toLowerCase(), ...EMAIL_LIMIT });
  if (!emailCheck.success) {
    return NextResponse.json(
      { ok: false, error: "We've already sent a confirmation to this address. Check your inbox." },
      tooManyRequestsInit(emailCheck),
    );
  }

  try {
    const result = await requestSubscription(
      db,
      { workspaceSlug, email },
      {
        baseUrl: getPublicBaseUrlFromEnv(),
        sendConfirmation: ({ to, workspaceName, confirmUrl, workspaceId }) =>
          sendUpdateSubscribeConfirmEmail({ to, workspaceName, confirmUrl, workspaceId }),
      },
    );
    if (result.kind === "unavailable") {
      return NextResponse.json({ ok: false, error: "Signups aren't open here." }, { status: 404 });
    }
  } catch (err) {
    console.error("[updates.subscribe] could not send the confirmation email", err);
    return NextResponse.json(
      { ok: false, error: "We couldn't send the confirmation email. Please try again later." },
      { status: 502 },
    );
  }

  // The same answer whether or not they were already subscribed.
  return NextResponse.json({ ok: true });
}
