import { type NextRequest } from "next/server";

import { db } from "~/server/db";
import { verifyUnsubscribeToken } from "~/server/services/crm/crmUnsubscribeToken";

/**
 * Public one-click unsubscribe for Broadcast emails (CONTEXT.md → Broadcast).
 * Sets the contact's `emailOptedOutAt` so every future Broadcast send skips them
 * (the consent filter lives in the `crm_contact` member resolver). Idempotent:
 * a second click is a no-op. The token is contact-scoped, so one recipient can
 * only unsubscribe themselves.
 */
function page(title: string, body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;text-align:center">
<h1>${title}</h1><p>${body}</p></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const contactId = token ? verifyUnsubscribeToken(token) : null;

  if (!contactId) {
    return page(
      "Invalid unsubscribe link",
      "This link is invalid or has expired. Please contact us if you continue to receive emails.",
      400,
    );
  }

  // Idempotent: only stamp the first time, but never error if already opted out.
  const contact = await db.crmContact.findUnique({
    where: { id: contactId },
    select: { emailOptedOutAt: true },
  });
  if (!contact) {
    // The contact was deleted or merged away since the email went out. Don't
    // claim an unsubscribe we couldn't record — ask them to write in instead.
    return page(
      "This link is no longer valid",
      "We couldn't find the subscription this link belongs to. If you still receive emails from us, reply to one and we'll remove you by hand.",
      410,
    );
  }
  if (!contact.emailOptedOutAt) {
    await db.crmContact.update({
      where: { id: contactId },
      data: { emailOptedOutAt: new Date() },
    });
  }

  return page(
    "You're unsubscribed",
    "You won't receive further update emails from us. You can close this tab.",
  );
}
