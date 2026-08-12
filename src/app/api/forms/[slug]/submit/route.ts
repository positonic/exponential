import { type NextRequest, NextResponse } from "next/server";
import { type Prisma } from "@prisma/client";

import { db } from "~/server/db";
import {
  parseFormFields,
  validateSubmission,
} from "~/server/services/forms/formSchema";
import { runFormDestinations } from "~/server/services/forms/runDestinations";
import { emailHashFor } from "~/server/services/crm/createCrmContact";
import { isTooFastSubmission } from "~/server/services/forms/timeTrap";
import {
  checkRateLimit,
  clientIpFrom,
  tooManyRequestsInit,
} from "~/server/utils/rateLimit";

/**
 * Public **Forms intake** (ADR-0029): POST /api/forms/[slug]/submit. Validates
 * against the form's field schema, stores a FormSubmission, then runs the form's
 * destinations synchronously. Unauthenticated — protected by a hidden honeypot
 * field, a time trap, and per-IP/per-email rate limiting shared across
 * instances (ADR-0030/0036: Upstash via ~/server/utils/rateLimit).
 */
export const dynamic = "force-dynamic";

const WINDOW_SECONDS = 60;
const IP_MAX = 5;
const EMAIL_MAX = 3;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const ip = clientIpFrom(request.headers);

  const ipCheck = await checkRateLimit({
    name: "forms-ip",
    key: ip,
    limit: IP_MAX,
    windowSeconds: WINDOW_SECONDS,
  });
  if (!ipCheck.success) {
    return NextResponse.json(
      { ok: false, error: "Too many submissions. Please try again shortly." },
      tooManyRequestsInit(ipCheck),
    );
  }

  let body: { data?: unknown; honeypot?: unknown; elapsedMs?: unknown };
  try {
    body = (await request.json()) as {
      data?: unknown;
      honeypot?: unknown;
      elapsedMs?: unknown;
    };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 },
    );
  }

  const data =
    body.data && typeof body.data === "object"
      ? (body.data as Record<string, unknown>)
      : {};
  const honeypotTripped =
    typeof body.honeypot === "string" && body.honeypot.trim().length > 0;

  const form = await db.form.findFirst({ where: { slug, isActive: true } });
  if (!form) {
    return NextResponse.json(
      { ok: false, error: "Form not found" },
      { status: 404 },
    );
  }

  const fields = parseFormFields(form.fields);

  // Honeypot: bots fill the hidden field. Record it, skip destinations, fake success.
  if (honeypotTripped) {
    await db.formSubmission.create({
      data: {
        formId: form.id,
        data: {},
        metadata: { ip, honeypotTripped: true } as Prisma.InputJsonValue,
      },
    });
    return NextResponse.json({ ok: true });
  }

  // Time-trap (ADR-0036): reject implausibly fast fills like a honeypot hit —
  // record, skip destinations, fake success so bots learn nothing.
  if (isTooFastSubmission(body.elapsedMs)) {
    await db.formSubmission.create({
      data: {
        formId: form.id,
        data: {},
        metadata: {
          ip,
          timeTrapped: true,
          elapsedMs: typeof body.elapsedMs === "number" ? body.elapsedMs : null,
        } as Prisma.InputJsonValue,
      },
    });
    return NextResponse.json({ ok: true });
  }

  const validation = validateSubmission(fields, data);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, errors: validation.errors },
      { status: 422 },
    );
  }

  const emailField = fields.find((f) => f.type === "email");
  const email =
    emailField && typeof validation.clean[emailField.key] === "string"
      ? (validation.clean[emailField.key] as string)
      : null;
  if (email) {
    const emailCheck = await checkRateLimit({
      name: "forms-email",
      key: email.toLowerCase(),
      limit: EMAIL_MAX,
      windowSeconds: WINDOW_SECONDS,
    });
    if (!emailCheck.success) {
      return NextResponse.json(
        { ok: false, error: "Too many submissions for this email." },
        tooManyRequestsInit(emailCheck),
      );
    }
  }

  const submission = await db.formSubmission.create({
    data: {
      formId: form.id,
      data: validation.clean as Prisma.InputJsonValue,
      metadata: {
        ip,
        userAgent: request.headers.get("user-agent") ?? null,
        honeypotTripped: false,
        emailHash: email ? emailHashFor(email) : null,
      } as Prisma.InputJsonValue,
    },
  });

  const { outcomes, createdContactId } = await runFormDestinations(
    db,
    form.destinations,
    validation.clean,
    {
      formId: form.id,
      formSlug: form.slug,
      workspaceId: form.workspaceId,
      submissionId: submission.id,
      ownerId: form.createdById,
    },
  );

  await db.formSubmission.update({
    where: { id: submission.id },
    data: {
      result: outcomes as unknown as Prisma.InputJsonValue,
      createdContactId,
    },
  });

  return NextResponse.json({
    ok: true,
    confirmationMessage: form.confirmationMessage ?? null,
  });
}